// Ensayo WebRTC local: no cambia la señalización de producción.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
function senalLocal(port) {
  const Original=window.Peer;
  window.Peer=function(id,opts) {
    let settings;
    if (typeof id==='string') settings=opts||{};
    else { settings=id||{}; id=undefined; }
    settings=Object.assign({},settings,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});
    return id ? new Original(id,settings) : new Original(settings);
  };
  window.Peer.prototype=Original.prototype;
}
test('Servidor y dos teléfonos: reconexión, historia, aislamiento y desempate', {timeout:150000}, async () => {
  const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});
  const port=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject);server.once('exit',code=>reject(new Error('Servidor de prueba terminó: '+code)));});
  let browser;
  const errors=[];
  try {
    browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
    const host=await browser.newPage({viewport:{width:1280,height:800}});
    host.on('pageerror',e=>errors.push('host: '+e.message));
    await host.goto('http://127.0.0.1:8000/?entrada=off',{waitUntil:'domcontentloaded'});
    await host.waitForTimeout(1200);
    await host.evaluate(senalLocal,port);
    await host.evaluate(()=>{V14.settings.gameMode='servidor';V14.net.host()});
    await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});
    const code=await host.evaluate(()=>V14.net.code);
    async function conectar(name,hostname) {
      const ctx=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const p=await ctx.newPage();p.on('pageerror',e=>errors.push(name+': '+e.message));
      await p.goto('http://'+hostname+':8000/?mando&sala='+code,{waitUntil:'domcontentloaded'});
      await p.waitForTimeout(700); await p.evaluate(senalLocal,port);
      await p.locator('#rm-name').fill(name); await p.locator('#rm-enter').click();
      await host.waitForFunction(n=>Array.from(V14.net.conns.values()).some(r=>r.name===n&&r.online&&r.conn&&r.conn.open),name,{timeout:15000});
      await p.waitForFunction(()=>V14.net._debugRemote().joined || getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});
      if (!await p.evaluate(()=>V14.net._debugRemote().joined)) await p.locator('#rm-ready').click({timeout:5000});
      await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});
      return p;
    }
    const ana=await conectar('Ana','127.0.0.1');
    const luis=await conectar('Luis','localhost');
    await host.waitForTimeout(1500);
    const roster=await host.evaluate(()=>V14.__v55.jugadores().map(p=>p.nombre));
    assert.deepEqual(roster,['Ana','Luis']);
    if (await host.locator('#v40-skip').isVisible()) await host.locator('#v40-skip').click({timeout:5000});
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    await host.evaluate(()=>V14.__v29.abrir());
    await host.locator('#v29-body').waitFor({state:'visible',timeout:10000});
    const panel=host.locator('#v29-body');
    assert.match(await panel.innerText(),/Sala y configuración/i);assert.match(await panel.innerText(),/Jugadores y marcador/i);
    assert.match(await panel.innerText(),/Ana/);assert.match(await panel.innerText(),/Luis/);
    const izquierda=await host.locator('#v29-right').boundingBox(),derecha=await host.locator('#v29-list-card').boundingBox();
    assert.ok(izquierda.x<derecha.x,'sala a la izquierda, jugadores y marcador a la derecha');
    await host.locator('#v29-body [data-v29="settings"]').click();
    await host.locator('#modal-ajustes').waitFor({state:'visible',timeout:10000});
    await host.evaluate(()=>closeAjustesModal());
    // Puede llegar otro welcome después de entrar, incluso al reconectar.
    await host.evaluate(()=>{const r=Array.from(V14.net.conns.values()).find(x=>x.name==='Luis');V14.net.rawSendTo(r,{t:'welcome',code:V14.net.code,teams:[],youSlot:r.slot});});
    await luis.waitForTimeout(500);
    assert.equal(await luis.locator('#rm-pick').isVisible(),false);
    // Puntajes distintos permiten detectar una reasignación errónea en el lobby.
    await host.evaluate(()=>{for(const p of V14.__v55.jugadores()){V14.G().teams[p.slot].score=p.nombre==='Ana'?3:7;}V14.__v55.reconciliar(true)});
    // Desconectar el primer asiento mientras el segundo sigue conectado.
    const primero=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').id);
    await ana.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),primero,{timeout:10000});
    await host.evaluate(()=>V14.__v55.reconciliar(true));
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.id!==id&&r.conn?.open),primero,{timeout:15000});
    await host.waitForTimeout(700);
    assert.deepEqual(await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score]))),{Ana:3,Luis:7},'el primero conserva su puntaje tras compactar el lobby');
    // Cortar el canal de datos fuerza la reconexión normal del mando.
    const anterior=await host.evaluate(()=>{const r=Array.from(V14.net.conns.values()).find(x=>x.name==='Luis');return {id:r.id,slot:r.slot,pid:r.pid}});
    await luis.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),anterior.id,{timeout:10000});
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Luis'&&r.id!==id&&r.online&&r.conn?.open),anterior.id,{timeout:15000});
    await luis.waitForFunction(()=>V14.net._debugRemote().joined && V14.net._debugRemote().conn?.open,null,{timeout:10000});
    await host.waitForTimeout(700);
    const reconectado=await host.evaluate(()=>{const r=Array.from(V14.net.conns.values()).find(x=>x.name==='Luis');return {slot:r.slot,pid:r.pid}});
    assert.equal(reconectado.pid,anterior.pid,'la identidad persiste aunque el lobby reordene asientos');
    const puntajesHub=await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,V14.G().teams[p.slot].score])));
    assert.deepEqual(puntajesHub,{Ana:3,Luis:7},'reconectar en el lobby no cambia propietarios de puntos');
    assert.equal(await luis.locator('#rm-pick').isVisible(),false);
    const viejoPanel=host.locator('.modal-backdrop.open').filter({hasText:'Jugar con celulares'});
    if (await viejoPanel.isVisible()) await viejoPanel.locator('[data-close]').first().click({timeout:5000});
    await host.locator('#hub-view .hub-card[data-game="cadena"]').click({timeout:10000});
    const llegadaInmediata=await host.evaluate(()=>{
      const enviado=[];
      const rec={id:'test-inmediato',pid:'test-pid-nuevo',name:'Llegada nueva',online:true,slot:null,conn:{open:true,send:m=>enviado.push(m)}};
      V14.net.conns.set(rec.id,rec);
      const admitido=V14.__v54.admitir(rec);
      V14.net.conns.delete(rec.id);
      return {admitido,espera:rec.__v54espera,aviso:enviado.some(m=>m.t==='v54wait'&&m.on)};
    });
    assert.deepEqual(llegadaInmediata,{admitido:false,espera:true,aviso:true},'una conexión nueva espera incluso inmediatamente después del cambio');
    await host.waitForFunction(()=>V14.gameOf()==='cadena');
    await host.waitForTimeout(300);
    await host.evaluate(()=>document.querySelector('#cadena-stage button').click());
    await ana.locator('#rm-secret-text').waitFor({state:'visible',timeout:10000});
    assert.match(await ana.locator('#rm-actions').innerText(),/Última frase/);
    const primerTurno=await host.evaluate(()=>V14.__v59.estado());
    // Dos personas pueden tener el mismo nombre: no basta compararlo para autorizar.
    await host.evaluate(()=>{V14.G().teams[1].name='Ana'});
    await luis.evaluate(c=>V14.net._debugRemote().conn.send({t:'secrettext',v:'Suplantación',round:c.ronda,turn:c.turno}),primerTurno);
    await host.waitForTimeout(300);
    assert.equal((await host.evaluate(()=>V14.__v59.estado())).frases.length,0);
    await host.evaluate(()=>{V14.G().teams[1].name='Luis'});
    await ana.locator('#rm-secret-text').fill('La luna bailó con el viento.');
    await ana.locator('#rm-secret-send').click({timeout:5000});
    await luis.locator('#rm-secret-text').waitFor({state:'visible',timeout:10000});
    await luis.getByText('«La luna bailó con el viento.»').waitFor({state:'visible',timeout:10000});
    assert.match(await host.locator('#cadena-stage').innerText(),/La luna bailó con el viento/);
    await luis.locator('#rm-secret-text').fill('Y las estrellas cantaron.');
    await luis.locator('#rm-secret-send').click({timeout:5000});
    await host.waitForFunction(()=>V14.__v59.estado().fase==='revelar',null,{timeout:10000});
    assert.match(await host.locator('#cadena-stage').innerText(),/Y las estrellas cantaron/);
    await host.evaluate(()=>V14.__v59.empezar());
    await ana.evaluate(c=>V14.net._debugRemote().conn.send({t:'secrettext',v:'Mensaje anterior',round:c.ronda,turn:c.turno}),primerTurno);
    await host.waitForTimeout(300);
    assert.equal((await host.evaluate(()=>V14.__v59.estado())).frases.length,0);
    await host.evaluate(()=>{V14.exitGame();V14.openGame('tabu')});
    await ana.locator('#v33-form [data-act="unir"][data-k="0"]').click({timeout:10000});
    await luis.locator('#v33-form [data-act="unir"][data-k="1"]').click({timeout:10000});
    await ana.locator('#v33-form [data-act="listo"]').click({timeout:10000});
    await luis.locator('#v33-form [data-act="listo"]').click({timeout:10000});
    await host.waitForTimeout(600);
    await host.evaluate(()=>document.querySelector('#v33-form [data-act="empezar"]').click());
    await host.waitForFunction(()=>V14.gameOf()==='tabu',null,{timeout:10000});
    // El tutorial del juego se monta 700 ms después de abrirlo.
    await host.waitForFunction(()=>V14.settings.onboarded.tabu || !!document.querySelector('#v26-tour'),null,{timeout:10000});
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    // Datos efímeros de prueba para que una palabra común como «equipo» en el
    // protocolo no produzca un falso positivo de privacidad.
    await host.evaluate(()=>{const previo=BUNDLE_DB.partyGames.tabu;BUNDLE_DB.partyGames.tabu=[{word:'OBJETIVO_PRIVADO_981',category:'Prueba',forbidden:['PROHIBIDA_PRIVADA_1','PROHIBIDA_PRIVADA_2','PROHIBIDA_PRIVADA_3','PROHIBIDA_PRIVADA_4','PROHIBIDA_PRIVADA_5']}];try{V14.__v65.iniciar()}finally{BUNDLE_DB.partyGames.tabu=previo}});
    const carta=await host.evaluate(()=>V14.__v65.estado());
    assert.equal(carta.palabra,'OBJETIVO_PRIVADO_981');
    await ana.locator('#rm-tabu-proposal').waitFor({state:'visible',timeout:10000});
    await luis.locator('#rm-tabu-proposal').waitFor({state:'visible',timeout:10000});
    for (const p of [ana,luis]) {
      const recibido=await p.evaluate(()=>JSON.stringify(V14.net._debugRemote().lastSync));
      for(const palabra of [carta.palabra,...carta.prohibidas]) assert.equal(recibido.includes(palabra),false,'Tabú no envía '+palabra);
    }
    const antes=await host.evaluate(()=>V14.G().teams.map(t=>t.score));
    await ana.locator('#rm-tabu-proposal').fill('Una propuesta');await ana.locator('#rm-tabu-send').click();
    await luis.locator('#rm-tabu-proposal').fill('Otra propuesta');await luis.locator('#rm-tabu-send').click();
    await host.waitForFunction(()=>V14.__v65.estado().intentos===2,null,{timeout:10000});
    await ana.evaluate(c=>V14.net._debugRemote().conn.send({t:'tabuguess',v:'Intento duplicado',round:c.ronda,card:c.carta}),carta);
    await host.waitForTimeout(300);
    assert.doesNotMatch(await host.locator('#t65-propuestas').innerText(),/Intento duplicado/);
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    await host.locator('#t65-propuestas button').first().click({timeout:5000});
    await host.evaluate(()=>V14.__v65.resolver(0));
    const despues=await host.evaluate(()=>V14.G().teams.map(t=>t.score));
    assert.equal(despues[0],antes[0]+1);assert.equal(despues[1],antes[1]);
    await host.evaluate(()=>{V14.exitGame();doOpenGame('verdad');V14.net.broadcast()});
    await host.waitForFunction(()=>V14.gameOf()==='verdad');
    // Comprueba también que un mensaje antiguo de reloj no reintroduce la lista.
    await host.evaluate(()=>V14.net.rawAll({t:'vdanim',name:'__clock',pts:{v20clock:1,seg:9,banned:['Médico','Enfermo']}}));
    await host.waitForTimeout(800);
    for (const p of [ana,luis]) {
      assert.equal(await p.locator('#v20-banned').count(),0);
      assert.doesNotMatch(await p.locator('#v-remote').innerText(),/Médico|Enfermo/);
    }
    await host.locator('#v21-boot').waitFor({state:'hidden',timeout:12000});
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    if (await host.locator('#v40-skip').isVisible()) await host.locator('#v40-skip').click({timeout:5000});
    await host.evaluate(()=>{V14.exitGame();V14.openGame('probable')});
    await host.waitForTimeout(1000);
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    await host.locator('#probable-stage button').click({timeout:5000});
    await ana.locator('#rm-actions [data-act^="pr:v:"]').first().waitFor({state:'visible',timeout:10000});
    await luis.locator('#rm-actions [data-act^="pr:v:"]').first().waitFor({state:'visible',timeout:10000});
    let puntos=await host.evaluate(()=>V14.G().teams.map(t=>t.score));
    await ana.locator('#rm-actions [data-act^="pr:v:"]').nth(0).click();
    await host.waitForFunction(()=>Object.keys(V14.__v63.estado().votos).length===1,null,{timeout:10000});
    const votacionAntes=await host.evaluate(()=>V14.__v63.estado());
    const anaCanal=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').id);
    await ana.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),anaCanal,{timeout:10000});
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.id!==id&&r.conn?.open),anaCanal,{timeout:15000});
    await ana.getByText(/Voto enviado/i).waitFor({state:'visible',timeout:10000});
    assert.equal(await ana.locator('#rm-actions [data-act^="pr:v:"]').count(),0);
    await ana.evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'pr:v:'+r+':1'}),votacionAntes.ronda);
    await host.waitForTimeout(300);
    assert.deepEqual((await host.evaluate(()=>V14.__v63.estado())).votos,votacionAntes.votos,'reconectar no permite cambiar o duplicar el voto');
    await luis.locator('#rm-actions [data-act^="pr:v:"]').nth(1).click();
    await host.waitForFunction(()=>Object.keys(V14.__v63.estado().votos).length===2,null,{timeout:10000});
    await host.locator('#probable-stage [data-cerrar]').click();
    assert.match(await host.locator('#probable-stage').innerText(),/Empate/);
    const rondaEmpate=await host.evaluate(()=>V14.__v63.estado().ronda);
    await host.locator('#probable-stage [data-desempatar]').click();
    await host.waitForFunction(r=>V14.__v63.estado().ronda===r+1,rondaEmpate);
    await ana.evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'pr:v:'+r+':1'}),rondaEmpate);
    await host.waitForTimeout(300);
    assert.equal(await host.evaluate(()=>Object.keys(V14.__v63.estado().votos).length),0);
    await ana.locator('#rm-actions [data-act^="pr:v:"]').first().waitFor({state:'visible',timeout:10000});
    await luis.locator('#rm-actions [data-act^="pr:v:"]').first().waitFor({state:'visible',timeout:10000});
    await ana.locator('#rm-actions [data-act^="pr:v:"]').nth(0).click();
    await luis.locator('#rm-actions [data-act^="pr:v:"]').nth(0).click();
    await host.waitForFunction(()=>Object.keys(V14.__v63.estado().votos).length===2,null,{timeout:10000});
    await host.locator('#probable-stage [data-cerrar]').click();
    assert.match(await host.locator('#probable-stage').innerText(),/Ana fue la persona más votada/);
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),puntos);
    // Trivia: una respuesta incorrecta no se puede cambiar al reconectar.
    await host.evaluate(()=>{V14.exitGame();V14.settings.triviaSeconds=120;V14.openGame('trivia')});
    await host.waitForFunction(()=>V14.settings.onboarded.trivia || !!document.querySelector('#v26-tour'),null,{timeout:10000});
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    await host.locator('#trivia-stage button').first().click({timeout:10000});
    await host.waitForFunction(()=>V14.triviaNow().open,null,{timeout:10000});
    const pregunta=await host.evaluate(()=>{const t=V14.triviaNow(),q=V14.DB.trivia.find(x=>x.q===t.q);return {ronda:t.round,correcta:q.a,erronea:q.o.findIndex((x,i)=>i!==q.a)}});
    await ana.locator(`#rm-actions [data-triv="${pregunta.erronea}"]`).click({timeout:10000});
    await host.waitForFunction(()=>V14.triviaNow().answers.length===1,null,{timeout:10000});
    const canalTrivia=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').id);
    await ana.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),canalTrivia,{timeout:10000});
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.id!==id&&r.conn?.open),canalTrivia,{timeout:15000});
    await ana.getByText('Respuesta enviada').waitFor({state:'visible',timeout:10000});
    assert.equal(await ana.locator('#rm-actions [data-triv]:not([disabled])').count(),0);
    await ana.evaluate(p=>V14.net._debugRemote().conn.send({t:'triv',k:p.correcta,round:p.ronda}),pregunta);
    await host.waitForTimeout(300);
    assert.equal((await host.evaluate(()=>V14.triviaNow())).answers.length,1);
    await luis.locator(`#rm-actions [data-triv="${pregunta.correcta}"]`).click({timeout:10000});
    await host.waitForFunction(()=>V14.triviaNow().winner!==null,null,{timeout:10000});
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),[puntos[0],puntos[1]+1]);
    puntos=await host.evaluate(()=>V14.G().teams.map(t=>t.score));
    await host.evaluate(()=>{V14.exitGame();V14.openGame('precio')});
    await host.locator('#precio-stage [data-iniciar-ronda]').click({timeout:10000});
    await host.evaluate(()=>{V14.precioState.item.a='20.10';V14.settings.autoPoints=true;V14.setScorePrecision(4)});
    await host.locator('#precio-stage [data-start]').click({timeout:10000});
    await ana.locator('#v36-capa #v36-enviar').waitFor({state:'visible',timeout:10000});
    await ana.setViewportSize({width:320,height:480});
    const movil=await ana.evaluate(()=>{const e=document.querySelector('#v36-enviar'),r=e.getBoundingClientRect(),c=document.querySelector('#v36-capa');return {bottom:r.bottom,alto:innerHeight,scroll:c.scrollHeight,client:c.clientHeight,overflow:getComputedStyle(c).overflowY}});
    assert.ok(movil.bottom<=movil.alto || (movil.scroll>movil.client && /auto|scroll/.test(movil.overflow)),`el botón debe verse o la capa permitir scroll: ${JSON.stringify(movil)}`);
    assert.equal(await luis.locator('#v36-capa #v36-enviar').count(),0);
    const seriePrecio=await host.evaluate(()=>V14.__v36api.mesa().serial);
    await luis.evaluate(n=>V14.net._debugRemote().conn.send({t:'v36est',serial:n,val:99}),seriePrecio);
    await host.waitForTimeout(300);assert.equal(await host.evaluate(()=>V14.precioState.estimates.length),0);
    for(const c of '1000') await ana.locator('#v36-capa [data-k="'+c+'"]').click();
    const conexionPrecio=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').id);
    await ana.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),conexionPrecio,{timeout:10000});
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.id!==id&&r.conn?.open),conexionPrecio,{timeout:15000});
    await ana.waitForTimeout(1500);
    assert.equal(await ana.locator('#v36-capa .buf').innerText(),'1000','el borrador privado persiste al reconectar el canal');
    // Recargar destruye el borrador, pero debe recuperar el teclado de la ronda vigente.
    const conexionRecuperada=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').id);
    // La conexión automática se desactiva solo en el ensayo para inyectar señalización local antes de entrar.
    await ana.evaluate(()=>localStorage.removeItem('snt-mando-name'));
    await ana.reload({waitUntil:'domcontentloaded'});await ana.waitForTimeout(700);await ana.evaluate(senalLocal,port);
    await ana.locator('#rm-name').fill('Ana');await ana.locator('#rm-enter').click({timeout:5000});
    await host.waitForFunction(id=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.id!==id&&r.conn?.open),conexionRecuperada,{timeout:15000});
    await ana.locator('#v36-capa #v36-enviar').waitFor({state:'visible',timeout:10000});
    for(const c of '1000000000000000.25') await ana.locator('#v36-capa [data-k="'+c+'"]').click();
    assert.equal(await ana.locator('#v36-capa .buf').innerText(),'1000000000000000.25');
    // Simular pérdida del primer envío sin fingir un acuse del anfitrión.
    await ana.evaluate(()=>{const c=V14.net._debugRemote().conn,send=c.send.bind(c);let perdido=false;c.send=function(m){if(m.t==='v36est'&&!perdido){perdido=true;return;}return send(m)}});
    await ana.locator('#v36-enviar').click();
    assert.match(await ana.locator('#v36-enviar').innerText(),/Esperando confirmación/);
    assert.equal(await host.evaluate(()=>V14.precioState.estimates.length),0);
    await ana.waitForFunction(()=>!document.querySelector('#v36-enviar')?.disabled,null,{timeout:5000});
    await ana.locator('#v36-enviar').click();
    await luis.locator('#v36-capa #v36-enviar').waitFor({state:'visible',timeout:10000});
    await ana.evaluate(n=>V14.net._debugRemote().conn.send({t:'v36est',serial:n,val:'1000000000000000.25'}),seriePrecio);
    await host.waitForTimeout(300);assert.equal(await host.evaluate(()=>V14.precioState.estimates.length),0,'la ronda aún no revela las estimaciones');
    await luis.evaluate(n=>V14.net._debugRemote().conn.send({t:'v36est',serial:n,val:99}),seriePrecio);
    await host.waitForTimeout(300);assert.equal(await host.evaluate(()=>V14.precioState.phase),'idle');
    for(const c of '20.10') await luis.locator('#v36-capa [data-k="'+c+'"]').click();
    assert.equal(await luis.locator('#v36-capa .buf').innerText(),'20.10');
    await luis.locator('#v36-enviar').click();
    await host.waitForFunction(()=>V14.precioState.phase==='revealed',null,{timeout:10000});
    const estimaciones=await host.evaluate(()=>V14.precioState.estimates.map(e=>[e.name,e.value]));
    assert.deepEqual(estimaciones,[['Ana','1000000000000000.25'],['Luis','20.1']]);
    await ana.locator('#rm-actions .v75-escala').waitFor({state:'visible',timeout:10000});
    await ana.waitForFunction(()=>V14.net._debugRemote().lastSync?.scorePrecision===4,null,{timeout:10000});
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),[puntos[0],puntos[1]+5], 'solo el exacto recibe cinco puntos');
    assert.equal(await host.locator('#precio-stage [data-rule]').isDisabled(),true);
    await host.locator('#precio-stage [data-undo-auto]').click();
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),puntos);
    await ana.getByText(/reparto deshecho/i).waitFor({state:'visible',timeout:10000});
    await host.locator('#precio-stage [data-next]').click();
    assert.equal(await host.locator('#precio-stage [data-rule]').isDisabled(),false);
    // Dos aciertos exactos de cero: se reparte y se deshace en una sola operación.
    await host.evaluate(()=>{V14.precioState.item.a='0';let c=V14.precioConf();c.empate='repartir';c.sinPasarse=false;V14.store.set('precio',c)});
    await host.locator('#precio-stage [data-start]').click();
    for (const p of [ana,luis]) { await p.locator('#v36-enviar').waitFor({state:'visible',timeout:10000});await p.locator('#v36-capa [data-k="0"]').click();await p.locator('#v36-enviar').click(); }
    await host.waitForFunction(()=>V14.precioState.phase==='revealed',null,{timeout:10000});
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),[puntos[0]+2.5,puntos[1]+2.5]);
    await host.locator('#precio-stage [data-undo-auto]').click();
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),puntos,'deshacer revierte todo el empate');
    await host.locator('#precio-stage [data-next]').click();
    // El reparto manual también es atómico, con empate no exacto.
    await host.evaluate(()=>{V14.precioState.item.a='60';V14.settings.autoPoints=false});
    await host.locator('#precio-stage [data-start]').click();
    for(const [p,valor] of [[ana,'48'],[luis,'72']]) { await p.locator('#v36-enviar').waitFor({state:'visible',timeout:10000});for(const c of valor)await p.locator('#v36-capa [data-k="'+c+'"]').click();await p.locator('#v36-enviar').click(); }
    await host.waitForFunction(()=>V14.precioState.phase==='revealed',null,{timeout:10000});
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),puntos);
    await host.locator('#precio-stage [data-award]').click();
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),[puntos[0]+1,puntos[1]+1]);
    await host.evaluate(()=>V14.undo());
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),puntos);
    // Sin pasarse: cero es válido y un número superior queda excluido.
    await host.evaluate(()=>{V14.precioState.item.a='60';V14.settings.autoPoints=true;let c=V14.precioConf();c.sinPasarse=true;V14.store.set('precio',c)});
    await host.locator('#precio-stage [data-start]').click();
    for(const [p,valor] of [[ana,'50'],[luis,'100']]) { await p.locator('#v36-enviar').waitFor({state:'visible',timeout:10000});for(const c of valor)await p.locator('#v36-capa [data-k="'+c+'"]').click();await p.locator('#v36-enviar').click(); }
    await host.waitForFunction(()=>V14.precioState.phase==='revealed',null,{timeout:10000});
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),[puntos[0]+2,puntos[1]]);
    await host.locator('#precio-stage [data-undo-auto]').click();
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),puntos);
    await host.locator('#precio-stage [data-next]').click();
    await host.locator('#precio-stage [data-start]').click();
    await ana.locator('#v36-enviar').waitFor({state:'visible',timeout:10000});
    // Cancelar el teclado del anfitrión no debe dejar la ronda bloqueada.
    await host.locator('.modal-backdrop.open').filter({has:host.locator('.v-secret-modal')}).locator('[data-close]').click({timeout:5000});
    await host.waitForFunction(()=>!V14.precioState.collecting,null,{timeout:3000});
    await ana.locator('#v36-capa #v36-enviar').waitFor({state:'hidden',timeout:5000});
    await host.locator('#precio-stage [data-start]').click();
    await ana.locator('#v36-enviar').waitFor({state:'visible',timeout:10000});
    const serialCancelado=await host.evaluate(()=>V14.__v36api.mesa().serial);
    await host.evaluate(()=>{V14.exitGame();V14.openGame('precio')});
    assert.equal(await host.evaluate(()=>V14.precioState.collecting),false);
    await ana.evaluate(n=>V14.net._debugRemote().conn.send({t:'v36est',serial:n,val:'60'}),serialCancelado);
    await host.waitForTimeout(500);
    assert.deepEqual(await host.evaluate(()=>V14.G().teams.map(t=>t.score)),puntos);
    assert.equal(await host.evaluate(()=>V14.precioState.estimates.length),0);
    await host.evaluate(()=>{V14.exitGame();V14.openGame('ranking')});
    await host.waitForTimeout(1500);
    if (await host.locator('#v26-tour .v26-skip').isVisible()) await host.locator('#v26-tour .v26-skip').click({timeout:5000});
    await host.locator('#ranking-stage [data-iniciar-ronda]').click({timeout:10000});
    await host.waitForFunction(()=>V14.gameOf()==='ranking'&&V14.__v61.estado().fase==='turno',null,{timeout:10000});
    const opciones=ana.locator('#rm-actions [data-act^="ran:pon:"]');
    await opciones.first().waitFor({state:'visible',timeout:10000});
    const old=await host.evaluate(()=>V14.__v61.estado().ronda);
    const pedro=await conectar('Pedro','127.0.0.2');
    await host.waitForFunction(()=>Array.from(V14.net.conns.values()).some(r=>r.name==='Pedro'&&r.__v54espera),null,{timeout:10000});
    await pedro.locator('#v54-wait.on').waitFor({state:'visible',timeout:10000});
    const aviso=await pedro.locator('#v54-wait').evaluate(e=>({background:getComputedStyle(e).backgroundColor,pointer:getComputedStyle(e).pointerEvents}));
    assert.equal(aviso.pointer,'none');assert.match(aviso.background,/0\.38/);
    assert.equal(await host.evaluate(()=>V14.__v55.jugadores().some(p=>p.nombre==='Pedro')),false);
    await host.evaluate(()=>V14.__v29.abrir());
    const filaEspera=host.locator('#v29-list .v29-row').filter({hasText:'Pedro'});
    await filaEspera.waitFor({state:'visible',timeout:10000});
    assert.match(await filaEspera.innerText(),/en espera/i);
    assert.equal(await filaEspera.locator('[data-kick]').count(),1);
    await host.evaluate(()=>V14.__v29.cerrar());
    await pedro.evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'ran:pon:'+r+':0'}),old);
    await host.waitForTimeout(300);assert.equal(await opciones.count(),5);
    await opciones.first().click();
    await ana.waitForFunction(()=>document.querySelectorAll('#rm-actions [data-act^="ran:pon:"]').length===4,null,{timeout:10000});
    const ar=await host.evaluate(()=>{const r=Array.from(V14.net.conns.values()).find(x=>x.name==='Ana');return {id:r.id,pid:r.pid,slot:r.slot}});
    await ana.evaluate(()=>V14.net._debugRemote().conn.close());
    await host.waitForFunction(id=>!V14.net.conns.has(id),ar.id,{timeout:10000});
    await host.waitForFunction(x=>Array.from(V14.net.conns.values()).some(r=>r.id!==x.id&&r.pid===x.pid&&r.slot===x.slot&&r.online&&r.conn?.open),ar,{timeout:15000});
    await ana.waitForFunction(()=>document.querySelectorAll('#rm-actions [data-act^="ran:pon:"]').length===4,null,{timeout:10000});
    await ana.evaluate(r=>V14.net._debugRemote().conn.send({t:'action',id:'ran:pon:'+(r-1)+':1'}),old);
    await ana.waitForTimeout(300);assert.equal(await opciones.count(),4);
    await ana.locator('#v54-wait.on').waitFor({state:'hidden',timeout:10000});
    for(let n=4;n>0;n--){await opciones.first().click({timeout:10000});if(n>1)await ana.waitForFunction(k=>document.querySelectorAll('#rm-actions [data-act^="ran:pon:"]').length===k,n-1,{timeout:10000});}
    const lops=luis.locator('#rm-actions [data-act^="ran:pon:"]');await lops.first().waitFor({state:'visible',timeout:10000});
    for(let n=5;n>0;n--){await lops.first().click();if(n>1)await luis.waitForFunction(k=>document.querySelectorAll('#rm-actions [data-act^="ran:pon:"]').length===k,n-1,{timeout:10000});}
    await host.waitForFunction(()=>V14.__v61.estado().fase==='revelar',null,{timeout:10000});
    assert.equal(await host.locator('#ranking-stage a[href^="https://"]').count(),1);
    assert.equal(Object.keys((await host.evaluate(()=>V14.__v61.estado())).respuestas).length,2);
    await host.evaluate(()=>V14.exitGame());
    await host.waitForFunction(()=>V14.gameOf()==='hub',null,{timeout:10000});
    await host.waitForFunction(()=>Array.from(V14.net.conns.values()).some(r=>r.name==='Pedro'&&!r.__v54espera),null,{timeout:10000});
    await host.evaluate(()=>V14.__v29.abrir());
    const filaLuis=host.locator('#v29-list .v29-row').filter({hasText:'Luis'});
    await filaLuis.locator('[data-kick]').click({timeout:10000});
    await host.waitForFunction(()=>!Array.from(V14.net.conns.values()).some(r=>r.name==='Luis'&&r.online),null,{timeout:10000});
    await luis.locator('#rm-err').getByText('El anfitrión te sacó de la sala').waitFor({state:'visible',timeout:10000});
    await host.waitForTimeout(3000);
    assert.equal(await host.evaluate(()=>Array.from(V14.net.conns.values()).some(r=>r.name==='Luis'&&r.online)),false);
    assert.equal(await host.evaluate(()=>Array.from(V14.net.conns.values()).some(r=>r.name==='Ana'&&r.online)),true);
    assert.deepEqual(errors,[]);
  } finally {
    if (browser) await browser.close();
    if (server.exitCode===null && server.signalCode===null) await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM');});
  }
});
