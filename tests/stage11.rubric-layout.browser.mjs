import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
const modulePath=process.env.TRACEPBL_PLAYWRIGHT_MODULE;if(!modulePath)throw new Error('Set existing Playwright module');
const {chromium}=await import(pathToFileURL(resolve(modulePath)).href);
const origin=process.env.TRACEPBL_BROWSER_ORIGIN ?? 'http://127.0.0.1:25173';
if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin))throw new Error('Loopback only');
const task=process.env.TRACEPBL_LAYOUT_TASK_ID;if(!task)throw new Error('Set an existing synthetic task with rubric rows');
const browser=await chromium.launch({headless:true,args:['--no-proxy-server']});
try{
 const page=await browser.newPage();await page.goto(`${origin}/tasks/${task}/rubric`);await page.locator('.rubric-row').first().waitFor();
 const output=resolve('.tracepbl/stage11-rubric-layout');await mkdir(output,{recursive:true});const results=[];
 for(const width of [1774,1024,390,320]){
  await page.setViewportSize({width,height:1114});
  for(const editing of [false,true]){
   const row=page.locator('.rubric-row').first();
   if(editing)await row.getByRole('button',{name:/^修改/}).click();
   const geometry=await row.evaluate(element=>{
    const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,bottom:r.bottom,right:r.right};};
    return {buttonInHeader:!!element.querySelector('header .inline-ai-buttons'),headings:[...document.querySelectorAll('.rubric-table-head span')].map(rect),cells:[...element.querySelectorAll('.rubric-level-grid > section,.rubric-level-grid > label')].map(rect),scroll:document.documentElement.scrollWidth,desktop:getComputedStyle(element).display==='grid'};
   });
   assert.equal(geometry.buttonInHeader,true,'AI button must belong to dimension actions');assert.equal(geometry.cells.length,3);assert.ok(geometry.scroll<=width);
   if(geometry.desktop)for(let i=0;i<3;i++){assert.ok(Math.abs(geometry.cells[i].x-geometry.headings[i+1].x)<3,`level ${i} misaligned at ${width}`);assert.ok(Math.abs(geometry.cells[i].y-geometry.cells[0].y)<3,'levels must remain on one row');}
   else for(let i=1;i<3;i++)assert.ok(geometry.cells[i].y>=geometry.cells[i-1].bottom-1);
   await page.screenshot({path:resolve(output,`rubric-${width}-${editing?'edit':'read'}.png`),fullPage:true});results.push({width,editing,...geometry});
   if(editing)await row.getByRole('button',{name:'取消',exact:true}).click();
  }
 }
 await writeFile(resolve(output,'result.json'),JSON.stringify({status:'passed',results},null,2));console.log('Passed: four widths, read/edit, aligned columns, AI in dimension header; no writes or generation');
}finally{await browser.close();}
