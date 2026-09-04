import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { issueSession, readSession } from "../src/session.js";

describe("local session cookie", () => {
  it("is host-only, HttpOnly and SameSite Strict", async () => {
    const app = new Hono(); app.get("/", (c) => { issueSession(c, crypto.randomUUID(), "x".repeat(43)); return c.text("ok"); });
    const response = await app.request("/"); const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=Strict"); expect(cookie).not.toContain("Domain=");
  });
  it("rejects a tampered cookie", async () => {
    const app = new Hono(); app.get("/", (c) => c.json({ valid: Boolean(readSession(c, "x".repeat(43))) }));
    expect(await (await app.request("/", { headers: { Cookie: "tracepbl_local_session=bad.value" } })).json()).toEqual({ valid: false });
  });
});
