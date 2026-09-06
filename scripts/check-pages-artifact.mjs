import assert from "node:assert/strict";
import { readdir, readFile, lstat } from "node:fs/promises";
import { resolve, join, extname, relative } from "node:path";
import { createHash } from "node:crypto";
const root=resolve(process.argv[2]??"apps/web/dist");
const allowed=new Set([".html",".js",".css",".map",".woff2",".ttf",".txt",".webp",".mp4"]);
let count=0,bytes=0;
async function walk(dir){for(const name of await readdir(dir)){const path=join(dir,name),info=await lstat(path);assert.equal(info.isSymbolicLink(),false,"No artifact symlinks");assert.ok(!/^(?:\.env|\.git|output|node_modules|database|api|worker)(?:$|\.)/i.test(name),"Private path in artifact");if(info.isDirectory())await walk(path);else{assert.ok(allowed.has(extname(name)),`Unexpected artifact type: ${relative(root,path)}`);bytes+=info.size;count++;}}}
await walk(root);
const html=await readFile(join(root,"index.html"),"utf8");assert.ok(html.includes('/tracepbl/assets/'));assert.ok(!html.includes('/src/main.tsx'));
assert.ok((await readFile(join(root,"404.html"),"utf8")).includes('tracepbl:spa-path:v1'));
for(const [name,hash] of [["p00-cinematic-h3-v2.mp4","e1de5ff83df60ea8fdd58004e14068f174ae04e4abb4ad433bf49a7ae9e4019b"],["p00-cinematic-h3-v2-poster.webp","ab7b4d36ed2349266cfe0cbdc0ac18c8349b314f9e35e634bc1e88bc2e61da49"]])assert.equal(createHash("sha256").update(await readFile(join(root,"assets/p00",name))).digest("hex"),hash);
const files=await readdir(join(root,"assets/p00"));assert.ok(!files.some(name=>/v1|dunhuang|cave|keyframe/.test(name)));
console.log(JSON.stringify({status:"passed",files:count,bytes,base:"/tracepbl/",approvedMedia:true}));
