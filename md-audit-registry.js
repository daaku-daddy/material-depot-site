/* Material Depot — product-category registry for the site-audit / installation job-card system.
   SINGLE SOURCE OF TRUTH for measurement fields, derived formulas, segment model, accessories,
   prerequisites and legacy label maps. Loaded via <script src="/md-audit-registry.js"> in every
   consuming file BEFORE its inline script. Pure data + functions — no DOM / jsPDF dependency.

   TO ADD A NEW PRODUCT CATEGORY: add one entry to MD_CATEGORIES below. The audit form, every PDF
   generator and every on-screen renderer iterate this object, so a new category needs ZERO core
   code changes. (The only coupling: the upstream order SKU `type` string must equal the new key
   for auto-selection; otherwise the auditor just picks it from the category dropdown.) */
(function(){
  var _n=function(x){var v=parseFloat(x);return isFinite(v)?v:0;};
  var r2=function(x){return Math.round(x*100)/100;};

  window.MD_CATEGORIES={
    flooring:{
      id:'flooring', label:'Wooden Flooring', pdfLabel:'Wooden Flooring',
      segment:{model:'single', segLabel:'Floor', facing:false, facingOpts:null, addLabel:null},
      variants:null, rollCoverage:null,
      fields:[
        {k:'length',    group:'Measurements', label:'Room length (ft)', input:'decimal'},
        {k:'width',     group:'Measurements', label:'Room width (ft)',  input:'decimal'},
        {k:'area',      group:'Measurements', label:'Total area (sq.ft)', derived:true, compute:function(v){return r2(_n(v.length)*_n(v.width));}},
        {k:'wastagePct',group:'Measurements', label:'Wastage to add (%)', input:'decimal'},
        {k:'areaW',     group:'Measurements', label:'Area incl. wastage (sq.ft)', derived:true, compute:function(v){return r2(_n(v.area)*(1+_n(v.wastagePct)/100));}},
        {k:'skirtKind', group:'Skirting', label:'Skirting type', input:'select', opts:['None','Normal','Step']},
        {k:'skirtH',    group:'Skirting', label:'Normal skirting — height (mm)', input:'decimal', showIf:function(v){return v.skirtKind==='Normal';}},
        {k:'skirtRft',  group:'Skirting', label:'Normal skirting — qty (running ft)', input:'decimal', showIf:function(v){return v.skirtKind==='Normal';}},
        {k:'stepTileH', group:'Skirting', label:'Step skirting — tile height (mm)', input:'decimal', showIf:function(v){return v.skirtKind==='Step';}},
        {k:'stepTileT', group:'Skirting', label:'Step skirting — tile thickness (mm)', input:'decimal', showIf:function(v){return v.skirtKind==='Step';}},
        {k:'stepRft',   group:'Skirting', label:'Step skirting — qty (running ft)', input:'decimal', showIf:function(v){return v.skirtKind==='Step';}},
        {k:'cornerRft', group:'Profiles', label:'Corner beading (running ft)', input:'decimal'},
        {k:'reducerRft',group:'Profiles', label:'Reducer profile (running ft)', input:'decimal'},
        {k:'tprofRft',  group:'Profiles', label:'T-profile (running ft)', input:'decimal'},
        {k:'lprofRft',  group:'Profiles', label:'L-profile (running ft)', input:'decimal'}
      ],
      prerequisites:[
        {k:'moisture', label:'Subfloor moisture within threshold'},
        {k:'level',    label:'Subfloor level / evenness within tolerance'},
        {k:'clean',    label:'Subfloor clean (no debris, dust, adhesive)'},
        {k:'climate',  label:'Room temperature & humidity stable'},
        {k:'noWet',    label:'No active wet-trade work nearby'},
        {k:'acclim',   label:'Material acclimatization confirmed'}
      ],
      legacyFields:[['area','Area (sq.ft)'],['boxes','Boxes'],['skirt','Skirting (nos)'],['skirtH','Skirting height (mm)'],['lprof','L-profile'],['rprof','Reducer profile'],['tprof','T-profile'],['corner','Corner beading']],
      installFields:[
        {k:'installedArea', group:'Installed', label:'Area installed (sq.ft)', input:'decimal'},
        {k:'batch',         group:'Installed', label:'Batch / lot no.', input:'text'}
      ]
    },
    wallpaper:{
      id:'wallpaper', label:'Wallpaper', pdfLabel:'Wallpaper',
      segment:{model:'multi', segLabel:'Wall', facing:true, facingOpts:['North','South','East','West','North-East','North-West','South-East','South-West'], addLabel:'Add wall'},
      variants:['Standard','Customized'], rollCoverage:57,
      fields:[
        {k:'height',    group:'Measurements', label:'Wall height (in)', input:'decimal'},
        {k:'width',     group:'Measurements', label:'Wall width (in)',  input:'decimal'},
        {k:'area',      group:'Measurements', label:'Area (sq.ft)', derived:true, compute:function(v){return r2((_n(v.height)*_n(v.width))/144);}},
        {k:'wastagePct',group:'Measurements', label:'Wastage to add (%)', input:'decimal'},
        {k:'areaW',     group:'Measurements', label:'Area incl. wastage (sq.ft)', derived:true, compute:function(v){return r2(_n(v.area)*(1+_n(v.wastagePct)/100));}},
        {k:'rolls',     group:'Measurements', label:'Rolls required', derived:true, compute:function(v,cat){return Math.ceil(_n(v.areaW)/((cat&&cat.rollCoverage)||57))||0;}}
      ],
      prerequisites:[
        {k:'moisture', label:'Wall moisture within threshold'},
        {k:'even',     label:'Wall surface even'},
        {k:'clean',    label:'Wall cleanliness (no dust / flaking paint)'},
        {k:'primer',   label:'Primer / base-coat confirmed'},
        {k:'noSeep',   label:'No active seepage / dampness'},
        {k:'ready',    label:'Room ready (no ongoing wet-trade work)'}
      ],
      legacyFields:[['warea','Wall area (sq.ft)'],['rolls','No. of rolls'],['repeat','Pattern repeat (mm)'],['match','Match type'],['adh','Adhesive (packs)'],['primer','Primer needed']],
      installFields:[
        {k:'installedRolls', group:'Installed', label:'Rolls used', input:'decimal'},
        {k:'batch',          group:'Installed', label:'Batch / lot no.', input:'text'}
      ]
    }
  };

  // Compute every derived field top-down (later derived read earlier). Mutates + returns `values`.
  window.mdComputeDerived=function(cat,values){
    if(!cat||!cat.fields||!values)return values;
    cat.fields.forEach(function(f){ if(f.derived&&typeof f.compute==='function'){ try{ values[f.k]=f.compute(values,cat); }catch(e){} } });
    return values;
  };
  // Category template for a category key / legacy `type` string. Falls back to flooring for display.
  window.mdCategoryFor=function(type){ return (type&&window.MD_CATEGORIES[type])||window.MD_CATEGORIES.flooring; };
  // v>=2 rooms expose segments; legacy rooms return null (caller uses the legacy path).
  window.mdSegmentsOf=function(room){ return (room&&room.v>=2&&room.segments)?room.segments:null; };
  // Any 'Not OK' prerequisite in a segment flags it (soft flag, informational only).
  window.mdPrereqFlagged=function(seg){ var p=seg&&seg.prereq; if(!p)return false; return Object.keys(p).some(function(k){return p[k]&&p[k].status==='Not OK';}); };
  // Normalize a legacy {type,calc,photos} room into a single-segment v:0 shape (passthrough if v>=2),
  // so every read-only consumer (PDF + on-screen) has one shape to render.
  window.mdNormalizeRoom=function(room){
    if(!room)return room;
    if(room.v>=2)return room;
    return {
      v:0, category:room.type||'flooring', name:room.name||'', sku:room.sku||'', variant:null,
      notes:room.notes||'', sketchStrokes:room.sketchStrokes||[],
      segments:[{ id:1, facing:null, fields:Object.assign({},room.calc||{}), photos:room.photos||(room.photo?[room.photo]:[]), prereq:{}, flagged:false }]
    };
  };

  // Shared ON-SCREEN (DOM) renderer for one audit room — v2 segments + prerequisites + photos, or a
  // legacy room via legacyFields. Returns an HTML string using CSS vars present in every consuming
  // file (--line/--muted/--navy/--red/--green). Used by SM Audit drawer, Admin job detail, and the
  // installer's read-only audit report so they all display v2 audits identically. `i` = room index.
  window.mdAuditRoomHtml=function(room,i){
    var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
    var KVW='<div style="display:grid;grid-template-columns:minmax(110px,auto) 1fr;gap:3px 12px;font-size:12.5px">';
    var krow=function(l,v,col){return '<div style="color:var(--muted)">'+esc(l)+'</div><div'+(col?' style="color:'+col+'"':'')+'>'+v+'</div>';};
    var nr=window.mdNormalizeRoom(room), cat=window.mdCategoryFor(nr.category), isV2=nr.v>=2;
    var multi=isV2 && cat.segment && cat.segment.model==='multi';
    var segHtml=(nr.segments||[]).map(function(s,si){
      var rows;
      if(isV2){ rows=cat.fields.filter(function(f){var v=s.fields&&s.fields[f.k];return v!==undefined&&v!==null&&String(v)!=='';}).map(function(f){return krow(f.label,esc(s.fields[f.k]));}).join(''); }
      else { rows=(cat.legacyFields||[]).filter(function(p){var v=s.fields&&s.fields[p[0]];return v!==undefined&&v!==null&&String(v)!=='';}).map(function(p){return krow(p[1],esc(s.fields[p[0]]));}).join(''); }
      var prq=isV2?(cat.prerequisites||[]).filter(function(p){return s.prereq&&s.prereq[p.k]&&s.prereq[p.k].status;}).map(function(p){var st=s.prereq[p.k].status;var col=st==='Not OK'?'var(--red)':(st==='OK'?'var(--green)':'var(--muted)');return krow(p.label,esc(st)+(s.prereq[p.k].note?' - '+esc(s.prereq[p.k].note):''),col);}).join(''):'';
      var photos=(s.photos||[]).filter(Boolean).map(function(p){return '<img src="'+esc(p)+'" style="width:60px;height:60px;object-fit:cover;border-radius:7px;border:1px solid var(--line)">';}).join('');
      var flagged=window.mdPrereqFlagged({prereq:s.prereq});
      return '<div style="border:1px solid var(--line);border-radius:9px;padding:9px;margin-top:8px">'
        +(multi?'<div style="font-weight:800;font-size:12.5px;color:var(--navy);margin-bottom:6px">'+esc(cat.segment.segLabel)+' '+(si+1)+(s.facing?' - '+esc(s.facing):'')+(flagged?' <span style="color:var(--red)">&#9888;</span>':'')+'</div>':'')
        +(rows?KVW+rows+'</div>':'<div style="color:var(--muted);font-size:12px">No measurements recorded.</div>')
        +(prq?KVW.replace('grid-template','margin-top:6px;grid-template')+prq+'</div>':'')
        +(photos?'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px">'+photos+'</div>':'')
        +'</div>';
    }).join('');
    return '<div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:8px">'
      +'<div style="font-weight:800;color:var(--navy)">Room '+((i||0)+1)+': '+esc(nr.name||'-')+' <span style="font-weight:600;color:var(--muted);font-size:11.5px">'+esc(cat.pdfLabel)+(nr.variant?' &middot; '+esc(nr.variant):'')+' &middot; SKU: '+esc(nr.sku||'NA')+'</span></div>'
      +segHtml
      +(nr.notes?'<div style="margin-top:8px;font-size:12px;color:var(--muted)">Notes: '+esc(nr.notes)+'</div>':'')
      +'</div>';
  };
})();
