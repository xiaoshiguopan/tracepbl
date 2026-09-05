import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const modulePath = process.env.TRACEPBL_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("Set an existing TRACEPBL_PLAYWRIGHT_MODULE; no installation is performed.");
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext();
const requests = []; const errors = [];
await context.route("**/*", route => {
  const url = new URL(route.request().url());
  if (url.origin !== "http://127.0.0.1:5174" || url.pathname.includes("/api/")) { requests.push(url.href); return route.abort(); }
  return route.continue();
});
try {
  const page = await context.newPage(); page.on("pageerror", error => errors.push(error.message));
  await page.goto("http://127.0.0.1:5174/tracepbl/");
  await page.getByRole("button", { name: "进入史料工作台", exact: true }).click();
  await page.locator('input[name="textbook"]').waitFor();
  await page.locator('input[name="textbook"]').fill("合成 Demo 教材");
  await page.locator('input[name="lesson"]').fill("合成 Demo 课程");
  await page.locator('select[name="grade"]').selectOption("七年级");
  await page.locator('input[name="minutes"]').fill("45");
  await page.getByRole("button", { name: "继续形成探究问题", exact: true }).click();
  await page.waitForURL("**/question");
  await page.reload(); await page.getByRole("heading", { name: "探究问题", exact: true }).waitFor();
  assert.equal(await page.locator('.missing-direction').count(),0);
  const outcome=page.locator('textarea[name="evidenceOutcome"]');await outcome.waitFor();assert.ok((await outcome.inputValue()).length>0);
  await outcome.fill('合成演示：保留我的课堂交付修改');
  await page.getByRole('button',{name:'示例 · 恢复交付要求',exact:true}).click();
  assert.notEqual(await outcome.inputValue(),'合成演示：保留我的课堂交付修改');
  await page.getByRole('button',{name:'撤销本次替换',exact:true}).click();assert.equal(await outcome.inputValue(),'合成演示：保留我的课堂交付修改');
  await page.getByRole('button',{name:'确认问题并查找史料',exact:true}).click();await page.waitForURL('**/sources');
  await page.getByRole('button',{name:'组织这些证据',exact:true}).click();await page.waitForURL('**/evidence-map');
  await page.locator('.evidence-card').first().waitFor();
  await page.getByRole('button',{name:'设计课堂活动',exact:true}).click();await page.waitForURL('**/lesson');
  await page.locator('.activity-card').first().waitFor();
  await page.getByRole('button',{name:'设计评价量规',exact:true}).click();await page.waitForURL('**/rubric');
  await page.locator('.rubric-row').first().waitFor();
  const {mkdir}=await import('node:fs/promises');const output=resolve('.tracepbl/stage11-demo-inline');await mkdir(output,{recursive:true});
  for(const width of [1774,390,320]){
    await page.setViewportSize({width,height:1114});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const positions=await page.evaluate(()=>({head:[...document.querySelectorAll('.rubric-table-head span')].map(el=>el.getBoundingClientRect().x),cells:[...document.querySelector('.rubric-row').querySelectorAll('.rubric-level-grid > section')].map(el=>el.getBoundingClientRect().x)}));
    if(width===1774)for(let i=0;i<3;i++)assert.ok(Math.abs(positions.head[i+1]-positions.cells[i])<3);
    await page.screenshot({path:resolve(output,`rubric-${width}.png`),fullPage:true});
  }
  await page.getByRole('button',{name:'继续设计检查',exact:true}).click();await page.waitForURL('**/audit');
  await page.getByRole('button',{name:'完成设计检查',exact:true}).click();await page.waitForURL('**/review');
  await page.locator('.export-menu summary').click();
  for(const label of ['Word','PDF']){
    const download=page.waitForEvent('download');await page.getByRole('button',{name:new RegExp('^'+label)}).click();assert.equal(await (await download).failure(),null);
  }
  for(const [route,selector] of [['question','.question-form'],['evidence-map','.evidence-card'],['lesson','.activity-card'],['rubric','.rubric-row']]){
    await page.goto(`http://127.0.0.1:5174/tracepbl/tasks/demo-tang-45m/${route}`);await page.locator(selector).first().waitFor();
    for(const width of [1774,390,320]){
      await page.setViewportSize({width,height:1114});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${route} overflow at ${width}`);
      await page.screenshot({path:resolve(output,`${route}-${width}.png`),fullPage:true});
    }
  }
  assert.ok((await page.evaluate(() => indexedDB.databases())).length > 0);
  assert.deepEqual(requests, []); assert.deepEqual(errors, []);
  console.log(JSON.stringify({ status: "passed", backendOrExternalRequests: 0, indexedDbPresent: true, reload: true,prepopulatedWorkflow:true,replaceUndo:true,rubricColumnsAligned:true,downloads:2 }));
} finally { await context.close(); await browser.close(); }
