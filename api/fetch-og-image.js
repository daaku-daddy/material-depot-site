// Vercel Serverless Function (Node, zero dependencies). Given ?url=<materialdepot.com product page>,
// fetches it server-side (avoids browser CORS) and scrapes its og:image (falling back to
// twitter:image) so the BM dashboard can show a product thumbnail from a pasted URL.
//
// Host-allowlisted to *.materialdepot.com on BOTH the requested URL and the final URL after
// redirects — checking only the requested URL would let a materialdepot.com page redirect
// somewhere else and have this function fetch arbitrary attacker-controlled URLs (SSRF).
const ALLOWED_HOST = /(^|\.)materialdepot\.com$/i;

module.exports = async (req, res) => {
  const raw = req.query.url;
  let target;
  try { target = new URL(raw); } catch (e) { return res.status(400).json({ error: 'invalid url' }); }

  if (target.protocol !== 'http:' && target.protocol !== 'https:') return res.status(400).json({ error: 'host not allowed' });
  if (!ALLOWED_HOST.test(target.hostname)) return res.status(400).json({ error: 'host not allowed' });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  let r;
  try {
    r = await fetch(target.href, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MaterialDepotBot/1.0)' }
    });
  } catch (e) {
    clearTimeout(timer);
    return res.status(504).json({ error: 'fetch failed or timed out' });
  }
  clearTimeout(timer);

  let finalHost;
  try { finalHost = new URL(r.url).hostname; } catch (e) { finalHost = ''; }
  if (!ALLOWED_HOST.test(finalHost)) return res.status(400).json({ error: 'redirected off allowed host' });

  if (!r.ok) return res.status(200).json({ image: null });

  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('text/html')) return res.status(200).json({ image: null });

  const len = parseInt(r.headers.get('content-length') || '0', 10);
  if (len && len > 3000000) return res.status(200).json({ image: null });

  let html = await r.text();
  if (html.length > 1000000) html = html.slice(0, 1000000);

  const patterns = [
    /<meta\s+[^>]*?(?:property|name)=["']og:image["'][^>]*?content=["']([^"']*)["']/i,
    /<meta\s+[^>]*?content=["']([^"']*)["'][^>]*?(?:property|name)=["']og:image["']/i,
    /<meta\s+[^>]*?(?:property|name)=["']twitter:image["'][^>]*?content=["']([^"']*)["']/i
  ];
  let img = null;
  for (const p of patterns) {
    const m = html.match(p);
    if (m) { img = m[1]; break; }
  }
  if (img) {
    try { img = new URL(img, r.url).href; } catch (e) {}
  }

  res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400');
  return res.status(200).json({ image: img || null });
};
