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
})();
