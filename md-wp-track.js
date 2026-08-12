/* ============================================================================
   md-wp-track.js — SHARED custom-wallpaper production registry + read-only renderer.

   Single source of truth for the vendor list, the stage ladder and the SLA maths behind
   the Category Ops Executive's custom wallpaper tracking (the `wp_production` table).

   Loaded via <script src> BEFORE the inline script in:
     COE_Dashboard.html        — the owner: creates rows and stamps stages
     SM_Install_Dashboard.html — read-only mirror inside a custom_wp order's drawer
     BM_Dashboard.html         — read-only, so a BM can see when the ball is in their court
     Admin.html                — read-only oversight

   Same convention as md-audit-registry.js: everything hangs off `window`, the renderer is
   inline-styled using CSS vars only (no classes), so any consumer can drop it in for free.

   ADDING A VENDOR = one object in MD_WP_VENDORS. Nothing else changes.
   ============================================================================ */
(function(){

  /* ---------- vendors ---------- */
  window.MD_WP_VENDORS=[
    {k:'indura',     label:'Indura',       dispatchFrom:'Hyderabad'},
    {k:'lifencolor', label:'Life n Color', dispatchFrom:'Gurugram'},
    {k:'macromedia', label:'Macro Media',  dispatchFrom:'Hyderabad', note:'1 PM cutoff for same-day pickup'},
    {k:'other',      label:'Other vendor', dispatchFrom:'vendor'}
  ];

  /* ---------- stage ladder ----------
     group    — which phase of the journey this belongs to (drives the COE's bucket tiles)
     slaH     — hours allowed since the PREVIOUS stage was stamped
     soft     — true = an attention threshold ("stalled"), false = a promised SLA ("breached").
                The first five come straight from the vendor sheet's own column headers
                (6hrs / 6hrs / 2hrs / 2hrs / 1day); the tail thresholds are ours, and are the
                knob to turn if the team decides a different lag is acceptable.
     round    — lives inside a render/approval round rather than the linear stage map
     decision — captures the client's verdict, which is what can send it round again        */
  window.MD_WP_STAGES=[
    {k:'dimensions_shared', label:'Dimensions shared with vendor', group:'prepress',  slaH:6},
    {k:'render_generated',  label:'Render generated',              group:'prepress',  slaH:6,  round:true},
    {k:'render_to_bm',      label:'Render shared with BM',         group:'prepress',  slaH:2,  round:true},
    {k:'render_to_client',  label:'Shared with client by BM',      group:'prepress',  slaH:2,  round:true},
    {k:'client_approval',   label:'Approved by client',            group:'approval',  slaH:24, round:true, decision:true},
    {k:'sent_for_printing', label:'Sent for printing',             group:'production',slaH:24, soft:true},
    {k:'dispatched',        label:'Dispatched from {from}',        group:'production',slaH:48, soft:true},
    {k:'at_warehouse',      label:'Reached our warehouse',         group:'logistics', slaH:72, soft:true},
    {k:'out_for_delivery',  label:'Out for delivery',              group:'logistics', slaH:72, soft:true},
    {k:'delivered',         label:'Delivered to client',           group:'logistics', slaH:24, soft:true},
    {k:'install_scheduled', label:'Installation scheduled',        group:'logistics', slaH:72, soft:true}
  ];

  window.MD_WP_DECISIONS=[
    {k:'approved',          l:'Approved by client',       terminalOk:true},
    {k:'changes_suggested', l:'Changes suggested',        loops:true},
    {k:'no_reply',          l:'No reply from client'},
    {k:'cancelled',         l:'PO cancelled',             cancels:true}
  ];

  var ROUND_KEYS=['render_generated','render_to_bm','render_to_client','client_approval'];
  window.MD_WP_ROUND_KEYS=ROUND_KEYS;

  function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}

  window.mdWpVendor=function(k){
    var v=window.MD_WP_VENDORS.filter(function(x){return x.k===k;})[0];
    return v||{k:k||'other',label:k||'Unknown vendor',dispatchFrom:'vendor'};
  };
  window.mdWpStage=function(k){
    return window.MD_WP_STAGES.filter(function(s){return s.k===k;})[0]||{k:k,label:k,group:'logistics'};
  };
  window.mdWpStageLabel=function(k,vendorKey){
    var s=window.mdWpStage(k);
    return String(s.label).replace('{from}',window.mdWpVendor(vendorKey).dispatchFrom);
  };

  // Rounds always read as at least one, so a brand-new row renders the full ladder
  // instead of an empty gap where the render cycle should be.
  window.mdWpRounds=function(row){
    var r=(row&&Array.isArray(row.rounds))?row.rounds:[];
    return r.length?r:[{n:1}];
  };
  function stages(row){return (row&&row.stages&&typeof row.stages==='object')?row.stages:{};}

  // Timestamp for a stage. Round stages resolve against the CURRENT (latest) round —
  // earlier rounds keep their own timestamps and are shown separately in the ladder.
  window.mdWpStageAt=function(row,k){
    if(ROUND_KEYS.indexOf(k)>=0){
      var rs=window.mdWpRounds(row), cur=rs[rs.length-1]||{};
      if(k==='client_approval')return (cur.approval&&cur.approval.at)||null;
      return (cur[k]&&cur[k].at)||null;
    }
    var e=stages(row)[k];
    return (e&&e.at)||null;
  };

  window.mdWpDecision=function(row){
    var rs=window.mdWpRounds(row), cur=rs[rs.length-1]||{};
    return (cur.approval&&cur.approval.decision)||null;
  };

  /* ---------- what has to happen next ----------
     Returns {k, label, blocked} or null when the row has nothing left to do.
     The one place the loop lives: "changes suggested" means the NEXT action is a fresh
     render (a new round), while "no reply" means keep chasing the same approval.        */
  window.mdWpNext=function(row){
    if(!row||row.state==='cancelled')return null;
    var at=function(k){return window.mdWpStageAt(row,k);};
    if(!at('dimensions_shared'))return mk('dimensions_shared');
    for(var i=0;i<ROUND_KEYS.length;i++){
      var k=ROUND_KEYS[i];
      if(!at(k))return mk(k);
    }
    var d=window.mdWpDecision(row);
    if(d==='cancelled')return null;
    if(d==='changes_suggested')return mk('render_generated',true);
    if(d==='no_reply')return mk('client_approval',true);
    if(d!=='approved')return mk('client_approval',true);
    var tail=['sent_for_printing','dispatched','at_warehouse','out_for_delivery','delivered','install_scheduled'];
    for(var j=0;j<tail.length;j++){if(!at(tail[j]))return mk(tail[j]);}
    return null;
    function mk(k,redo){var s=window.mdWpStage(k);return{k:k,label:window.mdWpStageLabel(k,row.vendor),group:s.group,redo:!!redo};}
  };

  /* ---------- SLA / stall clock ----------
     Elapsed is measured from the moment the PREVIOUS stage was stamped (or from the order
     being placed, for the very first stage) — the same way the vendor sheet's bracketed
     hour targets read. Wall-clock, not business hours. */
  window.mdWpPrevAt=function(row){
    var next=window.mdWpNext(row);
    if(!next)return null;
    var order=window.MD_WP_STAGES.map(function(s){return s.k;});
    var idx=order.indexOf(next.k);
    // A redo (new round after "changes suggested") clocks from the client's feedback,
    // not from the previous round's render — that's when the work actually restarted.
    if(next.redo){
      var rs=window.mdWpRounds(row),cur=rs[rs.length-1]||{};
      if(cur.approval&&cur.approval.at)return cur.approval.at;
    }
    for(var i=idx-1;i>=0;i--){
      var a=window.mdWpStageAt(row,window.MD_WP_STAGES[i].k);
      if(a)return a;
    }
    return row.order_placed_at||row.created_at||null;
  };

  window.mdWpSla=function(row,nowMs){
    var next=window.mdWpNext(row);
    if(!next)return{level:'none',next:null,hours:0};
    var s=window.mdWpStage(next.k);
    var from=window.mdWpPrevAt(row);
    if(!from)return{level:'none',next:next,hours:0,from:null};
    var hours=(( nowMs||Date.now())-new Date(from).getTime())/3600000;
    var level='ok';
    if(s.slaH){
      if(hours>s.slaH)level=s.soft?'stalled':'breach';
      else if(hours>=s.slaH*0.75)level='soon';
    }
    return{level:level,next:next,hours:hours,from:from,slaH:s.slaH||null,soft:!!s.soft};
  };

  // Bucket for the COE's stat tiles. Mutually exclusive and exhaustive, so the tiles
  // always sum to the row count (CLAUDE.md note 82's lesson).
  window.mdWpBucket=function(row,nowMs){
    if(row&&row.state==='cancelled')return'cancelled';
    var next=window.mdWpNext(row);
    if(!next)return'completed';
    if(row&&row.state==='on_hold')return'onhold';
    var sla=window.mdWpSla(row,nowMs);
    if(sla.level==='breach'||sla.level==='stalled')return'breach';
    return next.group;
  };
  window.MD_WP_BUCKETS=[
    {k:'breach',    l:'Delayed / breached', cls:'s-red'},
    {k:'prepress',  l:'Render in progress', cls:''},
    {k:'approval',  l:'Awaiting client',    cls:'s-amber'},
    {k:'production',l:'Printing & dispatch',cls:''},
    {k:'logistics', l:'Delivery & install', cls:''},
    {k:'onhold',    l:'On hold',            cls:''},
    {k:'completed', l:'Completed',          cls:'s-green'},
    {k:'cancelled', l:'Cancelled',          cls:''}
  ];

  /* ---------- completed-step durations, for the delay analytics ----------
     One entry per stage that actually happened, with the hours it took from whatever
     legitimately preceded it. EVERY render round contributes its own data points — a job
     that took three renders is three observations of "how long a render takes", not one.
     Lives here (not in the dashboard) so the analytics can never disagree with the ladder
     about what preceded what. */
  window.mdWpDurations=function(row){
    if(!row)return [];
    var out=[],rounds=window.mdWpRounds(row),st=stages(row);
    var start=row.order_placed_at||row.created_at||null;
    function push(k,at,prev,n){
      if(!at||!prev)return;
      var h=(new Date(at).getTime()-new Date(prev).getTime())/3600000;
      if(!isFinite(h)||h<0)return;                 // out-of-order/backfilled data — skip, never negative
      out.push({k:k,hours:h,round:n||null,vendor:row.vendor||'other'});
    }
    push('dimensions_shared',st.dimensions_shared&&st.dimensions_shared.at,start);
    var prevChain=(st.dimensions_shared&&st.dimensions_shared.at)||start;
    rounds.forEach(function(r,i){
      var base=i===0?prevChain:((rounds[i-1].approval&&rounds[i-1].approval.at)||null);
      var rg=r.render_generated&&r.render_generated.at;
      var rb=r.render_to_bm&&r.render_to_bm.at;
      var rc=r.render_to_client&&r.render_to_client.at;
      var ap=r.approval&&r.approval.at;
      push('render_generated',rg,base,i+1);
      push('render_to_bm',rb,rg,i+1);
      push('render_to_client',rc,rb,i+1);
      push('client_approval',ap,rc,i+1);
    });
    var last=rounds[rounds.length-1]||{};
    var prev=(last.approval&&last.approval.at)||null;
    ['sent_for_printing','dispatched','at_warehouse','out_for_delivery','delivered','install_scheduled'].forEach(function(k){
      var at=st[k]&&st[k].at;
      push(k,at,prev);
      if(at)prev=at;
    });
    return out;
  };

  function fmtTs(t){
    if(!t)return '';
    var d=new Date(t);if(isNaN(d.getTime()))return '';
    return d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})+' · '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});
  }
  function fmtDur(h){
    if(h==null)return '';
    if(h<1)return Math.max(1,Math.round(h*60))+' min';
    if(h<48)return (Math.round(h*10)/10)+' hrs';
    return Math.round(h/24)+' days';
  }
  window.mdWpFmtDur=fmtDur;

  /* ---------- read-only ladder renderer ----------
     Inline-styled with CSS vars only (--line/--muted/--green/--red/--amber/--navy), the same
     portability convention as mdAuditRoomHtml — every consumer already defines these. */
  window.mdWpLadderHtml=function(row){
    if(!row)return '';
    var v=window.mdWpVendor(row.vendor);
    var rounds=window.mdWpRounds(row);
    var next=window.mdWpNext(row);
    var sla=window.mdWpSla(row);
    var out='';

    var slaBadge='';
    if(next){
      var col=sla.level==='breach'?'var(--red)':sla.level==='stalled'?'var(--amber)':sla.level==='soon'?'var(--amber)':'var(--muted)';
      var word=sla.level==='breach'?'SLA breached':sla.level==='stalled'?'Stalled':sla.level==='soon'?'Due soon':'On track';
      slaBadge='<span style="color:'+col+';font-weight:700">'+word+'</span>'
        +(sla.from?' · '+esc(fmtDur(sla.hours))+' at this step':'')
        +(sla.slaH?' (target '+sla.slaH+'h)':'');
    }
    out+='<div style="font-size:12px;color:var(--muted);margin-bottom:8px">'
      +'<b style="color:var(--navy)">'+esc(v.label)+'</b>'
      +(row.md_id?' · '+esc(row.md_id):'')
      +(rounds.length>1?' · round '+rounds.length:'')
      +(next?'<div style="margin-top:2px">Next: <b style="color:var(--navy)">'+esc(next.label)+'</b> — '+slaBadge+'</div>'
            :'<div style="margin-top:2px;color:var(--green);font-weight:700">'+(row.state==='cancelled'?'PO cancelled':'All steps complete')+'</div>')
      +'</div>';

    out+=stepHtml('dimensions_shared');

    rounds.forEach(function(r,i){
      var multi=rounds.length>1;
      if(multi)out+='<div style="font-size:11px;font-weight:800;color:var(--muted);margin:8px 0 2px;letter-spacing:.4px">ROUND '+(i+1)+'</div>';
      ['render_generated','render_to_bm','render_to_client'].forEach(function(k){
        out+=stepHtml(k,r[k],i===rounds.length-1);
      });
      var ap=r.approval||null;
      var dec=ap&&ap.decision?window.MD_WP_DECISIONS.filter(function(d){return d.k===ap.decision;})[0]:null;
      out+=rowHtml(
        window.mdWpStageLabel('client_approval',row.vendor)+(dec?' — '+dec.l:''),
        ap&&ap.at?ap.at:null, ap&&ap.note?ap.note:'', ap&&ap.by?ap.by:null,
        dec?(dec.cancels?'var(--red)':dec.loops?'var(--amber)':'var(--green)'):null,
        i===rounds.length-1&&next&&next.k==='client_approval'
      );
    });

    ['sent_for_printing','dispatched','at_warehouse','out_for_delivery','delivered','install_scheduled'].forEach(function(k){
      out+=stepHtml(k);
    });

    if(row.notes)out+='<div style="margin-top:10px;background:var(--lighter,#eef3f9);border-radius:8px;padding:8px 10px;font-size:12px"><b>Notes:</b> '+esc(row.notes)+'</div>';
    return out;

    function stepHtml(k,entry,isCurrentRound){
      var e=entry!==undefined?entry:stages(row)[k];
      var isNext=!!(next&&next.k===k&&(entry===undefined||isCurrentRound!==false));
      return rowHtml(window.mdWpStageLabel(k,row.vendor),e&&e.at?e.at:null,(e&&e.note)||'',(e&&e.by)||null,null,isNext);
    }
    function rowHtml(label,at,note,by,doneColor,isNext){
      var done=!!at;
      var dot=done
        ?'<span style="width:16px;height:16px;border-radius:50%;display:inline-grid;place-items:center;font-size:9px;font-weight:800;background:'+(doneColor||'var(--green)')+';color:#fff;flex:0 0 auto">&#10003;</span>'
        :'<span style="width:16px;height:16px;border-radius:50%;display:inline-block;border:2px solid '+(isNext?'var(--amber)':'var(--line)')+';flex:0 0 auto"></span>';
      return '<div style="display:flex;gap:9px;align-items:flex-start;padding:5px 0">'+dot
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:12.5px;font-weight:'+(done||isNext?'700':'400')+';color:'+(done?'var(--ink,#1b2230)':isNext?'var(--navy)':'var(--muted)')+'">'+esc(label)+'</div>'
        +(at?'<div style="font-size:11px;color:var(--muted)">'+esc(fmtTs(at))+(by&&by.name?' · '+esc(by.name):'')+'</div>':'')
        +(note?'<div style="font-size:11.5px;margin-top:2px">'+esc(note)+'</div>':'')
        +'</div></div>';
    }
  };

})();
