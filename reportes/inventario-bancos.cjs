// Ejecutar con servidor local y las dependencias descritas en AUDITORIA-SINTONIA.md.
// No modifica bancos ni cuenta importaciones guardadas en perfiles ajenos.
'use strict';
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});try{const page=await browser.newPage();await page.goto(process.env.SINTONIA_URL||'http://127.0.0.1:8000/?entrada=off');await page.waitForFunction(()=>window.V14?.__v67&&V14.__v43api);const rows=await page.evaluate(()=>{
  const casos=['dial','verdad','reto','tabu','palabras','probable','yonunca','cadena','ranking','trivia','personaje'].map(j=>[j,'general']).concat(['bo','latam','mx','ar','es','us'].map(p=>['precio',p+':general']));
  return casos.map(([juego,variante])=>{const d=V14.__v67.destino(juego,variante);const validas=d.pool.filter(x=>{try{return d.validar(x)}catch{return false}});const claves=new Set(validas.map(x=>V14.__v67.clave(x)));return {juego,variante,id:d.id,total:d.pool.length,validas:validas.length,unicas:claves.size,duplicadas:validas.length-claves.size,invalidas:d.pool.length-validas.length}});
});
const objetivos={reto:1000,cadena:1000,yonunca:1000,probable:1000,palabras:1000};
for(const row of rows){row.objetivo=objetivos[row.juego]||null;row.faltanEstructurales=row.objetivo===null?null:Math.max(0,row.objetivo-row.unicas)}
const sumaPorBanco=rows.reduce((n,r)=>n+r.unicas,0);
console.log(JSON.stringify({nota:'Bancos base activos; validez estructural según la API actual, no revisión humana ni inventario de importaciones. La suma cuenta mercados y conjuntos por separado y no deduplica entre bancos.',objetivoGlobal:12000,sumaPorBanco,diferenciaMinimaBajoEstaConvencion:Math.max(0,12000-sumaPorBanco),filas:rows},null,2));}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
