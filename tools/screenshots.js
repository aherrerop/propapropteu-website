// Screenshots of the site as a phone (390x844) or any size (W=1280 H=800), full page.
// Uses the Microsoft Edge already on this PC, headless. Pictures go to tools/screens/ (not in git).
//   node tools/screenshots.js https://propapropteu.com/ "home=;;shop=shop.html;;menu=|Layout.toggleNav()"
//   jobs: name=path  or  name=path|javascript   (path - = stay on the current page), separated by ;;
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, 'screens'); fs.mkdirSync(OUT, { recursive: true });
const BASE = process.argv[2] || 'https://propapropteu.com/';
const JOBS = (process.argv[3] || 'home=').split(';;').map(s => { const [n, rest] = s.split('='); const [p, js] = (rest || '').split('|'); return { n, p, js }; });
const W = Number(process.env.W || 390), H = Number(process.env.H || 844), PORT = 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const edge = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(require('os').tmpdir(), 'ppt-edge-profile')}`, 'about:blank'], { stdio: 'ignore' });
(async () => {
  let tabs;
  for (let i = 0; i < 40; i++) { try { tabs = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (tabs.length) break; } catch (e) {} await sleep(250); }
  const page = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {};
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; } };
  const cmd = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async e => (await cmd('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true })).result.result;
  const metrics = h => cmd('Emulation.setDeviceMetricsOverride', { width: W, height: h, deviceScaleFactor: 1, mobile: W < 800 });
  await cmd('Page.enable'); await cmd('Runtime.enable');
  await cmd('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1' });
  await cmd('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await metrics(H);
  // pre-accept the cookie notice
  await cmd('Page.navigate', { url: BASE }); await sleep(2500);
  await evalJs("localStorage.setItem('ppt-cookies-ok','1'); localStorage.setItem('ppt-lang','es'); 1");
  for (const j of JOBS) {
    if (j.p !== undefined && j.p !== '-') { await cmd('Page.navigate', { url: BASE + j.p }); await sleep(3500); }
    if (j.js) { await evalJs(j.js); await sleep(1500); }
    const full = !j.js;
    let h = H;
    if (full) { h = (await evalJs('Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)')).value; }
    const r = await cmd('Page.captureScreenshot', full ? { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: h, scale: 1 } } : { format: 'png' });
    const file = path.join(OUT, j.n + '.png'); fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    console.log(j.n, h);
  }
  ws.close(); edge.kill();
})().catch(e => { console.error(e); edge.kill(); process.exit(1); });
