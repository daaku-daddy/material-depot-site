/* Reconciliation test for md-cat-analytics.js's dummy generator.
   Asserts that the expanded order-level / cart-level rows add back up to the workbook figures
   embedded in MD_AN_SHEET. Run: node tools/an_reconcile.js   (no dependencies) */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','md-cat-analytics.js'),'utf8');
global.window={};
// The file is one IIFE; when it is still being written the closer may be missing, so add it if needed.
const open=(src.match(/\(function\(\)\{/g)||[]).length;
eval(src+(src.trim().endsWith('})();')?'':'\n})();'));
const W=global.window, SHEET=W.MD_AN_SHEET;
let fails=0, checks=0;
function eq(label,got,want,tol){
  checks++;
  const ok=Math.abs(got-want)<=(tol||0);
  if(!ok){fails++;console.log('  ✗ '+label+'  got '+got+'  want '+want);}
}
W.mdAnDataset().then(ds=>{
  const orders=ds.orders, carts=ds.carts;
  console.log('generated: '+orders.length+' orders, '+carts.length+' carts');
  // ---- per store-month-category: orders, value, qty, customers ----
  Object.keys(SHEET.cat).forEach(cat=>{
    SHEET.cat[cat].forEach(([store,month,wOrders,wValue,wQty,wCust])=>{
      const rows=orders.filter(o=>o.store===store&&o.month===month&&o.lines.some(l=>l.cat===cat));
      const val=rows.reduce((s,o)=>s+o.lines.filter(l=>l.cat===cat).reduce((a,l)=>a+l.value,0),0);
      const qty=rows.reduce((s,o)=>s+o.lines.filter(l=>l.cat===cat).reduce((a,l)=>a+l.qty,0),0);
      const cust=new Set(rows.map(o=>o.client)).size;
      const tag=cat+' '+store+' '+month+' ';
      eq(tag+'orders',rows.length,wOrders);
      eq(tag+'value',Math.round(val),Math.round(wValue));
      eq(tag+'qty',Math.round(qty*10)/10,Math.round(wQty*10)/10,0.15);
      eq(tag+'customers',cust,wCust);
    });
  });
  // ---- attach counts ----
  const att={};
  SHEET.attach.forEach(([s,m,wp,fl])=>{att[s+'|'+m]={wallpaper:wp,flooring:fl};});
  SHEET.attachX.forEach(([s,m,pn,cn])=>{att[s+'|'+m]=Object.assign(att[s+'|'+m]||{},{wallpanel:pn,cnc:cn});});
  Object.keys(att).forEach(k=>{
    const [store,month]=k.split('|');
    Object.keys(att[k]).forEach(cat=>{
      const n=orders.filter(o=>o.store===store&&o.month===month&&o.lines.some(l=>l.cat===cat)&&o.hasInstall).length;
      eq('attach '+cat+' '+store+' '+month,n,att[k][cat]);
    });
  });
  // ---- carts: company-wide per category-month ----
  Object.keys(SHEET.carts).forEach(cat=>{
    SHEET.carts[cat].forEach(([month,tot,cl,same])=>{
      const rows=carts.filter(c=>c.cat===cat&&c.month===month);
      eq('carts '+cat+' '+month,rows.length,tot);
      eq('cleared '+cat+' '+month,rows.filter(c=>c.cleared).length,cl);
      eq('convB '+cat+' '+month,rows.filter(c=>c.orderedSameCat).length,same);
    });
  });
  // ---- Category Summary tab: company totals per month ----
  const summary={site_audit:{'2026-06':[54,53952],'2026-07':[121,120879],'2026-08':[73,72907]},
                 installation:{'2026-06':[90,472500],'2026-07':[131,578536],'2026-08':[88,447721]},
                 wallpaper:{'2026-06':[160,2127140],'2026-07':[147,2305314],'2026-08':[121,1500196]},
                 flooring:{'2026-06':[39,2096219],'2026-07':[60,2798442],'2026-08':[32,1823002]}};
  Object.keys(summary).forEach(cat=>Object.keys(summary[cat]).forEach(month=>{
    const [wo,wv]=summary[cat][month];
    // the workbook's Category Summary tab EXCLUDES the untagged (no branch_id) orders, which it
    // lists separately at the bottom of Cat x Store x Month — so nothing is added back here.
    const uo=0, uv=0;
    const rows=orders.filter(o=>o.month===month&&o.lines.some(l=>l.cat===cat));
    const val=rows.reduce((s,o)=>s+o.lines.filter(l=>l.cat===cat).reduce((a,l)=>a+l.value,0),0);
    eq('SUMMARY orders '+cat+' '+month,rows.length+uo,wo);
    eq('SUMMARY value '+cat+' '+month,Math.round(val)+uv,wv);
  }));
  // ---- audit link sanity ----
  const audits=orders.filter(o=>o.lines.some(l=>l.cat==='site_audit'));
  const linked=audits.filter(o=>o.link);
  const linkPhones=new Set(linked.map(o=>o.client));
  console.log('audits '+audits.length+', linked '+linked.length+' ('+Math.round(linked.length/audits.length*100)+'%), of which +install '+
    linked.filter(o=>o.link.kind==='product_install').length+' ('+Math.round(linked.filter(o=>o.link.kind==='product_install').length/linked.length*100)+'%)');
  eq('one audit per linked customer phone',linkPhones.size,linked.length);
  linked.forEach(a=>{const p=orders.find(o=>o.id===a.link.orderId);if(!p||p.client!==a.client||p.date<=a.date){fails++;console.log('  ✗ bad link '+a.id);}checks++;});
  console.log((fails?'FAIL':'PASS')+': '+(checks-fails)+'/'+checks+' checks');
  process.exit(fails?1:0);
});
