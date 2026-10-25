import type { Store } from "./store";
export class RemoteBackend {
  cache = new Map<string, { at: number; data: any }>();
  constructor(
    private store: Store,
    private secrets?: { get: (id: string) => Promise<string> },
  ) {}
  config(owner: string, agentId: string) {
    return this.store.get("backend", `${owner}:${agentId}`);
  }
  async call(
    owner: string,
    agentId: string,
    route: string,
    method = "GET",
    body?: unknown,
  ) {
    const config = this.config(owner, agentId);
    if (!config || !this.secrets)
      throw Error(
        "Connect this agent to its hosted backend in Settings → Integrations",
      );
    const token = await this.secrets.get(`backend:${owner}:${agentId}`);
    const response = await fetch(config.endpoint + route, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      let message = `Backend returned ${response.status}`;
      try {
        message = ((await response.json()) as any).error || message;
      } catch {}
      throw Error(message);
    }
    return response.json() as Promise<any>;
  }
  async metadata(owner: string, agentId: string) {
    const key = `${owner}:${agentId}`;
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.at < 3000) return cached.data;
    const data = await this.call(
      owner,
      agentId,
      `/agents/${agentId}/workspace`,
    );
    this.cache.set(key, { at: Date.now(), data });
    return data;
  }
  invalidate(owner: string, agentId: string) {
    const cached = this.cache.get(`${owner}:${agentId}`);
    if (cached) cached.at = 0;
  }
}
