'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype;}
for(const cantidad of [2,3,4])test(`Trivia: partida de diez preguntas con ${cantidad} mandos`,{timeout:150000},async()=>{
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});const port=await new Promise((r,j)=>{server.once('message',r);server.once('error',j)});let b;const errors=[];
 try{
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
  const host=await b.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errors.push(e.message));await host.addInitScript(()=>localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()})));await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);await host.locator('#v21-boot').waitFor({state:'hidden'});await host.locator('#v40-welcome [data-v40="servidor"]').click();await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
  for(const [i,n] of ['Ana','Luis','María','José'].slice(0,cantidad).entries()){
   const c=await b.newContext({viewport:{width:360,height:800},isMobile:true,hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(n+': '+e.message));await p.goto(`http://127.0.0.${i+2}:8000/?mando&sala=${code}`);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p)
  }
  await host.waitForFunction(n=>V14.__v55.jugadores().length===n,cantidad,{timeout:10000});const roster=await host.evaluate(()=>V14.__v55.jugadores().map(p=>p.nombre));assert.deepEqual(roster,['Ana','Luis','María','José'].slice(0,cantidad));
  const panel=host.locator('#v29-body');if(await panel.isVisible())await panel.locator('..').locator('..').locator('[data-close]').first().click();await host.locator('#v40-sala-jugar').click();
  await host.evaluate(()=>{V14.settings.onboarded.trivia=true;V14.settings.triviaSeconds=120});await host.locator('#hub-view button.hub-card[data-game="trivia"]').click({timeout:10000});await host.locator('#trivia-stage [data-iniciar-ronda]').click({timeout:10000});const inicial=await host.evaluate(()=>V14.G().teams.map(x=>x.score)),ganadas=Array(cantidad).fill(0);
  for(let i=0;i<10;i++){
   await host.waitForFunction(q=>V14.triviaNow().open&&V14.triviaNow().qi===q,i,{timeout:12000});const q=await host.evaluate(()=>{const t=V14.triviaNow();return {round:t.round,correcta:V14.DB.trivia.find(x=>x.q===t.q).a}});const slot=i%cantidad;await players[slot].locator(`#rm-actions [data-triv="${q.correcta}"]`).click({timeout:10000});await host.waitForFunction(()=>V14.triviaNow().winner!==null,null,{timeout:10000});assert.equal((await host.evaluate(()=>V14.triviaNow())).winner,slot);ganadas[slot]++;await players[slot].evaluate(x=>V14.net._debugRemote().conn.send({t:'triv',k:x.correcta,round:x.round}),q);await host.waitForTimeout(150);assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(x=>x.score)),inicial.map((x,j)=>x+ganadas[j]));
  }
  await host.getByText('Fin de la trivia',{exact:true}).waitFor({timeout:12000});assert.deepEqual(errors,[]);

 }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
