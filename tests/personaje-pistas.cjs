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
test('Personaje entrega pistas acumuladas a dos mandos y limpia la ronda', {timeout:90000}, async()=>{
  const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});
  const port=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject);server.once('exit',c=>reject(Error('Señalización terminó: '+c)))});
  let browser;const errores=[];
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const host=await browser.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errores.push('PC: '+e.message));
    await host.goto('http://127.0.0.1:8000/?entrada=off');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);
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
    await host.evaluate(()=>{V14.DB.personaje=[{who:'SECRETO_A_867',clues:['PISTA_A_UNO','PISTA_A_DOS','PISTA_A_TRES']},{who:'SECRETO_B_867',clues:['PISTA_B_UNO','PISTA_B_DOS','PISTA_B_TRES']}];V14.openGame('personaje')});
    if(await host.locator('#v26-tour .v26-skip').isVisible())await host.locator('#v26-tour .v26-skip').click();
    await host.locator('#personaje-stage [data-iniciar-ronda]').click({timeout:10000});
    const pista=await host.locator('#v70-pistas .v70-pista').first().innerText();
    for (const p of [ana,luis]) await p.waitForFunction(pista=>document.querySelector('#rm-actions')?.innerText.includes(pista.split('\n').pop()),pista,{timeout:5000});
    for (const p of [ana,luis]) assert.doesNotMatch(await p.locator('#rm-actions').innerText(),/SECRETO_[AB]_867/);
    await host.evaluate(()=>V14.__v70.mas());
    const segunda=await host.locator('#v70-pistas .v70-pista').nth(1).innerText();
    for (const p of [ana,luis]) await p.waitForFunction(t=>document.querySelector('#rm-actions')?.innerText.includes(t.split('\n').pop()),segunda,{timeout:5000});
    await host.evaluate(()=>V14.__v70.empezar(true));
    const nueva=await host.locator('#v70-pistas .v70-pista').first().innerText();
    assert.notEqual(nueva,pista);
    for (const p of [ana,luis]) { await p.waitForFunction(t=>document.querySelector('#rm-actions')?.innerText.includes(t.split('\n').pop()),nueva,{timeout:5000}); assert.doesNotMatch(await p.locator('#rm-actions').innerText(),new RegExp(pista.split('\n').pop())); }
    await host.evaluate(()=>{V14.exitGame();V14.openGame('ranking')});
    await host.waitForTimeout(900);
    if(await host.locator('#v26-tour .v26-skip').isVisible())await host.locator('#v26-tour .v26-skip').click();
    await host.locator('#ranking-stage [data-iniciar-ronda]').click({timeout:10000});
    if(await host.locator('#v26-tour .v26-skip').isVisible())await host.locator('#v26-tour .v26-skip').click();
    await ana.locator('#rm-actions [data-act^="ran:pon:"]').first().waitFor({state:'visible',timeout:10000});
    const etiquetas=await ana.locator('#rm-actions [data-act^="ran:pon:"]').allInnerTexts();
    const instruccion=await ana.locator('#rm-title').innerText();
    for(const t of etiquetas) assert.ok(!instruccion.includes(t),'la consigna no enumera las tarjetas');
    for (let i=0;i<etiquetas.length;i++) await ana.locator('#rm-actions [data-act^="ran:pon:"]').first().click({timeout:10000});
    await luis.locator('#rm-actions [data-act^="ran:pon:"]').first().waitFor({state:'visible',timeout:10000});
    for (let i=0;i<etiquetas.length;i++) await luis.locator('#rm-actions [data-act^="ran:pon:"]').last().click({timeout:10000});
    await host.waitForFunction(()=>V14.__v61.estado().fase==='revelar',null,{timeout:10000});
    const resp=await host.evaluate(()=>V14.__v61.estado().respuestas);assert.equal(Object.keys(resp).length,2);
    assert.notDeepEqual(resp[0].orden,resp[1].orden);
    for(const p of [ana,luis]){await p.locator('.rm-ranking-resultado').waitFor({state:'visible',timeout:10000});assert.match(await p.locator('.rm-ranking-resultado').innerText(),/Orden correcto/);assert.match(await p.locator('.rm-ranking-resultado').innerText(),/Tu respuesta/);}
    assert.notEqual(await ana.locator('.rm-ranking-resultado ol').nth(1).innerText(),await luis.locator('.rm-ranking-resultado ol').nth(1).innerText());
    assert.deepEqual(errores,[]);
  } finally {if(browser)await browser.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')});}
});
