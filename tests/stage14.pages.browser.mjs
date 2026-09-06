import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
import { pathToFileURL } from "node:url";
const root=resolve(process.env.TRACEPBL_PAGES_BUILD??".tracepbl/stage14/build");
const modulePath=process.env.TRACEPBL_PLAYWRIGHT_MODULE;
if(!modulePath)throw new Error("Set existing Playwright module");
const evidence=resolve(`.tracepbl/stage14/browser-${Date.now()}`);await mkdir(evidence,{recursive:true});
const mime={".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".json":"application/json",".mp4":"video/mp4",".webp":"image/webp",".woff2":"font/woff2",".ttf":"font/ttf"};
// Like Pages: missing deep routes return the real 404 document, never an index.html SPA fallback.
const server=createServer(async(req,res)=>{try{const path=decodeURIComponent(new URL(req.url,"http://127.0.0.1").pathname);if(!path.startsWith("/tracepbl/")){res.writeHead(404);res.end();return;}let target=resolve(root,path.slice("/tracepbl/".length)||"index.html");if(target!==root&&!target.startsWith(root+sep)){res.writeHead(404);res.end();return;}let code=200;try{if(!(await stat(target)).isFile())throw new Error("not file");}catch{target=resolve(root,"404.html");code=404;}const body=await readFile(target);res.writeHead(code,{"Content-Type":mime[extname(target)]??"application/octet-stream","Content-Length":body.length});res.end(body);}catch{res.writeHead(500);res.end();}});
await new Promise(done=>server.listen(0,"127.0.0.1",done));const origin=`http://127.0.0.1:${server.address().port}`;
const {chromium}=await import(pathToFileURL(resolve(modulePath)).href);const browser=await chromium.launch({headless:true,args:["--no-proxy-server"]});const context=await browser.newContext();const blocked=[],errors=[];
await context.route("**/*",route=>{const url=new URL(route.request().url());if(url.origin!==origin||url.pathname.includes("/api/")){blocked.push(url.pathname);return route.abort();}return route.continue();});
const page=await context.newPage();page.on("pageerror",e=>errors.push(e.message));
try{
 assert.equal((await fetch(`${origin}/tracepbl/tasks/demo-tang-45m/context`)).status,404);
 await page.goto(`${origin}/tracepbl/tasks/demo-tang-45m/context`);await page.locator('input[name="textbook"]').waitFor();assert.ok(page.url().endsWith("/context"));
 await page.locator('input[name="textbook"]').fill("Pages 合成刷新教材");await page.locator('input[name="lesson"]').fill("合成课程");await page.locator('select[name="grade"]').selectOption("七年级");await page.locator('input[name="minutes"]').fill("45");await page.getByRole("button",{name:"继续形成探究问题",exact:true}).click();await page.getByRole("heading",{name:"探究问题",exact:true}).waitFor();await page.reload();await page.getByRole("heading",{name:"探究问题",exact:true}).waitFor();
 await page.goto(`${origin}/tracepbl/tasks/not-owned/context`);await page.getByRole("heading",{name:"此任务不可使用",exact:true}).waitFor();assert.equal(await page.locator('input[name="textbook"]').count(),0);
 await page.goto(`${origin}/tracepbl/`);await page.getByRole("button",{name:"进入史料工作台",exact:true}).waitFor();assert.equal(await page.locator('link[href*="fonts.css"]').evaluate(el=>Boolean(el.sheet)),true);
 for(const width of [1440,390,320]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:resolve(evidence,`home-${width}.png`),fullPage:true});}
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);
 const result={status:"passed",deepRouteHttpStatus:404,restoredRoute:true,reload:true,unknownTaskHidden:true,fontsLoaded:true,widths:[1440,390,320],apiOrExternalRequests:0,pageErrors:0};await writeFile(resolve(evidence,"result.json"),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,evidence}));
}finally{await context.close();await browser.close();await new Promise(done=>server.close(done));}
