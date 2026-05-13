import { z } from "zod";

export const emailSchema = z.string().email().max(254).transform((email) => email.toLowerCase());
export const passwordSchema = z.string().min(12).max(256);
export const uuidSchema = z.string().uuid();

export const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: emailSchema,
  password: passwordSchema,
  workspaceName: z.string().min(2).max(120)
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(256)
});

export const workspaceSchema = z.object({
  name: z.string().min(2).max(120),
  regressionThreshold: z.coerce.number().min(0).max(1).default(0.05),
  latencyBudgetMs: z.coerce.number().int().min(100).max(120000).default(5000),
  dailyCostBudgetCents: z.coerce.number().int().min(0).max(10_000_000).default(10000)
});

export const datasetSchema = z.object({
  workspaceId: uuidSchema,
  name: z.string().min(2).max(160),
  description: z.string().max(2000).default("")
});

export const testCaseSchema = z.object({
  datasetId: uuidSchema,
  input: z.string().min(1).max(20000),
  context: z.string().max(50000).default(""),
  expectedOutput: z.string().min(1).max(50000),
  evaluationType: z.enum(["exact_match", "json_schema", "rubric", "security", "tool_call", "manual"]),
  criteria: z.record(z.string(), z.unknown()).default({}),
  tags: z.array(z.string().min(1).max(40)).max(20).default([]),
  difficulty: z.string().min(2).max(40).default("medium"),
  category: z.string().min(2).max(80).default("general")
});

export const promptVersionSchema = z.object({
  workspaceId: uuidSchema,
  name: z.string().min(2).max(160),
  template: z.string().min(1).max(100000),
  variables: z.array(z.string().min(1).max(80)).max(50).default([]),
  modelProvider: z.string().min(2).max(60).default("openai"),
  model: z.string().min(2).max(120),
  temperature: z.coerce.number().min(0).max(2).default(0.2),
  tools: z.array(z.record(z.string(), z.unknown())).default([]),
  notes: z.string().max(4000).default("")
});

export const createRunSchema = z.object({
  workspaceId: uuidSchema,
  datasetId: uuidSchema,
  promptVersionId: uuidSchema,
  baselineRunId: uuidSchema.optional()
});

export const ciRunSchema = z.object({
  datasetSlug: z.string().min(1).max(160),
  promptName: z.string().min(1).max(160),
  baselineRunId: uuidSchema.optional()
});

export const apiKeySchema = z.object({
  workspaceId: uuidSchema,
  name: z.string().min(2).max(120),
  scopes: z.array(z.enum(["evaluations:run", "results:read", "traces:write"])).min(1).max(3)
});

export const providerKeySchema = z.object({
  workspaceId: uuidSchema,
  provider: z.enum(["openrouter"]).default("openrouter"),
  name: z.string().min(2).max(120).default("OpenRouter"),
  apiKey: z.string().min(16).max(500),
  baseUrl: z.string().url().default("https://openrouter.ai/api/v1")
});

export const traceIngestSchema = z.object({
  requestId: z.string().min(1).max(200),
  promptVersionId: uuidSchema.optional(),
  model: z.string().min(1).max(120),
  tokensInput: z.coerce.number().int().min(0).default(0),
  tokensOutput: z.coerce.number().int().min(0).default(0),
  costCents: z.coerce.number().int().min(0).default(0),
  latencyMs: z.coerce.number().int().min(0).default(0),
  error: z.string().max(2000).optional(),
  toolCalls: z.array(z.record(z.string(), z.unknown())).default([]),
  output: z.string().max(100000).default(""),
  feedback: z.string().max(4000).optional()
});
