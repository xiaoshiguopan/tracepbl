import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const modulePath = process.env.TRACEPBL_PLAYWRIGHT_MODULE;
if (!modulePath) throw new Error("Set an existing TRACEPBL_PLAYWRIGHT_MODULE.");
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const browser = await chromium.launch({ headless: true, args: ["--no-proxy-server"] });
const context = await browser.newContext();
const origin = process.env.TRACEPBL_BROWSER_ORIGIN ?? "http://127.0.0.1:5173";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("Use loopback only.");
const api = async (path, method = "GET", body, version) => {
  const response = await context.request.fetch(`${origin}/api/v1${path}`, { method, headers: { Origin: origin, "Sec-Fetch-Site": "same-origin", "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID(), ...(version === undefined ? {} : { "If-Match": `"task-lv-${version}"` }) }, ...(body === undefined ? {} : { data: body }) });
  assert.ok(response.ok(), `${method} ${path}: ${response.status()}`); return response.json();
};
try {
  assert.equal((await api("/runtime")).ai.execution, "fake");
  const task = (await api("/tasks", "POST", { title: "合成本地界面验证" })).id;
  const base = `/tasks/${task}`;
  const put = (section, body, version) => api(`${base}/${section}`, "PUT", body, version);
  await put("context", {stage:"初中",grade:"七年级",textbook:"合成教材",lesson:"合成本地界面验证",lessonTypes:[],minutes:45,inquiryDirection:null,priorKnowledge:null,learningNeeds:[],profileNote:null}, 0);
  await put("question-set", {centralQuestion:"合成材料如何支持有条件的解释？",focus:"single",subQuestions:[],confirmed:true}, 1);
  const sources = (await api(`${base}/sources`)).items.filter(item => item.title.match(/^合成材料 [1-6]（非真实史料）$/)).map(item => item.versionId);
  assert.equal(sources.length, 6);
  await put("source-selection", {sourceVersionIds:sources}, 2);
  await put("evidence-map", {claims:[{text:"合成材料如何支持解释？",gapAccepted:false,relations:[{sourceVersionId:sources[0],kind:"supports",reason:"合成练习依据",citations:[{sourceVersionId:sources[0],chunkId:null,quotedText:null}]}]}]}, 3);
  await put("lesson-design", {activities:[{title:"合成证据活动",activityMinutes:40,transitionMinutes:0,studentAction:"比较并引用",evidenceProduct:"解释表格",difficulty:"证据边界",scaffold:"标明出处",sourceVersionIds:sources}]}, 4);
  await put("rubric", {items:[{title:"合成引用评价",activityOrdinals:[0],levels:[{key:"support",label:"需要支持",description:"提示下引用"},{key:"expected",label:"达到要求",description:"准确引用"},{key:"strong",label:"表现充分",description:"引用并限定结论"}]}]}, 5);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${origin}${base}/audit`);
  await page.getByRole('button', {name:'前往运行检查',exact:true}).click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'local-operation-run');
  assert.equal(await page.getByText('上游内容已有变化', {exact:false}).count(), 0);
  await page.getByRole('button', {name:'运行设计检查',exact:true}).click();
  await page.getByText('设计检查 · 已完成 · 尝试 1', {exact:true}).waitFor({timeout:30000});
  await page.getByRole('button', {name:'载入服务器最新内容',exact:true}).click();
  await page.getByRole('button', {name:'查看活动与时间',exact:true}).click();
  await page.waitForURL('**/lesson');
  await put('lesson-design', {activities:[{title:'合成证据活动',activityMinutes:45,transitionMinutes:0,studentAction:'比较并引用',evidenceProduct:'解释表格',difficulty:'证据边界',scaffold:'标明出处',sourceVersionIds:sources}]}, 6);
  await page.goto(`${origin}${base}/audit`);
  await page.getByRole('button', {name:'前往重新检查',exact:true}).click();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'local-operation-run');
  await page.goto(`${origin}${base}/sources`);
  const consent=page.getByRole('group', {name:'材料确认',exact:true});
  await consent.waitFor();
  assert.equal(await consent.getByRole('checkbox').count(),2);
  assert.equal(await consent.getByRole('checkbox').nth(0).isChecked(),false);
  assert.equal(await consent.getByRole('checkbox').nth(1).isChecked(),false);
  await consent.getByRole('checkbox').nth(0).check();
  assert.equal(await consent.getByRole('checkbox').nth(1).isChecked(),false);
  const {mkdir,writeFile}=await import('node:fs/promises');
  const output=resolve('.tracepbl/stage11-local-ui-verification'); await mkdir(output,{recursive:true});
  const layouts=[];
  for(const width of [1774,390,320]) {
    await page.setViewportSize({width,height:1114});
    for(const route of ['context','sources','audit']) {
      await page.goto(`${origin}${base}/${route}`);
      await page.locator('main h1').waitFor();

      const layout=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth,main:document.querySelector('main').getBoundingClientRect().toJSON()}));
      assert.ok(layout.scroll<=width,`${route} at ${width} overflows`);
      assert.equal(await page.locator('.local-operations').count(),route === 'audit' ? 1 : 0);
      layouts.push({route,...layout});
      await page.screenshot({path:resolve(output,`${route}-${width}.png`),fullPage:true});
    }
  }
  assert.deepEqual(errors,[]);
  const result={status:'passed',noAuditNotStale:true,runActionFocused:true,staleActionFocused:true,findingNavigatesToLesson:true,consentsIndependent:true,layouts,taskPath:base};
  await writeFile(resolve(output,'result.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify(result));
} finally {await context.close();await browser.close();}