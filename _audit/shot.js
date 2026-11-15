const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const edgePath = process.env.EDGE_PATH;
const url = process.env.PAGE_URL;
const outDir = process.env.OUT_DIR;
const width = parseInt(process.env.VW || "1440", 10);
const height = parseInt(process.env.VH || "900", 10);
const port = 9333 + Math.floor(Math.random()*100);
const profile = path.join(outDir, "edge-profile-" + port);
fs.mkdirSync(profile, { recursive: true });
const edge = spawn(edgePath, [
  "--headless=new",
  "--disable-gpu",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "--window-size=" + width + "," + height,
  "--hide-scrollbars",
  url
], { stdio: ["ignore", "pipe", "pipe"] });
let stderr = "";
edge.stderr.on("data", d => stderr += d.toString());
function getJSON(p) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: p }, res => {
      let b = ""; res.on("data", c => b += c); res.on("end", () => { try { resolve(JSON.parse(b)); } catch(e){ reject(e);} });
    });
    req.on("error", reject);
  });
}
function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }
function send(ws, method, params={}) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random()*1e9);
    const handler = (raw) => {
      let msg; try { msg = JSON.parse(raw); } catch { return; }
      if (msg.id === id) { ws.off("message", handler); resolve(msg); }
    };
    ws.on("message", handler);
    ws.send(JSON.stringify({ id, method, params }));
    setTimeout(() => { ws.off("message", handler); reject(new Error("timeout "+method)); }, 15000);
  });
}
(async () => {
  let targets = null;
  for (let i=0;i<40;i++) {
    try { targets = await getJSON("/json/list"); if (targets && targets.length) break; } catch {}
    await sleep(250);
  }
  if (!targets) throw new Error("no targets: " + stderr);
  const page = targets.find(t => t.type === "page");
  const WebSocket = require("ws");
  const ws = new WebSocket(page.webSocketDebuggerUrl, { perMessageDeflate: false });
  await new Promise((res, rej) => { ws.on("open", res); ws.on("error", rej); });
  await send(ws, "Page.enable");
  await send(ws, "Runtime.enable");
  // force reveal visible
  await send(ws, "Runtime.evaluate", { expression: `document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('visible');el.style.opacity='1';el.style.transform='none'});` });
  await sleep(500);
  // measure full height
  const hres = await send(ws, "Runtime.evaluate", { expression: "document.documentElement.scrollHeight", returnByValue: true });
  const fullH = hres.result.result.value;
  const shots = [];
  const step = height - 80;
  let y = 0, i = 1;
  while (y < fullH && i <= 12) {
    await send(ws, "Runtime.evaluate", { expression: `window.scrollTo(0, ${y});` });
    await sleep(350);
    // force reveal again
    await send(ws, "Runtime.evaluate", { expression: `document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('visible');el.style.opacity='1';el.style.transform='none'});` });
    await sleep(150);
    const shot = await send(ws, "Page.captureScreenshot", { format: "png" });
    const file = path.join(outDir, `v-${String(i).padStart(2,"0")}.png`);
    fs.writeFileSync(file, Buffer.from(shot.result.data, "base64"));
    shots.push({ file, y });
    y += step; i++;
  }
  // also capture modal if article list present
  await send(ws, "Runtime.evaluate", { expression: `window.scrollTo(0,0);` });
  console.log(JSON.stringify({ fullH, shots }, null, 2));
  ws.close(); edge.kill();
  process.exit(0);
})().catch(e => { console.error(e); try{edge.kill()}catch{}; process.exit(1); });
