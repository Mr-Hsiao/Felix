const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const edgePath = process.env.EDGE_PATH;
const url = process.env.PAGE_URL;
const outDir = process.env.OUT_DIR;
const width = parseInt(process.env.VW || "390", 10);
const height = parseInt(process.env.VH || "844", 10);
const port = 9500 + Math.floor(Math.random()*200);
const profile = path.join(outDir, "edge-profile-m-" + port);
fs.mkdirSync(profile, { recursive: true });
const edge = spawn(edgePath, [
  "--headless=new","--disable-gpu",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`,
  "--hide-scrollbars", url
], { stdio: ["ignore","pipe","pipe"] });
function getJSON(p){return new Promise((resolve,reject)=>{const req=http.get({host:"127.0.0.1",port,path:p},res=>{let b="";res.on("data",c=>b+=c);res.on("end",()=>{try{resolve(JSON.parse(b))}catch(e){reject(e)}})});req.on("error",reject)})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function send(ws,method,params={}){return new Promise((resolve,reject)=>{const id=Math.floor(Math.random()*1e9);const handler=(raw)=>{let msg;try{msg=JSON.parse(raw)}catch{return}if(msg.id===id){ws.off("message",handler);resolve(msg)}};ws.on("message",handler);ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{ws.off("message",handler);reject(new Error("timeout "+method))},15000)})}
(async()=>{
  let targets=null;
  for(let i=0;i<40;i++){try{targets=await getJSON("/json/list");if(targets&&targets.length)break}catch{} await sleep(250)}
  const page=targets.find(t=>t.type==="page");
  const WebSocket=require("ws");
  const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});
  await new Promise((res,rej)=>{ws.on("open",res);ws.on("error",rej)});
  await send(ws,"Page.enable"); await send(ws,"Runtime.enable"); await send(ws,"Emulation.setDeviceMetricsOverride",{width,height,deviceScaleFactor:2,mobile:true});
  // measure overflow
  const overflow=await send(ws,"Runtime.evaluate",{expression:`(()=>{
    const de=document.documentElement;
    const body=document.body;
    const offenders=[];
    document.querySelectorAll('*').forEach(el=>{
      const r=el.getBoundingClientRect();
      if(r.width>window.innerWidth+1 || r.right>window.innerWidth+1){
        offenders.push({tag:el.tagName,cls:el.className&&String(el.className).slice(0,60),w:Math.round(r.width),right:Math.round(r.right),sw:el.scrollWidth,cw:el.clientWidth});
      }
    });
    return {
      innerWidth:window.innerWidth,
      docSW:de.scrollWidth,
      docCW:de.clientWidth,
      bodySW:body.scrollWidth,
      overflowX:getComputedStyle(de).overflowX,
      offenders:offenders.slice(0,25)
    };
  })()`,returnByValue:true});
  const hres=await send(ws,"Runtime.evaluate",{expression:"document.documentElement.scrollHeight",returnByValue:true});
  const fullH=hres.result.result.value;
  const shots=[]; const step=height-60; let y=0,i=1;
  while(y<fullH && i<=10){
    await send(ws,"Runtime.evaluate",{expression:`document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('visible');el.style.opacity='1';el.style.transform='none'});window.scrollTo(0,${y});`});
    await sleep(300);
    await send(ws,"Runtime.evaluate",{expression:`document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('visible');el.style.opacity='1';el.style.transform='none'});`});
    await sleep(120);
    const shot=await send(ws,"Page.captureScreenshot",{format:"png"});
    const file=path.join(outDir,`m-${String(i).padStart(2,"0")}.png`);
    fs.writeFileSync(file,Buffer.from(shot.result.data,"base64"));
    shots.push({file,y}); y+=step; i++;
  }
  console.log(JSON.stringify({fullH,overflow:overflow.result.result.value,shots},null,2));
  ws.close(); edge.kill(); process.exit(0);
})().catch(e=>{console.error(e);try{edge.kill()}catch{};process.exit(1)});
