import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.env.TRACEPBL_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("Set an existing TRACEPBL_PLAYWRIGHT_MODULE; no installation is performed.");
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const origin = "http://127.0.0.1:5174";
const base = `${origin}/tracepbl/tasks/demo-tang-45m`;
const output = resolve(".tracepbl/stage11-feedback-verification");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext({ viewport: { width: 1774, height: 1114 } });
const errors = []; const forbiddenRequests = []; const layouts = [];
await context.route("**/*", route => {
  const url = new URL(route.request().url());
  if (url.origin !== origin || url.pathname.includes("/api/")) { forbiddenRequests.push(url.href); return route.abort(); }
  return route.continue();
});
try {
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${base}/context`);
  await page.locator('textarea[name="inquiryQuestion"]').waitFor();
  assert.equal(await page.locator(".advanced-fields").getAttribute("open"), "");
  const gaps = await page.evaluate(() => {
    const summary = document.querySelector(".advanced-fields summary").getBoundingClientRect();
    const grid = document.querySelector(".advanced-fields .check-grid").getBoundingClientRect();
    const details = document.querySelector(".advanced-fields").getBoundingClientRect();
    const heading = document.querySelector(".choice-heading").getBoundingClientRect();
    return { options: grid.top - summary.bottom, direction: heading.top - details.bottom };
  });
  assert.ok(gaps.options >= 16 && gaps.direction >= 24, JSON.stringify(gaps));
  assert.ok(!(await page.locator(".learning-profile select").textContent()).includes("贞观之治"));
  await page.getByRole("button", { name: "比较不同史料的记载", exact: true }).click();
  assert.equal(await page.locator('textarea[name="inquiryQuestion"]').inputValue(), "比较不同史料的记载");
  await page.getByRole("button", { name: "继续形成探究问题", exact: true }).click();
  await page.waitForURL("**/question");
  await page.locator(".question-editor").waitFor();
  assert.equal(await page.locator(".missing-direction").count(), 0);
  assert.match(await page.locator(".inline-title h2").textContent(), /不同史料的记载/);
  await page.getByRole("button", { name: "比较表", exact: true }).click();
  const outcome = page.locator('textarea[name="evidenceOutcome"]');
  assert.match(await outcome.inputValue(), /比较表/);
  const custom = "合成课堂：完成比较表，说明证据限制；可用口头表达补充。";
  await outcome.fill(custom);
  await page.waitForFunction(() => document.querySelector(".save-status")?.textContent === "已保存到本机");
  await page.reload(); await outcome.waitFor();
  assert.equal(await outcome.inputValue(), custom);

  // Leave both optional course choices empty; P02 asks for a choice only once.
  await page.goto(`${base}/context`);
  await page.locator('textarea[name="inquiryQuestion"]').fill("");
  for (const checkbox of await page.locator(".advanced-fields input").all()) await checkbox.uncheck();
  await page.getByRole("button", { name: "应用修改并返回探究问题", exact: true }).click();
  await page.waitForURL("**/question");
  await page.locator(".missing-direction").waitFor();
  await page.locator('textarea[name="originalInput"]').fill("比较不同的历史记载");
  assert.equal(await page.locator(".missing-direction").count(), 1);
  await page.getByRole("button", { name: "比较不同阶段的变化", exact: true }).click();
  await page.getByRole("button", { name: "形成首选方案", exact: true }).click();
  await page.locator(".question-editor").waitFor();
  await page.waitForFunction(() => document.querySelector(".save-status")?.textContent === "已保存到本机");
  await page.reload(); await page.locator(".question-editor").waitFor();
  assert.equal(await page.locator(".missing-direction").count(), 0);
  assert.match(await page.locator(".inline-title h2").textContent(), /不同阶段/);

  for (const width of [1774, 390, 320]) {
    await page.setViewportSize({ width, height: 1114 });
    for (const route of ["context", "question", "evidence-map", "lesson", "audit", "review"]) {
      await page.goto(`${base}/${route}`);
      await page.locator("main h1").waitFor();
      await page.locator(".context-skeleton, .question-skeleton, .audit-skeleton").waitFor({ state: "hidden" });
      await page.evaluate(() => new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done))));
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      assert.ok(overflow <= 1, `${route} ${width}: overflow ${overflow}`);
      layouts.push({ route, width, overflow });
      if (route === "evidence-map") {
        const size = await page.locator(".relation-control select").first().evaluate(el => parseFloat(getComputedStyle(el).fontSize));
        assert.ok(size >= 16, `relation font ${size}`);
      }
      if (route === "lesson") {
        const edit = page.locator(".activity-card-actions").first().getByRole("button", { name: "修改", exact: true });
        assert.ok(await edit.evaluate(el => parseFloat(getComputedStyle(el).fontSize)) >= 16);
        await edit.click();
        const minutes = page.locator(".activity-edit-grid input[type=number]").first();
        await minutes.fill("6");
        await page.locator(".activity-card-actions").first().getByRole("button", { name: "取消", exact: true }).click();
      }
      await page.screenshot({ path: `${output}/${route}-${width}.png`, fullPage: true });
    }
  }
  assert.deepEqual(errors, []); assert.deepEqual(forbiddenRequests, []);
  const result = { status: "passed", optionalSkip: true, directionReuse: true, missingDirectionReload: true, editableOutcomeReload: true, gaps, layouts, browserErrors: errors, backendOrExternalRequests: forbiddenRequests };
  await writeFile(`${output}/result.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await context.close(); await browser.close(); }
