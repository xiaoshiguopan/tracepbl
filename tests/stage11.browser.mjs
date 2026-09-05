import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Uses an existing Playwright installation; never installs a package or browser implicitly.
const modulePath = process.env.TRACEPBL_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("TRACEPBL_PLAYWRIGHT_MODULE must name an existing playwright/index.mjs.");
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const origin = process.env.TRACEPBL_BROWSER_ORIGIN ?? "http://127.0.0.1:5173";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Use a loopback test server.");
const runtime = await (await fetch(`${origin}/api/v1/runtime`)).json();
assert.equal(runtime.ai.execution, "fake", "Browser integration must use fake provider");
const directory = resolve(".tracepbl/stage11-browser-verification"); await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const errors = []; const external = []; const steps = [];
page.on("pageerror", error => errors.push(error.message));
page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
await context.route("**/*", route => { const url = new URL(route.request().url()); if (url.origin !== origin) { external.push(url.origin); return route.abort(); } return route.continue(); });
const button = name => page.getByRole("button", { name, exact: true });
const review = async label => {
  const names={"生成问题建议":"生成整组问题","生成证据建议":"生成全部证据关系","生成活动建议":"生成整课活动","生成评价建议":"生成整套量规"};
  await button(`模拟 AI · ${names[label]}`).click();
  await page.getByText('待确认 · 已填入栏目，可直接编辑',{exact:false}).waitFor({timeout:45000});
  assert.equal(await page.getByRole('region',{name:'待采用建议',exact:true}).count(),0);
  steps.push(`${label}:filled-inline-awaiting-confirmation`);
};
try {
  await page.goto(origin);
  await button("进入史料工作台").click();
  await page.locator('input[name="textbook"]').fill("合成集成教材");
  await page.locator('input[name="lesson"]').fill("合成材料的证据比较");
  await page.locator('select[name="grade"]').selectOption("七年级");
  assert.equal(await page.locator('select[name="grade"]').inputValue(), "七年级");
  await page.locator('input[name="minutes"]').fill("45");
  await page.locator('textarea[name="inquiryQuestion"]').fill("如何用合成材料支持有条件的解释？");
  await button("继续形成探究问题").click();
  await page.waitForURL("**/question");
  const taskPath = new URL(page.url()).pathname.replace(/\/question$/, "");
  await review("生成问题建议");
  await button("确认问题并查找史料").click();
  await page.waitForURL("**/sources");
  await button("查看全部可用史料").click();
  for (let index = 1; index <= 6; index++) await page.getByRole("checkbox", { name: `选用合成材料 ${index}（非真实史料）`, exact: true }).check();
  await button("组织这些证据").click();
  await page.waitForURL("**/evidence-map");
  await review("生成证据建议"); await button("确认证据并设计活动").click();
  await page.waitForURL("**/lesson");
  await review("生成活动建议"); await button("确认活动并设计量规").click();
  await page.waitForURL("**/rubric");
  await review("生成评价建议"); await button("确认量规并设计检查").click();
  await page.waitForURL("**/audit"); await button("运行设计检查").click();
  await page.getByText("设计检查 · 已完成 · 尝试 1", { exact: true }).waitFor({ timeout: 45_000 });
  await button("载入服务器最新内容").click();
  await button("进入最终确认与导出").click(); await page.waitForURL("**/review");
  await page.getByText("导出教学包", { exact: true }).click();
  for (const [label, extension] of [["Word .docx · 可继续编辑", "docx"], ["PDF .pdf · 固定版式", "pdf"]]) {
    const completed = page.waitForEvent("download", { timeout: 45_000 }); await button(label).click();
    await (await completed).saveAs(resolve(directory, `teaching-pack.${extension}`)); steps.push(`download:${extension}`);
  }
  for (let index = 0; index < 4; index++) { await page.reload(); await page.locator('.local-operations[data-connection="connected"]').waitFor({ timeout: 20_000 }); }
  steps.push("SSE:four-reloads-without-429");
  await context.setOffline(true); await page.locator('.local-operations[data-connection="reconnecting"]').waitFor({ timeout: 20_000 });
  await context.setOffline(false); await page.locator('.local-operations[data-connection="connected"]').waitFor({ timeout: 20_000 }); steps.push("SSE:offline-recovered");
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole("heading", { name: "最终确认与导出", exact: true }).waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `horizontal overflow at ${width}`);
    await page.screenshot({ path: resolve(directory, `review-${width}.png`), fullPage: true });
  }
  assert.equal((await page.evaluate(() => indexedDB.databases())).length, 0, "Complete mode must not store task data in IndexedDB");
  assert.deepEqual(external, []); assert.deepEqual(errors, []);
  await writeFile(resolve(directory, "result.json"), JSON.stringify({ status: "passed", taskPath, steps, externalRequests: 0, errors: 0, widths: [1440,390,320], indexedDbDatabases: 0 }, null, 2));
  console.log(JSON.stringify({ status: "passed", steps, evidence: directory }));
} catch (error) { await page.screenshot({path:resolve(directory,"failure.png"),fullPage:true}); console.error(await page.locator("main").innerText()); throw error; } finally { await context.close(); await browser.close(); }
