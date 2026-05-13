import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { apiKeySchema, createApiKey } from "@evalops/core";
import { apiKeys, db } from "@evalops/db";
import { handleRouteError, json, parseBody, requireWorkspaceAccess } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
    await requireWorkspaceAccess(request, workspaceId);
    const rows = await db.select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      scopes: apiKeys.scopes,
      lastUsedAt: apiKeys.lastUsedAt,
      revokedAt: apiKeys.revokedAt,
      createdAt: apiKeys.createdAt
    }).from(apiKeys).where(eq(apiKeys.workspaceId, workspaceId)).orderBy(desc(apiKeys.createdAt));
    return json({ apiKeys: rows });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseBody(request, apiKeySchema);
    await requireWorkspaceAccess(request, input.workspaceId);
    const result = await createApiKey(input);
    return json({
      apiKey: {
        id: result.key.id,
        name: result.key.name,
        prefix: result.key.prefix,
        scopes: result.key.scopes,
        createdAt: result.key.createdAt
      }
    }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
