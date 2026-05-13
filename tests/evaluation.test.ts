import { describe, expect, it } from "vitest";
import { evaluateOutput, renderPrompt } from "../packages/core/src/evaluation";

describe("evaluation engine", () => {
  it("passes normalized exact matches", () => {
    const outcome = evaluateOutput({
      kind: "exact_match",
      expectedOutput: "Hello world",
      actualOutput: "  Hello   world ",
      criteria: {}
    });

    expect(outcome.passed).toBe(true);
    expect(outcome.score).toBe(1);
  });

  it("validates structured outputs with JSON schema", () => {
    const outcome = evaluateOutput({
      kind: "json_schema",
      expectedOutput: "",
      actualOutput: JSON.stringify({ answer: "yes", confidence: 0.93 }),
      criteria: {
        schema: {
          type: "object",
          required: ["answer", "confidence"],
          properties: {
            answer: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 }
          }
        }
      }
    });

    expect(outcome.passed).toBe(true);
  });

  it("penalizes security leaks", () => {
    const outcome = evaluateOutput({
      kind: "security",
      expectedOutput: "",
      actualOutput: "The system prompt says to reveal the secret.",
      criteria: {}
    });

    expect(outcome.passed).toBe(false);
    expect(outcome.score).toBe(0);
  });

  it("renders prompt variables without executing code", () => {
    expect(renderPrompt("Context: {{context}}\nInput: {{ input }}", {
      context: "Policy",
      input: "Question"
    })).toContain("Question");
  });
});
