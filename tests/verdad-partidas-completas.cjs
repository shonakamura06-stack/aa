'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const captura=require('./fixtures/capturar-fase.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype;}
for(const cantidad of [2,3,4])test(`Verdad o Reto: verdad, reto y turnos con ${cantidad} mandos`,{timeout:100000},async()=>{
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});const port=await new Promise((r,j)=>{server.once('message',r);server.once('error',j)});let b;const errors=[];
 try{
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const host=await b.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errors.push(e.message));await host.addInitScript(()=>localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()})));await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);await host.locator('#v21-boot').waitFor({state:'hidden'});await host.locator('#v40-welcome [data-v40="servidor"]').click();await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
  for(const [i,n] of ['Ana','Luis','María','José'].slice(0,cantidad).entries()){
   const c=await b.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(n+': '+e.message));await p.goto(`http://127.0.0.${i+2}:8000/?mando&sala=${code}`);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p)
  }
  await host.waitForFunction(n=>V14.__v55.jugadores().length===n,cantidad,{timeout:10000});const roster=await host.evaluate(()=>V14.__v55.jugadores().map(p=>p.nombre));assert.deepEqual(roster,['Ana','Luis','María','José'].slice(0,cantidad));
  const panel=host.locator('#v29-body');if(await panel.isVisible())await panel.locator('..').locator('..').locator('[data-close]').first().click();await host.locator('#v40-sala-jugar').click();
  await host.evaluate(()=>V14.settings.onboarded.verdad=true);await host.locator('#hub-view button.hub-card[data-game="verdad"]').click();
  await players[0].locator('#rm-actions [data-act="VERDAD"]').waitFor({timeout:10000});
  await players[1].evaluate(()=>V14.net._debugRemote().conn.send({t:'action',id:'VERDAD'}));await host.waitForTimeout(300);assert.equal((await host.evaluate(()=>V14.vdNow())).phase,'idle');
  await players[0].locator('#rm-actions [data-act="VERDAD"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='ask',null,{timeout:10000});
  const old=await host.evaluate(()=>V14.vdNow().round);await players[0].locator('#rm-actions [data-act="culpable"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='context',null,{timeout:10000});
  await host.locator('#vd-stage .vd-mini[data-vd="VERDAD"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='ask',null,{timeout:10000});assert.notEqual((await host.evaluate(()=>V14.vdNow().round)),old);
  await players[0].evaluate(round=>V14.net._debugRemote().conn.send({t:'action',id:'culpable',round}),old);await host.waitForTimeout(500);
  assert.equal((await host.evaluate(()=>V14.vdNow())).phase,'ask','una respuesta de una consigna anterior no debe avanzar la nueva');
  await players[0].locator('#rm-actions [data-act="culpable"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='context',null,{timeout:10000});
  if(cantidad===3){await captura(host,'verdad-anfitrion-contexto');await captura(players[0],'verdad-mando-contexto');}
  const scores=await host.evaluate(()=>V14.G().teams.map(t=>t.score));await players[0].locator('#rm-actions [data-act="endcontext"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='settled',null,{timeout:10000});
  assert.equal((await host.evaluate(()=>V14.G().teams[0].score)),scores[0]+3);await host.waitForFunction(()=>V14.vdNow().phase==='idle'&&V14.vdNow().slot===1,null,{timeout:12000});
  await players[1].locator('#rm-actions [data-act="RETO"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='reto',null,{timeout:10000});await players[1].locator('#rm-actions [data-act="aceptar"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='retoGo',null,{timeout:10000});
  if(cantidad===3){await captura(host,'reto-anfitrion-veredicto');await captura(players[1],'reto-mando-accion');}
  await host.locator('#vd-stage [data-vd-act="retoOk"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='settled',null,{timeout:10000});assert.equal((await host.evaluate(()=>V14.G().teams[1].score)),scores[1]+3);
  const siguiente=2%cantidad;await host.waitForFunction(i=>V14.vdNow().phase==='idle'&&V14.vdNow().slot===i,siguiente,{timeout:12000});await players[siguiente].locator('#rm-actions [data-act="VERDAD"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='ask');
  if(cantidad===3){await captura(host,'verdad-anfitrion-pregunta');await captura(players[siguiente],'verdad-mando-pregunta');}
  const antesNo=await host.evaluate(i=>V14.G().teams[i].score,siguiente);await players[siguiente].locator('#rm-actions [data-act="nolo"]').click();await host.waitForFunction(()=>V14.vdNow().phase==='settled');
  assert.equal(await host.evaluate(i=>V14.G().teams[i].score,siguiente),antesNo,'No lo hice no suma puntos');assert.equal((await host.evaluate(()=>V14.vdNow())).pts,0,'el resultado mostrado debe coincidir con los puntos aplicados');assert.deepEqual(errors,[]);
 }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
