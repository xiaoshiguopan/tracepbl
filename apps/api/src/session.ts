import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { WorkspaceScope } from "@tracepbl/domain";

const COOKIE_NAME = "tracepbl_local_session";
function signature(payload: string, secret: string) { return createHmac("sha256", secret).update(payload).digest("base64url"); }
export function issueSession(c: Context, workspaceId: string, secret: string, secure = false) {
  const payload = Buffer.from(JSON.stringify({ workspaceId, sessionId: randomUUID(), expiresAt: Date.now() + 7 * 86_400_000 })).toString("base64url");
  setCookie(c, COOKIE_NAME, `${payload}.${signature(payload, secret)}`, { httpOnly: true, sameSite: "Strict", secure, path: "/", maxAge: 7 * 86_400 });
}
export function readSession(c: Context, secret: string): WorkspaceScope | null {
  const value = getCookie(c, COOKIE_NAME); if (!value) return null;
  const [payload, received] = value.split("."); if (!payload || !received) return null;
  const expected = signature(payload, secret); const a = Buffer.from(received); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try { const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { workspaceId?: unknown; sessionId?: unknown; expiresAt?: unknown };
    if (typeof parsed.workspaceId !== "string" || typeof parsed.sessionId !== "string" || typeof parsed.expiresAt !== "number" || parsed.expiresAt <= Date.now()) return null;
    return { workspaceId: parsed.workspaceId, sessionId: parsed.sessionId };
  } catch { return null; }
}
