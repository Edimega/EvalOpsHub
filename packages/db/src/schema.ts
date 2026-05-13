import { relations, sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const memberRole = pgEnum("member_role", ["owner", "admin", "member", "viewer"]);
export const evaluationType = pgEnum("evaluation_type", [
  "exact_match",
  "json_schema",
  "rubric",
  "security",
  "tool_call",
  "manual"
]);
export const runStatus = pgEnum("run_status", ["queued", "running", "completed", "failed"]);
export const alertStatus = pgEnum("alert_status", ["open", "acknowledged", "resolved"]);
export const apiScope = pgEnum("api_scope", ["evaluations:run", "results:read", "traces:write"]);

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  ...timestamps
}, (table) => ({
  emailIdx: uniqueIndex("users_email_idx").on(sql`lower(${table.email})`)
}));

export const sessions = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  userIdx: index("sessions_user_idx").on(table.userId),
  tokenIdx: index("sessions_token_idx").on(table.tokenHash)
}));

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  regressionThreshold: numeric("regression_threshold", { precision: 5, scale: 2 }).notNull().default("0.05"),
  latencyBudgetMs: integer("latency_budget_ms").notNull().default(5000),
  dailyCostBudgetCents: integer("daily_cost_budget_cents").notNull().default(10000),
  ...timestamps
});

export const workspaceMembers = pgTable("workspace_members", {
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  role: memberRole("role").notNull().default("member"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  pk: primaryKey({ columns: [table.workspaceId, table.userId] }),
  userIdx: index("workspace_members_user_idx").on(table.userId)
}));

export const datasets = pgTable("datasets", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  description: text("description").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  ...timestamps
}, (table) => ({
  workspaceSlugIdx: uniqueIndex("datasets_workspace_slug_idx").on(table.workspaceId, table.slug),
  workspaceIdx: index("datasets_workspace_idx").on(table.workspaceId)
}));

export const testCases = pgTable("test_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  datasetId: uuid("dataset_id").notNull().references(() => datasets.id, { onDelete: "cascade" }),
  input: text("input").notNull(),
  context: text("context").notNull().default(""),
  expectedOutput: text("expected_output").notNull(),
  evaluationType: evaluationType("evaluation_type").notNull().default("exact_match"),
  criteria: jsonb("criteria").$type<Record<string, unknown>>().notNull().default({}),
  tags: jsonb("tags").$type<string[]>().notNull().default([]),
  difficulty: text("difficulty").notNull().default("medium"),
  category: text("category").notNull().default("general"),
  ...timestamps
}, (table) => ({
  datasetIdx: index("test_cases_dataset_idx").on(table.datasetId)
}));

export const promptVersions = pgTable("prompt_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  authorId: uuid("author_id").notNull().references(() => users.id),
  name: text("name").notNull(),
  version: integer("version").notNull(),
  template: text("template").notNull(),
  variables: jsonb("variables").$type<string[]>().notNull().default([]),
  modelProvider: text("model_provider").notNull().default("openai"),
  model: text("model").notNull(),
  temperature: numeric("temperature", { precision: 3, scale: 2 }).notNull().default("0.20"),
  tools: jsonb("tools").$type<Array<Record<string, unknown>>>().notNull().default([]),
  notes: text("notes").notNull().default(""),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  ...timestamps
}, (table) => ({
  workspaceNameVersionIdx: uniqueIndex("prompt_versions_workspace_name_version_idx").on(table.workspaceId, table.name, table.version),
  workspaceIdx: index("prompt_versions_workspace_idx").on(table.workspaceId)
}));

export const evaluationRuns = pgTable("evaluation_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  datasetId: uuid("dataset_id").notNull().references(() => datasets.id),
  promptVersionId: uuid("prompt_version_id").notNull().references(() => promptVersions.id),
  baselineRunId: uuid("baseline_run_id"),
  status: runStatus("status").notNull().default("queued"),
  score: numeric("score", { precision: 6, scale: 4 }),
  baselineScore: numeric("baseline_score", { precision: 6, scale: 4 }),
  regressionDetected: boolean("regression_detected").notNull().default(false),
  costCents: integer("cost_cents").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  errorCount: integer("error_count").notNull().default(0),
  startedAt: timestamp("started_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  failureReason: text("failure_reason"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps
}, (table) => ({
  workspaceIdx: index("evaluation_runs_workspace_idx").on(table.workspaceId),
  datasetIdx: index("evaluation_runs_dataset_idx").on(table.datasetId)
}));

export const evaluationResults = pgTable("evaluation_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  runId: uuid("run_id").notNull().references(() => evaluationRuns.id, { onDelete: "cascade" }),
  testCaseId: uuid("test_case_id").notNull().references(() => testCases.id),
  actualOutput: text("actual_output").notNull(),
  passed: boolean("passed").notNull(),
  score: numeric("score", { precision: 6, scale: 4 }).notNull(),
  latencyMs: integer("latency_ms").notNull().default(0),
  costCents: integer("cost_cents").notNull().default(0),
  error: text("error"),
  evidence: jsonb("evidence").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  runIdx: index("evaluation_results_run_idx").on(table.runId)
}));

export const alerts = pgTable("alerts", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  runId: uuid("run_id").references(() => evaluationRuns.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  severity: text("severity").notNull().default("medium"),
  status: alertStatus("status").notNull().default("open"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true })
}, (table) => ({
  workspaceIdx: index("alerts_workspace_idx").on(table.workspaceId)
}));

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  prefix: text("prefix").notNull(),
  scopes: apiScope("scopes").array().notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  workspaceIdx: index("api_keys_workspace_idx").on(table.workspaceId)
}));

export const providerKeys = pgTable("provider_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  name: text("name").notNull(),
  keyPreview: text("key_preview").notNull(),
  encryptedKey: text("encrypted_key").notNull(),
  baseUrl: text("base_url").notNull(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  workspaceProviderIdx: index("provider_keys_workspace_provider_idx").on(table.workspaceId, table.provider),
  activeProviderIdx: uniqueIndex("provider_keys_active_provider_idx")
    .on(table.workspaceId, table.provider)
    .where(sql`${table.revokedAt} is null`)
}));

export const llmTraces = pgTable("llm_traces", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  promptVersionId: uuid("prompt_version_id").references(() => promptVersions.id),
  model: text("model").notNull(),
  tokensInput: integer("tokens_input").notNull().default(0),
  tokensOutput: integer("tokens_output").notNull().default(0),
  costCents: integer("cost_cents").notNull().default(0),
  latencyMs: integer("latency_ms").notNull().default(0),
  error: text("error"),
  toolCalls: jsonb("tool_calls").$type<Array<Record<string, unknown>>>().notNull().default([]),
  output: text("output").notNull().default(""),
  feedback: text("feedback"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => ({
  workspaceIdx: index("llm_traces_workspace_idx").on(table.workspaceId),
  requestIdx: index("llm_traces_request_idx").on(table.requestId)
}));

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").references(() => workspaces.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  memberships: many(workspaceMembers)
}));

export const workspacesRelations = relations(workspaces, ({ many }) => ({
  datasets: many(datasets),
  prompts: many(promptVersions),
  runs: many(evaluationRuns),
  members: many(workspaceMembers),
  providerKeys: many(providerKeys)
}));

export const datasetsRelations = relations(datasets, ({ many, one }) => ({
  workspace: one(workspaces, { fields: [datasets.workspaceId], references: [workspaces.id] }),
  testCases: many(testCases)
}));

export const evaluationRunsRelations = relations(evaluationRuns, ({ many, one }) => ({
  dataset: one(datasets, { fields: [evaluationRuns.datasetId], references: [datasets.id] }),
  promptVersion: one(promptVersions, { fields: [evaluationRuns.promptVersionId], references: [promptVersions.id] }),
  results: many(evaluationResults)
}));
