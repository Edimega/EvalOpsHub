import { NextRequest } from "next/server";
import { createProviderKey, listProviderKeys, providerKeySchema } from "@evalops/core";
import { handleRouteError, json, parseBody, requireWorkspaceAccess } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
    await requireWorkspaceAccess(request, workspaceId);
    return json({ providerKeys: await listProviderKeys(workspaceId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = await parseBody(request, providerKeySchema);
    await requireWorkspaceAccess(request, input.workspaceId);
    const providerKey = await createProviderKey(input);
    return json({ providerKey }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
