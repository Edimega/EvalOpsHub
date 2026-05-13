import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db, workspaceMembers, workspaces } from "@evalops/db";
import { handleRouteError, json, requireUser } from "@/lib/http";

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const workspaceRows = await db
      .select({
        id: workspaces.id,
        name: workspaces.name,
        slug: workspaces.slug,
        role: workspaceMembers.role,
        regressionThreshold: workspaces.regressionThreshold,
        latencyBudgetMs: workspaces.latencyBudgetMs,
        dailyCostBudgetCents: workspaces.dailyCostBudgetCents
      })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, user.id));

    return json({ user, workspaces: workspaceRows });
  } catch (error) {
    return handleRouteError(error);
  }
}
