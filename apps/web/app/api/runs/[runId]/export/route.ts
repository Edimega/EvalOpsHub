import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { buildRunMarkdownReport } from "@evalops/core";
import { db, evaluationRuns } from "@evalops/db";
import { handleRouteError, HttpError, requireWorkspaceAccess } from "@/lib/http";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await context.params;
    const [run] = await db.select().from(evaluationRuns).where(eq(evaluationRuns.id, runId)).limit(1);
    if (!run) throw new HttpError(404, "Run not found");
    await requireWorkspaceAccess(request, run.workspaceId);

    const markdown = await buildRunMarkdownReport(runId);
    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="evalops-run-${runId}.md"`
      }
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
