const { spawn } = require("child_process");
const http = require("http");
const fs = require("fs");
const path = require("path");
const edgePath = process.env.EDGE_PATH;
const url = process.env.PAGE_URL;
const outDir = process.env.OUT_DIR;
const width = 1440, height = 900;
const port = 9800;
const profile = path.join(outDir, "edge-profile-d-" + port);
fs.mkdirSync(profile, { recursive: true });
const edge = spawn(edgePath, ["--headless=new","--disable-gpu",`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,`--window-size=${width},${height}`,"--hide-scrollbars",url], {stdio:["ignore","pipe","pipe"]});
function getJSON(p){return new Promise((resolve,reject)=>{const req=http.get({host:"127.0.0.1",port,path:p},res=>{let b="";res.on("data",c=>b+=c);res.on("end",()=>{try{resolve(JSON.parse(b))}catch(e){reject(e)}})});req.on("error",reject)})}
function sleep(ms){return new Promise(r=>setTimeout(r,ms))}
function send(ws,method,params={}){return new Promise((resolve,reject)=>{const id=Math.floor(Math.random()*1e9);const handler=(raw)=>{let msg;try{msg=JSON.parse(raw)}catch{return}if(msg.id===id){ws.off("message",handler);resolve(msg)}};ws.on("message",handler);ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{ws.off("message",handler);reject(new Error("timeout "+method))},15000)})}
(async()=>{
  let targets=null; for(let i=0;i<40;i++){try{targets=await getJSON("/json/list");if(targets&&targets.length)break}catch{} await sleep(250)}
  const page=targets.find(t=>t.type==="page");
  const WebSocket=require("ws");
  const ws=new WebSocket(page.webSocketDebuggerUrl,{perMessageDeflate:false});
  await new Promise((res,rej)=>{ws.on("open",res);ws.on("error",rej)});
  await send(ws,"Page.enable"); await send(ws,"Runtime.enable");
  await send(ws,"Runtime.evaluate",{expression:`document.querySelectorAll('.reveal').forEach(el=>{el.classList.add('visible');el.style.opacity='1';el.style.transform='none'});`});
  await sleep(300);
  const metrics=await send(ws,"Runtime.evaluate",{expression:`(()=>{
    function parseColor(s){const m=s.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)(?:,\\s*([\\d.]+))?\\)/); return m?{r:+m[1],g:+m[2],b:+m[3],a:m[4]!==undefined?+m[4]:1}:null}
    function lum(c){function f(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)} return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b)}
    function contrast(a,b){const L1=lum(a),L2=lum(b);const [hi,lo]=L1>L2?[L1,L2]:[L2,L1];return (hi+0.05)/(lo+0.05)}
    const samples=[
      ['.hero-description','color'],
      ['.section-description','color'],
      ['.article-summary','color'],
      ['.focus-description','color'],
      ['.visual-metric-label','color'],
      ['.visual-caption','color'],
      ['.timeline-description','color'],
      ['.footer','color'],
      ['.footer-disclaimer','color'],
      ['.eyebrow','color'],
      ['.hero-title .gray','color'],
      ['.project-description','color'],
      ['.flow-node span','color']
    ];
    const bg=parseColor(getComputedStyle(document.body).backgroundColor)||{r:246,g:239,b:224,a:1};
    const results=samples.map(([sel])=>{
      const el=document.querySelector(sel); if(!el) return {sel,missing:true};
      const cs=getComputedStyle(el);
      const col=parseColor(cs.color);
      const fs=parseFloat(cs.fontSize); const fw=cs.fontWeight;
      const large = fs>=24 || (fs>=18.66 && (+fw>=700));
      const ratio=col?contrast(col,bg):null;
      const need=large?3:4.5;
      return {sel,color:cs.color,fontSize:cs.fontSize,fontWeight:fw,ratio:ratio?+ratio.toFixed(2):null,need,pass:ratio==null?null:ratio>=need};
    });
    // blue remnants
    const blues=[];
    document.querySelectorAll('*').forEach(el=>{
      const cs=getComputedStyle(el);
      const props=['color','backgroundColor','backgroundImage','borderTopColor','borderRightColor'];
      props.forEach(p=>{
        const v=cs[p];
        if(v && /rgba?\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)/.test(v)){
          const m=v.match(/rgba?\\(\\s*(\\d+),\\s*(\\d+),\\s*(\\d+)/);
          const r=+m[1],g=+m[2],b=+m[3];
          if(b>r+40 && b>g+30 && b>120){ blues.push({sel:el.tagName+'.'+String(el.className).slice(0,40),prop:p,val:v}); }
        }
      });
    });
    // title wrap check
    const title=document.querySelector('.hero-title');
    const tr=title?title.getBoundingClientRect():null;
    return {
      docSW:document.documentElement.scrollWidth,
      clientW:document.documentElement.clientWidth,
      results,
      blues:blues.slice(0,20),
      blueCount:blues.length,
      titleRect: tr?{w:tr.width,h:tr.height}:null,
      focusCards: document.querySelectorAll('.focus-card').length,
      articleButtons: document.querySelectorAll('button.article').length
    };
  })()`,returnByValue:true});
  console.log(JSON.stringify(metrics.result.result.value,null,2));
  ws.close(); edge.kill(); process.exit(0);
})().catch(e=>{console.error(e);try{edge.kill()}catch{};process.exit(1)});
