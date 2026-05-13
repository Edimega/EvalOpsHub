import { NextRequest } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { authenticateApiKey, ciRunSchema, createEvaluationRun, enqueueEvaluationRun, executeEvaluationRun, getRunSummary } from "@evalops/core";
import { datasets, db, promptVersions } from "@evalops/db";
import { getBearerToken, handleRouteError, HttpError, json, parseBody } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const key = await authenticateApiKey(getBearerToken(request), "evaluations:run");
    if (!key) throw new HttpError(401, "Valid API key with evaluations:run scope is required");

    const input = await parseBody(request, ciRunSchema);
    const [dataset] = await db.select().from(datasets).where(and(eq(datasets.workspaceId, key.workspaceId), eq(datasets.slug, input.datasetSlug))).limit(1);
    if (!dataset) throw new HttpError(404, "Dataset not found");

    const [prompt] = await db
      .select()
      .from(promptVersions)
      .where(and(eq(promptVersions.workspaceId, key.workspaceId), eq(promptVersions.name, input.promptName)))
      .orderBy(desc(promptVersions.version))
      .limit(1);
    if (!prompt) throw new HttpError(404, "Prompt not found");

    const run = await createEvaluationRun({
      workspaceId: key.workspaceId,
      datasetId: dataset.id,
      promptVersionId: prompt.id,
      ...(input.baselineRunId ? { baselineRunId: input.baselineRunId } : {})
    });

    const queued = process.env.EVALOPS_INLINE_RUNS === "true" ? false : await enqueueEvaluationRun(run.id);
    if (!queued) await executeEvaluationRun(run.id);

    const summary = await getRunSummary(run.id);
    return json({
      runId: run.id,
      queued,
      status: summary?.status ?? "queued",
      score: summary?.score ?? null,
      regressionDetected: summary?.regressionDetected ?? false,
      resultCount: summary?.resultCount ?? 0
    }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
