import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.env.TRACEPBL_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("Set existing TRACEPBL_PLAYWRIGHT_MODULE; no installation is performed.");
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext();
try {
  const page = await context.newPage();
  let releaseRuntime;
  const runtimeGate = new Promise(resolve => { releaseRuntime = resolve; });
  let runtimeFailed = false;
  await page.route("**/api/v1/runtime", async route => {
    if (runtimeFailed) return route.continue();
    runtimeFailed = true;
    await runtimeGate;
    return route.fulfill({ status: 503, body: "service unavailable" });
  });
  const keys = [];
  let beforeIds = [];
  async function taskIds() {
    const ids = []; let cursor = null;
    do {
      const response = await context.request.get(`http://127.0.0.1:5173/api/v1/tasks?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`);
      assert.equal(response.status(), 200);
      const result = await response.json(); ids.push(...result.items.map(item => item.id)); cursor = result.nextCursor;
    } while (cursor);
    return ids;
  }
  await page.route("**/api/v1/tasks", async route => {
    if (route.request().method() !== "POST") return route.continue();
    keys.push(route.request().headers()["idempotency-key"]);
    if (keys.length === 1) {
      beforeIds = await taskIds();
      const response = await route.fetch({ headers: { ...await route.request().allHeaders(), origin: "http://127.0.0.1:5173", "sec-fetch-site": "same-origin" } });
      assert.equal(response.status(), 201, JSON.stringify(await response.json()));
      return route.abort("failed"); // Server saved, client did not receive the result.
    }
    return route.continue();
  });
  await page.goto("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "进入史料工作台", exact: true }).click();
  const waiting = page.getByRole("button", { name: "正在打开本地工作台…", exact: true });
  await waiting.waitFor(); assert.equal(await waiting.isDisabled(), true);
  await page.getByRole("button", { name: "＋ 新建备课", exact: true }).click();
  releaseRuntime();
  await page.getByRole("alert").waitFor();
  await page.getByRole("button", { name: "进入史料工作台", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(keys.length, 1);
  await page.getByRole("button", { name: "进入史料工作台", exact: true }).click();
  await page.getByRole("heading", { name: "教学情境", exact: true }).waitFor();
  assert.equal(keys.length, 2); assert.equal(keys[0], keys[1]);
  const created = (await taskIds()).filter(id => !beforeIds.includes(id));
  assert.equal(created.length, 1);
  console.log(JSON.stringify({ status: "passed", runtimeFailureRetry: true, pendingFeedback: true, lostResponseSameKey: true, tasksCreated: created.length }));
} finally { await context.close(); await browser.close(); }
