import http from "node:http";
import { randomBytes } from "node:crypto";
import { Service, hash } from "../shared-runtime/service";
import { redact } from "../shared-runtime/recording";
import type { Run } from "../shared-runtime/schema";
import { z } from "zod";
export function serve(service: Service, port = 4319, bridgeOnly = false) {
  const server = http.createServer(async (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    if (origin?.startsWith("chrome-extension://")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Authorization, Content-Type",
      );
      res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 2_000_000) throw Error("Request too large");
      }
      const body = raw ? JSON.parse(raw) : {};
      const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);
      const send = (value: unknown, status = 200) => {
        res.writeHead(status);
        res.end(JSON.stringify(value));
      };
      if (url.pathname === "/pair" && req.method === "POST") {
        const pairing = service.pairings.get(body.code);
        if (!pairing || pairing.expires < Date.now())
          throw Error("Pairing code invalid or expired");
        service.pairings.delete(body.code);
        const token = randomBytes(32).toString("base64url");
        service.store.put("recorderToken", {
          id: hash(token),
          owner: pairing.owner,
        });
        send({ token });
        return;
      }
      const token = req.headers.authorization?.replace(/^Bearer /, "") || "";
      if (url.pathname === "/recordings" && req.method === "POST") {
        const record = service.store.get("recorderToken", hash(token));
        if (!record) throw Error("Unauthorized");
        service.store.put("recording", {
          id: randomBytes(16).toString("hex"),
          owner: record.owner,
          events: redact(body.events),
          created: new Date().toISOString(),
        });
        send({ saved: true });
        return;
      }
      if (bridgeOnly) throw Error("Not found");
      const integration = service.store
        .all("token")
        .find((t) => t.digest === hash(token));
      if (!integration) throw Error("Unauthorized");
      const owner = integration.owner;
      let match;
      if (url.pathname === "/runner/hello" && req.method === "POST") {
        const connections = z
          .array(
            z.object({
              site: z.string(),
              status: z.enum(["Connected", "Sign in again"]),
            }),
          )
          .max(50)
          .parse(body.connections);
        for (const old of service.store
          .all("runnerConnection")
          .filter((c) => c.owner === owner))
          service.store.delete("runnerConnection", old.id);
        for (const connection of connections)
          service.store.put("runnerConnection", {
            ...connection,
            id: `${owner}:${connection.site}`,
            owner,
            lastSeen: Date.now(),
          });
        send({ agentId: integration.agentId });
        return;
      }
      if (url.pathname === "/runner/claim" && req.method === "POST") {
        const run = service.store.transaction(() => {
          for (const stale of service.store
            .all<Run>("run")
            .filter(
              (r) =>
                r.owner === owner &&
                r.agentId === integration.agentId &&
                r.location === "local" &&
                r.state === "Running",
            )) {
            const lease = service.store.get("lease", stale.id);
            if (lease && lease.until < Date.now())
              service.store.put("run", {
                ...stale,
                state: "Needs input",
                error:
                  "Local runner disconnected. Review the last checkpoint before resuming.",
              });
          }
          const next = service.store
            .all<Run>("run")
            .find(
              (r) =>
                r.owner === owner &&
                r.agentId === integration.agentId &&
                r.location === "local" &&
                ["Queued", "Waiting for runner"].includes(r.state),
            );
          if (!next) return null;
          service.store.put("run", { ...next, state: "Running" });
          service.store.put("lease", {
            id: next.id,
            tokenId: integration.id,
            until: Date.now() + 30000,
          });
          return next;
        });
        send({ run });
        return;
      }
      if (url.pathname === "/runner/checkpoint" && req.method === "POST") {
        const checkpoint = z
          .object({
            id: z.string(),
            step: z.number().int().min(0).max(100),
            state: z.enum([
              "Queued",
              "Running",
              "Needs input",
              "Completed",
              "Failed",
              "Cancelled",
              "Waiting for runner",
            ]),
            outputs: z.record(z.string(), z.unknown()),
            history: z.array(z.unknown()).max(500),
            error: z.string().max(3000).optional(),
          })
          .parse(body.run);
        const existing = service.store.run(checkpoint.id, owner);
        const lease = service.store.get("lease", existing.id);
        if (
          existing.agentId !== integration.agentId ||
          existing.location !== "local" ||
          lease?.tokenId !== integration.id
        )
          throw Error("Forbidden");
        if (existing.state === "Cancelled") {
          send({ cancelled: true });
          return;
        }
        if (checkpoint.step > existing.workflow.steps.length)
          throw Error("Invalid checkpoint");
        service.store.put("run", { ...existing, ...checkpoint });
        service.store.put("lease", { ...lease, until: Date.now() + 30000 });
        send({ saved: true });
        return;
      }
      if (
        (match = url.pathname.match(
          /^\/agents\/([^/]+)\/(workspace|configuration|export)$/,
        ))
      ) {
        if (match[1] !== integration.agentId) throw Error("Forbidden");
        const agent = service.store.agent(match[1], owner);
        if (match[2] === "workspace" && req.method === "GET") {
          send({
            runs: service.store
              .all<Run>("run")
              .filter((r) => r.agentId === agent.id && r.owner === owner),
            connections: service.store
              .all("connection")
              .filter((c) => c.owner === owner),
            artifacts: service.store
              .all("artifact")
              .filter(
                (a) =>
                  a.owner === owner &&
                  service.store.get<Run>("run", a.runId)?.agentId === agent.id,
              )
              .map(({ path, ...a }) => a),
            readiness: service.readiness(owner, agent),
          });
          return;
        }
        if (match[2] === "configuration" && req.method === "PUT") {
          service.store.agent(agent.id, owner, true);
          send(
            await service.request(owner, {
              method: "saveAgent",
              payload: { ...body.agent, id: agent.id, untested: true },
            }),
          );
          return;
        }
        if (match[2] === "export" && req.method === "GET") {
          send(
            await service.request(owner, {
              method: "export",
              payload: { id: agent.id, format: url.searchParams.get("format") },
            }),
          );
          return;
        }
      }
      if (
        (match = url.pathname.match(/^\/artifacts\/([^/]+)\/content$/)) &&
        req.method === "GET"
      ) {
        const artifact = service.store.get("artifact", match[1]);
        if (
          !artifact ||
          service.store.run(artifact.runId, owner).agentId !==
            integration.agentId
        )
          throw Error("Forbidden");
        send(
          await service.request(owner, {
            method: "artifact",
            payload: { id: match[1], preview: url.searchParams.has("preview") },
          }),
        );
        return;
      }
      if (
        (match = url.pathname.match(/^\/agents\/([^/]+)\/runs$/)) &&
        req.method === "POST"
      ) {
        if (integration.agentId !== match[1]) throw Error("Forbidden");
        const inputs = body.inputs || {};
        if (
          typeof inputs !== "object" ||
          Object.values(inputs).some((v) => typeof v !== "string")
        )
          throw Error("Inputs must contain text values");
        send(
          service.submit(
            owner,
            match[1],
            inputs,
            req.headers["idempotency-key"] as string,
            Boolean(body.test),
          ),
          202,
        );
        return;
      }
      if (
        (match = url.pathname.match(/^\/runs\/([^/]+)(?:\/(cancel|resume))?$/))
      ) {
        const run = service.store.run(match[1], owner);
        if (run.agentId !== integration.agentId) throw Error("Forbidden");
        if (!match[2] && req.method === "GET") {
          send(run);
          return;
        }
        if (match[2] && req.method === "POST") {
          send(
            await service.request(owner, {
              method: match[2] as "cancel" | "resume",
              payload: { id: run.id },
            }),
          );
          return;
        }
      }
      if (
        (match = url.pathname.match(/^\/agents\/([^/]+)\/results$/)) &&
        req.method === "GET"
      ) {
        if (match[1] !== integration.agentId) throw Error("Forbidden");
        send(
          await service.request(owner, {
            method: "results",
            payload: { id: match[1] },
          }),
        );
        return;
      }
      if (
        (match = url.pathname.match(/^\/artifacts\/([^/]+)$/)) &&
        req.method === "GET"
      ) {
        const artifact = service.store.get("artifact", match[1]);
        if (
          !artifact ||
          service.store.run(artifact.runId, owner).agentId !==
            integration.agentId
        )
          throw Error("Forbidden");
        const file = await service.request(owner, {
          method: "artifact",
          payload: { id: match[1] },
        });
        res.setHeader("Content-Type", "application/octet-stream");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${file.name.replace(/[^\w.-]/g, "_")}"`,
        );
        res.end(Buffer.from(file.base64, "base64"));
        return;
      }
      send({ error: "Not found" }, 404);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Request failed";
      res.writeHead(
        message === "Unauthorized" ? 401 : message === "Forbidden" ? 403 : 400,
      );
      res.end(JSON.stringify({ error: message }));
    }
  });
  server.listen(port, process.env.RELAY_BIND || "127.0.0.1");
  return server;
}
