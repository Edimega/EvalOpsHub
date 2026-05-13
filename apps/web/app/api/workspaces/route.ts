import { NextRequest } from "next/server";
import { and, count, eq } from "drizzle-orm";
import { slugify, uuidSchema, workspaceSchema } from "@evalops/core";
import { db, workspaceMembers, workspaces } from "@evalops/db";
import { handleRouteError, HttpError, json, parseBody, requireUser } from "@/lib/http";
import { z } from "zod";

const deleteWorkspaceSchema = z.object({
  workspaceId: uuidSchema
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const input = await parseBody(request, workspaceSchema);
    const slug = await createAvailableSlug(input.name);

    const [workspace] = await db.insert(workspaces).values({
      name: input.name,
      slug,
      regressionThreshold: input.regressionThreshold.toFixed(2),
      latencyBudgetMs: input.latencyBudgetMs,
      dailyCostBudgetCents: input.dailyCostBudgetCents
    }).returning();

    if (!workspace) throw new Error("Workspace could not be created");

    await db.insert(workspaceMembers).values({
      workspaceId: workspace.id,
      userId: user.id,
      role: "owner"
    });

    return json({ workspace }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser(request);
    const input = await parseBody(request, deleteWorkspaceSchema);

    const [membership] = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, user.id)))
      .limit(1);

    if (!membership) throw new HttpError(404, "Workspace not found");
    if (membership.role !== "owner") throw new HttpError(403, "Only workspace owners can delete a workspace");

    const [total] = await db.select({ value: count() }).from(workspaceMembers).where(eq(workspaceMembers.userId, user.id));
    if ((total?.value ?? 0) <= 1) {
      throw new HttpError(400, "Create another workspace before deleting this one");
    }

    await db.delete(workspaces).where(eq(workspaces.id, input.workspaceId));
    return json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}

const createAvailableSlug = async (name: string) => {
  const base = slugify(name) || `workspace-${Date.now()}`;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = attempt === 0 ? base : `${base}-${attempt + 1}`;
    const [existing] = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.slug, slug)).limit(1);
    if (!existing) return slug;
  }

  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
};
