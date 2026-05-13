import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import { getUserBySessionToken, sessionCookieName, userCanAccessWorkspace } from "@evalops/core";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export const json = <T>(data: T, status = 200) => NextResponse.json(data, { status });

export const parseBody = async <T>(request: NextRequest, schema: ZodSchema<T>) => {
  try {
    return schema.parse(await request.json());
  } catch (error) {
    if (error instanceof ZodError) {
      throw new HttpError(400, error.issues.map((issue) => issue.message).join(", "));
    }
    throw new HttpError(400, "Invalid JSON body");
  }
};

export const requireUser = async (request: NextRequest) => {
  const token = request.cookies.get(sessionCookieName)?.value;
  const user = await getUserBySessionToken(token);
  if (!user) throw new HttpError(401, "Authentication is required");
  return user;
};

export const requireWorkspaceAccess = async (request: NextRequest, workspaceId: string) => {
  const user = await requireUser(request);
  const canAccess = await userCanAccessWorkspace(user.id, workspaceId);
  if (!canAccess) throw new HttpError(403, "Workspace access denied");
  return user;
};

export const handleRouteError = (error: unknown) => {
  if (error instanceof HttpError) return json({ error: error.message }, error.status);
  console.error(error);
  return json({ error: "Unexpected server error" }, 500);
};

export const getBearerToken = (request: NextRequest) => {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  return authorization.slice("Bearer ".length).trim();
};
