export type ModelCompletionInput = {
  prompt: string;
  context?: string;
  model: string;
  temperature: number;
  apiKey: string;
  baseUrl: string;
};

export type ModelCompletion = {
  output: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
};

type OpenAIResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

const estimateTokens = (value: string) => Math.ceil(value.length / 4);

export const completeWithModel = async (input: ModelCompletionInput): Promise<ModelCompletion> => {
  const startedAt = performance.now();
  const response = await fetch(`${input.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      temperature: input.temperature,
      messages: [
        { role: "system", content: input.prompt },
        { role: "user", content: input.context ? `${input.context}\n\n${input.prompt}` : input.prompt }
      ]
    })
  });

  const latencyMs = Math.round(performance.now() - startedAt);
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Model provider returned ${response.status}: ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as OpenAIResponse;
  const output = payload.choices?.[0]?.message?.content?.trim() ?? "";
  if (!output) throw new Error("Model provider returned an empty completion");

  const inputTokens = payload.usage?.prompt_tokens ?? estimateTokens(input.prompt);
  const outputTokens = payload.usage?.completion_tokens ?? estimateTokens(output);

  return {
    output,
    latencyMs,
    inputTokens,
    outputTokens,
    costCents: estimateCostCents(input.model, inputTokens, outputTokens)
  };
};

const estimateCostCents = (model: string, inputTokens: number, outputTokens: number) => {
  const pricing = parsePricing();
  const modelPricing = pricing[model];
  if (!modelPricing) return 0;

  const dollars = (inputTokens / 1_000_000) * modelPricing.input + (outputTokens / 1_000_000) * modelPricing.output;
  return Math.ceil(dollars * 100);
};

const parsePricing = (): Record<string, { input: number; output: number }> => {
  const raw = process.env.MODEL_PRICING_JSON;
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw) as Record<string, { input: number; output: number }>;
    return parsed;
  } catch {
    return {};
  }
};
