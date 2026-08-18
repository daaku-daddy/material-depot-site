/* Renders every new Analytics tab to a standalone HTML file (in the OS temp dir) so the markup can
   be eyeballed in a browser without touching the live Admin console — it borrows Admin.html's own
   <style> block so the preview looks like the real page. Run: node tools/an_render_check.js
   For the assertions, see an_reconcile.js (generator vs workbook) and an_compute_check.js. */
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
global.window={};
eval(fs.readFileSync(path.join(root,'md-cat-analytics.js'),'utf8'));
const W=global.window;
const f={from:'2026-08-01',to:'2026-08-17',store:'all',city:'all'};
W.mdAnDataset().then(ds=>{
  const t=W.mdAnTargetDefaults();
  const ctx=W.mdAnBuildCtx(ds,f,t);
  const parts={category:W.mdAnRenderCategory(ctx),weekly:W.mdAnRenderWeekly(ctx),
               penetration:W.mdAnRenderPenetration(ctx),targets:W.mdAnRenderTargets(ctx,'2026-08')};
  // pull the analytics CSS out of Admin.html so the preview looks like the real page
  const admin=fs.readFileSync(path.join(root,'Admin.html'),'utf8');
  const css=admin.slice(admin.indexOf('<style>')+7,admin.indexOf('</style>'));
  let html='<!doctype html><meta charset="utf-8"><title>Analytics revamp preview</title><style>'+css+
    'main{padding:20px;max-width:1400px;margin:0 auto}</style><body><main>';
  Object.keys(parts).forEach(k=>{html+='<h1 style="margin:26px 0 12px;font-size:20px;color:#1F3A5F">['+k+']</h1>'+parts[k];});
  html+='</main>';
  const out=path.join(require('node:os').tmpdir(),'an_preview.html');
  fs.writeFileSync(out,html);
  Object.keys(parts).forEach(k=>console.log(k+': '+parts[k].length+' chars'));
  console.log('drills: '+Object.keys(W.MD_AN_DRILL).join(', '));
  ['matrix','carts','weekly','penetration','targets'].forEach(k=>{
    const c=W.mdAnCsvData(k,ctx,'2026-08');console.log('csv '+k+': '+c.rows.length+' rows → '+c.name);
  });
  console.log('wrote '+out);
});
