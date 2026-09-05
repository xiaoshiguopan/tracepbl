import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const { chromium } = await import(pathToFileURL(resolve(process.env.TRACEPBL_PLAYWRIGHT_MODULE)).href);
const origin=process.env.TRACEPBL_BROWSER_ORIGIN ?? "http://127.0.0.1:45174";
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw new Error("Use loopback only");
const output=resolve(process.env.TRACEPBL_BROWSER_EVIDENCE ?? `.tracepbl/stage12-followup/keyboard-${Date.now()}`);
const extension=resolve(output,"zoom-extension");await mkdir(extension,{recursive:true});
// Native browser zoom, never CSS zoom or device-scale emulation. The helper is isolated to this test profile.
await writeFile(resolve(extension,"manifest.json"),JSON.stringify({manifest_version:3,name:"Local zoom verification",version:"1.0",permissions:["tabs"],host_permissions:["<all_urls>"],background:{service_worker:"zoom.js"}}));
await writeFile(resolve(extension,"zoom.js"),"chrome.runtime.onInstalled.addListener(()=>{});");
const context=await chromium.launchPersistentContext(resolve(output,"profile"),{channel:"chromium",headless:false,viewport:null,args:["--window-size=1440,1000","--no-proxy-server",`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]});
const evidence=[];const errors=[];const outside=[];
try{
 await context.route("**/*",route=>{const u=new URL(route.request().url());if(u.origin!==origin||u.pathname.includes('/api/')){outside.push(u.href);return route.abort();}return route.continue();});
 const page=context.pages()[0];page.on("pageerror",e=>errors.push(e.message));
 const button=name=>page.getByRole("button",{name,exact:true});
 async function tabTo(locator){
  await locator.waitFor({state:"visible"});
  for(let n=0;n<240;n++){
   if(await locator.evaluate(el=>el===document.activeElement))return;
   await page.keyboard.press("Tab");
  }
  throw new Error(`Keyboard cannot reach ${await locator.innerText().catch(()=>"control")}`);
 }
 async function activate(locator){await tabTo(locator);await page.keyboard.press("Enter");}
 async function type(selector,value){await tabTo(page.locator(selector));await page.keyboard.press("Control+A");await page.keyboard.insertText(value);}
 await page.goto(`${origin}/tracepbl/`);
 await activate(button("进入史料工作台"));await page.waitForURL("**/context");
 await type('input[name="textbook"]',"合成键盘教材");await type('input[name="lesson"]',"合成键盘课程");
 await tabTo(page.locator('select[name="grade"]'));await page.keyboard.press("Home");await page.keyboard.press("ArrowDown");await page.keyboard.press("Tab");
 assert.equal(await page.locator('select[name="grade"]').inputValue(),"七年级");await type('input[name="minutes"]',"45");
 await activate(button("继续形成探究问题"));await page.waitForURL("**/question");
 for(const [label,route] of [["确认问题并查找史料","sources"],["组织这些证据","evidence-map"],["设计课堂活动","lesson"],["设计评价量规","rubric"],["继续设计检查","audit"],["完成设计检查","review"]]){
  await activate(button(label));await page.waitForURL(`**/${route}`);evidence.push({keyboardRoute:route});
 }
 await page.locator(".export-menu summary").waitFor();
 await activate(button("我的备课"));const dialog=page.getByRole("dialog");await dialog.waitFor();
 for(let i=0;i<30;i++){await page.keyboard.press("Tab");assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);}
 for(let i=0;i<30;i++){await page.keyboard.press("Shift+Tab");assert.equal(await dialog.evaluate(el=>el.contains(document.activeElement)),true);}
 await page.keyboard.press("Escape");await dialog.waitFor({state:"hidden"});assert.equal(await button("我的备课").evaluate(el=>el===document.activeElement),true);
 await activate(page.locator('.export-menu summary'));
 for(const label of ['Word','PDF']){const download=page.waitForEvent('download');await activate(page.getByRole('button',{name:new RegExp('^'+label)}));const file=await download;assert.equal(await file.failure(),null);await file.saveAs(resolve(output,`synthetic-demo.${label==='Word'?'docx':'pdf'}`));}
 const worker=context.serviceWorkers()[0]??await context.waitForEvent('serviceworker');
 const before=await page.evaluate(()=>({inner:innerWidth,dpr:devicePixelRatio}));
 const zoom=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url?.startsWith('http://127.0.0.1:'));await chrome.tabs.setZoom(tab.id,2);return chrome.tabs.getZoom(tab.id);});
 assert.equal(zoom,2);await page.waitForFunction(dpr=>Math.abs(devicePixelRatio-dpr*2)<0.01,before.dpr);
 const after=await page.evaluate(()=>({inner:innerWidth,outer:outerWidth,dpr:devicePixelRatio,visualScale:visualViewport.scale}));assert.ok(Math.abs(after.inner*2-before.inner)<5);assert.equal(after.visualScale,1);
 const task=page.url().split('/tasks/')[1].split('/')[0];
 for(const route of ['context','question','sources','evidence-map','lesson','rubric','audit','review']){
  await page.goto(`${origin}/tracepbl/tasks/${task}/${route}`);await page.locator('main h1').waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${route}: overflow at native 200%`);
  // Playwright full-page capture clips at native zoom; capture actual browser pixels instead.
  for(const position of ['top','bottom']){
   await page.evaluate(position=>scrollTo(0,position==='top'?0:document.documentElement.scrollHeight),position);
   await page.waitForTimeout(600);
   const capture=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({});const tab=tabs.find(t=>t.url?.startsWith('http://127.0.0.1:'));return chrome.tabs.captureVisibleTab(tab.windowId,{format:'png'});});
   await writeFile(resolve(output,`${route}-200-percent-${position}.png`),Buffer.from(capture.split(',')[1],'base64'));
  }
  await writeFile(resolve(output,`${route}-aria.txt`),await page.locator('main').ariaSnapshot());
  evidence.push({route,nativeZoom:2,noHorizontalOverflow:true});
 }
 await page.emulateMedia({reducedMotion:'reduce',forcedColors:'active'});await page.goto(`${origin}/tracepbl/`);await button('进入史料工作台').waitFor();
 assert.equal(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches&&matchMedia('(forced-colors: active)').matches),true);
 await page.screenshot({path:resolve(output,'reduced-motion-forced-colors.png'),fullPage:true});
 assert.deepEqual(errors,[]);assert.deepEqual(outside,[]);
 await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',keyboardWorkflow:true,drawerTrapAndReturn:true,downloads:2,nativeZoom:zoom,before,after,evidence,pageErrors:errors,externalRequests:outside},null,2));
 console.log(JSON.stringify({status:'passed',keyboardWorkflow:true,nativeZoom:zoom,before,after,output}));
}finally{await context.close();}
