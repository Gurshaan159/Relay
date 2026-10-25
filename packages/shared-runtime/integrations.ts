import { z } from "zod";
import { allowedURL } from "./runtime";
export interface IntegrationAdapter {
  name: string;
  call(
    operation: string,
    input: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
}
export interface MCPTransport {
  request(
    method: string,
    params: unknown,
    signal: AbortSignal,
  ): Promise<unknown>;
}
/** The transport is supplied by the trusted host; servers cannot register arbitrary executable code. */
export class MCPAdapter implements IntegrationAdapter {
  name = "MCP";
  constructor(
    private transport: MCPTransport,
    private allowedTools: Record<string, z.ZodType>,
  ) {}
  async call(operation: string, input: unknown, signal: AbortSignal) {
    const schema = this.allowedTools[operation];
    if (!schema) throw Error("MCP tool is not approved");
    return this.transport.request(
      "tools/call",
      { name: operation, arguments: schema.parse(input) },
      signal,
    );
  }
}
export class OpenAPIAdapter implements IntegrationAdapter {
  name = "OpenAPI";
  constructor(
    private origin: string,
    private operations: Record<
      string,
      { path: string; method: "GET" | "POST"; schema: z.ZodType }
    >,
    private headers: () => Promise<Record<string, string>> = async () => ({}),
  ) {}
  async call(operation: string, input: unknown, signal: AbortSignal) {
    const op = this.operations[operation];
    if (!op) throw Error("API operation is not approved");
    const parsed = op.schema.parse(input);
    const url = allowedURL(new URL(op.path, this.origin).href);
    const response = await fetch(url, {
      method: op.method,
      headers: {
        ...(await this.headers()),
        "Content-Type": "application/json",
      },
      body: op.method === "POST" ? JSON.stringify(parsed) : undefined,
      redirect: "error",
      signal,
    });
    if (!response.ok) throw Error(`Integration returned ${response.status}`);
    return response.json();
  }
}
