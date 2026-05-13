import { NextRequest } from "next/server";
import { authenticateUser, loginSchema, sessionCookieName } from "@evalops/core";
import { handleRouteError, HttpError, json, parseBody } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    const input = await parseBody(request, loginSchema);
    const session = await authenticateUser(input.email, input.password);
    if (!session) throw new HttpError(401, "Invalid email or password");

    const response = json({ ok: true });
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
