/* Spot-checks mdAnAggregate / mdAnWeeks / mdAnPenetration / mdAnEvaluate against the workbook. */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','md-cat-analytics.js'),'utf8');
global.window={};
eval(src+(src.trim().endsWith('})();')?'':'\n})();'));
const W=global.window;
let f=0,n=0;
const eq=(l,g,w,tol)=>{n++;if(Math.abs(g-w)>(tol||0)){f++;console.log('  ✗ '+l+' got '+g+' want '+w);}};
W.mdAnDataset().then(ds=>{
  // ---------- full window ----------
  let flt={from:'2026-06-01',to:'2026-08-17',store:'all',city:'all'};
  let a=W.mdAnAggregate(ds,flt);
  eq('wallpaper orders Jun-Aug',a.cats.wallpaper.orders,160+147+121);
  eq('flooring value Jun-Aug',Math.round(a.cats.flooring.value),2096219+2798442+1823002);
  eq('site audit orders',a.cats.site_audit.orders,54+121+73);
  eq('installation orders',a.cats.installation.orders,90+131+88);
  eq('total carts',a.totals.carts,79+159+101+179+246+216+911+975+770+298+311+221+96+118+104+58+71+49);
  // ---------- August month-to-date ----------
  flt={from:'2026-08-01',to:'2026-08-17',store:'all',city:'all'};
  a=W.mdAnAggregate(ds,flt);
  eq('Aug wallpaper orders',a.cats.wallpaper.orders,121);
  eq('Aug wallpaper attach %',+a.cats.wallpaper.attachPct.toFixed(2),52.07,0.01);
  eq('Aug flooring attach %',+a.cats.flooring.attachPct.toFixed(2),56.25,0.01);
  eq('Aug wallpaper carts',a.cats.wallpaper.carts,770);
  eq('Aug wallpaper conv B %',+a.cats.wallpaper.convBpct.toFixed(2),14.29,0.01);
  eq('Aug wallpaper conv A %',+a.cats.wallpaper.convApct.toFixed(2),29.87,0.01);
  eq('Aug site audit conv B %',+a.cats.site_audit.convBpct.toFixed(2),71.29,0.01);
  eq('Aug JP wallpaper orders',a.byStore['JP NAGAR'].wallpaper.orders,34);
  eq('Aug JP wallpaper attach',a.byStore['JP NAGAR'].wallpaper.attachNum,19);
  // ---------- weeks ----------
  const wk=W.mdAnWeeks(flt);
  eq('Aug week count',wk.length,3);
  eq('W1 days',wk[0].days,7); eq('W3 days',wk[2].days,3);
  if(wk[2].label.indexOf('15–17')<0){f++;n++;console.log('  ✗ W3 label '+wk[2].label);}else n++;
  const wkOrders=wk.map(w=>W.mdAnAggregate(ds,Object.assign({},flt,{from:w.from,to:w.to})).cats.wallpaper.orders);
  eq('weekly wallpaper orders sum',wkOrders.reduce((s,x)=>s+x,0),121);
  console.log('  weekly wallpaper orders '+wkOrders.join(' / ')+'  (workbook 46 / 66 / 9)');
  // ---------- penetration ----------
  const pen=W.mdAnPenetration(ds,flt,a);
  const jp=pen.find(p=>p.store==='JP NAGAR');
  eq('JP total orders Aug',jp.totalOrders,459);
  eq('JP site audit penetration %',+jp.cats.site_audit.pct.toFixed(2),+(29/459*100).toFixed(2),0.01);
  eq('JP wallpaper penetration %',+jp.cats.wallpaper.pct.toFixed(2),+(34/459*100).toFixed(2),0.01);
  const hsr=pen.find(p=>p.store==='HSR LAYOUT');
  eq('HSR months live ~0.7',hsr.monthsLive,0.7,0.15);
  // ---------- conversion ----------
  console.log('  audit→order (Aug): '+a.conv.audits+' audits, '+a.conv.pct.toFixed(1)+'% converted ('
    +a.conv.productPct.toFixed(1)+'% product-only, '+a.conv.productInstallPct.toFixed(1)+'% product+install), median TAT '+a.conv.medianTat+'d');
  eq('conv parts add up',a.conv.product+a.conv.productInstall+a.conv.none,a.conv.audits);
  // ---------- targets ----------
  const t=W.mdAnTargetDefaults();
  eq('mature JP wallpaper target Aug',t.orders['2026-08']['JP NAGAR'].wallpaper,28);
  eq('ramping HSR wallpaper target Aug',t.orders['2026-08']['HSR LAYOUT'].wallpaper,12);
  eq('planned RR NAGAR target Aug',t.orders['2026-08']['RR NAGAR'].wallpaper,0);
  console.log('  Dec-26 seeded plan (orders): '+W.MD_AN_STORE_IDS.map(s=>W.mdAnStoreLabel(s)+' '+
    W.MD_AN_CAT_IDS.reduce((x,c)=>x+t.orders['2026-12'][s][c],0)).join(' · '));
  const decTotal=W.MD_AN_STORE_IDS.reduce((s,st)=>s+W.MD_AN_CAT_IDS.reduce((x,c)=>x+t.orders['2026-12'][st][c],0),0);
  console.log('  Dec-26 company total across '+W.MD_AN_CAT_IDS.length+' categories: '+decTotal+' orders (workbook bottom-up: 1,767 across 4)');
  const pr=W.mdAnProrate(t,flt,'JP NAGAR','wallpaper');
  eq('prorated Aug 1-17 target',+pr.orders.toFixed(2),+(28*17/31).toFixed(2),0.01);
  const ev=W.mdAnEvaluate(ds,flt,a,t);
  console.log('  targets: '+ev.all.length+' checks · '+ev.risk.length+' at risk · '+ev.watch.length+' watch · stores at risk: '+
    (ev.storesAtRisk.map(W.mdAnStoreLabel).join(', ')||'none'));
  console.log('  worst 6: '+ev.bad.slice(0,6).map(r=>r.storeLabel+'/'+r.catLabel+' '+r.metric+' '+Math.round(r.pct)+'%').join(' | '));
  const full=W.mdAnAggregate(ds,{from:'2026-06-01',to:'2026-08-17',store:'all',city:'all'});
  const tats=full.auditRows.filter(r=>r.tat!=null).map(r=>r.tat).sort((x,y)=>x-y);
  console.log('  audit→order TAT (Jun–Aug, '+tats.length+' links): min '+tats[0]+'d · p50 '+tats[Math.floor(tats.length/2)]+'d · p90 '+tats[Math.floor(tats.length*0.9)]+'d · max '+tats[tats.length-1]+'d');
  console.log((f?'FAIL':'PASS')+': '+(n-f)+'/'+n);
  process.exit(f?1:0);
});
