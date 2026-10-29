// Requiere Playwright Core y Chromium instalados por separado. Ver README.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
async function abrir(viewport={width:1280,height:800}, inicio=false) {
  let browser;
  for(let attempt=0;attempt<3;attempt++) {
    try { browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || undefined, headless:true, args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']}); break; }
    catch(e) { if(attempt===2 || !/SIGSEGV/.test(String(e))) throw e; console.warn('Chromium terminó con SIGSEGV al iniciar; reintentando lanzamiento',attempt+1); }
  }
  const page=await browser.newPage({viewport});
  const errores=[]; page.on('pageerror', e=>errores.push(e.message));
  await page.goto(process.env.SINTONIA_URL || ('http://127.0.0.1:8000/'+(inicio?'':'?entrada=off')),{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(1400);
  return {browser,page,errores};
}
async function prepararVerdad(page) {
  await page.evaluate(() => {
    V14.settings.gameMode='pantalla';
    const s=V14.G(); s.teams=[{id:1,name:'Ana',score:0,members:[]},{id:2,name:'Luis',score:0,members:[]}];
    s.activeTeamIdx=0; doOpenGame('verdad');
  });
  await page.waitForTimeout(150);
}
test('Catálogo usa solo la tarjeta para abrir el juego', async () => {
  const {browser,page,errores}=await abrir();
  try {
    assert.ok(await page.locator('#hub-view button.hub-card[data-game]').count() > 0);
    assert.equal(await page.locator('#hub-view .hub-card-play').count(),0);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('El inicio no promete funcionamiento offline ni un número incorrecto de juegos', async () => {
  const {browser,page,errores}=await abrir();
  try {
    const subtitulo=await page.locator('#hub-view .v-hub-sub').innerText();
    assert.doesNotMatch(subtitulo,/todo offline/i);
    assert.match(subtitulo,new RegExp(`^${await page.locator('#hub-view button.hub-card[data-game]').count()} juegos`));
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Cada tarjeta abre su juego desde ambos extremos en escritorio y móvil', {timeout:120000}, async () => {
  const {browser,page,errores}=await abrir();
  try {
    await page.locator('#v21-boot').waitFor({state:'hidden',timeout:12000});
    if(await page.locator('#v40-skip').isVisible()) await page.locator('#v40-skip').click();
    if(await page.locator('#v26-tour .v26-skip').isVisible()) await page.locator('#v26-tour .v26-skip').click();
    await page.evaluate(()=>localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()})));
    const ids=await page.locator('#hub-view button.hub-card[data-game]').evaluateAll(es=>es.map(e=>e.dataset.game));
    assert.equal(ids.length,11);
    await page.evaluate(()=>{
      V14.settings.gameMode='pantalla';
      V14.G().teams=[{id:1,name:'Ana',score:0,members:[]},{id:2,name:'Luis',score:0,members:[]}];
      V14.GAME_META.forEach(g=>{V14.settings.onboarded[g.id]=true});
    });
    for(const viewport of [{width:1280,height:800},{width:390,height:844}]) {
      await page.setViewportSize(viewport);
      for(const id of ids) {
        const card=page.locator('#hub-view button.hub-card[data-game="'+id+'"]');
        for(const lado of ['izquierda','derecha']) {
          const width=await card.evaluate(e=>e.getBoundingClientRect().width);
          await card.click({position:{x:lado==='izquierda'?8:width-8,y:8},timeout:5000});
          try { await page.waitForFunction(id=>V14.gameOf()===id,id,{timeout:5000}); } catch(e) { throw new Error(`${id}: clic ${lado} en ${viewport.width}px no abrió el juego (${await page.evaluate(()=>V14.gameOf())})`,{cause:e}); }
          assert.equal(await page.evaluate(()=>V14.gameOf()),id,`${id}: ${lado} en ${viewport.width}px`);
          await page.keyboard.press('Escape');
          await page.waitForFunction(()=>V14.gameOf()==='hub',null,{timeout:5000});
          await page.waitForTimeout(400);
        }
      }
    }
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('La tarjeta de Precio refleja la regla por defecto y el juego individual', async () => {
  const {browser,page,errores}=await abrir();
  try {
    const texto=await page.locator('#hub-view .hub-card[data-game="precio"]').innerText();
    assert.doesNotMatch(texto,/sin pasarte|por equipos/i);
    assert.match(texto,/por turnos/i);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('El tutorial de Más probable no promete puntos', async () => {
  const {browser,page,errores}=await abrir();
  try {
    const texto=await page.evaluate(()=>V14.__v26.juegos.probable.reglas);
    assert.match(texto,/no (?:se )?(?:dan|reparten|adjudican) puntos/i);
    assert.doesNotMatch(texto,/se lleva el punto/i);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Verdad muestra controles de elección en fila en PC y columna en móvil', async () => {
  const {browser,page,errores}=await abrir();
  try {
    await prepararVerdad(page);
    assert.equal(await page.locator('#vd-stage .vd-draw').evaluate(e=>getComputedStyle(e).flexDirection),'row');
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('#vd-stage .vd-draw').evaluate(e=>getComputedStyle(e).flexDirection),'column');
    assert.equal(await page.locator('#vd-stage [data-vd-act="auto"], #vd-stage [data-vd-act="aud"], #vd-stage [data-vd-act="next"]').count(),0);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Verdad no avanza antes del veredicto y avanza una vez después', async () => {
  const {browser,page,errores}=await abrir();
  try {
    await prepararVerdad(page);
    await page.evaluate(()=>{V14.vdElegir('RETO',0); V14.vdAct('aceptar',0)});
    await page.waitForTimeout(1100);
    assert.equal((await page.evaluate(()=>V14.vdNow())).phase,'retoGo');
    assert.equal((await page.evaluate(()=>V14.vdAct('retoOk','host'))).ok,true);
    assert.equal((await page.evaluate(()=>V14.vdAct('retoOk','host'))).ok,false);
    await page.waitForTimeout(5200);
    const r=await page.evaluate(()=>({now:V14.vdNow(),scores:V14.G().teams.map(t=>t.score)}));
    assert.equal(r.now.phase,'idle'); assert.equal(r.now.slot,1); assert.deepEqual(r.scores,[3,0]);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Verdad cancela el avance al salir del juego', async () => {
  const {browser,page,errores}=await abrir();
  try {
    await prepararVerdad(page);
    await page.evaluate(()=>{V14.vdElegir('RETO',0);V14.vdAct('aceptar',0);V14.vdAct('retoOk','host');doOpenGame('hub')});
    await page.waitForTimeout(5200);
    assert.equal(await page.evaluate(()=>V14.G().activeTeamIdx),0);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
async function prepararTrivia(page) {
  await page.evaluate(() => {
    V14.settings.gameMode='pantalla';
    const s=V14.G(); s.teams=[{id:1,name:'Ana',score:0,members:[]},{id:2,name:'Luis',score:0,members:[]}]; s.activeTeamIdx=0;
    V14.openGame('trivia');
  });
  await page.waitForTimeout(250);
  await page.evaluate(() => document.querySelector('#trivia-stage button').click());
  await page.waitForTimeout(250);
}
test('Trivia resuelve una vez y avanza después de mostrar el resultado', async () => {
  const {browser,page,errores}=await abrir();
  try {
    await prepararTrivia(page);
    const previo=await page.evaluate(()=>{const t=V14.triviaNow();return {t, correct:V14.DB.trivia.find(q=>q.q===t.q).a}});
    assert.equal(previo.t.answer,-1,'no enviar respuesta correcta antes del resultado');
    assert.equal(await page.locator('#trivia-stage [data-wild="time"], #trivia-stage [data-next-q]').count(),0);
    const r=await page.evaluate(a=>V14.triviaAnswer(0,a),previo.correct);
    assert.equal(r.win,true);
    await page.waitForTimeout(200);
    let t=await page.evaluate(()=>V14.triviaNow());
    assert.equal(t.winner,0); assert.equal(t.answer,previo.correct); assert.equal(t.qi,0);
    assert.equal((await page.evaluate(a=>V14.triviaAnswer(0,a),previo.correct)).win,undefined);
    assert.equal(await page.evaluate(()=>V14.G().teams[0].score),1);
    await page.waitForTimeout(5100);
    t=await page.evaluate(()=>V14.triviaNow()); assert.equal(t.qi,1);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Trivia avanza tras agotarse el tiempo y cancela al salir', async () => {
  const {browser,page,errores}=await abrir();
  try {
    await prepararTrivia(page);
    await page.evaluate(()=>V14.triviaTick(100));
    assert.equal((await page.evaluate(()=>V14.triviaNow())).open,false);
    await page.waitForTimeout(5200);
    assert.equal((await page.evaluate(()=>V14.triviaNow())).qi,1);
    await page.evaluate(()=>{V14.triviaTick(100);V14.exitGame()});
    await page.waitForTimeout(5200);
    assert.equal(await page.evaluate(()=>V14.gameOf()),'hub');
    assert.equal((await page.evaluate(()=>V14.triviaNow())).qi,-1);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('En modo servidor solo cuentan conexiones reales, no el anfitrión', async () => {
  const {browser,page,errores}=await abrir();
  try {
    const actual=await page.evaluate(()=>{
      V14.settings.gameMode='servidor'; V14.settings.v55anfitrion={on:true,nombre:'Servidor'};
      V14.G().teams=[{name:'Fantasma',score:0,members:[]}];
      const net=V14.net, prev=net.conns;
      net.conns=new Map([['a',{id:'a',name:'Ana',slot:0,online:true,ready:true,conn:{open:true}}],['b',{id:'b',name:'Luis',slot:1,online:true,conn:{open:false}}]]);
      const lista=V14.__v55.jugadores().map(p=>p.nombre); net.conns=prev; return lista;
    });
    assert.deepEqual(actual,['Ana']); assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Al identificarse, un jugador nuevo no recibe provisionalmente el marcador ajeno', async () => {
  const {browser,page,errores}=await abrir();
  try {
    const result=await page.evaluate(()=>{
      V14.settings.gameMode='servidor';
      V14.G().teams=[{id:1,name:'Ana',score:4,members:[],__v55pids:['anterior']}];
      const mensajes=[];
      const rec={id:'canal-nuevo',name:'',slot:null,online:true,conn:{open:true,send:m=>{if(m.t==='welcome')mensajes.push({mensaje:m,score:V14.G().teams[rec.slot]?.score})}}};
      V14.net.conns=new Map([[rec.id,rec]]);
      V14.__v35.entrar(rec,{pid:'nueva',name:'Ana'});
      return {slot:rec.slot,actual:V14.G().teams[rec.slot].score,
        anterior:V14.G().teams.find(t=>(t.__v55pids||[]).includes('anterior'))?.score,
        welcome:mensajes[0]};
    });
    assert.equal(result.actual,0);
    assert.equal(result.anterior,4);
    assert.equal(result.welcome.mensaje.youSlot,result.slot);
    assert.equal(result.welcome.score,0);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Si el último jugador se desconecta, el anfitrión todavía puede volver al hub', async () => {
  const {browser,page,errores}=await abrir();
  try {
    await prepararVerdad(page);
    const juego=await page.evaluate(()=>{V14.settings.gameMode='servidor';V14.net.conns.clear();doOpenGame('hub');return V14.gameOf()});
    assert.equal(juego,'hub'); assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Avisos conservan texto legible, fondo translúcido y dejan pasar el clic', async () => {
  const {browser,page,errores}=await abrir();
  try {
    await page.locator('#v21-boot').waitFor({state:'hidden',timeout:12000});
    if (await page.locator('#v40-skip').isVisible()) await page.locator('#v40-skip').click();
    await page.evaluate(()=>{
      const b=document.createElement('button');b.id='prueba-debajo';
      Object.assign(b.style,{position:'fixed',right:'0',bottom:'0',width:'200px',height:'100px',zIndex:'7999'});
      b.addEventListener('click',()=>b.dataset.pulsado='si');document.body.appendChild(b);
    });
    for(const tipo of ['info','ok','warn','err']) {
      const resultado=await page.evaluate(tipo=>{
        document.querySelector('#v-toasts')?.replaceChildren();
        const el=V14.toast('Aviso de prueba',tipo,2000);
        const css=getComputedStyle(el), r=el.getBoundingClientRect();
        return {fondo:css.backgroundColor,puntero:css.pointerEvents,x:r.x+r.width/2,y:r.y+r.height/2};
      },tipo);
      const alfa=Number(resultado.fondo.match(/rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/)?.[1] ?? 1);
      assert.ok(alfa<=0.4,`${tipo}: ${resultado.fondo}`);
      assert.equal(resultado.puntero,'none');
      await page.waitForTimeout(350);
      const centro=await page.locator('#v-toasts .v-toast').filter({hasText:'Aviso de prueba'}).evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}});
      await page.mouse.click(centro.x,centro.y);
      assert.equal(await page.locator('#prueba-debajo').getAttribute('data-pulsado'),'si');
    }
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Al recargar durante el Dial se recupera el marcador individual sin perder el resultado de equipo', async () => {
  const {browser,page,errores}=await abrir();
  try {
    await page.evaluate(()=>{
      const uno={id:1,name:'Ana',score:3,members:[]};
      const dos={id:2,name:'Luis',score:5,members:[]};
      V14.__v33individuales={equipos:[uno,dos],telefonos:[{slot:0,equipo:0},{slot:1,equipo:0}]};
      V14.G().teams=[{id:3,name:'Pareja',score:7,members:['Ana','Luis']}];
      V14.saveSessionNow();
    });
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>V14.__v33resultados && V14.__v33resultados.length===1,null,{timeout:10000});
    const s=await page.evaluate(()=>({individuales:V14.G().teams.map(t=>[t.name,t.score]),equipos:V14.__v33resultados}));
    assert.deepEqual(s.individuales,[['Ana',6.5],['Luis',8.5]]);
    assert.equal(s.equipos[0][0].puntos,7);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Precio Justo no atribuye una referencia de otro mercado', async () => {
  const {browser,page,errores}=await abrir();
  try {
    const r=await page.evaluate(()=>({
      es:V14.__v75.fuenteDe({q:'Un plan de Spotify individual',a:11.99},'es'),
      us:V14.__v75.fuenteDe({q:'Un plan de Spotify individual',a:11.99},'us'),
      distinto:V14.__v75.fuenteDe({q:'Un plan de Spotify individual',a:12},'es'),
      escala:V14.__v75.escalaPrevia(100,[{name:'Ana',val:50},{name:'Luis',val:200}])
    }));
    assert.equal(r.es.documentado,true);assert.equal(r.us.documentado,false);assert.equal(r.distinto.documentado,false);
    assert.ok(r.escala.max>200);assert.ok(r.escala.real>r.escala.puntos[0].pct);assert.ok(r.escala.real<r.escala.puntos[1].pct);assert.ok(r.escala.puntos[1].pct<100);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('La entrada ofrece anfitrión, local y mando, sin formar equipos automáticamente', async () => {
  const {browser,page,errores}=await abrir(undefined,true);
  try {
    const botones=await page.locator('#v40-welcome [data-v40]').evaluateAll(a=>a.map(x=>x.dataset.v40));
    assert.deepEqual(botones,['servidor','local','solo','mando']);
    assert.equal(await page.locator('#v40-welcome [data-tipo="equipos"]').isVisible(),false);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Precio Justo muestra la misma escala proporcional en PC y teléfono', async () => {
  const {browser,page,errores}=await abrir();
  try {
    const movil=await page.evaluate(()=>{
      V14.settings.gameMode='pantalla';V14.G().teams=[{id:1,name:'Ana',score:0,members:[]},{id:2,name:'Luis',score:0,members:[]}];
      V14.openGame('precio');
      const st=V14.precioState;st.item={q:'Objeto de prueba',a:100,t:2};st.estimates=[{name:'Ana',value:50},{name:'Luis',value:200}];st.phase='revealed';st.auto=false;
      V14.RENDER_PRECIO();return V14.__v60.ajustar({screen:{}},0).screen.precio;
    });
    await page.waitForTimeout(900);
    const pc=await page.locator('#precio-stage .v75-escala').evaluate(e=>({max:Number(e.dataset.max),real:Number(e.dataset.real),marcas:Array.from(e.querySelectorAll('.v75-punto')).map(x=>parseFloat(x.style.left))}));
    assert.equal(await page.locator('#v22-regla').count(),0);
    assert.deepEqual(pc,{max:movil.max,real:movil.realPct,marcas:movil.filas.map(f=>f.pct)});
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Importador de Ranking valida y guarda una tarjeta objetiva desde la interfaz', {timeout:25000}, async () => {
  const {browser,page,errores}=await abrir();
  try {
    if (await page.locator('#v40-skip').isVisible()) await page.locator('#v40-skip').click({timeout:5000});
    await page.evaluate(()=>openImporterModal());
    await page.locator('#im-game').selectOption('ranking',{timeout:5000});
    await page.locator('#im-text').fill('Longitud de prueba (km) | desc | Uno=1, Dos=2, Tres=3 | https://example.org/referencia');
    await page.locator('[data-im="run"]').click({timeout:5000});
    await page.waitForFunction(()=>document.querySelector('#im-report')?.innerText.includes('1 válidas'),null,{timeout:5000});
    assert.match(await page.locator('#im-report').innerText(),/1 válidas/);
    await page.locator('#im-insert').click({timeout:5000});
    const guardado=await page.evaluate(()=>V14.__v67.importados('ranking:general:conjuntos'));
    const carta=guardado.find(x=>x.title.startsWith('Longitud de prueba'));
    assert.ok(carta);assert.deepEqual(carta.items,['Tres','Dos','Uno']);assert.deepEqual(carta.valores,[3,2,1]);
    assert.equal(carta.fuente,'https://example.org/referencia');
    await page.locator('#v-imp2').locator('..').locator('..').locator('[data-close]').click();
    await page.evaluate(()=>openImporterModal());await page.locator('#im-game').selectOption('ranking');
    await page.locator('#im-text').fill('Dato incorrecto | asc | Uno=1, Dos=1, Tres=3 | https://example.org');
    await page.locator('[data-im="run"]').click({timeout:5000});await page.waitForFunction(()=>document.querySelector('#im-status')?.textContent==='Listo para importar');assert.equal(await page.locator('#im-insert').isDisabled(),true);
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('La lista de sala conserva su scroll al actualizar y se adapta a móvil', {timeout:20000}, async () => {
  const {browser,page,errores}=await abrir();
  try {
    if (await page.locator('#v40-skip').isVisible()) await page.locator('#v40-skip').click({timeout:5000});
    await page.evaluate(()=>{
      V14.settings.gameMode='servidor';V14.net.status='open';V14.net.code='TEST';
      V14.G().teams=Array.from({length:8},(_,i)=>({id:i+1,name:'Jugador '+(i+1),score:0,members:[]}));
      for(let i=0;i<8;i++)V14.net.conns.set('scroll-'+i,{id:'scroll-'+i,name:'Jugador '+(i+1),slot:i,online:true,ready:true,conn:{open:true,send(){},on(){}}});
      V14.__v29.abrir();
    });
    const lista=page.locator('#v29-list');await lista.waitFor({state:'visible',timeout:5000});
    const desplazado=await lista.evaluate(e=>{e.scrollTop=e.scrollHeight;return e.scrollTop});
    assert.ok(desplazado>0);
    await page.evaluate(()=>{V14.G().teams[0].score=5});
    await page.waitForTimeout(1400);
    assert.equal(await lista.evaluate(e=>e.scrollTop),desplazado);
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('#v29-body').evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(' ').length),1);
    assert.ok(await lista.evaluate(e=>e.scrollHeight>e.clientHeight));
    assert.deepEqual(errores,[]);
  } finally { await browser.close(); }
});
test('Precio usa decimales exactos, seis categorías y empates configurables', {timeout:20000}, async () => {
  const {browser,page,errores}=await abrir();
  try {
    const r=await page.evaluate(()=>{
      const D=V14.precioDecimal, P=V14.__v75;
      const limites=['0','100.99','101','1000.99','1001','99999.99','100000','999999.99','1000000','999999999.99','1000000000'];
      const enorme='123456789012345678901234567890.25';
      const cien='9'.repeat(100), cienUno='9'.repeat(101);
      const c={sinPasarse:false,empate:'ninguno'};
      const cercano=P.ganador(c,[{name:'Ana',val:'40'}], '60');
      const noExacto=P.ganador(c,[{name:'Ana',val:'59.999'}], '60');
      const exacto=P.ganador(c,[{name:'Ana',val:'60.00'}], '60');
      const gran=P.ganador(c,[{name:'Ana',val:enorme},{name:'Luis',val:'123456789012345678901234567890.24'}], enorme);
      const s=V14.G();s.teams=[{id:1,name:'Ana',score:0,members:[]},{id:2,name:'Luis',score:0,members:[]},{id:3,name:'Maria',score:0,members:[]}];
      const st=P.estado();st.item={q:'Prueba exacta',a:'60',t:1};st.awarded=false;
      const iguales=[{name:'Ana',val:'60'},{name:'Luis',val:'60.0'},{name:'Maria',val:'60.00'}];
      P.repartir(c,s,iguales,'60');const ninguno=s.teams.map(x=>x.score);
      st.awarded=false;P.repartir({sinPasarse:false,empate:'repartir'},s,iguales,'60');const reparto=s.teams.map(x=>x.score);
      const segundo=P.repartir({sinPasarse:false,empate:'repartir'},s,iguales,'60');
      V14.undo();const deshacer=s.teams.map(x=>x.score);
      s.teams[1].name='Ana';st.awarded=false;
      P.repartir({sinPasarse:false,empate:'repartir'},s,[{name:'Ana',slot:0,val:'60'},{name:'Ana',slot:1,val:'60'}],'60');
      const nombresDuplicados=s.teams.map(x=>x.score);V14.undo();
      return {deshacer,nombresDuplicados,max100:D.normalizar(cien),rechaza101:D.normalizar(cienUno),comparacion100:D.comparar(cien,'9'.repeat(99)+'8'),niveles:limites.map(D.nivel),enorme:D.dinero(enorme,'BOB'),cercano:cercano.exact,noExacto:noExacto.exact,exacto:exacto.exact,gran:gran.winner.name,ninguno,reparto,segundo,conf:V14.precioConf()};
    });
    assert.equal(r.max100,'9'.repeat(100));assert.equal(r.rechaza101,null);assert.equal(r.comparacion100,1);
    assert.deepEqual(r.niveles,[1,1,2,2,3,3,4,4,5,5,6]);
    assert.match(r.enorme,/123[.,]456[.,]789[.,]012[.,]345[.,]678[.,]901[.,]234[.,]567[.,]890[,.]25/);
    assert.equal(r.cercano,false);assert.equal(r.noExacto,false);assert.equal(r.exacto,true);assert.equal(r.gran,'Ana');
    assert.deepEqual(r.ninguno,[0,0,0]);assert.ok(r.reparto.every(x=>Math.abs(x-5/3)<1e-12));assert.equal(r.segundo,false);
    assert.deepEqual(r.deshacer,[0,0,0]);assert.deepEqual(r.nombresDuplicados,[2.5,2.5,0]);
    assert.equal(r.conf.sinPasarse,false);assert.equal(r.conf.empate,'ninguno');
    await page.evaluate(()=>{V14.G().teams[0].score=2/3;V14.setScorePrecision(2);renderSharedScoreboard()});
    assert.equal(await page.evaluate(()=>V14.formatScore(V14.G().teams[0].score)),'0,67');
    if (await page.locator('#v40-skip').isVisible()) await page.locator('#v40-skip').click({timeout:5000});
    await page.evaluate(()=>{openAjustesModal()});
    await page.locator('#score-precision').selectOption('4',{timeout:5000});
    assert.equal(await page.evaluate(()=>V14.formatScore(2/3)),'0,6667');
    assert.deepEqual(errores,[]);
  } finally {await browser.close();}
});
test('Precio importa cifras grandes sin perder decimales y permite configurar reglas', {timeout:25000}, async () => {
  const {browser,page,errores}=await abrir();
  try {
    if (await page.locator('#v40-skip').isVisible()) await page.locator('#v40-skip').click({timeout:5000});
    await page.evaluate(()=>openImporterModal());await page.locator('#im-game').selectOption('precio',{timeout:5000});
    const importe='123456789012345678901234567890.25';
    await page.locator('#im-text').fill('Una fortuna verificable | '+importe);
    await page.locator('[data-im="run"]').click({timeout:5000});
    await page.waitForFunction(()=>document.querySelector('#im-report')?.innerText.includes('1 válidas'),null,{timeout:5000});
    assert.match(await page.locator('#im-report').innerText(),/1 válidas/);
    await page.locator('#im-insert').click({timeout:5000});
    const x=await page.evaluate(()=>V14.__v67.importados('precio:bo:general').find(v=>v.q==='Una fortuna verificable'));
    assert.equal(x.a,importe);assert.equal(x.t,6);
    await page.locator('#v-imp2').locator('..').locator('..').locator('[data-close]').click();
    await page.evaluate(()=>{V14.settings.gameMode='pantalla';V14.G().teams=[{id:1,name:'Ana',score:0,members:[]},{id:2,name:'Luis',score:0,members:[]}];for(let i=0;i<2;i++)V14.net.conns.set('precio-test-'+i,{id:'precio-test-'+i,pid:'precio-pid-'+i,name:i?'Luis':'Ana',slot:i,online:true,conn:{open:true,send(){},on(){}}});V14.openGame('precio');});
    await page.waitForTimeout(1500);
    if (await page.locator('#v26-tour .v26-skip').isVisible()) await page.locator('#v26-tour .v26-skip').click({timeout:5000});
    await page.locator('#precio-stage [data-iniciar-ronda]').click({timeout:5000});
    assert.match(await page.locator('#precio-stage [data-rule]').innerText({timeout:5000}),/El más cercano/);
    await page.locator('#precio-stage [data-rule]').click({timeout:5000});assert.equal((await page.evaluate(()=>V14.precioConf())).sinPasarse,true);
    await page.locator('#precio-stage [data-empate]').click({timeout:5000});assert.equal((await page.evaluate(()=>V14.precioConf())).empate,'repartir');
    await page.locator('#precio-stage [data-tier="4"]').click({timeout:5000});
    assert.match(await page.locator('#precio-stage').innerText(),/Sin tarjetas en esta categoría/i);
    await page.locator('#precio-stage [data-tier="6"]').click({timeout:5000});
    assert.match(await page.locator('#precio-stage').innerText(),/Una fortuna verificable/);
    await page.evaluate(val=>{const s=V14.precioState;s.item={q:'Una fortuna verificable',a:val,t:6};s.estimates=[{name:'Ana',value:val},{name:'Luis',value:'1'}];s.phase='revealed';s.awarded=false;s.auto=false;V14.RENDER_PRECIO()},importe);
    const real=await page.locator('#precio-stage .v-price-real').innerText({timeout:5000});
    assert.match(real,/123[.,]456[.,]789[.,]012[.,]345[.,]678[.,]901[.,]234[.,]567[.,]890[,.]25/);
    assert.match(await page.locator('#precio-stage [data-award]').innerText({timeout:5000}),/Dar 5 pts/);
    assert.deepEqual(errores,[]);
  } finally {await browser.close();}
});
test('Escala Precio mantiene márgenes y posiciones para decimales cercanos y enormes', async () => {
  const {browser,page,errores}=await abrir();
  try {
    const casos=await page.evaluate(()=>[
      V14.precioEscala('70',[{name:'A',val:'60'},{name:'B',val:'80'}]),
      V14.precioEscala('0',[{name:'A',val:'0'}]),
      V14.precioEscala('100000000000000000000000000000000000000000000000000.01',[{name:'A',val:'100000000000000000000000000000000000000000000000000.02'}]),
      V14.precioEscala('0.000001',[{name:'A',val:'0.000002'},{name:'B',val:'0.000003'}])
    ]);
    for(const c of casos){assert.ok(c.real>=7&&c.real<=93);assert.ok(c.puntos.every(p=>p.pct>=7&&p.pct<=93));assert.ok(c.ticks.length>0&&c.ticks.length<=8);}
    assert.ok(casos[0].puntos[0].pct<casos[0].real&&casos[0].real<casos[0].puntos[1].pct);
    assert.ok(casos[2].real<casos[2].puntos[0].pct,'valores enormes cercanos conservan la posición relativa');
    assert.deepEqual(errores,[]);
  } finally {await browser.close();}
});
