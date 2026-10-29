// Ensayo de un anfitrión y cuatro mandos Chromium con señalización local.
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
test('El Dial conserva parejas elegidas y distribuye fases por conexión', {timeout:150000}, async()=>{
  const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});
  const port=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject);server.once('exit',code=>reject(Error('Señalización terminó: '+code)))});
  let browser;const errores=[];
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
    const host=await browser.newPage({viewport:{width:1280,height:800}});host.on('pageerror',e=>errores.push('PC: '+e.message));
    await host.goto('http://127.0.0.1:8000/');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);
    await host.evaluate(()=>{V14.settings.gameMode='servidor';V14.net.host()});
    await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code);
    async function conectar(nombre,hostname){
      const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});const p=await ctx.newPage();p.on('pageerror',e=>errores.push(nombre+': '+e.message));
      await p.goto('http://'+hostname+':8000/?mando&sala='+code);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);
      await p.locator('#rm-name').fill(nombre,{timeout:5000});await p.locator('#rm-enter').click({timeout:5000});
      await host.waitForFunction(n=>Array.from(V14.net.conns.values()).some(r=>r.name===n&&r.online&&r.conn?.open),nombre,{timeout:15000});
      await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});
      if(!await p.evaluate(()=>V14.net._debugRemote().joined))await p.locator('#rm-ready').click({timeout:5000});
      await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});return p;
    }
    const ana=await conectar('Ana','127.0.0.1'), luis=await conectar('Luis','localhost'), maria=await conectar('Maria','127.0.0.2'), jose=await conectar('Jose','127.0.0.3');
    await host.waitForTimeout(1200);
    const puntajes=await host.evaluate(()=>{
      const nombres=['Ana','Luis','Maria','Jose'],r={};
      for(const [i,n] of nombres.entries()){const p=V14.__v55.jugadores().find(x=>x.nombre===n);V14.G().teams[p.slot].score=i+1;r[n]=i+1;}return r;
    });
    await host.evaluate(()=>V14.openGame('dial'));
    const prematuro=await host.evaluate(()=>({reparto:V14.__v33api.repartirRapido(),inicio:V14.__v33api.arrancar(),estado:V14.__v33api.estado()}));
    assert.equal(prematuro.reparto,false);assert.equal(prematuro.inicio,false);
    assert.equal(prematuro.estado.pool.length,4);assert.ok(prematuro.estado.equipos.every(e=>e.gente.length===0));
    for(const [p,k] of [[ana,0],[luis,1],[maria,0],[jose,1]]) await p.locator('#v33-form [data-act="unir"][data-k="'+k+'"]').click({timeout:10000});
    for(const p of [ana,luis,maria,jose]) await p.locator('#v33-form [data-act="listo"]').click({timeout:10000});
    await host.waitForFunction(()=>V14.__v33api.validar().ok && document.querySelector('#v33-form [data-act="empezar"]')?.disabled===false,null,{timeout:10000});
    if (await host.locator('#v40-skip').isVisible()) await host.locator('#v40-skip').click({timeout:5000});
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    await host.locator('#v33-form [data-act="empezar"]').click({timeout:10000});
    await host.waitForFunction(()=>V14.gameOf()==='dial',null,{timeout:10000});
    const guardada=await host.evaluate(()=>{V14.saveSessionNow();return V14.store.get('session',null).v33individuales});
    assert.equal(guardada.telefonos.length,4);
    assert.deepEqual(guardada.telefonos.map(p=>guardada.equipos[p.slot].score).sort(),[1,2,3,4]);
    const parejas=await host.evaluate(()=>V14.__v66.parejas().map(p=>[p.a?.nombre,p.b?.nombre]));
    assert.deepEqual(parejas,[['Ana','Maria'],['Luis','Jose']]);
    assert.deepEqual(await host.evaluate(()=>V14.__v55.equipos('dial').map(e=>e.miembros)),parejas,'el registro compartido usa los equipos elegidos');
    await ana.locator('#rm-dial-start').waitFor({state:'visible',timeout:10000});
    await ana.locator('#rm-dial-start').click();
    await ana.locator('#rm-dial-reveal').waitFor({state:'visible',timeout:10000});
    await ana.locator('#rm-dial-reveal').click();
    assert.equal(await ana.locator('#rm-dial-target').isVisible(),true);
    // Reconexión durante la pista privada: conserva la ronda y el rol, sin exponerla a los demás.
    const pistaAntes=await host.evaluate(()=>({ronda:V14.__v66.estado().roundId,target:V14.__v66.estado().target}));
    const equiposAntesDeCorte=await host.evaluate(()=>V14.G().teams.map(t=>({name:t.name,score:t.score,members:t.members})));
    const idAna=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').id);
    await ana.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),idAna,{timeout:10000});
    await host.evaluate(()=>V14.__v55.reconciliar(true));
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>({name:t.name,score:t.score,members:t.members}))),equiposAntesDeCorte,'la reconciliación del lobby no modifica una ronda activa');
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.id!==id&&r.conn?.open),idAna,{timeout:15000});
    await ana.locator('#rm-dial-reveal').waitFor({state:'visible',timeout:10000});
    await ana.locator('#rm-dial-reveal').click();
    assert.equal(await ana.locator('#rm-dial-target').isVisible(),true);
    assert.deepEqual(await host.evaluate(()=>({ronda:V14.__v66.estado().roundId,target:V14.__v66.estado().target})),pistaAntes);
    assert.equal(await maria.locator('#rm-dial-target').count(),0);
    assert.equal(await luis.locator('#rm-dial-target').count(),0);
    await ana.locator('#rm-pista-text').fill('Algo muy caliente');
    await ana.locator('#rm-pista-send').click();
    await host.waitForFunction(()=>V14.__v77.estado().texto==='Algo muy caliente',null,{timeout:10000});
    const rp=await host.evaluate(()=>V14.__v66.estado().roundId);
    await luis.evaluate(r=>V14.net._debugRemote().conn.send({t:'pista',v:'intruso',round:r}),rp);
    await ana.evaluate(r=>V14.net._debugRemote().conn.send({t:'pista',v:'caducada',round:r-1}),rp);
    await host.waitForTimeout(300);assert.equal(await host.evaluate(()=>V14.__v77.estado().texto),'Algo muy caliente');
    await ana.locator('#rm-dial-hide').click();
    await host.waitForFunction(()=>V14.__v66.estado().phase==='guessing',null,{timeout:10000});
    const aguja=maria.locator('#rm-dialbox .v16-svg');
    await aguja.waitFor({state:'visible',timeout:10000});
    await maria.getByText('«Algo muy caliente»',{exact:true}).waitFor({state:'visible',timeout:10000});
    assert.equal(await luis.getByText('«Algo muy caliente»',{exact:true}).count(),0);
    assert.equal(await jose.getByText('«Algo muy caliente»',{exact:true}).count(),0);
    assert.equal(await ana.locator('#rm-dial').count(),0);
    assert.equal(await luis.locator('#rm-dial').count(),0);
    await aguja.tap({position:{x:230,y:65},timeout:5000});
    await host.waitForFunction(()=>V14.__v66.estado().needleMoved,null,{timeout:10000});
    // La persona que mueve la aguja vuelve durante la fase activa.
    const antesDeCorte=await host.evaluate(()=>({ronda:V14.__v66.estado().roundId,phase:V14.__v66.estado().phase,score:V14.G().teams.map(t=>t.score)}));
    const idMaria=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Maria').id);
    await maria.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),idMaria,{timeout:10000});
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Maria'&&r.id!==id&&r.conn?.open),idMaria,{timeout:15000});
    await maria.locator('#rm-dialbox .v16-svg').waitFor({state:'visible',timeout:10000});
    await maria.getByText('«Algo muy caliente»',{exact:true}).waitFor({state:'visible',timeout:10000});
    assert.deepEqual(await host.evaluate(()=>({ronda:V14.__v66.estado().roundId,phase:V14.__v66.estado().phase,score:V14.G().teams.map(t=>t.score)})),antesDeCorte);
    // Solo quien maneja la aguja puede revelar el resultado de esta ronda.
    const ronda=await host.evaluate(()=>V14.__v66.estado().roundId);
    await luis.evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'dial:reveal',round:r}),ronda);
    await ana.evaluate(()=>V14.net._debugRemote().conn.send({t:'action',id:'reveal'}));
    await host.waitForTimeout(300);
    assert.equal(await host.evaluate(()=>V14.__v66.estado().phase),'guessing');
    await maria.locator('#rm-actions [data-act="dial:reveal"]').click({timeout:5000});
    await host.waitForFunction(()=>V14.__v66.estado().phase==='revealed',null,{timeout:10000});
    for(const p of [ana,luis,maria,jose]) await p.getByText('Ronda revelada',{exact:true}).waitFor({state:'visible',timeout:10000});
    const puntos=await host.evaluate(()=>V14.G().teams.map(t=>t.score));
    await maria.evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'dial:reveal',round:r}),ronda);
    await host.waitForTimeout(300);
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),puntos);
    // Valores deliberados para comprobar fracciones y reparto por identidad, no por conexión.
    await host.evaluate(()=>{V14.G().teams[0].score=3;V14.G().teams[1].score=1});
    await host.waitForFunction(()=>V14.__v66.estado().phase==='idle'&&V14.G().activeTeamIdx===1,null,{timeout:10000});
    await jose.locator('#rm-dial-start').waitFor({state:'visible',timeout:10000});
    const anterior=await host.evaluate(()=>{const r=Array.from(V14.net.conns.values()).find(r=>r.name==='Jose');return {id:r.id,pid:r.pid,slot:r.slot}});
    await jose.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),anterior.id,{timeout:10000});
    assert.equal(await host.evaluate(()=>V14.__v66.puedeEmpezar().ok),false);
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.id!==id&&r.name==='Jose'&&r.online&&r.conn?.open),anterior.id,{timeout:15000});
    await host.waitForFunction(p=>Array.from(V14.net.conns.values()).some(r=>r.name==='Jose'&&r.pid===p.pid&&r.slot===p.slot),anterior,{timeout:10000});
    await host.waitForFunction(()=>V14.__v66.puedeEmpezar().ok,null,{timeout:10000});
    await host.evaluate(()=>V14.openGame('probable'));
    await host.waitForFunction(()=>V14.gameOf()==='probable',null,{timeout:10000});
    const jugadores=await host.evaluate(()=>V14.__v55.jugadores().map(p=>({nombre:p.nombre,slot:p.slot})));
    assert.equal(new Set(jugadores.map(p=>p.slot)).size,4,'al volver a un juego individual cada teléfono tiene un asiento propio');
    const restaurados=await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score])));
    assert.deepEqual(restaurados,{Ana:puntajes.Ana+1.5,Luis:puntajes.Luis+0.5,Maria:puntajes.Maria+1.5,Jose:puntajes.Jose+0.5},'los puntos de cada pareja se dividen entre sus integrantes');
    const archivo=await host.evaluate(()=>{V14.saveSessionNow();return V14.store.get('session',null).v33resultados});
    assert.equal(archivo.length,1);assert.equal(archivo[0].length,2);assert.ok(archivo[0].every(x=>x.repartido));
    // La elección del usuario también reparte por igual los puntos de Tabú.
    await host.evaluate(()=>V14.openGame('tabu'));
    for(const [p,k] of [[ana,0],[luis,1],[maria,0],[jose,1]]) await p.locator('#v33-form [data-act="unir"][data-k="'+k+'"]').click({timeout:10000});
    for(const p of [ana,luis,maria,jose]) if (!await p.locator('#v33-form [data-act="listo"]').evaluate(e=>e.classList.contains('ok'))) await p.locator('#v33-form [data-act="listo"]').click({timeout:10000});
    await host.waitForFunction(()=>V14.__v33api.validar().ok,null,{timeout:10000});
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    await host.locator('#v33-form [data-act="empezar"]').click({timeout:10000});
    await host.waitForFunction(()=>V14.gameOf()==='tabu',null,{timeout:10000});
    await host.waitForTimeout(1500);
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    // Dos personas de un mismo equipo deben poder proponer una vez cada una.
    await host.evaluate(()=>V14.__v65.iniciar());
    await ana.locator('#rm-tabu-proposal').waitFor({state:'visible',timeout:10000});
    await maria.locator('#rm-tabu-proposal').waitFor({state:'visible',timeout:10000});
    const tarjetaTabu=await host.evaluate(()=>V14.__v65.estado());
    await ana.locator('#rm-tabu-proposal').fill('Primera propuesta');await ana.locator('#rm-tabu-send').click();
    await host.waitForFunction(()=>V14.__v65.estado().intentos===1,null,{timeout:10000});
    const anaTabu=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').id);
    await ana.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),anaTabu,{timeout:10000});
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.id!==id&&r.conn?.open),anaTabu,{timeout:15000});
    // La capa común se instala asíncronamente: probar también después de
    // instalarla, cuando antes sobrescribía el estado privado por asiento.
    await host.waitForFunction(()=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.conn?.__v60),null,{timeout:10000});
    await host.evaluate(()=>V14.net.broadcast());
    await ana.getByText('Propuesta recibida',{exact:true}).waitFor({state:'visible',timeout:10000});
    await maria.locator('#rm-tabu-proposal').waitFor({state:'visible',timeout:10000});
    await ana.evaluate(c=>V14.net._debugRemote().conn.send({t:'tabuguess',v:'Duplicada al reconectar',round:c.ronda,card:c.carta}),tarjetaTabu);
    await host.waitForTimeout(300);assert.equal(await host.evaluate(()=>V14.__v65.estado().intentos),1);
    await maria.locator('#rm-tabu-proposal').fill('Segunda propuesta');await maria.locator('#rm-tabu-send').click();
    await host.waitForFunction(()=>V14.__v65.estado().intentos===2,null,{timeout:10000});
    assert.match(await host.locator('#t65-propuestas').innerText(),/Primera propuesta/);
    assert.match(await host.locator('#t65-propuestas').innerText(),/Segunda propuesta/);
    await ana.evaluate(c=>V14.net._debugRemote().conn.send({t:'tabuguess',v:'Duplicada',round:c.ronda,card:c.carta}),tarjetaTabu);
    await host.waitForTimeout(300);assert.equal(await host.evaluate(()=>V14.__v65.estado().intentos),2);
    await host.locator('#t65-propuestas button').first().click();
    assert.equal((await host.evaluate(()=>V14.G().teams[0].score)),1);
    await host.evaluate(()=>{V14.G().teams[0].score=3;V14.G().teams[1].score=1;V14.openGame('dial')});
    // Transición directa entre juegos de equipos: no se deben reciclar plazas ni puntos.
    for(const [p,k] of [[ana,0],[luis,1],[maria,0],[jose,1]]) await p.locator('#v33-form [data-act="unir"][data-k="'+k+'"]').click({timeout:10000});
    for(const p of [ana,luis,maria,jose]) if (!await p.locator('#v33-form [data-act="listo"]').evaluate(e=>e.classList.contains('ok'))) await p.locator('#v33-form [data-act="listo"]').click({timeout:10000});
    await host.waitForFunction(()=>V14.__v33api.validar().ok,null,{timeout:10000});
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    await host.locator('#v33-form [data-act="empezar"]').click({timeout:10000});
    await host.waitForFunction(()=>V14.gameOf()==='dial',null,{timeout:10000});
    assert.equal(await host.evaluate(()=>V14.__v65.estado().relojActivo),false,'al cambiar directamente a Dial se detiene el reloj de Tabú');
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),[0,0]);
    await host.evaluate(()=>V14.openGame('probable'));
    await host.waitForFunction(()=>V14.gameOf()==='probable',null,{timeout:10000});
    const despuesTabu=await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score])));
    assert.deepEqual(despuesTabu,{Ana:restaurados.Ana+1.5,Luis:restaurados.Luis+0.5,Maria:restaurados.Maria+1.5,Jose:restaurados.Jose+0.5});
    // El inicio diferido de la formación no puede abrir un juego abandonado.
    await host.evaluate(()=>V14.openGame('dial'));
    for(const [p,k] of [[ana,0],[luis,1],[maria,0],[jose,1]]) await p.locator('#v33-form [data-act="unir"][data-k="'+k+'"]').click({timeout:10000});
    for(const p of [ana,luis,maria,jose]) if (!await p.locator('#v33-form [data-act="listo"]').evaluate(e=>e.classList.contains('ok'))) await p.locator('#v33-form [data-act="listo"]').click({timeout:10000});
    await host.waitForFunction(()=>V14.__v33api.validar().ok,null,{timeout:10000});
    await host.evaluate(()=>{document.querySelector('#v33-form [data-act="empezar"]').click();V14.openGame('probable')});
    await host.waitForTimeout(800);
    assert.equal(await host.evaluate(()=>V14.gameOf()),'probable','el inicio diferido no cambia el juego elegido después');
    assert.deepEqual(await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score]))),despuesTabu);
    assert.deepEqual(errores,[]);
  } finally {
    if(browser)await browser.close();
    if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')});
  }
});
