import { z } from "zod";
import approvedSites from "../../config/approved-sites.json";
export const actions = [
  "navigate",
  "click",
  "fill",
  "select",
  "press",
  "read",
  "wait",
  "download",
  "upload",
  "spreadsheet",
  "human",
  "http",
  "transform",
  "tab",
  "model",
] as const;
export const stepSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  action: z.enum(actions),
  url: z.string().optional(),
  method: z.enum(["GET", "POST"]).optional(),
  locator: z.string().optional(),
  value: z.string().optional(),
  file: z.string().optional(),
  output: z.string().default("result"),
  recommendation: z
    .enum([
      "Automate",
      "Review before continuing",
      "Keep manual",
      "Unsupported with current tools",
    ])
    .default("Automate"),
  reason: z.string().default("Deterministic action with a verifiable target"),
  assignedTo: z.string().optional(),
  condition: z.string().optional(),
  success: z.string().optional(),
  model: z.string().optional(),
});
export const workflowSchema = z.object({
  steps: z.array(stepSchema).max(100),
  inputs: z
    .array(
      z.object({
        name: z.string().regex(/^[a-zA-Z]\w*$/),
        label: z.string(),
        required: z.boolean().default(true),
      }),
    )
    .default([]),
  output: z
    .object({
      format: z.enum(["table", "report", "files"]).default("table"),
      mode: z.enum(["append", "update", "dated"]).default("dated"),
      uniqueKey: z.string().default("id"),
    })
    .default({ format: "table", mode: "dated", uniqueKey: "id" }),
  sites: z.array(z.string()).default(["fixture"]),
  instructions: z.string().default(""),
  expectedOutputs: z.array(z.string()).default([]),
});
export type Step = z.infer<typeof stepSchema>;
export type Workflow = z.infer<typeof workflowSchema>;
export const agentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).default(""),
  workflow: workflowSchema,
  status: z.enum(["Draft", "Ready", "Paused", "Archived"]).default("Draft"),
  shared: z.boolean().default(false),
  location: z.enum(["local", "hosted"]).default("local"),
  intervalMinutes: z.number().int().min(1).nullable().default(null),
  wizardStage: z.number().int().min(0).max(5).default(0),
});
export type Agent = z.infer<typeof agentSchema> & {
  id: string;
  owner: string;
  team: string;
  version: number;
};
export type Employee = {
  id: string;
  name: string;
  team: string;
  initials: string;
  role: "admin" | "employee";
};
export const employees: Employee[] = [
  {
    id: "alex",
    name: "Alex Morgan",
    team: "Operations",
    initials: "AM",
    role: "admin",
  },
  {
    id: "jordan",
    name: "Jordan Lee",
    team: "Operations",
    initials: "JL",
    role: "employee",
  },
  {
    id: "sam",
    name: "Sam Rivera",
    team: "Customer success",
    initials: "SR",
    role: "employee",
  },
  {
    id: "taylor",
    name: "Taylor Chen",
    team: "Customer success",
    initials: "TC",
    role: "employee",
  },
];
export interface Collection {
  id: string;
  name: string;
  description: string;
  team: string;
  fileName: string;
  path: string;
  size: number;
  columns: string[];
  rows: number;
  addedBy: string;
  created: string;
}
export const sites = z
  .array(
    z.object({
      id: z.string().regex(/^[a-z0-9-]+$/),
      name: z.string(),
      origin: z.string().url(),
      login: z.string(),
      type: z.enum(["browser", "api"]),
      sessionCookie: z.string().optional(),
      auth: z.enum(["bearer", "api-key"]).optional(),
      headerName: z
        .string()
        .regex(/^[A-Za-z0-9-]+$/)
        .optional(),
      verifyPath: z.string().optional(),
    }),
  )
  .parse(approvedSites);
export type RunState =
  | "Queued"
  | "Running"
  | "Needs input"
  | "Waiting for runner"
  | "Completed"
  | "Failed"
  | "Cancelled";
export interface Run {
  id: string;
  agentId: string;
  owner: string;
  location: string;
  state: RunState;
  step: number;
  inputs: Record<string, string>;
  workflow: Workflow;
  version: number;
  created: string;
  error?: string;
  outputs: Record<string, unknown>;
  history: unknown[];
  approved?: number;
  inflight?: number;
}
export interface ResultRow {
  id: string;
  agentId: string;
  owner: string;
  runId: string;
  collectedAt: string;
  source: string;
  data: Record<string, unknown>;
}
export const requestSchema = z.object({
  method: z.enum([
    "snapshot",
    "deactivate",
    "backend",
    "saveAgent",
    "deleteAgent",
    "duplicate",
    "run",
    "cancel",
    "resume",
    "connect",
    "finishConnect",
    "disconnect",
    "requestSite",
    "results",
    "artifact",
    "pair",
    "recordings",
    "interpret",
    "settings",
    "token",
    "revokeToken",
    "export",
    "openSource",
    "admin",
    "setTeamSites",
    "moveMember",
    "addCollection",
    "updateCollection",
    "removeCollection",
    "collection",
    "connectProvider",
    "disconnectProvider",
    "modelPlan",
    "trainModel",
    "cancelModel",
    "publishModel",
    "unpublishModel",
    "predict",
  ]),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type Request = z.infer<typeof requestSchema>;
export interface RelayBridge {
  request(request: Request): Promise<any>;
  switchEmployee(id: string): Promise<void>;
}
