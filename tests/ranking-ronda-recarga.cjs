'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype;}
test('Ranking rechaza pulsaciones de antes de recargar y acepta la actual',{timeout:90000},async()=>{
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});const port=await new Promise((r,j)=>{server.once('message',r);server.once('error',j)});let b;
 try{
  b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  const host=await b.newPage();await host.goto('http://127.0.0.1:8000/?entrada=off');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);await host.evaluate(()=>{V14.settings.gameMode='servidor';V14.net.host()});await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
  for(const [n,ip] of [['Ana','127.0.0.2'],['Luis','127.0.0.3']]){const c=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await c.newPage();await p.goto('http://'+ip+':8000/?mando&sala='+code);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p)}
  await host.waitForFunction(()=>V14.__v55.jugadores().length===2,null,{timeout:10000});
  const abrir=async()=>{const panel=host.locator('.modal-backdrop.open').filter({hasText:'Jugar con celulares'});if(await panel.isVisible())await panel.locator('[data-close]').first().click();await host.evaluate(()=>{V14.settings.onboarded.ranking=true;V14.openGame('ranking')});await host.locator('#ranking-stage [data-iniciar-ronda]').click({timeout:10000});await players[0].locator('#rm-actions [data-act^="ran:pon:"]').first().waitFor({timeout:10000});};
  await abrir();const anterior=await host.evaluate(()=>V14.__v61.estado().ronda);
  await host.evaluate(()=>V14.saveSessionNow());await host.reload({waitUntil:'domcontentloaded'});await host.evaluate(senalLocal,port);await host.waitForFunction(c=>V14.net.status==='open'&&V14.net.code===c,code,{timeout:20000});await host.waitForFunction(()=>V14.__v55.jugadores().length===2,null,{timeout:20000});await players[0].waitForFunction(()=>V14.net._debugRemote().joined&&V14.net._debugRemote().conn?.open,null,{timeout:15000});await abrir();const actual=await host.evaluate(()=>V14.__v61.estado().ronda);const inicial=await players[0].locator('#rm-actions [data-act^="ran:pon:"]').count();
  await players[0].evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'ran:pon:'+r+':0'}),anterior);await host.waitForTimeout(400);assert.equal(await players[0].locator('#rm-actions [data-act^="ran:pon:"]').count(),inicial,'no debe aceptar pulsaciones de antes de recargar');assert.notEqual(actual,anterior);
  await players[0].locator('#rm-actions [data-act^="ran:pon:"]').first().click();await players[0].waitForFunction(n=>document.querySelectorAll('#rm-actions [data-act^="ran:pon:"]').length===n-1,inicial,{timeout:10000});

 }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
