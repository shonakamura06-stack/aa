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
test('Recarga del anfitrión recupera sala y marcadores sin continuar una ronda incompleta', {timeout:90000}, async()=>{
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
    await host.evaluate(()=>{for(const p of V14.__v55.jugadores())V14.G().teams[p.slot].score=p.nombre==='Ana'?3:7;V14.__v55.reconciliar(true)});
    await host.evaluate(()=>V14.openGame('dial'));
    for(const p of [ana,luis]) await p.locator('#v33-form [data-act="unir"][data-k="0"]').click({timeout:10000});
    for(const p of [ana,luis]) await p.locator('#v33-form [data-act="listo"]').click({timeout:10000});
    await host.waitForFunction(()=>V14.__v33api.validar().ok,null,{timeout:10000});
    if(await host.locator('#v40-skip').isVisible())await host.locator('#v40-skip').click();
    if(await host.locator('#v26-tour .v26-skip').isVisible())await host.locator('#v26-tour .v26-skip').click();
    await host.locator('#v33-form [data-act="empezar"]').click();
    await ana.locator('#rm-dial-start').waitFor({state:'visible',timeout:10000});await ana.locator('#rm-dial-start').click();
    await host.waitForFunction(()=>V14.__v66.estado().phase==='guide',null,{timeout:10000});
    await host.evaluate(()=>{V14.G().teams[0].score=2;V14.saveSessionNow()});
    await host.reload({waitUntil:'domcontentloaded'});await host.evaluate(senalLocal,port);
    await host.waitForFunction(c=>V14.net.status==='open'&&V14.net.code===c,code,{timeout:20000});
    await host.waitForFunction(()=>{const p=V14.__v55.jugadores();return p.length===2 && new Set(p.map(x=>x.slot)).size===2},null,{timeout:20000});
    assert.equal(await host.evaluate(()=>V14.gameOf()),'hub');
    assert.deepEqual(await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score]))),{Ana:4,Luis:8});
    // Una segunda recarga no debe repartir de nuevo el resultado anterior.
    await host.reload({waitUntil:'domcontentloaded'});await host.evaluate(senalLocal,port);
    await host.waitForFunction(c=>V14.net.status==='open'&&V14.net.code===c,code,{timeout:20000});
    await host.waitForFunction(()=>{const p=V14.__v55.jugadores();return p.length===2 && new Set(p.map(x=>x.slot)).size===2},null,{timeout:20000});
    assert.deepEqual(await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score]))),{Ana:4,Luis:8});
    const pidsAnteriores=await host.evaluate(()=>V14.__v55.jugadores().map(p=>p.pid));
    assert.equal(pidsAnteriores.filter(Boolean).length,2);
    await host.evaluate(()=>V14.net.close());
    await host.waitForFunction(()=>V14.net.status==='idle',null,{timeout:5000});
    assert.equal(await host.evaluate(()=>sessionStorage.getItem('snt-host-recuperar')),null);
    // Una nueva sala en la misma pestaña no debe heredar el directorio de la anterior.
    await host.evaluate(()=>V14.net.host());
    await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});
    await host.waitForTimeout(1000);
    const directorioNuevo=await host.evaluate(()=>Object.keys(V14.__v35.dir()));
    for(const pid of pidsAnteriores) assert.ok(!directorioNuevo.includes(pid),'la nueva sala no debe heredar identidades de la sala cerrada');
    const nuevoCodigo=await host.evaluate(()=>V14.net.code);
    await conectar('Ana','127.0.0.2',nuevoCodigo);
    await host.waitForFunction(()=>V14.__v55.jugadores().length===1,null,{timeout:10000});
    const nuevaIdentidad=await host.evaluate(()=>{const p=V14.__v55.jugadores()[0];return {pid:p.pid,score:V14.G().teams[p.slot].score}});
    assert.ok(!pidsAnteriores.includes(nuevaIdentidad.pid),'el nombre repetido no debe recuperar otra identidad');
    assert.equal(nuevaIdentidad.score,0,'el nombre repetido no debe heredar el marcador ajeno');
    await host.evaluate(()=>V14.net.close());
    await host.waitForFunction(()=>V14.net.status==='idle',null,{timeout:5000});
    await host.reload({waitUntil:'domcontentloaded'});await host.evaluate(senalLocal,port);await host.waitForTimeout(1800);
    assert.notEqual(await host.evaluate(()=>V14.net.status),'open','cerrar expresamente no reabre la sala');
    assert.deepEqual(errores,[]);
  } finally {if(browser)await browser.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')});}
});
