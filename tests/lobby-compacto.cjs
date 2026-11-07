'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
const opts={executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']};
for(const [width,height] of [[1366,655],[360,800],[320,700],[320,568],[320,480],[740,360]]){
 test(`Lobby fijo ${width}x${height}: controles, jugadores y esquina de Netlify`,{timeout:55000},async()=>{
  const browser=await chromium.launch(opts), page=await browser.newPage({viewport:{width,height}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
   await page.addInitScript(()=>localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()})));
   await page.goto('http://127.0.0.1:8000/');await page.locator('#v21-boot').waitFor({state:'hidden'});
   await page.locator('#v40-welcome [data-v40="local"]').click();
   for(let i=0;i<12;i++){await page.locator('#v40-local-nombre').fill(i===0?'Nombre muy largo Ana':`Jugador real ${i+1}`);await page.locator('#v40-local-form button').click();}
   await page.waitForFunction(()=>document.querySelectorAll('#v40-sala-previa .v44-slot').length===12);
   await page.evaluate(()=>{let d=document.createElement('div');d.id='netlify-simulado';Object.assign(d.style,{position:'fixed',right:'0',bottom:'0',width:'180px',height:'64px',zIndex:'9999',background:'rgba(0,0,0,.1)'});document.body.appendChild(d)});
   const metrics=await page.evaluate(()=>{let r=document.querySelector('#v40-sala-previa'),list=r.querySelector('.s51-players'),play=r.querySelector('#v40-sala-jugar'),b=play.getBoundingClientRect(),hit=document.elementFromPoint(b.left+b.width/2,b.top+b.height/2),card=list.querySelector('.v44-slot'),cardBox=card.getBoundingClientRect(),controls=[...card.querySelectorAll('button')].map(x=>x.getBoundingClientRect());return {outer:[r.scrollHeight,r.clientHeight,r.scrollWidth,r.clientWidth],list:[list.scrollHeight,list.clientHeight],button:[b.left,b.right,b.top,b.bottom],controlsInside:controls.every(x=>x.left>=cardBox.left&&x.right<=cardBox.right&&x.top>=cardBox.top&&x.bottom<=cardBox.bottom),hit:hit===play||play.contains(hit)}});
   assert.equal(metrics.outer[0],metrics.outer[1],JSON.stringify(metrics));assert.equal(metrics.outer[2],metrics.outer[3],JSON.stringify(metrics));
   assert.ok(metrics.list[1]>=64,JSON.stringify(metrics));assert.ok(metrics.list[0]>metrics.list[1],JSON.stringify(metrics));assert.equal(metrics.hit,true,JSON.stringify(metrics));assert.equal(metrics.controlsInside,true,JSON.stringify(metrics));
   assert.ok(metrics.button[1]<=width-180 || metrics.button[3]<=height-64,JSON.stringify(metrics));
   const panel=page.locator('#v40-sala-previa .s51-players');await panel.evaluate(e=>e.scrollTop=e.scrollHeight);const scroll=await panel.evaluate(e=>e.scrollTop);assert.ok(scroll>0);await page.evaluate(()=>V14.__v44api.pintar());assert.equal(await panel.evaluate(e=>e.scrollTop),scroll,'la lista conserva su posición al actualizarse');
   await panel.locator('.v44-slot').last().scrollIntoViewIfNeeded();const card=panel.locator('.v44-slot').last();await card.locator('[data-ava]').click();assert.equal(await page.locator('#v40-sala-previa .v44-slot').count(),12);
   await page.locator('.s51-admin-menu summary').click();await page.evaluate(()=>V14.__v44api.pintar());assert.equal(await page.locator('.s51-admin-menu').evaluate(e=>e.open),true);assert.equal(await page.locator('#v44-vaciar').count(),1);assert.equal(await page.locator('#v44-equipos').count(),1);
   await page.locator('#v40-local-parejas summary').click();await page.locator('#v40-local-parejas [data-par="0"]').selectOption('1');assert.equal(await page.evaluate(()=>V14.G().teams[0].dialEquipo),1);await page.locator('#v40-local-parejas summary').click();
   assert.equal(await page.locator('#v40-sala-previa').evaluate(e=>e.scrollHeight===e.clientHeight),true);await page.locator('#v40-sala-jugar').click();assert.equal(await page.locator('#v40-sala-previa').count(),0);assert.deepEqual(errors,[]);
  }finally{await browser.close()}
 });
}

test('Lobby de servidor conserva invitación, gestión y botones de participantes',{timeout:60000},async()=>{
 const {fork}=require('node:child_process'),path=require('node:path');
 const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});
 const port=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject)});let browser;
 function local(port){const Orig=window.Peer;window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Orig(id,o):new Orig(o)};window.Peer.prototype=Orig.prototype}
 try{
  browser=await chromium.launch(opts);const host=await browser.newPage({viewport:{width:1366,height:655}}),errors=[];host.on('pageerror',e=>errors.push(e.message));
  await host.addInitScript(()=>{localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()}));Object.defineProperty(navigator,'clipboard',{value:{writeText:text=>{window.__copiado=text;return Promise.resolve()}}})});
  await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(local,port);await host.locator('#v21-boot').waitFor({state:'hidden'});await host.locator('#v40-welcome [data-v40="servidor"]').click();await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code);
  const player=await browser.newPage({viewport:{width:390,height:844}});await player.goto('http://127.0.0.2:8000/?mando&sala='+code);await player.waitForTimeout(700);await player.evaluate(local,port);await player.locator('#rm-name').fill('Sho');await player.locator('#rm-enter').click();await player.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});if(!await player.evaluate(()=>V14.net._debugRemote().joined)){await player.waitForFunction(()=>V14.net._debugRemote().slot!=null);await player.locator('#rm-ready').click()}await host.waitForFunction(()=>V14.__v55.jugadores().length===1,null,{timeout:10000});
  const open=host.locator('#v29-body');if(await open.isVisible())await open.locator('..').locator('..').locator('[data-close]').first().click();
  await host.locator('#v40-sala-previa [data-copy]').click();assert.ok((await host.evaluate(()=>window.__copiado)).includes(code));
  await host.locator('#v40-sala-previa [data-qr]').click();await open.waitFor({state:'visible'});await open.locator('..').locator('..').locator('[data-close]').first().click();
  await host.setViewportSize({width:320,height:700});await host.evaluate(()=>{const badge=document.createElement('div');Object.assign(badge.style,{position:'fixed',right:'0',bottom:'0',width:'180px',height:'64px',zIndex:'9999'});badge.id='netlify-simulado';document.body.appendChild(badge)});
  assert.equal(await host.locator('#v40-sala-previa').evaluate(e=>e.scrollHeight===e.clientHeight),true);await host.locator('#v40-sala-previa [data-copy]').click();await host.locator('#v40-sala-previa [data-qr]').click();await open.waitFor({state:'visible'});await open.locator('..').locator('..').locator('[data-close]').first().click();
  const card=host.locator('#v40-sala-previa .v44-slot');assert.equal(await card.locator('[data-name]').inputValue(),'Sho');assert.equal(await card.locator('[data-del]').getAttribute('aria-label'),'Quitar');assert.equal(await card.locator('[data-ban]').getAttribute('aria-label'),'Banear');
  await host.locator('.s51-admin-menu summary').click();await host.locator('#v44-equipos').click();await host.locator('#modal-equipos').waitFor({state:'visible',timeout:4000});
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(r=>{server.once('exit',r);server.kill('SIGTERM')})}
});
