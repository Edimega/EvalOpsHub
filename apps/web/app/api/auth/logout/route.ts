import { NextRequest } from "next/server";
import { revokeSession, sessionCookieName } from "@evalops/core";
import { handleRouteError, json } from "@/lib/http";

export async function POST(request: NextRequest) {
  try {
    await revokeSession(request.cookies.get(sessionCookieName)?.value);
    const response = json({ ok: true });
    response.cookies.delete(sessionCookieName);
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
