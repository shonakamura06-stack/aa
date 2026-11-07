'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const captura=require('./fixtures/capturar-fase.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype;}
for(const cantidad of [3,4])test(`Impostor: reparto privado y resultado con ${cantidad} mandos`,{timeout:100000},async()=>{
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});const port=await new Promise((r,j)=>{server.once('message',r);server.once('error',j)});let b;const errors=[];
 try{
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const host=await b.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errors.push(e.message));await host.addInitScript(()=>localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()})));await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);await host.locator('#v21-boot').waitFor({state:'hidden'});await host.locator('#v40-welcome [data-v40="servidor"]').click();await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
  for(const [i,n] of ['Ana','Luis','María','José'].slice(0,cantidad).entries()){
   const c=await b.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(n+': '+e.message));await p.goto(`http://127.0.0.${i+2}:8000/?mando&sala=${code}`);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p)
  }
  await host.waitForFunction(n=>V14.__v55.jugadores().length===n,cantidad,{timeout:10000});const roster=await host.evaluate(()=>V14.__v55.jugadores().map(p=>p.nombre));assert.deepEqual(roster,['Ana','Luis','María','José'].slice(0,cantidad));
  const panel=host.locator('#v29-body');if(await panel.isVisible())await panel.locator('..').locator('..').locator('[data-close]').first().click();await host.locator('#v40-sala-jugar').click();
  await host.evaluate(()=>V14.settings.onboarded.impostor=true);await host.locator('#hub-view button.hub-card[data-game="impostor"]').click();
  const nombresMarcador=await host.locator('#view-impostor .team-score-card .team-name').allTextContents();assert.equal(nombresMarcador.length,roster.length);for(const [i,n] of roster.entries())assert.ok(nombresMarcador[i].endsWith(n),'el marcador debe mostrar los participantes reales');
  const selector=host.locator('#impostor-player-count-select');assert.equal(await selector.inputValue(),String(cantidad),'el reparto debe usar los participantes reales');
  await selector.selectOption(String(cantidad===3?4:3));await host.locator('#impostor-setup-box button[onclick="startImpostorGame()"]').click();assert.equal(await host.locator('#impostor-setup-box').isVisible(),true,'no repartir a asientos ficticios');
  await selector.selectOption(String(cantidad));await host.locator('#impostor-setup-box button[onclick="startImpostorGame()"]').click();
  await players[0].locator('[data-roleseen]').waitFor({timeout:10000});
  if(cantidad===3){await captura(host,'impostor-anfitrion-reparto');await captura(players[0],'impostor-mando-rol');}
  const before=await host.locator('#impostor-current-player-tag').innerText();
  const oldToken=await players[0].evaluate(()=>V14.net._debugRemote().role.token);
  assert.ok(oldToken);for(const p of players.slice(1))assert.equal(await p.evaluate(()=>V14.net._debugRemote().role),null,'cada rol se envía únicamente al destinatario');
  // Ni otro participante con el token ni una confirmación antigua pueden saltar al titular.
  await players[1].evaluate(token=>V14.net._debugRemote().conn.send({t:'roleseen',token}),oldToken);
  await players[0].evaluate(()=>V14.net._debugRemote().conn.send({t:'roleseen',token:'obsoleto'}));
  await host.waitForTimeout(700);assert.equal(await host.locator('#impostor-current-player-tag').innerText(),before);
  const anterior=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').id);
  await players[0].evaluate(()=>V14.net._debugRemote().conn.close());
  await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.id!==id&&r.conn?.open),anterior,{timeout:15000});
  await players[0].waitForFunction(t=>V14.net._debugRemote().role?.token===t,oldToken,{timeout:10000});
  const roles=[];
  for(const [i,p] of players.entries()){
   await p.locator('[data-roleseen]').waitFor({timeout:10000});
   const r=await p.evaluate(()=>V14.net._debugRemote().role);roles.push(r.title);
   const btn=p.locator('[data-role]');await btn.dispatchEvent('pointerdown');await host.evaluate(()=>{V14.net.lastFp='';V14.net.broadcast()});await p.waitForTimeout(300);assert.equal(await p.locator('#rm-title').innerText(),r.title,'el rol sigue visible durante la sincronización');await btn.dispatchEvent('pointerup');assert.equal(await p.locator('#rm-title').innerText(),r.title,'el gesto existente conserva el rol hasta el segundo toque');await btn.dispatchEvent('pointerdown');await btn.dispatchEvent('pointerup');assert.notEqual(await p.locator('#rm-title').innerText(),r.title,'el segundo toque oculta el rol');
   await p.locator('[data-roleseen]').click();
   if(i+1<cantidad)await host.waitForFunction(n=>document.querySelector('#impostor-current-player-tag').textContent.includes('JUGADOR '+n),i+2,{timeout:10000});
  }
  assert.equal(roles.filter(x=>/IMPOSTOR/.test(x)).length,1);assert.equal(new Set(roles.filter(x=>/^PALABRA:/.test(x))).size,1);
  await host.locator('#impostor-debate-box').waitFor({state:'visible',timeout:10000});await host.locator('#impostor-debate-box button[onclick="showImpostorVotingPhase()"]').click();await host.locator('#impostor-result-box').waitFor({state:'visible'});
  if(cantidad===3){await captura(host,'impostor-anfitrion-resultado');await captura(players[0],'impostor-mando-resultado');}
  assert.match(await host.locator('#impostor-reveal-text').innerText(),/Impostor/);
  const puntos=await host.evaluate(()=>({scores:V14.G().teams.map(x=>x.score),pts:V14.G().config.impostor.points,selected:getSelectedMinigameTeam()}));
  await host.locator('#impostor-result-box button[onclick="resolveImpostorOutcome(\'caught\')"]').click();
  const after=await host.evaluate(()=>V14.G().teams.map(x=>x.score));assert.equal(after[puntos.selected],puntos.scores[puntos.selected]+puntos.pts);
  await host.locator('#impostor-setup-box button[onclick="startImpostorGame()"]').click();await players[0].locator('[data-roleseen]').waitFor({timeout:10000});
  const current=await players[0].evaluate(()=>V14.net._debugRemote().role.token);assert.notEqual(current,oldToken);
  for(const p of players.slice(1))await p.waitForFunction(()=>V14.net._debugRemote().role===null,null,{timeout:10000});
  await players[0].evaluate(token=>V14.net._debugRemote().conn.send({t:'roleseen',token}),oldToken);await host.waitForTimeout(600);assert.match(await host.locator('#impostor-current-player-tag').innerText(),/JUGADOR 1/);
  assert.deepEqual(errors,[]);
 }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
