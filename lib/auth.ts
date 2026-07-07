import { createHmac, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
// HMAC 密钥:优先用 AUTH_SECRET,其次 ADMIN_PASSWORD。
const SECRET = process.env.AUTH_SECRET || ADMIN_PASSWORD || "dev-only-insecure-secret";

export const AUTH_COOKIE = "mt_admin";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 天

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: COOKIE_MAX_AGE
};

function sign(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

/** 生成一个 HMAC 签名的会话 cookie 值。 */
export function makeAuthCookie(): string {
  const payload = `admin.${Date.now()}`;
  return `${payload}.${sign(payload)}`;
}

/** 校验会话 cookie 是否有效(签名正确)。 */
export function verifyAuthCookie(value?: string): boolean {
  if (!value) return false;
  const dot = value.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 校验管理员密码(恒定时间比较)。 */
export function passwordMatches(value: string): boolean {
  if (!ADMIN_PASSWORD) return true; // 未设密码 = 不鉴权(仅本地开发)
  const a = Buffer.from(value);
  const b = Buffer.from(ADMIN_PASSWORD);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** 统一鉴权:支持 x-admin-password 头(CLI/curl)或会话 cookie。 */
export function isAuthorized(request: NextRequest): boolean {
  if (!ADMIN_PASSWORD) return true;
  if (request.headers.get("x-admin-password") && passwordMatches(request.headers.get("x-admin-password")!)) {
    return true;
  }
  if (verifyAuthCookie(request.cookies.get(AUTH_COOKIE)?.value)) return true;
  return false;
}
