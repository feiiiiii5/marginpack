import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
await mkdir(resolve(root, '.runtime'), {recursive:true});
await mkdir(resolve(root, 'dist'), {recursive:true});
await writeFile(resolve(root, '.runtime/blank.html'), '<!doctype html><meta charset="utf-8"><title>MarginPack demo generator</title>');
const html = '<!doctype html><html><head><title>A reading worth keeping</title></head><body><article><p>FIELD NOTES · ORIGINAL SYNTHETIC EXAMPLE</p><h1>A reading worth keeping</h1><p id="lead">A useful note belongs beside the passage that prompted it. When a saved webpage leaves your library, that connection should travel with it.</p><h2>Keep the context</h2><p id="context">An excerpt tells you what was selected. The surrounding page tells you what it meant.</p><p>You can send this file to someone who has never installed Zotero. They can read the saved text, open a comment and follow the original reasoning without a shared account.</p><blockquote id="handoff">A small handoff can preserve a large amount of careful reading.</blockquote><h2>Make uncertainty visible</h2><p id="uncertain">If an old annotation no longer matches its saved text, the reader needs to know.</p><p>MarginPack retains unresolved entries in the sidebar. It never moves a quotation to a merely similar sentence.</p><h2>Read across languages</h2><p id="cjk">阅读笔记应该和原文一起保存。A fox 🦊 is two UTF-16 units; offsets still need to agree.</p><p>This demonstration contains only original text and synthetic annotations. No personal research data is included.</p></article></body></html>';
const make=(id,type,color,selector,text,comment,tags=[])=>({id,type,color,position:{type:'CssSelector',value:selector},text,comment,tags});
const annotations=[
 make('one','highlight','#ffd400','#lead','A useful note belongs beside the passage that prompted it. When a saved webpage leaves your library, that connection should travel with it.','This is the reason I saved the page. Keep the whole passage with the comment.',['context']),
 make('two','underline','#2ea8e5','#context','An excerpt tells you what was selected. The surrounding page tells you what it meant.','Useful distinction for sharing a source with a colleague.',['handoff']),
 make('three','highlight','#f19837','#handoff','A small handoff can preserve a large amount of careful reading.','Try sending the exported file to someone outside the project.'),
 make('four','highlight','#5fb236','#uncertain','This deliberately stale quotation is not in the saved page.','An unresolved record remains visible. No silent relocation.'),
 make('five','note','#a28ae5','#cjk','阅读笔记应该和原文一起保存。A fox 🦊 is two UTF-16 units; offsets still need to agree.','保留原文、评论和对应位置。',['multilingual'])
];
const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1040},deviceScaleFactor:1});
 await page.goto(pathToFileURL(resolve(root,'.runtime/blank.html')).href);
 await page.addScriptTag({path:resolve(root,'src/marginpack.js')});
 const result=await page.evaluate(input=>globalThis.MarginPack.exportSnapshot(input),{html,annotations,metadata:{title:'A reading worth keeping',url:'https://example.invalid/reading',savedAt:'2026-11-06'}});
 const target=resolve(root,'dist/marginpack-demo.html');
 await writeFile(target,result.html);
 await page.goto(pathToFileURL(target).href);
 await page.locator('[data-annotation-index="0"]').waitFor();
 await page.screenshot({path:resolve(root,'docs/demo.png'),fullPage:true});
 await writeFile(resolve(root,'dist/demo-report.json'),JSON.stringify(result.report,null,2)+'\n');
 console.log(JSON.stringify({total:result.report.total,matched:result.report.matched,unresolved:result.report.unresolved,unsupported:result.report.unsupported}));
}finally{await browser.close();}
