import { NextRequest } from "next/server";
import { createUserWithWorkspace, registerSchema, sessionCookieName } from "@evalops/core";
import { handleRouteError, json, parseBody } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const input = await parseBody(request, registerSchema);
    const { user, workspace, session } = await createUserWithWorkspace(input);
    const response = json({ user: { id: user.id, name: user.name, email: user.email }, workspace }, 201);
    response.cookies.set(sessionCookieName, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      expires: session.expiresAt,
      path: "/"
    });
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
