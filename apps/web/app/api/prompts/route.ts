import { NextRequest } from "next/server";
import { and, desc, eq, max } from "drizzle-orm";
import { promptVersionSchema } from "@evalops/core";
import { db, promptVersions } from "@evalops/db";
import { handleRouteError, json, parseBody, requireWorkspaceAccess } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
    await requireWorkspaceAccess(request, workspaceId);
    const rows = await db.select().from(promptVersions).where(eq(promptVersions.workspaceId, workspaceId)).orderBy(desc(promptVersions.createdAt));
    return json({ prompts: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseBody(request, promptVersionSchema);
    const user = await requireWorkspaceAccess(request, input.workspaceId);
    const [latest] = await db
      .select({ version: max(promptVersions.version) })
      .from(promptVersions)
      .where(and(eq(promptVersions.workspaceId, input.workspaceId), eq(promptVersions.name, input.name)));

    const [prompt] = await db.insert(promptVersions).values({
      ...input,
      version: Number(latest?.version ?? 0) + 1,
      authorId: user.id,
      temperature: input.temperature.toFixed(2),
      lockedAt: new Date()
    }).returning();

    return json({ prompt }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
