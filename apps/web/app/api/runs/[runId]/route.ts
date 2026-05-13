import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, evaluationResults, evaluationRuns, testCases } from "@evalops/db";
import { handleRouteError, HttpError, json, requireWorkspaceAccess } from "@/lib/http";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const [run] = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, runId)).limit(1);
    if (!run) throw new HttpError(404, "Run not found");
    await requireWorkspaceAccess(request, run.workspaceId);

    const results = await db
      .select({
        id: evaluationResults.id,
        actualOutput: evaluationResults.actualOutput,
        passed: evaluationResults.passed,
        score: evaluationResults.score,
        latencyMs: evaluationResults.latencyMs,
        costCents: evaluationResults.costCents,
        error: evaluationResults.error,
        evidence: evaluationResults.evidence,
        input: testCases.input,
        expectedOutput: testCases.expectedOutput,
        category: testCases.category
      })
      .from(evaluationResults)
      .innerJoin(testCases, eq(testCases.id, evaluationResults.testCaseId))
      .where(eq(evaluationResults.runId, runId));

    return json({ run, results });
  } catch (error) {
    return handleRouteError(error);
  }
}
