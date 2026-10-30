'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const captura=require('./fixtures/capturar-fase.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype;}
for(const cantidad of [2,3,4])test(`Tabú: equipos, propuestas y resultado con ${cantidad} mandos`,{timeout:100000},async()=>{
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});const port=await new Promise((r,j)=>{server.once('message',r);server.once('error',j)});let b;const errors=[];
 try{
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const host=await b.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errors.push(e.message));await host.addInitScript(()=>localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()})));await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);await host.locator('#v21-boot').waitFor({state:'hidden'});await host.locator('#v40-welcome [data-v40="servidor"]').click();await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
  for(const [i,n] of ['Ana','Luis','María','José'].slice(0,cantidad).entries()){
   const c=await b.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(n+': '+e.message));await p.goto(`http://127.0.0.${i+2}:8000/?mando&sala=${code}`);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p)
  }
  await host.waitForFunction(n=>V14.__v55.jugadores().length===n,cantidad,{timeout:10000});const roster=await host.evaluate(()=>V14.__v55.jugadores().map(p=>p.nombre));assert.deepEqual(roster,['Ana','Luis','María','José'].slice(0,cantidad));
  const panel=host.locator('#v29-body');if(await panel.isVisible())await panel.locator('..').locator('..').locator('[data-close]').first().click();await host.locator('#v40-sala-jugar').click();
  await host.evaluate(()=>V14.settings.onboarded.tabu=true);await host.locator('#hub-view button.hub-card[data-game="tabu"]').click();
  for(const [i,p] of players.entries())await p.locator('#v33-form [data-act="unir"][data-k="'+(i%2)+'"]').click({timeout:10000});
  for(const p of players)if(!await p.locator('#v33-form [data-act="listo"]').evaluate(e=>e.classList.contains('ok')))await p.locator('#v33-form [data-act="listo"]').click();
  await host.waitForFunction(()=>V14.__v33api.validar().ok,null,{timeout:10000});await host.waitForTimeout(1200);if(await host.locator('#v26-tour .v26-skip').isVisible())await host.locator('#v26-tour .v26-skip').click();await host.locator('#v33-form [data-act="empezar"]').click();
  await host.waitForFunction(()=>V14.gameOf()==='tabu');await host.locator('#tabu-round-time-select').selectOption('30');await host.locator('#btn-tabu-round-start').click();await players[0].locator('#rm-tabu-proposal').waitFor({timeout:10000});
  if(cantidad===3){await captura(host,'tabu-anfitrion-ronda');await captura(players[0],'tabu-mando-propuesta');}
  const carta=await host.evaluate(()=>V14.__v65.estado());assert.equal(carta.fase,'visible');
  for(const p of players){const screen=await p.evaluate(()=>V14.net._debugRemote().lastSync.screen);assert.notEqual(screen.title,carta.palabra);assert.ok(screen.word==null);assert.ok(screen.secretWord==null);assert.ok(!JSON.stringify(screen).includes(carta.palabra));}
  await players[0].locator('#rm-tabu-proposal').fill('propuesta de Ana');await host.evaluate(()=>{V14.net.lastFp='';V14.net.broadcast()});await players[0].waitForTimeout(450);assert.equal(await players[0].locator('#rm-tabu-proposal').inputValue(),'propuesta de Ana','una sincronización no debe borrar lo escrito');await players[0].locator('#rm-tabu-send').click();await host.waitForFunction(()=>V14.__v65.estado().intentos===1);
  for(const p of players.slice(1))assert.ok(!JSON.stringify(await p.evaluate(()=>V14.net._debugRemote().lastSync.screen)).includes('propuesta de Ana'));
  await players[0].evaluate(c=>V14.net._debugRemote().conn.send({t:'tabuguess',v:'duplicada',round:c.ronda,card:c.carta}),carta);await host.waitForTimeout(300);assert.equal((await host.evaluate(()=>V14.__v65.estado())).intentos,1);
  await host.locator('#t65-propuestas button').first().click();await host.waitForFunction(c=>V14.__v65.estado().carta>c,carta.carta);assert.equal((await host.evaluate(()=>V14.__v65.estado())).aciertos,1);assert.equal(await host.locator('#tabu-live-score').innerText(),'1');
  await players[1].locator('#rm-tabu-proposal').waitFor({timeout:10000});await players[1].locator('#rm-tabu-proposal').fill('propuesta pendiente');await players[1].locator('#rm-tabu-send').click();await host.waitForFunction(()=>V14.__v65.estado().intentos===1);
  await host.locator('#btn-tabu-stop').click();await host.waitForFunction(()=>V14.__v65.estado().fase==='fin');for(const p of players){await p.waitForFunction(()=>V14.net._debugRemote().lastSync?.screen?.title==='Ronda terminada',null,{timeout:10000});assert.equal(await p.locator('#rm-tabu-send').count(),0,'no ofrecer propuestas después del final');}await host.locator('#t65-propuestas button').first().click();assert.equal((await host.evaluate(()=>V14.__v65.estado())).aciertos,2);
  if(cantidad===3){await captura(host,'tabu-anfitrion-resultado');await captura(players[0],'tabu-mando-resultado');}
  assert.match(await host.locator('#tabu-summary-text').innerText(),/Aciertos: 2/,'el resultado incluye propuestas resueltas después de cerrar el tiempo');
  await host.locator('#btn-tabu-round-start').click();await host.waitForFunction(()=>V14.__v65.estado().relojActivo);assert.equal(await host.locator('#tabu-round-summary-box').isVisible(),false);await host.locator('#view-tabu button[onclick="goHub()"]').click();const guard=host.locator('#modal-round-guard');if(await guard.isVisible())await guard.locator('button[onclick="guardExitAndReset()"]').click();await host.waitForFunction(()=>V14.gameOf()==='hub');
  assert.equal((await host.evaluate(()=>V14.__v65.estado())).relojActivo,false,'el reloj debe parar al salir por la interfaz');assert.deepEqual(errors,[]);
 }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
