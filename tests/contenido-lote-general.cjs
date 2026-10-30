'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
const primero=require('../contenido/lote-general-01.json');
const segundo=require('../contenido/lote-general-02.json');
const lote=Object.fromEntries(Object.keys(primero).map(k=>[k,primero[k].concat(segundo[k])]));

test('El lote General está integrado, no duplica al sincronizar y no se repite tras recargar',{timeout:40000},async()=>{
  const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
  try{
    const p=await b.newPage();
    await p.goto('http://127.0.0.1:8000/?entrada=off');
    await p.waitForFunction(()=>window.V14?.__v67&&V14.__v43api);
    const resultado=await p.evaluate(lote=>{
      V14.__v43api.aplicar('general');
      const filas=Object.entries(lote).map(([juego,items])=>{
        const d=V14.__v67.destino(juego,'general');
        const claves=new Set(d.pool.map(x=>V14.__v67.clave(x)));
        const presentes=items.filter(x=>claves.has(V14.__v67.clave(x))).length;
        const validas=items.filter(x=>d.validar(x)).length;
        const leidas=[];
        for(let i=0;i<items.length;i++)leidas.push(V14.__v67.sacar(d.id,items));
        return {juego,total:d.pool.length,presentes,validas,leidas:new Set(leidas.map(x=>V14.__v67.clave(x))).size,agotada:V14.__v67.sacar(d.id,items)===null,picante:V14.__v43api.banco(juego,'spicy').length};
      });
      V14.__v43api.aplicar('general');
      filas.forEach(f=>f.totalTrasSincronizar=V14.__v67.destino(f.juego,'general').pool.length);
      return filas;
    },lote);
    for(const f of resultado){
      assert.equal(f.presentes,50,JSON.stringify(f));
      assert.equal(f.validas,50,JSON.stringify(f));
      assert.equal(f.leidas,50,JSON.stringify(f));
      assert.equal(f.agotada,true,JSON.stringify(f));
      assert.equal(f.picante,0,JSON.stringify(f));
      assert.equal(f.totalTrasSincronizar,f.total,JSON.stringify(f));
    }
    await p.reload();
    await p.waitForFunction(()=>window.V14?.__v67&&V14.__v43api);
    const agotadas=await p.evaluate(lote=>Object.entries(lote).map(([juego,items])=>{const d=V14.__v67.destino(juego,'general');return V14.__v67.sacar(d.id,items)===null}),lote);
    assert.deepEqual(agotadas,[true,true,true,true,true]);
  }finally{await b.close()}
});
