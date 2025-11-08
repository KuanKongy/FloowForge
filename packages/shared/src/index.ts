// Types shared between FlowForge web and api.
// Mirrors the Pydantic models in api/schemas.py.

export type NodeType =
  | "textbox"
  | "imagebox"
  | "audiobox"
  | "filebox"
  | "chatbox"
  | "header"
  | "button"
  | "llm"
  | "imagegen"
  | "audiogen"
  | "fileparser"
  | "subflow"
  | "prompt_template"
  | "webhook_in"
  | "manual_in";

export type WaitStrategy = "barrier" | "race";

export interface FlowNodeData {
  /** Display name overriding the node-type default. */
  name?: string;
  /** Whether the node is collapsed in the editor (header-only). */
  collapsed?: boolean;
  /** Race-vs-barrier semantics for multi-parent nodes. */
  wait_strategy?: WaitStrategy;
  /** Static value used when this node is a snapshot input outside the run scope. */
  value?: unknown;
  /** Friendly label of the AI model (mapped to provider id by the engine). */
  model?: string;
  /** Free-form additional fields (provider options, raw config, etc.). */
  [key: string]: unknown;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  position: { x: number; y: number };
  data: FlowNodeData;
}

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface FlowGraph {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

export type IoType = "text" | "image" | "audio" | "file" | "json";

export interface IoPort {
  name: string;
  type: IoType;
  required?: boolean;
}

export interface FlowVersion {
  id: string;
  flow_id: string;
  version: number;
  graph: FlowGraph;
  inputs: IoPort[];
  outputs: IoPort[];
  created_at: string;
}

export interface Flow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  tags: string[];
  is_subflow: boolean;
  is_published: boolean;
  current_version_id: string | null;
  created_at: string;
  updated_at: string;
}

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export type TriggerKind = "manual" | "webhook" | "schedule" | "subflow";


function buildSchemaSearchSearchText(record: Record<string, unknown>): string {
  return ['name', 'title', 'description', 'status']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function filterSchemaSearchRecords<T extends Record<string, unknown>>(records: T[], query: string): T[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return records;
  return records.filter((record) => buildSchemaSearchSearchText(record).includes(needle));
}

export interface Run {
  id: string;
  flow_id: string;
  flow_version_id: string;
  user_id: string;
  status: RunStatus;
  trigger_kind: TriggerKind;
  input: unknown;
  output: unknown;
  error: string | null;
  started_at: string | null;
  ended_at: string | null;
}


type SchemaHistoryRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readSchemaHistoryLabel(record: SchemaHistoryRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortSchemaHistoryRecords(records: SchemaHistoryRecord[]): SchemaHistoryRecord[] {
  return records.slice().sort((a, b) => readSchemaHistoryLabel(a).localeCompare(readSchemaHistoryLabel(b)));
}

export type RunEventKind =
  | "run_started"
  | "run_succeeded"
  | "run_failed"
  | "run_cancelled"
  | "node_started"
  | "node_succeeded"
  | "node_failed"
  | "node_skipped"
  | "log";

export interface RunEvent {
  id: string;
  run_id: string;
  node_id: string | null;
  kind: RunEventKind;
  payload: Record<string, unknown>;
  duration_ms: number | null;
  ts: string;
}

/** Helper for the client-side topo-order badges. */
export interface OrderInfo {
  step: number;
  parallelGroup: number;
}

export interface Trigger {
  id: string;
  flow_id: string;
  user_id: string;
  kind: "webhook" | "schedule" | "manual";
  config: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
}

export interface CustomNode {
  id: string;
  user_id: string;
  kind: "subflow" | "prompt_template";
  name: string;
  icon: string | null;
  schema: { inputs: IoPort[]; outputs: IoPort[] };
  body: Record<string, unknown>;
  created_at: string;
}

export interface Integration {
  id: string;
  user_id: string;
  provider: "openai" | "gemini" | "cloudflare";
  label: string;
  created_at: string;
}
