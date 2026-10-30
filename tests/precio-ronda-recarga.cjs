'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype;}
test('Precio rechaza estimaciones de antes de recargar y acepta la actual',{timeout:90000},async()=>{
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});const port=await new Promise((r,j)=>{server.once('message',r);server.once('error',j)});let b;
 try{
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const host=await b.newPage();await host.goto('http://127.0.0.1:8000/?entrada=off');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);await host.evaluate(()=>{V14.settings.gameMode='servidor';V14.net.host()});await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
  for(const [n,ip] of [['Ana','127.0.0.2'],['Luis','127.0.0.3']]){const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await c.newPage();await p.goto('http://'+ip+':8000/?mando&sala='+code);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p)}
  await host.waitForFunction(()=>V14.__v55.jugadores().length===2,null,{timeout:10000});
  const abrir=async()=>{const panel=host.locator('.modal-backdrop.open').filter({hasText:'Jugar con celulares'});if(await panel.isVisible())await panel.locator('[data-close]').first().click();await host.evaluate(()=>{V14.settings.onboarded.precio=true;V14.openGame('precio')});await host.locator('#precio-stage [data-iniciar-ronda]').click({timeout:10000});await host.locator('#precio-stage [data-start]').click({timeout:10000});await host.waitForFunction(()=>V14.__v36api.mesa().on&&V14.__v36api.mesa().slot>=0,null,{timeout:10000});};
  await abrir();const anterior=await host.evaluate(()=>V14.__v36api.mesa().serial);
  await host.evaluate(()=>V14.saveSessionNow());await host.reload({waitUntil:'domcontentloaded'});await host.evaluate(senalLocal,port);await host.waitForFunction(c=>V14.net.status==='open'&&V14.net.code===c,code,{timeout:20000});
  // Los mandos se reconectan en cualquier orden: cada identidad debe tener
  // su propio asiento y marcador, antes de abrir la ronda de estimaciones.
  await host.waitForFunction(()=>{const js=V14.__v55.jugadores();return js.length===2&&new Set(js.map(j=>j.slot)).size===2&&js.every(j=>V14.G().teams[j.slot]?.name===j.nombre)},null,{timeout:20000});
  const slots=await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(j=>[j.nombre,j.slot])));
  assert.notEqual(slots.Ana,slots.Luis);for(const [i,n] of ['Ana','Luis'].entries())await players[i].waitForFunction(slot=>{const r=V14.net._debugRemote();return r.joined&&r.conn?.open&&r.slot===slot},slots[n],{timeout:15000});
  await abrir();const mesaAntes=await host.evaluate(()=>{const m=V14.__v36api.mesa();return {slot:m.slot,serial:m.serial}});assert.notEqual(mesaAntes.serial,anterior);
  const actorIndex=await Promise.all(players.map(p=>p.evaluate(()=>V14.net._debugRemote().slot))).then(ss=>ss.indexOf(mesaAntes.slot));assert.ok(actorIndex>=0);const actor=players[actorIndex],otro=players[1-actorIndex];
  await actor.waitForFunction(serial=>{const t=V14.__v36api.estado();return t.on&&t.mio&&t.serial===serial},mesaAntes.serial,{timeout:10000});
  await otro.waitForFunction(serial=>{const t=V14.__v36api.estado();return t.on&&!t.mio&&t.serial===serial},mesaAntes.serial,{timeout:10000});
  await actor.evaluate(r=>V14.net._debugRemote().conn.send({t:'v36est',val:'123',serial:r}),anterior);await host.waitForTimeout(700);assert.equal((await host.evaluate(()=>V14.__v36api.mesa())).slot,mesaAntes.slot,'no debe avanzar con estimaciones anteriores');
  for(const k of '45')await actor.locator('#v36-capa [data-k="'+k+'"]').click();await actor.locator('#v36-capa #v36-enviar').click();
  await host.waitForFunction(slot=>{let m=V14.__v36api.mesa();return m.on&&m.slot!==slot},mesaAntes.slot,{timeout:10000});const siguiente=await host.evaluate(()=>V14.__v36api.mesa().serial);
  await otro.waitForFunction(serial=>{const t=V14.__v36api.estado();return t.on&&t.mio&&t.serial===serial},siguiente,{timeout:10000});
  for(const k of '55')await otro.locator('#v36-capa [data-k="'+k+'"]').click();await otro.locator('#v36-capa #v36-enviar').click();await host.waitForFunction(()=>V14.precioState.estimates.length===2,null,{timeout:10000});assert.deepEqual((await host.evaluate(()=>V14.precioState.estimates)).map(x=>x.value),['45','55']);

 }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
