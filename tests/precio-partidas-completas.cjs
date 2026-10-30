'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype;}
for(const cantidad of [2,3,4])test(`Precio: sala real, estimaciones y resultado con ${cantidad} mandos`,{timeout:100000},async()=>{
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});const port=await new Promise((r,j)=>{server.once('message',r);server.once('error',j)});let b;const errors=[];
 try{
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
  const host=await b.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errors.push(e.message));await host.addInitScript(()=>localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()})));await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);await host.locator('#v21-boot').waitFor({state:'hidden'});await host.locator('#v40-welcome [data-v40="servidor"]').click();await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
  for(const [i,n] of ['Ana','Luis','María','José'].slice(0,cantidad).entries()){
   const c=await b.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(n+': '+e.message));await p.goto(`http://127.0.0.${i+2}:8000/?mando&sala=${code}`);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p)
  }
  await host.waitForFunction(n=>V14.__v55.jugadores().length===n,cantidad,{timeout:10000});const roster=await host.evaluate(()=>V14.__v55.jugadores().map(p=>p.nombre));assert.deepEqual(roster,['Ana','Luis','María','José'].slice(0,cantidad));
  const panel=host.locator('#v29-body');if(await panel.isVisible())await panel.locator('..').locator('..').locator('[data-close]').first().click();await host.locator('#v40-sala-jugar').click();
  await host.evaluate(()=>{V14.settings.onboarded.precio=true;V14.settings.autoPoints=true});await host.locator('#hub-view button.hub-card[data-game="precio"]').click({timeout:10000});await host.locator('#precio-stage [data-iniciar-ronda]').click({timeout:10000});const score=await host.evaluate(()=>V14.G().teams.map(x=>x.score));const real=await host.evaluate(()=>V14.precioDecimal.normalizar(V14.precioState.item.a));assert.ok(real!==null);await host.locator('#precio-stage [data-start]').click();
  for(const [i,p] of players.entries()){
   await p.locator('#v36-capa #v36-enviar').waitFor({timeout:10000});const mesa=await host.evaluate(()=>V14.__v36api.mesa());assert.equal(mesa.slot,i);const intruso=players[(i+1)%cantidad];await intruso.evaluate(serial=>V14.net._debugRemote().conn.send({t:'v36est',serial,val:'987'}),mesa.serial);await host.waitForTimeout(150);assert.equal((await host.evaluate(()=>V14.__v36api.mesa())).slot,i);assert.equal(await host.evaluate(()=>V14.precioState.estimates.length),0,'no se revelan estimaciones anticipadamente');
   const val=i===0?real:(real==='0'?'1':'0');for(const k of val)await p.locator('#v36-capa [data-k="'+k+'"]').click();await p.locator('#v36-capa #v36-enviar').click();
  }
  await host.waitForFunction(()=>V14.precioState.phase==='revealed',null,{timeout:10000});const estimates=await host.evaluate(()=>V14.precioState.estimates);assert.equal(estimates.length,cantidad);assert.equal(estimates[0].value,real);assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(x=>x.score)),score.map((x,i)=>x+(i===0?5:0)));for(const p of players)await p.locator('#rm-actions .v75-escala').waitFor({timeout:10000});assert.deepEqual(errors,[]);

 }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
