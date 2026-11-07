const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(process.env.SINTONIA_HTML || 'index.html', 'utf8');
function script(id) {
  const match = html.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'));
  assert.ok(match, 'Falta el script ' + id);
  return match[1];
}
function entorno() {
  const pantallas = {}, acciones = {};
  const lista = [{slot: 0}, {slot: 1}, {slot: 2}];
  let premios = 0;
  const g = {mainMode:'general', teams: lista.map((x) => ({name:'Jugador '+(x.slot+1)}))};
  const S = {roster: () => lista, nombre: (n) => 'Jugador '+(n+1), sincro(){}, juego:()=> 'probable', pantalla(k, f){pantallas[k]=f;}, accion(k,f){acciones[k]=f;}};
  const V = {__v60:S, __v67:{elegir: (_id, pool) => pool[0]}, DB:{probable:{general:['Pregunta']}}, G:()=>g, award(){premios++;}, RENDER:{}, gameOf:()=> 'tabu', net:{rawAll(x){V.envio=x;}}, exitGame(){}};
  const document = {readyState:'loading', createElement:()=>({}), head:{appendChild(){}}, getElementById:()=>null, querySelectorAll:()=>[{textContent:'Médico'}, {textContent:'Enfermo'}], addEventListener(){}};
  const ctx = {window:{V14:V, addEventListener(){}}, document, location:{search:''}, setInterval(){}, clearInterval(){}, setTimeout(){}, clearTimeout(){}, tabuRunning:true, tabuSecondsRemaining:30};
  vm.createContext(ctx);
  return {ctx,V,S,pantallas,acciones,premios:()=>premios};
}
test('Tabú no transmite las palabras prohibidas en el reloj público', () => {
  const e = entorno(); vm.runInContext(script('v20-tabu-remoto'),e.ctx);
  e.V.__v20.api.injectClock();
  assert.ok(e.V.envio);
  assert.equal(e.V.envio.pts.seg, 30);
  assert.equal('banned' in e.V.envio.pts, false);
});
test('Probable cierra la votación con resultado sin adjudicar puntos', () => {
  const e = entorno(); vm.runInContext(script('v63-probable'),e.ctx);
  const p=e.V.__v63; p.empezar();
  assert.equal(p.votar(0,1).ok,true); assert.equal(p.votar(0,2).ok,false);
  assert.equal(p.votar(1,1).ok,true); assert.equal(p.votar(2,2).ok,true);
  p.cerrar();
  assert.equal(p.estado().fase,'resultado');
  assert.deepEqual(Array.from(p.estado().resultado.top),[1]);
  assert.equal(p.estado().resultado.max,2);
  const sc={}; e.pantallas.probable(sc,0);
  assert.match(sc.text,/Jugador 2/); assert.match(sc.text,/2 voto/);
  assert.equal(e.premios(),0);
  p.cerrar(); assert.equal(e.premios(),0);
});
test('Probable muestra empates y rechaza votos de jugadores inexistentes', () => {
  const e=entorno(); vm.runInContext(script('v63-probable'),e.ctx);
  const p=e.V.__v63; p.empezar();
  assert.equal(p.votar(99,0).ok,false);
  p.votar(0,0); p.votar(1,1); p.cerrar();
  const sc={}; e.pantallas.probable(sc,0);
  assert.match(sc.text,/Empate/i); assert.match(sc.text,/Jugador 1/); assert.match(sc.text,/Jugador 2/);
  assert.equal(e.premios(),0);
});
test('Historia en cadena personaliza la última frase para el siguiente jugador', () => {
  const e=entorno();
  e.V.gameOf=()=> 'cadena';
  e.V.DB.cadena=['Una apertura'];
  e.V.__v55={jugadores:()=>[{slot:0},{slot:1}]};
  e.V.net.conns=new Map();
  vm.runInContext(script('v59-cadena'),e.ctx);
  const c=e.V.__v59; c.empezar();
  let p=c.salida({game:'cadena',screen:{}},0);
  assert.equal(p.screen.ultimaFrase,'Una apertura');
  assert.equal(c.recibir('Después comenzó la aventura').ok,true);
  p=c.salida({game:'cadena',screen:{}},1);
  assert.equal(p.screen.ultimaFrase,'Después comenzó la aventura');
  assert.equal(c.salida({game:'cadena',screen:{}},0).screen.ultimaFrase,null);
  assert.match(c.historiaLarga(),/Después comenzó la aventura/);
});
test('Todos los bloques JavaScript del HTML se pueden analizar', () => {
  let n=0;
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.doesNotThrow(() => new vm.Script(m[2]), m[1]); n++;
  }
  assert.ok(n >= 60);
});
test('Un voto atrasado de una ronda anterior no se aplica en la siguiente', () => {
  const e=entorno(); vm.runInContext(script('v63-probable'),e.ctx);
  const p=e.V.__v63; p.empezar();
  const primera=p.estado().ronda;
  p.cerrar(); p.siguiente();
  assert.equal(e.acciones['pr:']('pr:v:'+primera+':1',{slot:0}),true);
  assert.equal(Object.keys(p.estado().votos).length,0);
  const sc={}; e.pantallas.probable(sc,0);
  const accion=sc.actions.find(a => a.id.endsWith(':1'));
  e.acciones['pr:'](accion.id,{slot:0});
  assert.equal(p.estado().votos[0],1);
});
test('El registro compartido no inventa jugadores cuando la sala está vacía', () => {
  const e=entorno();
  e.V.__v55={jugadores:()=>[]};
  delete e.V.__v60;
  e.V.net.conns=new Map();
  vm.runInContext(script('v60-sala'),e.ctx);
  assert.equal(e.V.__v60.roster().length,0);
});
test('Probable permite desempatar entre los empatados sin puntuar ni aceptar votos antiguos', () => {
  const e=entorno(); vm.runInContext(script('v63-probable'),e.ctx);
  const p=e.V.__v63; p.empezar();
  const ronda=p.estado().ronda;
  p.votar(0,0); p.votar(1,1); p.votar(2,2); p.cerrar();
  assert.equal(p.desempatar(),true);
  assert.equal(p.estado().ronda,ronda+1);
  e.acciones['pr:']('pr:v:'+ronda+':1',{slot:0});
  assert.equal(Object.keys(p.estado().votos).length,0);
  // En este primer empate participan los tres.
  p.votar(0,0); p.votar(1,1); p.votar(2,1); p.cerrar();
  assert.equal(p.estado().resultado.top[0],1);
  assert.equal(e.premios(),0);
  p.empezar(); p.votar(0,0); p.votar(1,1); p.cerrar(); p.desempatar();
  assert.equal(p.votar(2,2).ok,false,'no se vota a alguien fuera del empate');
  assert.equal(p.votar(2,1).ok,true);
});
test('El Dial respeta las parejas elegidas, no el orden de conexión', () => {
  const jugadores=[
    {id:'a',slot:0,nombre:'Ana'}, {id:'b',slot:1,nombre:'Luis'},
    {id:'c',slot:0,nombre:'María'}, {id:'d',slot:1,nombre:'José'}
  ];
  const V={__v55:{jugadores:()=>jugadores},__v60:{},settings:{gameMode:'servidor'},gameOf:()=> 'dial',RENDER:{}};
  const document={readyState:'loading',addEventListener(){},getElementById(){return null},querySelector(){return null}};
  const ctx=vm.createContext({window:{V14:V},document,state:{activeTeamIdx:0},setTimeout(){},setInterval(){}});
  vm.runInContext(script('v66-dial'),ctx);
  assert.deepEqual(Array.from(V.__v66.parejas(),p=>[p.a.nombre,p.b&&p.b.nombre]),[['Ana','María'],['Luis','José']]);
  assert.equal(V.__v66.puedeEmpezar().ok,true);
  jugadores.splice(2,2);
  assert.equal(V.__v66.puedeEmpezar().ok,false,'dos personas en equipos separados no forman pareja');
});
test('Ranking usa criterios con datos y fuente y rechaza acciones viejas o ajenas', () => {
  const e=entorno();e.ctx.URL=URL;e.S.juego=()=> 'ranking';
  e.S.turno=()=>{};e.S.telefono=()=>true;
  e.S.Marcador=class {nuevaRonda(){} poner(){return {ok:true}}};
  e.V.net.conns=new Map();
  e.V.__v67.elegir=(_id,pool,validar)=>pool.find(validar);
  vm.runInContext(script('v61-ranking'),e.ctx);
  const r=e.V.__v61, banco=r.banco();
  assert.equal(banco.length,30);
  assert.ok(banco.every(x=>r.valida(x)&&x.fuente.startsWith('https://')));
  const radios={'Júpiter':69911,'Saturno':58232,'Urano':25362,'Neptuno':24622,'Tierra':6371,'Venus':6052,'Marte':3390,'Mercurio':2440};
  const orbital={'Mercurio':1,'Venus':2,'Tierra':3,'Marte':4,'Júpiter':5,'Saturno':6,'Urano':7,'Neptuno':8};
  const atomico={'Hidrógeno':1,'Helio':2,'Litio':3,'Berilio':4,'Boro':5,'Carbono':6,'Nitrógeno':7,'Oxígeno':8,'Flúor':9,'Neón':10};
  for(const tarjeta of banco){const datos=tarjeta.title.startsWith('Radio')?radios:tarjeta.title.startsWith('Planetas')?orbital:atomico;tarjeta.items.forEach((item,i)=>assert.equal(tarjeta.valores[i],datos[item]));}
  assert.equal(r.valida({title:'Mejor pizza',items:['A','B']}),false);
  r.empezar();const primera=r.estado().ronda;
  const rec={id:'a',slot:0,online:true,conn:{open:true}};e.V.net.conns.set('a',rec);
  let sc={};e.pantallas.ranking(sc,0);assert.equal(sc.actions.length,5);
  e.acciones['ran:'](`ran:pon:${primera}:0`,{...rec});
  sc={};e.pantallas.ranking(sc,0);assert.equal(sc.actions.length,5,'rechaza conexión falsificada');
  e.acciones['ran:'](`ran:pon:${primera}:0`,rec);
  sc={};e.pantallas.ranking(sc,0);assert.equal(sc.actions.length,4);
  r.empezar();e.acciones['ran:'](`ran:pon:${primera}:0`,rec);
  sc={};e.pantallas.ranking(sc,0);assert.equal(sc.actions.length,5,'rechaza ronda anterior');
});
test('Las ilustraciones de los juegos conservan la imagen correspondiente', () => {
  const original=fs.readFileSync('recuperacion/actual-original.html','utf8');
  function arte(doc){return JSON.parse(doc.match(/<script id="v14-art">window\.VART = (.*?);<\/script>/s)[1]);}
  const antes=arte(original), actual=arte(html);
  assert.equal(actual.verdad,antes.ranking);
  assert.equal(actual.ranking,antes.verdad);
  assert.equal(actual.impostor,antes.probable);
  assert.equal(actual.probable,antes.impostor);
  for(const id of ['dial','tabu','yonunca','trivia','cadena','precio','personaje']) assert.equal(actual[id],antes[id]);
});
