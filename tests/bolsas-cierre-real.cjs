'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
test('El historial de cada banco sobrevive al cierre y reapertura del navegador',{timeout:60000},async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sintonia-bolsas-'));const opts={executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']};let ctx;
 try{
  ctx=await chromium.launchPersistentContext(dir,opts);let p=ctx.pages()[0]||await ctx.newPage();await p.goto('http://127.0.0.1:8000/?entrada=off');await p.waitForFunction(()=>window.V14?.__v67&&V14.__v43api);
  const primero=await p.evaluate(()=>['dial','palabras','verdad','reto','tabu','probable','yonunca','cadena','ranking','trivia','personaje'].map(j=>{const d=V14.__v67.destino(j,'general');const antes=V14.__v67.restantes(d.id,d.pool),x=V14.__v67.sacar(d.id,d.pool);return {j,id:d.id,antes,clave:V14.__v67.clave(x),despues:V14.__v67.restantes(d.id,d.pool),picante:V14.__v43api.banco(j,'spicy').length}}));
  for(const r of primero){assert.ok(r.antes>0,JSON.stringify(r));assert.equal(r.despues,r.antes-1,JSON.stringify(r));assert.equal(r.picante,0,JSON.stringify(r))}
  await ctx.close();ctx=null;
  ctx=await chromium.launchPersistentContext(dir,opts);p=ctx.pages()[0]||await ctx.newPage();await p.goto('http://127.0.0.1:8000/?entrada=off');await p.waitForFunction(()=>window.V14?.__v67&&V14.__v43api);
  const despues=await p.evaluate(filas=>filas.map(r=>{const d=V14.__v67.destino(r.j,'general');const restantes=V14.__v67.restantes(d.id,d.pool);const first=d.pool.find(x=>V14.__v67.clave(x)===r.clave);return {id:d.id,restantes,elegidaDisponible:V14.__v67.sacar(d.id,[first])!==null}}),primero);
  for(const [i,r] of despues.entries()){assert.equal(r.id,primero[i].id);assert.equal(r.restantes,primero[i].despues);assert.equal(r.elegidaDisponible,false,JSON.stringify(r))}
 }finally{if(ctx)await ctx.close();fs.rmSync(dir,{recursive:true,force:true})}
});
