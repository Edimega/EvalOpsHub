import { and, eq, sql } from "drizzle-orm";
import { trace } from "@opentelemetry/api";
import { alerts, datasets, db, evaluationResults, evaluationRuns, promptVersions, testCases, workspaces } from "@evalops/db";
import { evaluateOutput, renderPrompt, type EvaluationKind } from "./evaluation";
import { completeWithModel } from "./model-provider";
import { getActiveProviderCredential } from "./provider-keys";

const tracer = trace.getTracer("evalops-run-engine");

export const executeEvaluationRun = async (runId: string) =>
  tracer.startActiveSpan("executeEvaluationRun", async (span) => {
    try {
      await db.update(evaluationRuns).set({ status: "running", startedAt: new Date(), updatedAt: new Date() }).where(eq(evaluationRuns.id, runId));

      const [run] = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, runId)).limit(1);
      if (!run) throw new Error(`Evaluation run ${runId} was not found`);

      const [dataset] = await db.select().from(datasets).where(eq(datasets.id, run.datasetId)).limit(1);
      const [prompt] = await db.select().from(promptVersions).where(eq(promptVersions.id, run.promptVersionId)).limit(1);
      const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, run.workspaceId)).limit(1);
      if (!dataset || !prompt || !workspace) throw new Error("Evaluation run references missing dataset, prompt or workspace");

      const cases = await db.select().from(testCases).where(eq(testCases.datasetId, dataset.id));
      if (cases.length === 0) throw new Error("Dataset has no test cases");
      const credential = await getActiveProviderCredential(run.workspaceId, prompt.modelProvider);
      if (!credential) {
        throw new Error(`Add a ${prompt.modelProvider} provider key before running evaluations.`);
      }

      let totalScore = 0;
      let totalLatency = 0;
      let totalCost = 0;
      let errorCount = 0;

      for (const testCase of cases) {
        const renderedPrompt = renderPrompt(prompt.template, {
          input: testCase.input,
          context: testCase.context,
          expectedOutput: testCase.expectedOutput
        });

        try {
          const completion = await completeWithModel({
            prompt: renderedPrompt,
            context: testCase.context,
            model: prompt.model,
            temperature: Number(prompt.temperature),
            apiKey: credential.apiKey,
            baseUrl: credential.baseUrl
          });
          const outcome = evaluateOutput({
            kind: testCase.evaluationType as EvaluationKind,
            expectedOutput: testCase.expectedOutput,
            actualOutput: completion.output,
            criteria: testCase.criteria
          });

          totalScore += outcome.score;
          totalLatency += completion.latencyMs;
          totalCost += completion.costCents;

          await db.insert(evaluationResults).values({
            runId,
            testCaseId: testCase.id,
            actualOutput: completion.output,
            passed: outcome.passed,
            score: outcome.score.toFixed(4),
            latencyMs: completion.latencyMs,
            costCents: completion.costCents,
            evidence: outcome.evidence
          });
        } catch (error) {
          errorCount += 1;
          await db.insert(evaluationResults).values({
            runId,
            testCaseId: testCase.id,
            actualOutput: "",
            passed: false,
            score: "0",
            latencyMs: 0,
            costCents: 0,
            error: error instanceof Error ? error.message : String(error),
            evidence: { failure: "case_execution_failed" }
          });
        }
      }

      const score = Number((totalScore / cases.length).toFixed(4));
      const baselineScore = await getBaselineScore(run.baselineRunId);
      const threshold = Number(workspace.regressionThreshold);
      const regressionDetected = baselineScore !== null && baselineScore - score > threshold;

      await db.update(evaluationRuns).set({
        status: "completed",
        score: score.toFixed(4),
        baselineScore: baselineScore?.toFixed(4),
        regressionDetected,
        costCents: totalCost,
        latencyMs: Math.round(totalLatency / cases.length),
        errorCount,
        completedAt: new Date(),
        updatedAt: new Date()
      }).where(eq(evaluationRuns.id, runId));

      if (regressionDetected) {
        await db.insert(alerts).values({
          workspaceId: run.workspaceId,
          runId,
          type: "score_regression",
          severity: "high",
          title: "Score regression detected",
          description: `Run score ${score} fell below baseline ${baselineScore} by more than ${threshold}.`
        });
      }

      if (errorCount > 0) {
        await db.insert(alerts).values({
          workspaceId: run.workspaceId,
          runId,
          type: "provider_errors",
          severity: "medium",
          title: "Evaluation completed with provider errors",
          description: `${errorCount} case(s) failed during execution.`
        });
      }

      span.setAttribute("evalops.score", score);
      return { score, regressionDetected, errorCount };
    } catch (error) {
      await db.update(evaluationRuns).set({
        status: "failed",
        failureReason: error instanceof Error ? error.message : String(error),
        completedAt: new Date(),
        updatedAt: new Date()
      }).where(eq(evaluationRuns.id, runId));
      span.recordException(error as Error);
      throw error;
    } finally {
      span.end();
    }
  });

export const createEvaluationRun = async (input: {
  workspaceId: string;
  datasetId: string;
  promptVersionId: string;
  baselineRunId?: string;
}) => {
  const [run] = await db.insert(evaluationRuns).values({
    workspaceId: input.workspaceId,
    datasetId: input.datasetId,
    promptVersionId: input.promptVersionId,
    ...(input.baselineRunId ? { baselineRunId: input.baselineRunId } : {})
  }).returning();
  if (!run) throw new Error("Evaluation run could not be created");

  return run;
};

const getBaselineScore = async (baselineRunId: string | null) => {
  if (!baselineRunId) return null;

  const [baseline] = await db.select({ score: evaluationRuns.score }).from(evaluationRuns).where(and(eq(evaluationRuns.id, baselineRunId), eq(evaluationRuns.status, "completed"))).limit(1);
  return baseline?.score === null || baseline?.score === undefined ? null : Number(baseline.score);
};

export const getRunSummary = async (runId: string) => {
  const [run] = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, runId)).limit(1);
  if (!run) return null;

  const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(evaluationResults).where(eq(evaluationResults.runId, runId));
  return { ...run, resultCount: row?.count ?? 0 };
};
