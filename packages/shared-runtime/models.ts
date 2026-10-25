import { randomUUID } from "node:crypto";
import { readTable } from "./tabular";
import type { Store } from "./store";
import type { Collection } from "./schema";
const HUB = "https://huggingface.co";
const ENDPOINTS = "https://api.endpoints.huggingface.cloud/v2";
export const BASE_MODEL = "distilbert/distilbert-base-uncased";
export const TRAIN_IMAGE = "pytorch/pytorch:2.6.0-cuda12.4-cudnn9-devel";
export const recipe = {
  minLabels: 2,
  maxLabels: 50,
  minPerLabel: 10,
  maxExamples: 10000,
  evalShare: 0.2,
};
export const settings = {
  epochs: 3,
  learning_rate: 5e-5,
  batch_size: 16,
  max_length: 128,
  seed: 42,
};
export const trainingChoices = [
  {
    flavor: "cpu-upgrade",
    label: "Lower cost",
    speed: "Slower · 8 CPU cores",
    timeoutMinutes: 120,
  },
  {
    flavor: "t4-small",
    label: "Faster",
    speed: "Faster · Nvidia T4 GPU",
    timeoutMinutes: 60,
  },
];
export const hostingChoices = [
  {
    id: "aws-us-east-1-intel-spr-x2",
    label: "Standard · 2 CPU cores",
    vendor: "aws",
    region: "us-east-1",
    accelerator: "cpu",
    instanceType: "intel-spr",
    instanceSize: "x2",
  },
  {
    id: "aws-us-east-1-nvidia-t4-x1",
    label: "Faster responses · Nvidia T4 GPU",
    vendor: "aws",
    region: "us-east-1",
    accelerator: "gpu",
    instanceType: "nvidia-t4",
    instanceSize: "x1",
  },
];
export type ModelState =
  | "Preparing"
  | "Training"
  | "Evaluated"
  | "Failed"
  | "Cancelled"
  | "Publishing"
  | "Published";
export interface Model {
  id: string;
  name: string;
  goal: string;
  team: string;
  collectionId: string;
  fileName: string;
  textColumn: string;
  labelColumn: string;
  labels: string[];
  counts: { train: number; eval: number };
  baseModel: string;
  settings: typeof settings;
  flavor: string;
  timeoutMinutes: number;
  trainingEstimate: { unitCostUSD: number; unitLabel: string; maxUSD: number };
  namespace: string;
  dataRepo: string;
  modelRepo: string;
  jobId?: string;
  revision?: string;
  state: ModelState;
  status?: string;
  error?: string;
  evaluation?: {
    accuracy: number;
    train_examples: number;
    eval_examples: number;
    per_label: Record<
      string,
      { examples: number; precision: number; recall: number }
    >;
    samples: {
      text: string;
      expected: string;
      predicted: string;
      score: number;
    }[];
  };
  hosting?: {
    compute: string;
    pricePerHour: number;
    endpoint: string;
    url?: string;
    checks?: number;
    approvedBy: string;
  };
  createdBy: string;
  created: string;
}
// Runs inside the Hugging Face Job. Reads the prepared split, fine-tunes the
// base model, evaluates on the reserved examples and pushes the result.
export const TRAIN_SCRIPT = `import json, os
import numpy as np
import torch
from huggingface_hub import HfApi, hf_hub_download
from transformers import AutoModelForSequenceClassification, AutoTokenizer, DataCollatorWithPadding, Trainer, TrainingArguments

cfg = json.loads(os.environ["RELAY_CONFIG"])
labels = cfg["labels"]
label_ids = {label: i for i, label in enumerate(labels)}

def load(name):
    path = hf_hub_download(cfg["data_repo"], name, repo_type="dataset")
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

train_rows, eval_rows = load("train.jsonl"), load("eval.jsonl")
tokenizer = AutoTokenizer.from_pretrained(cfg["base_model"])
model = AutoModelForSequenceClassification.from_pretrained(
    cfg["base_model"], num_labels=len(labels), id2label=dict(enumerate(labels)), label2id=label_ids
)

class Examples(torch.utils.data.Dataset):
    def __init__(self, rows):
        self.encodings = tokenizer([r["text"] for r in rows], truncation=True, max_length=cfg["max_length"])
        self.targets = [label_ids[r["label"]] for r in rows]

    def __len__(self):
        return len(self.targets)

    def __getitem__(self, i):
        item = {k: v[i] for k, v in self.encodings.items()}
        item["labels"] = self.targets[i]
        return item

args = TrainingArguments(
    output_dir="/tmp/relay-run",
    num_train_epochs=cfg["epochs"],
    learning_rate=cfg["learning_rate"],
    per_device_train_batch_size=cfg["batch_size"],
    per_device_eval_batch_size=32,
    save_strategy="no",
    logging_steps=20,
    report_to=[],
    seed=cfg["seed"],
)
trainer = Trainer(model=model, args=args, train_dataset=Examples(train_rows), data_collator=DataCollatorWithPadding(tokenizer))
trainer.train()
output = trainer.predict(Examples(eval_rows))
probs = torch.softmax(torch.tensor(output.predictions), dim=-1).numpy()
guesses = probs.argmax(axis=-1)
truth = np.array([label_ids[r["label"]] for r in eval_rows])
per_label = {}
for i, label in enumerate(labels):
    actual = truth == i
    predicted = guesses == i
    hits = int((actual & predicted).sum())
    per_label[label] = {
        "examples": int(actual.sum()),
        "precision": hits / int(predicted.sum()) if predicted.sum() else 0.0,
        "recall": hits / int(actual.sum()) if actual.sum() else 0.0,
    }
samples = [
    {"text": r["text"][:300], "expected": r["label"], "predicted": labels[int(g)], "score": round(float(p[g]), 4)}
    for r, g, p in list(zip(eval_rows, guesses, probs))[:20]
]
os.makedirs("/tmp/relay-model", exist_ok=True)
trainer.save_model("/tmp/relay-model")
tokenizer.save_pretrained("/tmp/relay-model")
with open("/tmp/relay-model/relay_eval.json", "w", encoding="utf-8") as f:
    json.dump({
        "accuracy": float((guesses == truth).mean()),
        "train_examples": len(train_rows),
        "eval_examples": len(eval_rows),
        "per_label": per_label,
        "samples": samples,
    }, f, indent=2)
HfApi().upload_folder(repo_id=cfg["model_repo"], folder_path="/tmp/relay-model", commit_message="Relay text classification model")
print("Relay training finished")
`;
const clean = (v: unknown) =>
  v === null || v === undefined ? "" : String(v).replace(/\s+/g, " ").trim();
export async function inspect(c: Collection) {
  const { columns, rows } = await readTable(c.path);
  const stats = columns.map((column) => {
    const values = rows.map((r) => clean(r[column])).filter(Boolean);
    return {
      column,
      filled: values.length,
      distinct: new Set(values.map((v) => v.toLowerCase())).size,
      length: values.reduce((n, v) => n + v.length, 0) / (values.length || 1),
      numeric: values.filter((v) => !isNaN(Number(v))).length,
    };
  });
  const text = stats
    .filter(
      (s) =>
        s.filled &&
        s.length >= 20 &&
        s.numeric / s.filled < 0.5 &&
        s.distinct / s.filled >= 0.5,
    )
    .sort((a, b) => b.length - a.length)[0];
  const label = stats
    .filter(
      (s) =>
        s.column !== text?.column &&
        s.distinct >= recipe.minLabels &&
        s.distinct <= recipe.maxLabels &&
        s.distinct * 5 <= s.filled,
    )
    .sort((a, b) => b.filled - a.filled || a.distinct - b.distinct)[0];
  return {
    columns,
    rows,
    sample: rows
      .slice(0, 5)
      .map((r) =>
        Object.fromEntries(columns.map((k) => [k, clean(r[k]).slice(0, 120)])),
      ),
    suggestion:
      text && label
        ? {
            textColumn: text.column,
            labelColumn: label.column,
            reason: `“${text.column}” holds written text (about ${Math.round(text.length)} characters on average) and “${label.column}” has ${label.distinct} repeating categories.`,
          }
        : null,
  };
}
export function check(
  rows: Record<string, unknown>[],
  textColumn: string,
  labelColumn: string,
) {
  const problems: { issue: string; fix: string }[] = [];
  if (!textColumn || !labelColumn || textColumn === labelColumn)
    return {
      ok: false,
      problems: [
        {
          issue: "Choose two different columns.",
          fix: "Pick the column with the text to read and the column with its correct category.",
        },
      ],
      labels: [],
      examples: [],
      ignored: 0,
      duplicates: 0,
    };
  let ignored = 0,
    noLabel = 0,
    noText = 0,
    numeric = 0,
    duplicates = 0;
  const seen = new Map<string, string>();
  const conflicts = new Set<string>();
  const examples: { text: string; label: string }[] = [];
  for (const r of rows) {
    const text = clean(r[textColumn]);
    const label = clean(r[labelColumn]);
    if (!text && !label) ignored++;
    else if (!label) noLabel++;
    else if (!text) noText++;
    else {
      if (!isNaN(Number(text))) numeric++;
      const key = text.toLowerCase();
      const prior = seen.get(key);
      if (prior === undefined) {
        seen.set(key, label);
        examples.push({ text, label });
      } else if (prior === label) duplicates++;
      else conflicts.add(key);
    }
  }
  if (noLabel)
    problems.push({
      issue: `${noLabel} rows have text but no “${labelColumn}”.`,
      fix: `Fill in the correct “${labelColumn}” for those rows, or delete them, then add the file again.`,
    });
  if (noText)
    problems.push({
      issue: `${noText} rows have a “${labelColumn}” but no “${textColumn}”.`,
      fix: "Add the missing text or delete those rows.",
    });
  if (numeric > examples.length / 2)
    problems.push({
      issue: `“${textColumn}” mostly contains numbers, not written text.`,
      fix: "Choose the column that holds messages or descriptions.",
    });
  if (conflicts.size)
    problems.push({
      issue: `${conflicts.size} texts appear more than once with different “${labelColumn}” values.`,
      fix: "Give repeated texts the same category, or remove the extra copies.",
    });
  const final = examples.filter((e) => !conflicts.has(e.text.toLowerCase()));
  const counts = new Map<string, number>();
  for (const e of final) counts.set(e.label, (counts.get(e.label) || 0) + 1);
  const labels = [...counts]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
  if (labels.length < recipe.minLabels)
    problems.push({
      issue: `“${labelColumn}” needs at least ${recipe.minLabels} different categories.`,
      fix: "Add examples for more categories, or choose a different category column.",
    });
  if (labels.length > recipe.maxLabels)
    problems.push({
      issue: `“${labelColumn}” has ${labels.length} different values. That looks like an ID or free text, not a short list of categories.`,
      fix: `Choose a column with at most ${recipe.maxLabels} categories.`,
    });
  const small = labels.filter((l) => l.count < recipe.minPerLabel);
  if (small.length && labels.length <= recipe.maxLabels)
    problems.push({
      issue: `Some categories have fewer than ${recipe.minPerLabel} examples: ${small
        .slice(0, 6)
        .map((l) => `${l.label} (${l.count})`)
        .join(", ")}${small.length > 6 ? "…" : ""}.`,
      fix: `Add at least ${recipe.minPerLabel} examples for each category, or merge or remove the small ones.`,
    });
  if (final.length > recipe.maxExamples)
    problems.push({
      issue: `This file has ${final.length} usable examples. This recipe supports up to ${recipe.maxExamples}.`,
      fix: "Use a smaller file.",
    });
  return {
    ok: !problems.length,
    problems,
    labels,
    examples: final,
    ignored,
    duplicates,
  };
}
// Deterministic, per-category split so every category is represented in the
// examples reserved for evaluation.
export function split(examples: { text: string; label: string }[]) {
  let seed = settings.seed;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const train: typeof examples = [];
  const test: typeof examples = [];
  const groups = new Map<string, typeof examples>();
  for (const e of examples)
    groups.set(e.label, [...(groups.get(e.label) || []), e]);
  for (const group of groups.values()) {
    const shuffled = group
      .map((e) => ({ e, k: random() }))
      .sort((a, b) => a.k - b.k)
      .map((x) => x.e);
    const n = Math.max(2, Math.round(group.length * recipe.evalShare));
    test.push(...shuffled.slice(0, n));
    train.push(...shuffled.slice(n));
  }
  return { train, eval: test };
}
const unsupportedGoals: [RegExp, string][] = [
  [/summar/i, "summaries"],
  [/translat/i, "translations"],
  [/\b(write|generat|draft|compose|reply|replies|respond)/i, "written text"],
  [/\b(extract|pull out)/i, "extracted details"],
  [/\b(chat|conversation|answer questions|assistant)/i, "a chat assistant"],
  [/\b(image|photo|picture|pdf|audio|voice|video|scan)/i, "anything from files other than spreadsheet text"],
  [/\b(forecast|predict (the )?(number|amount|price|revenue|sales|value))/i, "numbers or forecasts"],
];
const classificationGoal =
  /(classif|categor|sort|route|routing|label|tag|assign|triage|bucket|flag|which (team|group|category|department|queue|topic|type)|detect)/i;
export function interpretGoal(
  goal: string,
  textColumn: string,
  labelColumn: string,
) {
  const unsupported = unsupportedGoals.find(([re]) => re.test(goal));
  if (unsupported)
    return {
      fit: "unsupported" as const,
      message: `Relay can’t train a model that produces ${unsupported[1]}. It can only train a model that reads a piece of text and picks one of the categories in a column, such as “${labelColumn}”.`,
    };
  if (classificationGoal.test(goal))
    return {
      fit: "classification" as const,
      message: `Relay will train a model that reads a “${textColumn}” and picks a “${labelColumn}”.`,
    };
  return {
    fit: "unclear" as const,
    message: `Relay couldn’t match this goal to the one kind of model it can train. If you want each “${textColumn}” sorted into a “${labelColumn}”, use the recommendation.`,
  };
}
let priceCache: { at: number; jobs: any[]; endpoints: any[] } | undefined;
export async function prices() {
  if (priceCache && Date.now() - priceCache.at < 600000) return priceCache;
  const [jobs, provider] = await Promise.all([
    fetch(`${HUB}/api/jobs/hardware`, {
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? r.json() : Promise.reject())),
    fetch(`${ENDPOINTS}/provider`, {
      signal: AbortSignal.timeout(10000),
    }).then((r) => (r.ok ? r.json() : Promise.reject())),
  ]);
  const endpoints = (provider.vendors || []).flatMap((v: any) =>
    (v.regions || []).flatMap((r: any) => r.computes || []),
  );
  priceCache = { at: Date.now(), jobs, endpoints };
  return priceCache;
}
export async function costs() {
  try {
    const p = await prices();
    return {
      training: trainingChoices.flatMap((c) => {
        const h = p.jobs.find((h: any) => h.name === c.flavor);
        if (!h || typeof h.unitCostUSD !== "number") return [];
        const minutes = h.unitLabel === "minute" ? c.timeoutMinutes : NaN;
        return [
          {
            ...c,
            hardware: h.prettyName,
            unitCostUSD: h.unitCostUSD,
            unitLabel: h.unitLabel,
            maxUSD: h.unitCostUSD * minutes,
          },
        ].filter((x) => Number.isFinite(x.maxUSD));
      }),
      hosting: hostingChoices.flatMap((c) => {
        const e = p.endpoints.find(
          (e: any) => e.id === c.id && e.status === "available",
        );
        return e && typeof e.pricePerHour === "number"
          ? [{ ...c, pricePerHour: e.pricePerHour }]
          : [];
      }),
    };
  } catch {
    return {
      training: [],
      hosting: [],
      error:
        "Relay couldn’t load current Hugging Face prices, so it can’t estimate costs right now.",
    };
  }
}
export function parsePrediction(raw: unknown, labels: string[]) {
  const list = Array.isArray(raw) && Array.isArray(raw[0]) ? raw[0] : raw;
  if (!Array.isArray(list) || !list.length)
    throw Error("The model endpoint returned an unexpected response");
  const top = list.reduce((a: any, b: any) => (b?.score > a?.score ? b : a));
  if (typeof top?.label !== "string" || typeof top?.score !== "number")
    throw Error("The model endpoint returned an unexpected response");
  if (!labels.includes(top.label))
    throw Error(`The model endpoint returned an unknown category: ${top.label}`);
  return { label: top.label as string, score: top.score as number };
}
export class HuggingFace {
  constructor(private token: string) {}
  async call(url: string, init: RequestInit = {}, raw = false) {
    const response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(init.body && !raw ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30000),
    });
    const text = await response.text();
    if (!response.ok) {
      let detail = text.slice(0, 300);
      try {
        detail = JSON.parse(text).error || JSON.parse(text).message || detail;
      } catch {}
      throw Error(`Hugging Face (${response.status}): ${detail}`);
    }
    try {
      return text ? JSON.parse(text) : {};
    } catch {
      return text;
    }
  }
  whoami() {
    return this.call(`${HUB}/api/whoami-v2`);
  }
  createRepo(type: "dataset" | "model", repo: string) {
    const [organization, name] = repo.split("/");
    return this.call(`${HUB}/api/repos/create`, {
      method: "POST",
      body: JSON.stringify({ type, name, organization, visibility: "private" }),
    });
  }
  deleteRepo(type: "dataset" | "model", repo: string) {
    const [organization, name] = repo.split("/");
    return this.call(`${HUB}/api/repos/delete`, {
      method: "DELETE",
      body: JSON.stringify({ type, name, organization }),
    });
  }
  async commit(
    type: "dataset" | "model",
    repo: string,
    files: { path: string; content: string }[],
  ) {
    const base = `${HUB}/api/${type}s/${repo}`;
    const modes = await this.call(`${base}/preupload/main`, {
      method: "POST",
      body: JSON.stringify({
        files: files.map((f) => {
          const bytes = Buffer.from(f.content);
          return {
            path: f.path,
            size: bytes.length,
            sample: bytes.subarray(0, 512).toString("base64"),
          };
        }),
      }),
    });
    if (modes.files?.some((f: any) => f.uploadMode !== "regular"))
      throw Error(
        "The prepared examples are too large to upload directly. Use a smaller file.",
      );
    const lines = [
      { key: "header", value: { summary: "Relay training data", description: "" } },
      ...files.map((f) => ({
        key: "file",
        value: {
          path: f.path,
          content: Buffer.from(f.content).toString("base64"),
          encoding: "base64",
        },
      })),
    ];
    return this.call(
      `${base}/commit/main`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-ndjson" },
        body: lines.map((l) => JSON.stringify(l)).join("\n"),
      },
      true,
    );
  }
  runJob(namespace: string, spec: unknown) {
    return this.call(`${HUB}/api/jobs/${namespace}`, {
      method: "POST",
      body: JSON.stringify(spec),
    });
  }
  job(namespace: string, id: string) {
    return this.call(`${HUB}/api/jobs/${namespace}/${id}`);
  }
  cancelJob(namespace: string, id: string) {
    return this.call(`${HUB}/api/jobs/${namespace}/${id}/cancel`, {
      method: "POST",
    });
  }
  modelInfo(repo: string) {
    return this.call(`${HUB}/api/models/${repo}`);
  }
  file(repo: string, revision: string, path: string) {
    return this.call(`${HUB}/${repo}/resolve/${revision}/${path}`);
  }
  createEndpoint(namespace: string, payload: unknown) {
    return this.call(`${ENDPOINTS}/endpoint/${namespace}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }
  endpoint(namespace: string, name: string) {
    return this.call(`${ENDPOINTS}/endpoint/${namespace}/${name}`);
  }
  deleteEndpoint(namespace: string, name: string) {
    return this.call(`${ENDPOINTS}/endpoint/${namespace}/${name}`, {
      method: "DELETE",
    });
  }
  predict(url: string, text: string) {
    return this.call(url, {
      method: "POST",
      body: JSON.stringify({ inputs: text }),
    });
  }
}
type Secrets = {
  set: (id: string, value: string) => Promise<void>;
  get: (id: string) => Promise<string>;
};
const TERMINAL = ["COMPLETED", "ERROR", "CANCELED", "DELETED"];
export class Models {
  polled = new Map<string, number>();
  busy = new Set<string>();
  constructor(
    public store: Store,
    public secrets?: Secrets,
  ) {}
  provider() {
    const p = this.store.get("provider", "huggingface");
    return p ? { connected: true, namespace: p.namespace, account: p.account } : { connected: false };
  }
  async client() {
    const p = this.store.get("provider", "huggingface");
    if (!p || !this.secrets)
      throw Error("Connect a Hugging Face account in Data first");
    const token = await this.secrets.get("huggingface");
    if (!token) throw Error("Connect a Hugging Face account in Data first");
    return { hf: new HuggingFace(token), namespace: p.namespace as string };
  }
  async connect(owner: string, token: string, namespace?: string) {
    if (!this.secrets) throw Error("Secure credential storage is unavailable");
    const me = await new HuggingFace(token).whoami();
    const allowed = [me.name, ...(me.orgs || []).map((o: any) => o.name)];
    const chosen = namespace || me.name;
    if (!allowed.includes(chosen))
      throw Error(`This token can’t use the “${chosen}” account`);
    await this.secrets.set("huggingface", token);
    this.store.put("provider", {
      id: "huggingface",
      namespace: chosen,
      account: me.name,
      connectedBy: owner,
      connected: new Date().toISOString(),
    });
    return this.provider();
  }
  async disconnect() {
    if (
      this.store
        .all<Model>("model")
        .some((m) => ["Preparing", "Training", "Publishing", "Published"].includes(m.state))
    )
      throw Error("Stop training and hosting before disconnecting Hugging Face");
    await this.secrets?.set("huggingface", "");
    this.store.delete("provider", "huggingface");
    return true;
  }
  async plan(p: Record<string, unknown>) {
    const c = this.store.get<Collection>("collection", String(p.collectionId));
    if (!c) throw Error("Data collection not found");
    const { columns, rows, sample, suggestion } = await inspect(c);
    const textColumn = String(p.textColumn || suggestion?.textColumn || "");
    const labelColumn = String(p.labelColumn || suggestion?.labelColumn || "");
    const result = check(rows, textColumn, labelColumn);
    const parts = result.ok ? split(result.examples) : undefined;
    const goal = String(p.goal || "").trim();
    return {
      collection: { id: c.id, name: c.name, fileName: c.fileName, team: c.team, rows: rows.length },
      columns,
      sample,
      suggestion,
      textColumn,
      labelColumn,
      check: { ...result, examples: undefined },
      counts: parts && { train: parts.train.length, eval: parts.eval.length },
      goal: goal ? interpretGoal(goal, textColumn, labelColumn) : undefined,
      provider: this.provider(),
      baseModel: BASE_MODEL,
      settings,
      ...(await costs()),
    };
  }
  async train(owner: string, p: Record<string, unknown>) {
    if (p.approved !== true) throw Error("Approve the training cost first");
    const c = this.store.get<Collection>("collection", String(p.collectionId));
    if (!c) throw Error("Data collection not found");
    const textColumn = String(p.textColumn);
    const labelColumn = String(p.labelColumn);
    const result = check((await readTable(c.path)).rows, textColumn, labelColumn);
    if (!result.ok) throw Error(result.problems.map((x) => x.issue).join(" "));
    const goal = String(p.goal || "").trim();
    if (!goal) throw Error("Describe the goal or choose the recommendation");
    if (interpretGoal(goal, textColumn, labelColumn).fit !== "classification")
      throw Error("This goal doesn’t fit the text classification recipe");
    const choice = (await costs()).training.find((t) => t.flavor === p.flavor);
    if (!choice) throw Error("Choose a training option with a current price");
    const { hf, namespace } = await this.client();
    const parts = split(result.examples);
    const id = randomUUID();
    const short = id.slice(0, 8);
    const model: Model = {
      id,
      name: String(p.name || "").trim().slice(0, 100) || `${c.name} classifier`,
      goal,
      team: c.team,
      collectionId: c.id,
      fileName: c.fileName,
      textColumn,
      labelColumn,
      labels: result.labels.map((l) => l.label),
      counts: { train: parts.train.length, eval: parts.eval.length },
      baseModel: BASE_MODEL,
      settings,
      flavor: choice.flavor,
      timeoutMinutes: choice.timeoutMinutes,
      trainingEstimate: {
        unitCostUSD: choice.unitCostUSD,
        unitLabel: choice.unitLabel,
        maxUSD: choice.maxUSD,
      },
      namespace,
      dataRepo: `${namespace}/relay-data-${short}`,
      modelRepo: `${namespace}/relay-model-${short}`,
      state: "Preparing",
      status: "Uploading prepared examples",
      createdBy: owner,
      created: new Date().toISOString(),
    };
    this.store.put("model", model);
    try {
      const jsonl = (rows: typeof parts.train) =>
        rows.map((r) => JSON.stringify(r)).join("\n") + "\n";
      await hf.createRepo("dataset", model.dataRepo);
      await hf.commit("dataset", model.dataRepo, [
        { path: "train.jsonl", content: jsonl(parts.train) },
        { path: "eval.jsonl", content: jsonl(parts.eval) },
      ]);
      await hf.createRepo("model", model.modelRepo);
      const job = await hf.runJob(namespace, {
        dockerImage: TRAIN_IMAGE,
        command: [
          "bash",
          "-c",
          'pip install --quiet transformers==4.48.3 accelerate==1.3.0 && python -c "$RELAY_TRAIN_SCRIPT"',
        ],
        arguments: [],
        environment: {
          RELAY_TRAIN_SCRIPT: TRAIN_SCRIPT,
          RELAY_CONFIG: JSON.stringify({
            ...settings,
            base_model: BASE_MODEL,
            labels: model.labels,
            data_repo: model.dataRepo,
            model_repo: model.modelRepo,
          }),
        },
        secrets: { HF_TOKEN: await this.secrets!.get("huggingface") },
        flavor: model.flavor,
        timeoutSeconds: model.timeoutMinutes * 60,
        labels: { relay: model.id },
      });
      return this.store.put("model", {
        ...model,
        jobId: job.id,
        state: "Training",
        status: job.status?.stage || "SCHEDULING",
      });
    } catch (e) {
      this.store.put("model", {
        ...model,
        state: "Failed",
        error: `Training could not start: ${(e as Error).message}`,
      });
      await hf.deleteRepo("dataset", model.dataRepo).catch(() => {});
      await hf.deleteRepo("model", model.modelRepo).catch(() => {});
      throw e;
    }
  }
  async cancel(id: string) {
    const m = this.get(id);
    if (m.state !== "Training" || !m.jobId) throw Error("This model isn’t training");
    const { hf } = await this.client();
    await hf.cancelJob(m.namespace, m.jobId);
    await hf.deleteRepo("dataset", m.dataRepo).catch(() => {});
    return this.store.put("model", { ...m, state: "Cancelled", status: "CANCELED" });
  }
  async publish(owner: string, id: string, p: Record<string, unknown>) {
    if (p.approved !== true) throw Error("Approve the hosting cost first");
    const m = this.get(id);
    if (m.state !== "Evaluated" || !m.evaluation || !m.revision)
      throw Error("Publish is available after training and evaluation");
    const choice = (await costs()).hosting.find((h) => h.id === p.hosting);
    if (!choice) throw Error("Choose a hosting option with a current price");
    const { hf } = await this.client();
    const endpoint = `relay-${m.id.slice(0, 8)}`;
    await hf.createEndpoint(m.namespace, {
      name: endpoint,
      type: "authenticated",
      provider: { vendor: choice.vendor, region: choice.region },
      compute: {
        accelerator: choice.accelerator,
        instanceType: choice.instanceType,
        instanceSize: choice.instanceSize,
        scaling: { minReplica: 1, maxReplica: 1 },
      },
      model: {
        repository: m.modelRepo,
        revision: m.revision,
        framework: "pytorch",
        task: "text-classification",
        image: { huggingface: {} },
      },
    });
    return this.store.put("model", {
      ...m,
      state: "Publishing",
      status: "pending",
      error: undefined,
      hosting: {
        compute: choice.id,
        pricePerHour: choice.pricePerHour,
        endpoint,
        approvedBy: owner,
      },
    });
  }
  async unpublish(id: string) {
    const m = this.get(id);
    if (!["Publishing", "Published"].includes(m.state) || !m.hosting)
      throw Error("This model isn’t hosted");
    const { hf } = await this.client();
    await hf.deleteEndpoint(m.namespace, m.hosting.endpoint);
    return this.store.put("model", {
      ...m,
      state: "Evaluated",
      status: undefined,
      hosting: undefined,
    });
  }
  access(owner: string, id: string) {
    const m = this.get(id);
    const e = this.store.employee(owner);
    if (e.role !== "admin" && e.team !== m.team)
      throw Error("Model not available to your team");
    return m;
  }
  async predict(owner: string, id: string, input: unknown) {
    const m = this.access(owner, id);
    if (m.state !== "Published" || !m.hosting?.url)
      throw Error("This model isn’t published");
    const text = String(input ?? "").trim();
    if (!text || text.length > 10000)
      throw Error("Provide text up to 10,000 characters");
    const { hf } = await this.client();
    return {
      ...parsePrediction(await hf.predict(m.hosting.url, text), m.labels),
      model: m.id,
      revision: m.revision,
    };
  }
  get(id: string) {
    const m = this.store.get<Model>("model", id);
    if (!m) throw Error("Model not found");
    return m;
  }
  recover() {
    for (const m of this.store.all<Model>("model"))
      if (m.state === "Preparing")
        this.store.put("model", {
          ...m,
          state: "Failed",
          error:
            "Relay closed while preparing training. Check your Hugging Face jobs page; no result was recorded.",
        });
  }
  async poll(force = false) {
    for (const m of this.store.all<Model>("model")) {
      if (!["Training", "Publishing"].includes(m.state) || this.busy.has(m.id))
        continue;
      if (!force && Date.now() - (this.polled.get(m.id) || 0) < 15000) continue;
      this.polled.set(m.id, Date.now());
      this.busy.add(m.id);
      try {
        if (m.state === "Training") await this.pollJob(m);
        else await this.pollEndpoint(m);
      } catch (e) {
        this.store.put("model", {
          ...this.get(m.id),
          status: `Couldn’t check status: ${(e as Error).message}`,
        });
      } finally {
        this.busy.delete(m.id);
      }
    }
  }
  async pollJob(m: Model) {
    const { hf } = await this.client();
    const job = await hf.job(m.namespace, m.jobId!);
    const stage = job.status?.stage || "UNKNOWN";
    if (!TERMINAL.includes(stage)) {
      this.store.put("model", { ...m, status: stage });
      return;
    }
    await hf.deleteRepo("dataset", m.dataRepo).catch(() => {});
    if (stage !== "COMPLETED") {
      this.store.put("model", {
        ...m,
        state: stage === "ERROR" ? "Failed" : "Cancelled",
        status: stage,
        error:
          stage === "ERROR"
            ? `Training failed: ${job.status?.message || "the job reported an error"}`
            : undefined,
      });
      return;
    }
    try {
      const revision = (await hf.modelInfo(m.modelRepo)).sha;
      const evaluation = await hf.file(m.modelRepo, revision, "relay_eval.json");
      if (typeof evaluation?.accuracy !== "number" || !revision) throw Error();
      this.store.put("model", {
        ...m,
        state: "Evaluated",
        status: stage,
        revision,
        evaluation,
      });
    } catch {
      this.store.put("model", {
        ...m,
        state: "Failed",
        status: stage,
        error: "Training finished, but no evaluation was saved with the model.",
      });
    }
  }
  async pollEndpoint(m: Model) {
    const { hf } = await this.client();
    const e = await hf.endpoint(m.namespace, m.hosting!.endpoint);
    const state = e.status?.state;
    if (["failed", "updateFailed"].includes(state)) {
      await hf.deleteEndpoint(m.namespace, m.hosting!.endpoint).catch(() => {});
      this.store.put("model", {
        ...m,
        state: "Evaluated",
        status: undefined,
        hosting: undefined,
        error: `Hosting failed to start: ${e.status?.message || state}. The endpoint was removed.`,
      });
      return;
    }
    if (state !== "running" || !e.status?.url) {
      this.store.put("model", { ...m, status: state });
      return;
    }
    try {
      parsePrediction(
        await hf.predict(
          e.status.url,
          m.evaluation?.samples[0]?.text || "Relay readiness check",
        ),
        m.labels,
      );
    } catch (error) {
      const checks = (m.hosting!.checks || 0) + 1;
      if (checks < 5) {
        this.store.put("model", {
          ...m,
          status: "Testing the hosted model",
          hosting: { ...m.hosting!, checks },
        });
        return;
      }
      await hf.deleteEndpoint(m.namespace, m.hosting!.endpoint).catch(() => {});
      this.store.put("model", {
        ...m,
        state: "Evaluated",
        status: undefined,
        hosting: undefined,
        error: `The hosted model failed its test request (${(error as Error).message}). Hosting was stopped.`,
      });
      return;
    }
    this.store.put("model", {
      ...m,
      state: "Published",
      status: "running",
      error: undefined,
      hosting: { ...m.hosting!, url: e.status.url },
    });
  }
}
