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
  var MM2_PER_SQFT=92903.04; // 304.8mm (1ft) squared — converts a height(mm)*width(mm) area straight to sq.ft

  /* ---- UNITS (note 109) ------------------------------------------------------------------
     Every category captures its linear dimensions in ONE unit, declared as `unit` below, and
     always derives area in sq.ft (the only unit the rest of the business works in). A category
     whose unit depends on the room-level variant (Standard vs Customized wallpaper) declares
     `variantUnits` + `variantFields` instead, resolved per room by mdUnitFor / mdFieldsFor.
     UNIT_DIV: (height * width) / div  =>  sq.ft. */
  var UNIT_DIV={ft:1, in:144, mm:MM2_PER_SQFT};
  // Schema marker written by the auditor form for every NEW room. Bumped 2 -> 3 when per-variant
  // units arrived: a v2 wallpaper room captured its height/width in mm whatever its variant, so
  // v2 rooms MUST keep rendering with the mm base field list (see mdFieldsFor) or a historical
  // Standard-wallpaper audit would be re-labelled "ft" over numbers that are millimetres.
  window.MD_ROOM_V=3;

  /* ---- AREA ADJUSTMENTS (note 109) -------------------------------------------------------
     A segment may carry `adjust:[{sign:'+'|'-', h, w, reason}]` — small add/subtract areas that
     belong to THIS wall/floor rather than to a room of their own (a door or window to deduct, a
     niche return to add). h/w are in the segment's own unit; the signed sq.ft total is written
     into `fields.adjArea` by the capture form, so every read-only consumer just reads a field.
     Order of the derived chain: gross area -> ± adjustments -> net area -> + wastage -> rolls. */
  // Effective (post-adjustment) area a wastage/roll calculation should work from.
  var effArea=function(v){ var a=_n(v.adjArea); return a? r2(_n(v.area)+a) : _n(v.area); };
  /* ---- MANUAL AREA MODE (irregular walls/floors) -----------------------------------------
     Some walls/floors can't be generalised as one length x height. `fields.areaMode` (absent
     = 'Normal', today's behaviour) lets the auditor switch a segment to 'Custom' and type the
     total area directly instead. `showIf`/`skipIf`/`editableIf` below are the three hooks that
     make this work with zero changes to any renderer: `showIf` (already a generic mechanism —
     see the skirting fields) hides height/width when Custom; `skipIf` (new, honoured by
     mdComputeDerived) stops the area formula from overwriting a manually-typed value; `editableIf`
     (new, honoured by the auditor form) turns the normally read-only area field into a plain
     input. mdAuditRoomHtml/mdPdfAuditRoom need no changes — both already render fields generically
     from "does this field have a non-blank value", so a hidden height/width just stays blank. */
  var AREA_MODE_FIELD=function(){ return {k:'areaMode', group:'Measurements',
    label:'How to measure this wall/floor', input:'select', opts:['Normal','Custom']}; };
  var _skipDim=function(v){ return v.areaMode==='Custom'; };
  // `adjArea` is `derived` (read-only in the form, shown by every renderer) but has NO compute —
  // mdComputeDerived skips it and the capture form maintains it from the adjustment rows.
  var ADJ_FIELD=function(){ return {k:'adjArea', group:'Measurements', label:'Adjustments (± sq.ft)', derived:true}; };
  // Net area is blank (and so hidden by every renderer) unless an adjustment actually exists —
  // otherwise it would just repeat the gross area on every single segment.
  var NET_FIELD=function(){ return {k:'netArea', group:'Measurements', label:'Net area (sq.ft)', derived:true,
    compute:function(v){ return _n(v.adjArea)? r2(_n(v.area)+_n(v.adjArea)) : ''; }}; };
  var WASTAGE_FIELDS=function(){ return [
    {k:'wastagePct',group:'Measurements', label:'Wastage to add (%)', input:'decimal'},
    {k:'areaW',     group:'Measurements', label:'Area incl. wastage (sq.ft)', derived:true,
      compute:function(v){ return r2(effArea(v)*(1+_n(v.wastagePct)/100)); }}
  ]; };
  var ROLLS_FIELD=function(){ return {k:'rolls', group:'Measurements', label:'Rolls required', derived:true,
    compute:function(v,cat){ return Math.ceil(_n(v.areaW)/((cat&&cat.rollCoverage)||57))||0; }}; };
  // Wall-style measurement block (wallpaper / CNC / panels) in unit `u`.
  var WALL_FIELDS=function(u,opts){
    opts=opts||{};
    var f=[
      AREA_MODE_FIELD(),
      {k:'height', group:'Measurements', label:'Wall height ('+u+')', input:'decimal', showIf:function(v){return !_skipDim(v);}},
      {k:'width',  group:'Measurements', label:'Wall width ('+u+')',  input:'decimal', showIf:function(v){return !_skipDim(v);}},
      {k:'area',   group:'Measurements', label:'Area (sq.ft)', derived:true, input:'decimal', skipIf:_skipDim, editableIf:_skipDim,
        compute:function(v){ return r2((_n(v.height)*_n(v.width))/UNIT_DIV[u]); }},
      ADJ_FIELD(), NET_FIELD()
    ];
    if(opts.wastage) f=f.concat(WASTAGE_FIELDS());
    if(opts.rolls)   f.push(ROLLS_FIELD());
    return f.concat(opts.extra||[]);
  };
  var PROFILE_FIELDS=function(){ return [
    {k:'cornerRft', group:'Profiles', label:'Corner beading (running ft)', input:'decimal'},
    {k:'reducerRft',group:'Profiles', label:'Reducer profile (running ft)', input:'decimal'},
    {k:'tprofRft',  group:'Profiles', label:'T-profile (running ft)', input:'decimal'},
    {k:'lprofRft',  group:'Profiles', label:'L-profile (running ft)', input:'decimal'}
  ]; };
  var WALL_FACING=['North','South','East','West','North-East','North-West','South-East','South-West'];
  var WALL_PREREQ=function(extra,cleanLabel){ return [
    {k:'moisture', label:'Wall moisture within threshold'},
    {k:'even',     label:'Wall surface even'},
    {k:'clean',    label:cleanLabel||'Wall cleanliness (no dust / flaking paint)'}
  ].concat(extra||[]).concat([
    {k:'noSeep',   label:'No active seepage / dampness'},
    {k:'ready',    label:'Room ready (no ongoing wet-trade work)'}
  ]); };

  window.MD_CATEGORIES={
    flooring:{
      id:'flooring', label:'Wooden Flooring', pdfLabel:'Wooden Flooring', unit:'ft',
      segment:{model:'single', segLabel:'Floor', facing:false, facingOpts:null, addLabel:null},
      variants:null, rollCoverage:null,
      unitNote:'Room length & width are entered in FEET (ft). Area is shown in sq.ft.',
      fields:[
        AREA_MODE_FIELD(),
        {k:'length',    group:'Measurements', label:'Room length (ft)', input:'decimal', showIf:function(v){return !_skipDim(v);}},
        {k:'width',     group:'Measurements', label:'Room width (ft)',  input:'decimal', showIf:function(v){return !_skipDim(v);}},
        {k:'area',      group:'Measurements', label:'Area (sq.ft)', derived:true, input:'decimal', skipIf:_skipDim, editableIf:_skipDim,
          compute:function(v){return r2(_n(v.length)*_n(v.width));}},
        ADJ_FIELD(), NET_FIELD()
      ].concat(WASTAGE_FIELDS()).concat([
        {k:'skirtKind', group:'Skirting', label:'Skirting type', input:'select', opts:['None','Normal','Step']},
        {k:'skirtH',    group:'Skirting', label:'Normal skirting — height (mm)', input:'decimal', showIf:function(v){return v.skirtKind==='Normal';}},
        {k:'skirtRft',  group:'Skirting', label:'Normal skirting — qty (running ft)', input:'decimal', showIf:function(v){return v.skirtKind==='Normal';}},
        {k:'stepTileH', group:'Skirting', label:'Step skirting — tile height (mm)', input:'decimal', showIf:function(v){return v.skirtKind==='Step';}},
        {k:'stepTileT', group:'Skirting', label:'Step skirting — tile thickness (mm)', input:'decimal', showIf:function(v){return v.skirtKind==='Step';}},
        {k:'stepRft',   group:'Skirting', label:'Step skirting — qty (running ft)', input:'decimal', showIf:function(v){return v.skirtKind==='Step';}}
      ]).concat(PROFILE_FIELDS()),
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
      segment:{model:'multi', segLabel:'Wall', facing:true, facingOpts:WALL_FACING, addLabel:'Add wall'},
      variants:['Standard','Customized'], rollCoverage:57,
      // Unit depends on the room-level variant: Standard is measured in feet, Customized in
      // millimetres. `unit`/`fields` are the pre-note-109 (v2) baseline — mm for both variants —
      // and stay here so historical v2 rooms keep rendering in the unit they were captured in.
      unit:'mm',
      variantUnits:{Standard:'ft', Customized:'mm'},
      variantFields:{Standard:WALL_FIELDS('ft',{wastage:true,rolls:true}), Customized:WALL_FIELDS('mm',{wastage:true,rolls:true})},
      variantNote:{
        Standard:'Standard wallpaper — wall height & width are entered in FEET (ft). Area is shown in sq.ft.',
        Customized:'Customized wallpaper — wall height & width are entered in MILLIMETRES (mm). Area is shown in sq.ft.'
      },
      variantPrompt:'Pick Standard or Customized above — measurements are in feet for Standard and millimetres for Customized.',
      // Baseline note for a pre-note-109 (v2) room, which was captured in mm whatever its variant.
      unitNote:'Wall height & width are entered in MILLIMETRES (mm). Area is shown in sq.ft.',
      fields:WALL_FIELDS('mm',{wastage:true,rolls:true}),
      prerequisites:WALL_PREREQ([{k:'primer', label:'Primer / base-coat confirmed'}]),
      legacyFields:[['warea','Wall area (sq.ft)'],['rolls','No. of rolls'],['repeat','Pattern repeat (mm)'],['match','Match type'],['adh','Adhesive (packs)'],['primer','Primer needed']],
      installFields:[
        {k:'installedRolls', group:'Installed', label:'Rolls used', input:'decimal'},
        {k:'batch',          group:'Installed', label:'Batch / lot no.', input:'text'}
      ]
    },
    cnc:{
      id:'cnc', label:'CNC', pdfLabel:'CNC', unit:'mm',
      segment:{model:'multi', segLabel:'Wall', facing:true, facingOpts:WALL_FACING, addLabel:'Add wall'},
      variants:null, rollCoverage:null,
      unitNote:'CNC — wall height & width are entered in MILLIMETRES (mm). Area is shown in sq.ft.',
      fields:WALL_FIELDS('mm'),
      prerequisites:WALL_PREREQ([{k:'structural', label:'Wall structurally sound for CNC panel fixing'}],'Wall cleanliness (no dust / debris)'),
      legacyFields:[],
      installFields:[]
    },
    wallpanel:{
      id:'wallpanel', label:'Wall Panels', pdfLabel:'Wall Panels', unit:'in',
      segment:{model:'multi', segLabel:'Wall', facing:true, facingOpts:WALL_FACING, addLabel:'Add wall'},
      variants:null, rollCoverage:null,
      unitNote:'Wall Panels — wall height & width are entered in INCHES (in). Area is shown in sq.ft.',
      fields:WALL_FIELDS('in',{wastage:true,extra:PROFILE_FIELDS()}),
      prerequisites:WALL_PREREQ([{k:'structural', label:'Wall structurally sound to bear panel weight'}]),
      legacyFields:[],
      installFields:[
        {k:'installedArea', group:'Installed', label:'Area installed (sq.ft)', input:'decimal'},
        {k:'batch',         group:'Installed', label:'Batch / lot no.', input:'text'}
      ]
    }
  };

  // Compute every derived field top-down (later derived read earlier). Mutates + returns `values`.
  // `room` (note 109) selects the right field list for a per-variant-unit category — WITHOUT it a
  // Standard (feet) wallpaper wall would be computed with the Customized (mm) area formula and come
  // out ~300x too small, so every caller that has a room must pass it.
  window.mdComputeDerived=function(cat,values,room){
    if(!cat||!values)return values;
    window.mdFieldsFor(cat,room).forEach(function(f){ if(f.derived&&typeof f.compute==='function'&&!(f.skipIf&&f.skipIf(values))){ try{ values[f.k]=f.compute(values,cat); }catch(e){} } });
    return values;
  };

  /* ---- PER-ROOM UNIT / FIELD RESOLUTION (note 109) ---------------------------------------
     A room's measurement field list is no longer just `cat.fields` — for a category with
     per-variant units it depends on the room's `variant`, and on the room's schema version
     (v2 rooms predate per-variant units and were all captured in the base unit). ALWAYS go
     through mdFieldsFor / mdUnitFor rather than reading cat.fields directly. */
  var _roomV=function(room){ var v=room&&room.v; return (v===undefined||v===null)?window.MD_ROOM_V:v; };
  window.mdFieldsFor=function(cat,room){
    if(!cat)return [];
    if(cat.variantFields && _roomV(room)>=3 && room && room.variant && cat.variantFields[room.variant]) return cat.variantFields[room.variant];
    return cat.fields||[];
  };
  window.mdUnitFor=function(cat,room){
    if(!cat)return 'ft';
    if(cat.variantUnits && _roomV(room)>=3 && room && room.variant && cat.variantUnits[room.variant]) return cat.variantUnits[room.variant];
    return cat.unit||'ft';
  };
  // True when the variant must be picked BEFORE measurements can be entered, because it is what
  // decides the unit. The capture form shows `cat.variantPrompt` instead of the fields.
  window.mdNeedsVariant=function(cat,room){ return !!(cat&&cat.variantFields&&_roomV(room)>=3&&!(room&&room.variant)); };
  // Unit banner for the capture form — per-variant where the variant decides the unit.
  window.mdUnitNote=function(cat,room){
    if(!cat)return '';
    // Variant still unpicked — the variant prompt states both units, so a banner naming just one
    // of them here would contradict it.
    if(window.mdNeedsVariant(cat,room))return '';
    if(cat.variantNote && room && room.variant && _roomV(room)>=3) return cat.variantNote[room.variant]||'';
    return cat.unitNote||'';
  };
  // Unsigned sq.ft magnitude of one adjustment row. `shape` absent is treated as 'Rectangle',
  // reproducing the pre-shape h*w formula exactly (every live production row has no `shape`).
  // 'Other' skips the unit conversion entirely — the auditor types the area straight in sq.ft.
  var _adjArea=function(a,div){
    if(!a)return 0;
    if(a.shape==='Other')return _n(a.area);
    var mult=(a.shape==='Triangle')?0.5:1;
    var raw=_n(a.h)*_n(a.w)*mult;
    return raw? r2(raw/div) : 0;
  };
  // Signed sq.ft total of a segment's area adjustments. The capture form writes this into
  // `fields.adjArea` so every read-only consumer only ever reads a plain field.
  window.mdAdjSum=function(cat,room,adjust){
    var div=UNIT_DIV[window.mdUnitFor(cat,room)]||1, t=0;
    (adjust||[]).forEach(function(a){
      var ar=_adjArea(a,div); if(!ar)return;
      t+=(a.sign==='-'? -ar : ar);
    });
    return r2(t);
  };
  // Display rows for a segment's adjustments — {label,shape,size,area,reason,photos}. Empty rows
  // (no computed/typed area) are dropped so a half-typed adjustment never reaches a job card.
  window.mdAdjRows=function(cat,room,adjust){
    var u=window.mdUnitFor(cat,room), div=UNIT_DIV[u]||1;
    return (adjust||[]).map(function(a){ return a?{a:a,ar:_adjArea(a,div)}:null; })
      .filter(function(x){return x&&x.ar;}).map(function(x){
        var a=x.a, shape=a.shape||'Rectangle', neg=a.sign==='-';
        var size=shape==='Other' ? 'manual entry' : (_n(a.h)+' × '+_n(a.w)+' '+u+(shape==='Triangle'?' (triangle)':''));
        return {label:neg?'Subtract':'Add', shape:shape, size:size,
                area:(neg?'-':'+')+x.ar, reason:(a.reason||'').trim(),
                photos:(a.photos||[]).slice(), neg:neg};
      });
  };
  // Any adjustment carrying an area but no stated reason — the capture form soft-gates on this.
  window.mdAdjMissingReason=function(cat,room,adjust){
    return window.mdAdjRows(cat,room,adjust).some(function(r){return !r.reason;});
  };
  // Any adjustment carrying an area but no photo — the capture form soft-gates on this too.
  window.mdAdjMissingPhoto=function(cat,room,adjust){
    return window.mdAdjRows(cat,room,adjust).some(function(r){return !r.photos||!r.photos.length;});
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
      if(isV2){ rows=window.mdFieldsFor(cat,nr).filter(function(f){var v=s.fields&&s.fields[f.k];return v!==undefined&&v!==null&&String(v)!=='';}).map(function(f){return krow(f.label,esc(s.fields[f.k]));}).join(''); }
      else { rows=(cat.legacyFields||[]).filter(function(p){var v=s.fields&&s.fields[p[0]];return v!==undefined&&v!==null&&String(v)!=='';}).map(function(p){return krow(p[1],esc(s.fields[p[0]]));}).join(''); }
      // Area adjustments (note 109) — the small add/subtract areas with their stated reason. Only
      // v2+ rooms can carry these; the summed sq.ft already shows above as the `adjArea` field.
      var adjRows=isV2?window.mdAdjRows(cat,nr,s.adjust):[];
      var adj=adjRows.length?('<div style="margin-top:7px;border-top:1px dashed var(--line);padding-top:6px">'
        +'<div style="font-size:11px;font-weight:800;color:var(--muted);text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px">Area adjustments</div>'
        +adjRows.map(function(a){return '<div style="font-size:12.5px;display:flex;gap:8px;flex-wrap:wrap">'
          +'<span style="font-weight:700;color:'+(a.neg?'var(--red)':'var(--green)')+'">'+esc(a.area)+' sq.ft</span>'
          +'<span style="color:var(--muted)">'+esc(a.label)+' '+esc(a.size)+'</span>'
          +'<span>'+(a.reason?esc(a.reason):'<i style="color:var(--red)">no reason given</i>')+'</span>'
          +'<span>'+(a.photos.length?esc(a.photos.length+' photo'+(a.photos.length>1?'s':'')):'<i style="color:var(--red)">no photo attached</i>')+'</span></div>';}).join('')
        +'</div>'):'';
      var prq=isV2?(cat.prerequisites||[]).filter(function(p){return s.prereq&&s.prereq[p.k]&&s.prereq[p.k].status;}).map(function(p){var st=s.prereq[p.k].status;var col=st==='Not OK'?'var(--red)':(st==='OK'?'var(--green)':'var(--muted)');return krow(p.label,esc(st)+(s.prereq[p.k].note?' - '+esc(s.prereq[p.k].note):''),col);}).join(''):'';
      var photos=(s.photos||[]).filter(Boolean).map(function(p){return '<img src="'+esc(p)+'" style="width:60px;height:60px;object-fit:cover;border-radius:7px;border:1px solid var(--line)">';}).join('');
      var flagged=window.mdPrereqFlagged({prereq:s.prereq});
      // BM material selection (added 2026-08-12) — per-segment {sku,productName,url,image,by,at}, set via
      // BM_Dashboard.html. Absent on every pre-existing segment, so this is purely additive.
      var mat=s.material?('<div style="margin-top:7px;display:flex;gap:8px;align-items:center;background:var(--lighter,#eef3f9);border-radius:7px;padding:6px 8px">'
        +(s.material.image?'<img src="'+esc(s.material.image)+'" style="width:44px;height:44px;object-fit:cover;border-radius:6px;border:1px solid var(--line);flex:0 0 auto">':'')
        +'<div style="font-size:11.5px;min-width:0"><div style="font-weight:700">'+esc(s.material.productName||s.material.sku||'Material selected')+'</div>'
        +(s.material.sku?'<div style="color:var(--muted)">SKU: '+esc(s.material.sku)+'</div>':'')
        +'</div></div>'):'';
      return '<div style="border:1px solid var(--line);border-radius:9px;padding:9px;margin-top:8px">'
        +(multi?'<div style="font-weight:800;font-size:12.5px;color:var(--navy);margin-bottom:6px">'+esc(cat.segment.segLabel)+' '+(si+1)+(s.facing?' - '+esc(s.facing):'')+(flagged?' <span style="color:var(--red)">&#9888;</span>':'')+'</div>':'')
        +(rows?KVW+rows+'</div>':'<div style="color:var(--muted);font-size:12px">No measurements recorded.</div>')
        +adj
        +(prq?KVW.replace('grid-template','margin-top:6px;grid-template')+prq+'</div>':'')
        +(photos?'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:7px">'+photos+'</div>':'')
        +mat
        +'</div>';
    }).join('');
    return '<div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:8px">'
      +'<div style="font-weight:800;color:var(--navy)">Room '+((i||0)+1)+': '+esc(nr.name||'-')+' <span style="font-weight:600;color:var(--muted);font-size:11.5px">'+esc(cat.pdfLabel)+(nr.variant?' &middot; '+esc(nr.variant):'')+' &middot; SKU: '+esc(nr.sku||'NA')+'</span></div>'
      +segHtml
      +(nr.notes?'<div style="margin-top:8px;font-size:12px;color:var(--muted)">Notes: '+esc(nr.notes)+'</div>':'')
      +'</div>';
  };

  // Shared ON-SCREEN renderer for one INSTALLATION room. New install rooms are flat v2
  // {v:2,category,name,sku,fields:{installFields},photos,comments}; legacy install rooms are
  // {name,sku,qty,height,width,photos,comments}. Both render through this one path.
  // BM customer-journey timeline (added 2026-08-12) — the downstream stages after a site audit
  // completes: order placement -> render generation -> client approval (may loop) -> printing ->
  // delivery -> install. None of this is auto-derived from any system; entries are appended
  // manually (by BM/SM/Admin) via BM_Dashboard.html's `pushJourneyEntry`, and stored as a flat,
  // append-only array (`audit_orders.bm_journey`) — a `round` number lets the renderer group
  // repeated render/approval cycles without needing a nested state machine.
  window.MD_JOURNEY_STAGES=[
    {k:'order_placed',      label:'Order Placed',              icon:'🧾', hasRef:true,  refLabel:'Order-placement enquiry ID'},
    {k:'render_generated',  label:'Render Generated',          icon:'🖼️', hasRound:true},
    {k:'sent_for_approval', label:'Sent for Client Approval',  icon:'📤', hasRound:true},
    {k:'client_feedback',   label:'Client Feedback',           icon:'💬', hasRound:true, hasDecision:true},
    {k:'printing',          label:'Printing',                  icon:'🖨️'},
    {k:'delivery_scheduled',label:'Delivery Scheduled',        icon:'🚚', hasRef:true,  refLabel:'Delivery date / tracking no.'},
    {k:'installed',         label:'Installed',                 icon:'✅'}
  ];
  // Read-only timeline renderer — inline-styled (CSS vars only, no classes), same portability
  // convention as mdAuditRoomHtml/mdInstallRoomHtml, so any consumer can drop it in for free.
  window.mdJourneyHtml=function(entries){
    var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
    var fmt=function(ts){var d=new Date(ts);if(isNaN(d.getTime()))return '—';return d.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})+' · '+d.toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'});};
    if(!Array.isArray(entries)||!entries.length)return '<div style="color:var(--muted);font-size:12.5px">No journey entries logged yet.</div>';
    var byKey={};(window.MD_JOURNEY_STAGES||[]).forEach(function(s){byKey[s.k]=s;});
    var sorted=entries.slice().sort(function(a,b){return new Date(b.ts)-new Date(a.ts);});
    return sorted.map(function(e){
      var st=byKey[e.stage]||{label:e.stage,icon:'•'};
      var roundTxt=e.round?(' · Round '+esc(e.round)):'';
      var decisionCol=e.decision==='approved'?'var(--green)':(e.decision==='changes_requested'?'var(--red)':'');
      var decisionTxt=e.decision?(' <span style="color:'+decisionCol+'">'+(e.decision==='approved'?'&#10003; Approved':'&#9998; Changes requested')+'</span>'):'';
      return '<div style="border-bottom:1px solid var(--line);padding:8px 0">'
        +'<div style="font-weight:700;font-size:13px">'+esc(st.icon||'')+' '+esc(st.label)+roundTxt+decisionTxt+'</div>'
        +(e.note?'<div style="font-size:12px;margin-top:2px">'+esc(e.note)+'</div>':'')
        +(e.refId?'<div style="font-size:11.5px;color:var(--muted);margin-top:1px">Ref: '+esc(e.refId)+'</div>':'')
        +'<div style="font-size:11.5px;color:var(--muted);margin-top:2px">'+(e.by&&e.by.name?esc(e.by.name)+' · ':'')+fmt(e.ts)+(e.by&&e.by.role?' · '+esc(e.by.role):'')+'</div>'
        +'</div>';
    }).join('');
  };

  window.mdInstallRoomHtml=function(room,i){
    var esc=function(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
    var KVW='<div style="display:grid;grid-template-columns:minmax(110px,auto) 1fr;gap:3px 12px;font-size:12.5px">';
    var krow=function(l,v){return '<div style="color:var(--muted)">'+esc(l)+'</div><div>'+esc(v)+'</div>';};
    var head, rows, photos, comments;
    if(room && room.v>=2){
      var cat=window.mdCategoryFor(room.category);
      rows=(cat.installFields||[]).filter(function(f){var v=room.fields&&room.fields[f.k];return v!==undefined&&v!==null&&String(v)!=='';}).map(function(f){return krow(f.label,room.fields[f.k]);}).join('');
      head=esc(room.name||'-')+' <span style="font-weight:600;color:var(--muted);font-size:11.5px">'+esc(cat.pdfLabel)+' &middot; SKU: '+esc(room.sku||'NA')+'</span>';
      photos=(room.photos||[]).filter(Boolean);
      comments=room.comments||room.notes||'';
    }else{
      rows=[['SKU',room.sku],['Quantity',room.qty],['H x W',[room.height,room.width].filter(Boolean).join(' x ')]].filter(function(p){return p[1]!==undefined&&p[1]!==null&&String(p[1])!=='';}).map(function(p){return krow(p[0],p[1]);}).join('');
      head=esc(room.name||'-');
      photos=(room.photos&&room.photos.length?room.photos:(room.photo?[room.photo]:[])).filter(Boolean);
      comments=room.comments||'';
    }
    var ph=photos.map(function(p){return '<img src="'+esc(p)+'" style="width:60px;height:60px;object-fit:cover;border-radius:7px;border:1px solid var(--line)">';}).join('');
    return '<div style="border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:8px">'
      +'<div style="font-weight:800;color:var(--navy)">Room '+((i||0)+1)+': '+head+'</div>'
      +(rows?KVW+rows+'</div>':'')
      +(ph?'<div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">'+ph+'</div>':'')
      +(comments?'<div style="margin-top:8px;font-size:12px;color:var(--muted)">'+esc(comments)+'</div>':'')
      +'</div>';
  };
})();
