import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, COOKIE_OPTIONS, makeAuthCookie, passwordMatches } from "../../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const { password } = (await request.json()) as { password?: string };
  if (typeof password !== "string" || !passwordMatches(password)) {
    return NextResponse.json({ error: "密码错误。" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, makeAuthCookie(), COOKIE_OPTIONS);
  return res;
}
