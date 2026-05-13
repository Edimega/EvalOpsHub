import { NextRequest } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { alerts, apiKeys, datasets, db, evaluationRuns, promptVersions, providerKeys, testCases } from "@evalops/db";
import { handleRouteError, json, requireWorkspaceAccess } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
    await requireWorkspaceAccess(request, workspaceId);

    const [datasetCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(datasets).where(eq(datasets.workspaceId, workspaceId));
    const [caseCountRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(testCases)
      .innerJoin(datasets, eq(datasets.id, testCases.datasetId))
      .where(eq(datasets.workspaceId, workspaceId));
    const [promptCountRow] = await db.select({ count: sql<number>`count(*)::int` }).from(promptVersions).where(eq(promptVersions.workspaceId, workspaceId));
    const [runMetricsRow] = await db.select({
      count: sql<number>`count(*)::int`,
      avgScore: sql<string | null>`avg(${evaluationRuns.score})`,
      totalCost: sql<number>`coalesce(sum(${evaluationRuns.costCents}), 0)::int`,
      avgLatency: sql<number>`coalesce(avg(${evaluationRuns.latencyMs}), 0)::int`
    }).from(evaluationRuns).where(eq(evaluationRuns.workspaceId, workspaceId));

    const recentRuns = await db
      .select({
        id: evaluationRuns.id,
        status: evaluationRuns.status,
        score: evaluationRuns.score,
        regressionDetected: evaluationRuns.regressionDetected,
        costCents: evaluationRuns.costCents,
        latencyMs: evaluationRuns.latencyMs,
        createdAt: evaluationRuns.createdAt,
        datasetName: datasets.name,
        promptName: promptVersions.name,
        promptVersion: promptVersions.version
      })
      .from(evaluationRuns)
      .innerJoin(datasets, eq(datasets.id, evaluationRuns.datasetId))
      .innerJoin(promptVersions, eq(promptVersions.id, evaluationRuns.promptVersionId))
      .where(eq(evaluationRuns.workspaceId, workspaceId))
      .orderBy(desc(evaluationRuns.createdAt))
      .limit(10);

    const runSeries = await db
      .select({
        id: evaluationRuns.id,
        score: evaluationRuns.score,
        latencyMs: evaluationRuns.latencyMs,
        costCents: evaluationRuns.costCents,
        createdAt: evaluationRuns.createdAt
      })
      .from(evaluationRuns)
      .where(and(eq(evaluationRuns.workspaceId, workspaceId), eq(evaluationRuns.status, "completed")))
      .orderBy(desc(evaluationRuns.createdAt))
      .limit(20);

    const openAlerts = await db.select().from(alerts).where(and(eq(alerts.workspaceId, workspaceId), eq(alerts.status, "open"))).orderBy(desc(alerts.createdAt)).limit(10);
    const keys = await db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt
    }).from(apiKeys).where(eq(apiKeys.workspaceId, workspaceId)).orderBy(desc(apiKeys.createdAt));
    const providerKeyRows = await db.select({
      id: providerKeys.id,
      provider: providerKeys.provider,
      name: providerKeys.name,
      keyPreview: providerKeys.keyPreview,
      baseUrl: providerKeys.baseUrl,
      lastUsedAt: providerKeys.lastUsedAt,
      createdAt: providerKeys.createdAt
    }).from(providerKeys).where(and(eq(providerKeys.workspaceId, workspaceId), sql`${providerKeys.revokedAt} is null`)).orderBy(desc(providerKeys.createdAt));

    return json({
      metrics: {
        datasets: datasetCountRow?.count ?? 0,
        testCases: caseCountRow?.count ?? 0,
        prompts: promptCountRow?.count ?? 0,
        runs: runMetricsRow?.count ?? 0,
        avgScore: runMetricsRow?.avgScore ? Number(runMetricsRow.avgScore) : null,
        totalCost: runMetricsRow?.totalCost ?? 0,
        avgLatency: runMetricsRow?.avgLatency ?? 0
      },
      recentRuns,
      runSeries: runSeries.reverse(),
      openAlerts,
      apiKeys: keys,
      providerKeys: providerKeyRows
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
