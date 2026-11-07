'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype;}
for(const cantidad of [2,3,4])test(`Yo Nunca Nunca: acusación completa con ${cantidad} mandos`,{timeout:100000},async()=>{
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});const port=await new Promise((r,j)=>{server.once('message',r);server.once('error',j)});let b;const errors=[];
 try{
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const host=await b.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errors.push(e.message));await host.addInitScript(()=>localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()})));await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);await host.locator('#v21-boot').waitFor({state:'hidden'});await host.locator('#v40-welcome [data-v40="servidor"]').click();await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
  for(const [i,n] of ['Ana','Luis','María','José'].slice(0,cantidad).entries()){
   const c=await b.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(n+': '+e.message));await p.goto(`http://127.0.0.${i+2}:8000/?mando&sala=${code}`);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p)
  }
  await host.waitForFunction(n=>V14.__v55.jugadores().length===n,cantidad,{timeout:10000});const roster=await host.evaluate(()=>V14.__v55.jugadores().map(p=>p.nombre));assert.deepEqual(roster,['Ana','Luis','María','José'].slice(0,cantidad));
  const panel=host.locator('#v29-body');if(await panel.isVisible())await panel.locator('..').locator('..').locator('[data-close]').first().click();await host.locator('#v40-sala-jugar').click();
  await host.evaluate(()=>V14.settings.onboarded.yonunca=true);await host.locator('#hub-view button.hub-card[data-game="yonunca"]').click({timeout:10000});await host.locator('#yonunca-stage [data-iniciar-ronda]').click({timeout:10000});const score=await host.evaluate(()=>V14.G().teams.map(x=>x.score));
  await players[0].locator('#rm-actions [data-act^="yn:abrir:"]').click({timeout:10000});await host.waitForFunction(()=>V14.__v62.estado().fase==='votando',null,{timeout:10000});const ronda=await host.evaluate(()=>V14.__v62.estado().ronda);
  for(const [i,p] of players.entries()){
   await p.locator('#rm-actions [data-act^="yn:panel:"][data-act$=":0"]').click({timeout:10000});await host.waitForFunction(n=>Object.keys(V14.__v62.estado().votos).length===n,i+1,{timeout:10000});const votos=await host.evaluate(()=>V14.__v62.estado().votos);await p.evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'yn:panel:'+r+':1'}),ronda);await host.waitForTimeout(150);assert.deepEqual((await host.evaluate(()=>V14.__v62.estado())).votos,votos);
  }
  await host.waitForFunction(()=>V14.__v62.estado().fase==='acusado',null,{timeout:10000});await players[1].evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'yn:nego:'+r}),ronda);await host.waitForTimeout(150);assert.equal((await host.evaluate(()=>V14.__v62.estado())).fase,'acusado');await players[0].locator('#rm-actions [data-act^="yn:nego:"]').click();await host.waitForFunction(()=>V14.__v62.estado().fase==='resultado',null,{timeout:10000});assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(x=>x.score)),score.map((x,i)=>x-(i===0?cantidad*.5:0)));const fin=await host.evaluate(()=>V14.__v62.estado());await players[0].evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'yn:nego:'+r}),ronda);await host.waitForTimeout(150);assert.deepEqual(await host.evaluate(()=>V14.__v62.estado()),fin);assert.deepEqual(errors,[]);

 }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
