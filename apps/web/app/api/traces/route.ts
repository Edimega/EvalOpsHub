import { NextRequest } from "next/server";
import { authenticateApiKey, traceIngestSchema } from "@evalops/core";
import { db, llmTraces } from "@evalops/db";
import { getBearerToken, handleRouteError, HttpError, json, parseBody } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const key = await authenticateApiKey(getBearerToken(request), "traces:write");
    if (!key) throw new HttpError(401, "Valid API key with traces:write scope is required");

    const input = await parseBody(request, traceIngestSchema);
    const [trace] = await db.insert(llmTraces).values({
      ...input,
      workspaceId: key.workspaceId,
      promptVersionId: input.promptVersionId ?? null,
      error: input.error ?? null,
      feedback: input.feedback ?? null
    }).returning();
    if (!trace) throw new Error("Trace could not be stored");

    return json({ traceId: trace.id }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
