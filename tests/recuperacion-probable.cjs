// Reinicio del anfitrión con PeerServer local: los navegadores son emulados.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
function senalLocal(port){
  const Original=window.Peer;
  window.Peer=function(id,opts){let o;if(typeof id==='string')o=opts||{};else{o=id||{};id=undefined}o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});return id?new Original(id,o):new Original(o)};
  window.Peer.prototype=Original.prototype;
}
test('Más probable recupera votos y resultado después de dos recargas del anfitrión', {timeout:90000}, async()=>{
  const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});
  const port=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('Señalización terminó: '+c)))});
  let browser;const errores=[];
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
    const host=await browser.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errores.push('PC: '+e.message));
    await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);
    await host.evaluate(()=>{V14.settings.gameMode='servidor';V14.net.host()});
    await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code);
    async function conectar(nombre,hostname,codigo=code){
      const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>errores.push(nombre+': '+e.message));
      await p.goto('http://'+hostname+':8000/?mando&sala='+codigo);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);
      await p.locator('#rm-name').fill(nombre);await p.locator('#rm-enter').click();
      await host.waitForFunction(n=>Array.from(V14.net.conns.values()).some(r=>r.name===n&&r.online&&r.conn?.open),nombre,{timeout:15000});
      await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});
      if(!await p.evaluate(()=>V14.net._debugRemote().joined))await p.locator('#rm-ready').click();
      await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});return p;
    }
    const ana=await conectar('Ana','127.0.0.1'),luis=await conectar('Luis','localhost');
    await host.waitForTimeout(1000);
    if(await host.locator('#v40-skip').isVisible())await host.locator('#v40-skip').click();
    const panel=host.locator('.modal-backdrop.open').filter({hasText:'Jugar con celulares'});
    if(await panel.isVisible())await panel.locator('[data-close]').first().click();
    await host.evaluate(()=>{for(const p of V14.__v55.jugadores()) V14.G().teams[p.slot].score=p.nombre==='Ana'?3:7; V14.__v55.reconciliar(true); V14.openGame('probable')});
    if(await host.locator('#v40-skip').isVisible())await host.locator('#v40-skip').click();
    if(await host.locator('#v26-tour .v26-skip').isVisible())await host.locator('#v26-tour .v26-skip').click();
    await host.locator('#probable-stage button').click({timeout:5000});
    await ana.locator('#rm-actions [data-act^="pr:v:"]').first().waitFor({state:'visible',timeout:10000});
    await ana.locator('#rm-actions [data-act^="pr:v:"]').first().click();
    await host.waitForFunction(()=>Object.keys(V14.__v63.estado().votos).length===1,null,{timeout:10000});
    const inicial=await host.evaluate(()=>V14.__v63.estado());
    await host.evaluate(()=>V14.saveSessionNow());
    const saved=await host.evaluate(()=>V14.store.get('session').v63recuperacion);
    assert.equal(saved.participantes.length,2);
    for(let i=0;i<2;i++){
      await host.reload({waitUntil:'domcontentloaded'});await host.evaluate(senalLocal,port);
      await host.waitForFunction(c=>V14.net.status==='open'&&V14.net.code===c,code,{timeout:20000});
      assert.equal(await host.evaluate(()=>V14.gameOf()),'probable');
      assert.deepEqual(await host.evaluate(()=>V14.__v63.estado()),inicial);
      await host.waitForFunction(()=>V14.__v55.jugadores().length===2,null,{timeout:20000});
      await ana.waitForFunction(()=>V14.net._debugRemote().joined && V14.net._debugRemote().conn?.open,null,{timeout:10000});
      await ana.evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'pr:v:'+r+':1'}),inicial.ronda);
      await host.waitForTimeout(300);
      assert.deepEqual((await host.evaluate(()=>V14.__v63.estado())).votos,inicial.votos,'no se cambia el voto anterior');
      assert.deepEqual(await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score]))),{Ana:3,Luis:7});
    }
    await luis.locator('#rm-actions [data-act^="pr:v:"]').first().waitFor({state:'visible',timeout:10000});
    await luis.locator('#rm-actions [data-act^="pr:v:"]').first().click();
    await host.waitForFunction(()=>Object.keys(V14.__v63.estado().votos).length===2,null,{timeout:10000});
    if(await panel.isVisible())await panel.locator('[data-close]').first().click({timeout:5000});
    await host.locator('#probable-stage [data-cerrar]').click();
    const resultado=await host.evaluate(()=>V14.__v63.estado());
    assert.equal(resultado.fase,'resultado');
    await host.reload({waitUntil:'domcontentloaded'});await host.evaluate(senalLocal,port);
    await host.waitForFunction(c=>V14.net.status==='open'&&V14.net.code===c,code,{timeout:20000});
    assert.deepEqual(await host.evaluate(()=>V14.__v63.estado()),resultado,'también se recupera el resultado');
    await host.waitForFunction(()=>V14.__v55.jugadores().length===2,null,{timeout:20000});
    assert.deepEqual(await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score]))),{Ana:3,Luis:7});
    // El guardado dañado no puede restaurar un voto de un asiento ajeno.
    await host.evaluate(()=>{V14.saveSessionNow(); const p=V14.store.get('session'); p.v63recuperacion.estado.votos={'999':1}; V14.store.set('session',p); V14.saveSessionNow=()=>{};});
    await host.reload({waitUntil:'domcontentloaded'});await host.evaluate(senalLocal,port);
    await host.waitForFunction(c=>V14.net.status==='open'&&V14.net.code===c,code,{timeout:20000});
    assert.equal(await host.evaluate(()=>V14.gameOf()),'hub','un guardado inválido cancela la ronda');
    await host.waitForFunction(()=>V14.__v55.jugadores().length===2,null,{timeout:20000});
    assert.deepEqual(await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score]))),{Ana:3,Luis:7});
    if(await panel.isVisible())await panel.locator('[data-close]').first().click({timeout:5000});
    await host.evaluate(()=>V14.openGame('probable'));
    await host.locator('#probable-stage [data-iniciar-ronda]').click({timeout:5000});
    const nueva=await host.evaluate(()=>V14.__v63.estado().ronda);
    assert.notEqual(nueva,resultado.ronda);
    await ana.waitForFunction(()=>V14.net._debugRemote().joined && V14.net._debugRemote().conn?.open,null,{timeout:10000});
    await ana.evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'pr:v:'+r+':1'}),resultado.ronda);
    await host.waitForTimeout(400);
    assert.deepEqual((await host.evaluate(()=>V14.__v63.estado())).votos,{},'voto atrasado de ronda cancelada rechazado');
    assert.deepEqual(errores,[]);
  } finally {if(browser)await browser.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')});}
});
