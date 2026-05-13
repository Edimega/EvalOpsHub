import { and, eq, gt, isNull } from "drizzle-orm";
import { db, sessions, users, workspaceMembers, workspaces, apiKeys } from "@evalops/db";
import { createOpaqueToken, hashPassword, sha256, verifyPassword } from "./crypto";
import { slugify } from "./slug";

export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
};

export const sessionCookieName = "evalops_session";

export const createUserWithWorkspace = async (input: {
  name: string;
  email: string;
  password: string;
  workspaceName: string;
}) => {
  const passwordHash = await hashPassword(input.password);
  const workspaceSlug = slugify(input.workspaceName) || `workspace-${Date.now()}`;

  const [user] = await db.insert(users).values({
    name: input.name,
    email: input.email,
    passwordHash
  }).returning();
  if (!user) throw new Error("User could not be created");

  const [workspace] = await db.insert(workspaces).values({
    name: input.workspaceName,
    slug: workspaceSlug
  }).returning();
  if (!workspace) throw new Error("Workspace could not be created");

  await db.insert(workspaceMembers).values({
    workspaceId: workspace.id,
    userId: user.id,
    role: "owner"
  });

  const session = await createSession(user.id);
  return { user, workspace, session };
};

export const authenticateUser = async (email: string, password: string) => {
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return null;

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return null;

  return createSession(user.id);
};

export const createSession = async (userId: string) => {
  const token = createOpaqueToken("sess");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);

  await db.insert(sessions).values({
    userId,
    tokenHash: sha256(token),
    expiresAt
  });

  return { token, expiresAt };
};

export const getUserBySessionToken = async (token: string | undefined) => {
  if (!token) return null;

  const [row] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);

  return row ?? null;
};

export const revokeSession = async (token: string | undefined) => {
  if (!token) return;
  await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
};

export const userCanAccessWorkspace = async (userId: string, workspaceId: string) => {
  const [membership] = await db
    .select()
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)))
    .limit(1);

  return Boolean(membership);
};

export const createApiKey = async (input: {
  workspaceId: string;
  name: string;
  scopes: Array<"evaluations:run" | "results:read" | "traces:write">;
}) => {
  const token = createOpaqueToken("eoh_live");
  const prefix = token.slice(0, 18);

  const [key] = await db.insert(apiKeys).values({
    workspaceId: input.workspaceId,
    name: input.name,
    keyHash: sha256(token),
    prefix,
    scopes: input.scopes
  }).returning();
  if (!key) throw new Error("API key could not be created");

  return { key, token };
};

export const authenticateApiKey = async (token: string | null, scope: "evaluations:run" | "results:read" | "traces:write") => {
  if (!token?.startsWith("eoh_live_")) return null;

  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, sha256(token)), isNull(apiKeys.revokedAt)))
    .limit(1);

  if (!key || !key.scopes.includes(scope)) return null;

  await db.update(apiKeys).set({ lastUsedAt: new Date() }).where(eq(apiKeys.id, key.id));
  return key;
};
