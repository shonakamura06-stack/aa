'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const captura=require('./fixtures/capturar-fase.cjs');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype;}
for(const cantidad of [2,3,4])test(`El Dial: formación y resultado con ${cantidad} mandos`,{timeout:100000},async()=>{
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});const port=await new Promise((r,j)=>{server.once('message',r);server.once('error',j)});let b;const errors=[];
 try{
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const host=await b.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errors.push(e.message));await host.addInitScript(()=>localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()})));await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);await host.locator('#v21-boot').waitFor({state:'hidden'});await host.locator('#v40-welcome [data-v40="servidor"]').click();await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
  for(const [i,n] of ['Ana','Luis','María','José'].slice(0,cantidad).entries()){
   const c=await b.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(n+': '+e.message));await p.goto(`http://127.0.0.${i+2}:8000/?mando&sala=${code}`);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p)
  }
  await host.waitForFunction(n=>V14.__v55.jugadores().length===n,cantidad,{timeout:10000});const roster=await host.evaluate(()=>V14.__v55.jugadores().map(p=>p.nombre));assert.deepEqual(roster,['Ana','Luis','María','José'].slice(0,cantidad));
  const panel=host.locator('#v29-body');if(await panel.isVisible())await panel.locator('..').locator('..').locator('[data-close]').first().click();await host.locator('#v40-sala-jugar').click();
  await host.evaluate(()=>V14.settings.onboarded.dial=true);await host.locator('#hub-view button.hub-card[data-game="dial"]').click();
  for(const [i,p] of players.entries())await p.locator('#v33-form [data-act="unir"][data-k="'+(cantidad===2?0:i%2)+'"]').click({timeout:10000});
  for(const p of players)if(!await p.locator('#v33-form [data-act="listo"]').evaluate(e=>e.classList.contains('ok')))await p.locator('#v33-form [data-act="listo"]').click();
  if(cantidad===3){const status=await host.evaluate(()=>V14.__v33api.validar());assert.equal(status.ok,false);assert.match(status.msg,/exactamente dos/);return;}
  await host.waitForFunction(()=>V14.__v33api.validar().ok,null,{timeout:10000});await host.waitForTimeout(1200);if(await host.locator('#v26-tour .v26-skip').isVisible())await host.locator('#v26-tour .v26-skip').click();await host.locator('#v33-form [data-act="empezar"]').click();
  await host.waitForFunction(()=>V14.gameOf()==='dial',null,{timeout:10000});await players[0].locator('#rm-dial-start').waitFor({timeout:10000});await players[0].locator('#rm-dial-start').click();await players[0].locator('#rm-dial-reveal').waitFor({timeout:10000});await players[0].locator('#rm-dial-reveal').click();
  if(cantidad===2){await host.waitForFunction(()=>document.querySelector('#v-play-chip')?.textContent.includes('2 jugadores'),null,{timeout:4000});await captura(host,'dial-anfitrion-objetivo');await captura(players[0],'dial-guia-objetivo');}
  const objective=await players[0].evaluate(()=>V14.net._debugRemote().lastSync.screen.secret.target);assert.ok(Number.isFinite(objective));for(const p of players.slice(1)){const sc=await p.evaluate(()=>V14.net._debugRemote().lastSync.screen);assert.ok(!sc.secret||sc.secret.target===undefined);}
  await players[0].locator('#rm-pista-text').fill('Pista de la pareja');await players[0].locator('#rm-pista-send').click();await players[0].locator('#rm-dial-hide').click();await host.waitForFunction(()=>V14.__v66.estado().phase==='guessing');
  const guesser=players[cantidad===2?1:2],needle=guesser.locator('#rm-dialbox .v16-svg');await needle.waitFor({state:'visible',timeout:10000});await needle.tap({position:{x:230,y:65}});await host.waitForFunction(()=>V14.__v66.estado().needleMoved);
  await needle.focus();await needle.press(objective<50?'End':'Home');await host.waitForFunction(v=>state.guessValue===v,objective<50?100:0,{timeout:10000});
  const r=await host.evaluate(()=>V14.__v66.estado().roundId);await players[0].evaluate(round=>V14.net._debugRemote().conn.send({t:'action',id:'dial:reveal',round}),r);await host.waitForTimeout(300);assert.equal((await host.evaluate(()=>V14.__v66.estado())).phase,'guessing');
  const antes=await host.evaluate(()=>V14.G().teams.map(t=>t.score));await guesser.locator('#rm-actions [data-act="dial:reveal"]').click();await host.waitForFunction(()=>V14.__v66.estado().phase==='revealed');
  if(cantidad===2){await captura(host,'dial-anfitrion-resultado');await captura(guesser,'dial-mando-resultado');}
  const result=await host.evaluate(()=>({puntos:state.lastPointsAwarded,objetivo:state.lastTargetAwarded,aguja:state.lastGuessAwarded,scores:V14.G().teams.map(t=>t.score)}));assert.equal(result.objetivo,objective);assert.equal(result.scores[0],antes[0]+result.puntos);assert.equal(result.puntos,0);
  const ruleta=host.locator('#sidebar-action-dock button[onclick="openPenaltyRouletteModal()"]');await ruleta.waitFor({state:'visible'});assert.equal(await ruleta.evaluate(e=>e.scrollWidth<=e.clientWidth),true,'el texto del resultado no debe quedar recortado');
  await guesser.evaluate(round=>V14.net._debugRemote().conn.send({t:'action',id:'dial:reveal',round}),r);await host.waitForTimeout(300);assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),result.scores);
  assert.deepEqual(errors,[]);
 }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
