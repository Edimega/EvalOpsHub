import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { createEvaluationRun, createRunSchema, enqueueEvaluationRun, executeEvaluationRun } from "@evalops/core";
import { datasets, db, evaluationRuns, promptVersions } from "@evalops/db";
import { handleRouteError, HttpError, json, parseBody, requireWorkspaceAccess } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
    await requireWorkspaceAccess(request, workspaceId);
    const rows = await db
      .select({
        id: evaluationRuns.id,
        status: evaluationRuns.status,
        score: evaluationRuns.score,
        baselineScore: evaluationRuns.baselineScore,
        regressionDetected: evaluationRuns.regressionDetected,
        costCents: evaluationRuns.costCents,
        latencyMs: evaluationRuns.latencyMs,
        errorCount: evaluationRuns.errorCount,
        failureReason: evaluationRuns.failureReason,
        createdAt: evaluationRuns.createdAt,
        datasetName: datasets.name,
        promptName: promptVersions.name,
        promptVersion: promptVersions.version
      })
      .from(evaluationRuns)
      .innerJoin(datasets, eq(datasets.id, evaluationRuns.datasetId))
      .innerJoin(promptVersions, eq(promptVersions.id, evaluationRuns.promptVersionId))
      .where(eq(evaluationRuns.workspaceId, workspaceId))
      .orderBy(desc(evaluationRuns.createdAt));
    return json({ runs: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseBody(request, createRunSchema);
    await requireWorkspaceAccess(request, input.workspaceId);
    const [dataset] = await db.select().from(datasets).where(eq(datasets.id, input.datasetId)).limit(1);
    const [prompt] = await db.select().from(promptVersions).where(eq(promptVersions.id, input.promptVersionId)).limit(1);
    if (!dataset || dataset.workspaceId !== input.workspaceId) throw new HttpError(404, "Dataset not found in workspace");
    if (!prompt || prompt.workspaceId !== input.workspaceId) throw new HttpError(404, "Prompt not found in workspace");

    const run = await createEvaluationRun({
      workspaceId: input.workspaceId,
      datasetId: input.datasetId,
      promptVersionId: input.promptVersionId,
      ...(input.baselineRunId ? { baselineRunId: input.baselineRunId } : {})
    });
    const queued = process.env.EVALOPS_INLINE_RUNS === "true" ? false : await enqueueEvaluationRun(run.id);
    if (!queued) {
      await executeEvaluationRun(run.id);
    }

    return json({ runId: run.id, queued }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
