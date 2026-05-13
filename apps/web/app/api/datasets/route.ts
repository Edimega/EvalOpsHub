import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { datasetSchema, slugify } from "@evalops/core";
import { datasets, db } from "@evalops/db";
import { handleRouteError, json, parseBody, requireWorkspaceAccess } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
    await requireWorkspaceAccess(request, workspaceId);
    const rows = await db.select().from(datasets).where(eq(datasets.workspaceId, workspaceId)).orderBy(desc(datasets.createdAt));
    return json({ datasets: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseBody(request, datasetSchema);
    await requireWorkspaceAccess(request, input.workspaceId);
    const [dataset] = await db.insert(datasets).values({
      workspaceId: input.workspaceId,
      name: input.name,
      slug: slugify(input.name),
      description: input.description
    }).returning();
    return json({ dataset }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
