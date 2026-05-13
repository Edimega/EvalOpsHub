import { NextRequest } from "next/server";
import { getActiveProviderCredential } from "@evalops/core";
import { handleRouteError, HttpError, json, requireWorkspaceAccess } from "@/lib/http";

type OpenRouterModel = {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
};

type OpenRouterModelsResponse = {
  data?: OpenRouterModel[];
};

export async function GET(request: NextRequest) {
  try {
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) return json({ error: "workspaceId is required" }, 400);
    await requireWorkspaceAccess(request, workspaceId);

    const credential = await getActiveProviderCredential(workspaceId, "openrouter");
    if (!credential) throw new HttpError(400, "Add an OpenRouter provider key before loading models");

    const response = await fetch(`${credential.baseUrl.replace(/\/$/, "")}/models`, {
      headers: { Authorization: `Bearer ${credential.apiKey}` },
      cache: "no-store"
    });

    if (!response.ok) {
      const body = await response.text();
      throw new HttpError(response.status, `OpenRouter models request failed: ${body.slice(0, 300)}`);
    }

    const payload = (await response.json()) as OpenRouterModelsResponse;
    const models = (payload.data ?? [])
      .filter((model) => model.id)
      .map((model) => ({
        id: model.id,
        name: model.name ?? model.id,
        contextLength: model.context_length ?? null,
        promptPrice: model.pricing?.prompt ?? null,
        completionPrice: model.pricing?.completion ?? null
      }))
      .sort((a, b) => a.id.localeCompare(b.id));

    return json({ models });
  } catch (error) {
    return handleRouteError(error);
  }
}
