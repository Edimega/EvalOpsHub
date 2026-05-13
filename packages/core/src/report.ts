import { eq } from "drizzle-orm";
import { datasets, db, evaluationResults, evaluationRuns, promptVersions, testCases } from "@evalops/db";

export const buildRunMarkdownReport = async (runId: string) => {
  const [run] = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, runId)).limit(1);
  if (!run) throw new Error(`Run ${runId} was not found`);

  const [dataset] = await db.select().from(datasets).where(eq(datasets.id, run.datasetId)).limit(1);
  const [prompt] = await db.select().from(promptVersions).where(eq(promptVersions.id, run.promptVersionId)).limit(1);
  const results = await db
    .select({
      id: evaluationResults.id,
      passed: evaluationResults.passed,
      score: evaluationResults.score,
      error: evaluationResults.error,
      input: testCases.input,
      category: testCases.category
    })
    .from(evaluationResults)
    .innerJoin(testCases, eq(testCases.id, evaluationResults.testCaseId))
    .where(eq(evaluationResults.runId, runId));

  const rows = results.map((result) => `| ${result.passed ? "pass" : "fail"} | ${result.score} | ${escapeCell(result.category)} | ${escapeCell(result.input.slice(0, 120))} | ${escapeCell(result.error ?? "")} |`).join("\n");

  return [
    `# EvalOps Run ${run.id}`,
    "",
    `- Dataset: ${dataset?.name ?? run.datasetId}`,
    `- Prompt: ${prompt?.name ?? run.promptVersionId}`,
    `- Status: ${run.status}`,
    `- Score: ${run.score ?? "n/a"}`,
    `- Regression: ${run.regressionDetected ? "yes" : "no"}`,
    `- Cost cents: ${run.costCents}`,
    `- Average latency ms: ${run.latencyMs}`,
    "",
    "| Result | Score | Category | Input | Error |",
    "| --- | ---: | --- | --- | --- |",
    rows || "| n/a | n/a | n/a | No results recorded | |"
  ].join("\n");
};

const escapeCell = (value: string) => value.replaceAll("|", "\\|").replaceAll("\n", " ");
