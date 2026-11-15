const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const edgePath = process.env.EDGE_PATH;
const url = process.env.PAGE_URL;
const outDir = process.env.OUT_DIR;
const port = 9911;
const profile = path.join(outDir, "edge-profile-final-" + port);
fs.mkdirSync(profile, { recursive: true });
const edge = spawn(edgePath, ["--headless=new","--disable-gpu",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,"--window-size=1440,900","--hide-scrollbars",url], {stdio:["ignore","pipe","pipe"]});
function getJSON(p){return new Promise((resolve,reject)=>{const req=http.get({host:"127.0.0.1",port,path:p},res=>{let b="";res.on("data",c=>b+=c);res.on("end",()=>{try{resolve(JSON.parse(b))}catch(e){reject(e)}})});req.on("error",reject)})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function send(ws,method,params={}){return new Promise((resolve,reject)=>{const id=Math.floor(Math.random()*1e9);const handler=(raw)=>{let msg;try{msg=JSON.parse(raw)}catch{return}if(msg.id===id){ws.off("message",handler);resolve(msg)}};ws.on("message",handler);ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{ws.off("message",handler);reject(new Error("timeout"))},15000)})}
(async()=>{
  let targets=null; for(let i=0;i<40;i++){try{targets=await getJSON("/json/list");if(targets&&targets.length)break}catch{} await sleep(250)}
  const page=targets.find(t=>t.type==="page");
  const WebSocket=require("ws");
  const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});
  await new Promise((res,rej)=>{ws.on("open",res);ws.on("error",rej)});
  await send(ws,"Page.enable"); await send(ws,"Runtime.enable");
  await send(ws,"Runtime.evaluate",{expression:`
    document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('visible');el.style.opacity='1';el.style.transform='none'});
    document.querySelectorAll('.visual-bar').forEach((el,i)=>{el.style.animation='none';el.style.opacity='1';el.style.transform='none';});
    window.scrollTo(0,0);
  `});
  await sleep(400);
  const shot=await send(ws,"Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(outDir,"final-hero.png"), Buffer.from(shot.result.data,"base64"));
  // scroll to focus
  await send(ws,"Runtime.evaluate",{expression:`document.getElementById('focus').scrollIntoView(); document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('visible');el.style.opacity='1';el.style.transform='none'});`});
  await sleep(300);
  const shot2=await send(ws,"Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(outDir,"final-focus.png"), Buffer.from(shot2.result.data,"base64"));
  // project
  await send(ws,"Runtime.evaluate",{expression:`document.getElementById('project').scrollIntoView(); document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('visible');el.style.opacity='1';el.style.transform='none'});`});
  await sleep(300);
  const shot3=await send(ws,"Page.captureScreenshot",{format:"png"});
  fs.writeFileSync(path.join(outDir,"final-project.png"), Buffer.from(shot3.result.data,"base64"));
  console.log("ok");
  ws.close(); edge.kill(); process.exit(0);
})().catch(e=>{console.error(e);try{edge.kill()}catch{};process.exit(1)});
