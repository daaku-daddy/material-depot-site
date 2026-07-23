(function(){
  // Already installed as standalone PWA — never show
  if(window.matchMedia('(display-mode: standalone)').matches||navigator.standalone)return;
  // Dismissed this session — don't show until next browser open
  if(sessionStorage.getItem('_pwaDismissed'))return;
  // Desktop — skip (check touch support as proxy for mobile)
  const isIOS=/iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid=/android/i.test(navigator.userAgent);
  if(!isIOS&&!isAndroid)return;

  let _prompt=null;

  const banner=document.createElement('div');
  banner.id='_pwaBanner';
  banner.style.cssText='position:fixed;bottom:0;left:0;right:0;background:#1F3A5F;color:#fff;'
    +'padding:13px 16px 13px 16px;display:none;align-items:center;gap:12px;z-index:99999;'
    +'box-shadow:0 -3px 16px rgba(0,0,0,.35);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;'
    +'padding-bottom:calc(13px + env(safe-area-inset-bottom));';

  const iosMsg='Tap the Share button, then <b>Add to Home Screen</b>';
  const droidMsg='Get quick access &amp; offline support';

  banner.innerHTML=
    '<div style="flex:1;min-width:0">'
      +'<div style="font-weight:700;font-size:14px;line-height:1.2">📲 Install Material Depot App</div>'
      +'<div style="font-size:12px;opacity:.75;margin-top:3px;line-height:1.3">'+(isIOS?iosMsg:droidMsg)+'</div>'
    +'</div>'
    +(isIOS?'':'<button id="_pwaInstallBtn" style="flex-shrink:0;background:#F4C20D;color:#1F3A5F;border:none;border-radius:9px;padding:9px 16px;font-weight:800;font-size:13px;cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent">Install</button>')
    +'<button id="_pwaDismissBtn" aria-label="Dismiss" style="flex-shrink:0;background:transparent;border:none;color:#fff;font-size:22px;line-height:1;cursor:pointer;padding:4px 2px;opacity:.65;-webkit-tap-highlight-color:transparent">&#x2715;</button>';

  function show(){banner.style.display='flex';}
  function hide(){banner.style.display='none';}

  // Wait for DOM to be ready before appending
  function mount(){
    if(document.body)document.body.appendChild(banner);
    else document.addEventListener('DOMContentLoaded',()=>document.body.appendChild(banner));

    const installBtn=document.getElementById('_pwaInstallBtn');
    if(installBtn)installBtn.onclick=async function(){
      if(!_prompt)return;
      _prompt.prompt();
      const r=await _prompt.userChoice;
      if(r.outcome==='accepted')hide();
      _prompt=null;
    };

    document.getElementById('_pwaDismissBtn').onclick=function(){
      sessionStorage.setItem('_pwaDismissed','1');
      hide();
    };

    // iOS: show immediately (no API, just show instructions)
    if(isIOS)show();
  }

  // Android Chrome: wait for browser's install readiness signal
  window.addEventListener('beforeinstallprompt',function(e){
    e.preventDefault();
    _prompt=e;
    show();
  });

  // Hide when installed via our prompt or any other mechanism
  window.addEventListener('appinstalled',hide);

  // Mount banner once DOM is available
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);
  else mount();
})();
