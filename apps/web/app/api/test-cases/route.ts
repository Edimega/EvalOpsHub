import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { testCaseSchema } from "@evalops/core";
import { datasets, db, testCases } from "@evalops/db";
import { handleRouteError, HttpError, json, parseBody, requireWorkspaceAccess } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const datasetId = request.nextUrl.searchParams.get("datasetId");
    if (!datasetId) return json({ error: "datasetId is required" }, 400);
    const [dataset] = await db.select().from(datasets).where(eq(datasets.id, datasetId)).limit(1);
    if (!dataset) throw new HttpError(404, "Dataset not found");
    await requireWorkspaceAccess(request, dataset.workspaceId);
    const rows = await db.select().from(testCases).where(eq(testCases.datasetId, datasetId)).orderBy(desc(testCases.createdAt));
    return json({ testCases: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseBody(request, testCaseSchema);
    const [dataset] = await db.select().from(datasets).where(eq(datasets.id, input.datasetId)).limit(1);
    if (!dataset) throw new HttpError(404, "Dataset not found");
    await requireWorkspaceAccess(request, dataset.workspaceId);
    const [testCase] = await db.insert(testCases).values(input).returning();
    return json({ testCase }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
