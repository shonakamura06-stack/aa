'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {fork}=require('node:child_process');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');

function senalLocal(port){
  const Orig=window.Peer;
  window.Peer=function(id,opts){
    let o;
    if(typeof id==='string')o=opts||{};
    else{o=id||{};id=undefined}
    o=Object.assign({},o,{host:'127.0.0.1',port,path:'/signal',secure:false,config:{iceServers:[]}});
    return id?new Orig(id,o):new Orig(o);
  };
  window.Peer.prototype=Orig.prototype;
}

test('Tres mandos emulados excluyen al anfitrión y rechazan asientos inválidos',{timeout:80000},async()=>{
  const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});
  const port=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject)});
  let b;
  try{
    b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
    const host=await b.newPage();
    await host.goto('http://127.0.0.1:8000/?entrada=off');
    await host.waitForTimeout(1200);
    await host.evaluate(senalLocal,port);
    await host.evaluate(()=>{V14.settings.gameMode='servidor';V14.net.host()});
    await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});
    const code=await host.evaluate(()=>V14.net.code),players=[];
    for(const [n,ip] of [['Ana','127.0.0.2'],['Luis','127.0.0.3'],['María','127.0.0.4']]){
      const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const p=await ctx.newPage();
      await p.goto('http://'+ip+':8000/?mando&sala='+code);
      await p.waitForTimeout(700);
      await p.evaluate(senalLocal,port);
      await p.locator('#rm-name').fill(n);
      await p.locator('#rm-enter').click();
      await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});
      if(!await p.evaluate(()=>V14.net._debugRemote().joined)){
        await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});
        await p.locator('#rm-ready').click();
      }
      try{await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000})}
      catch(e){
        console.log('Error al entrar',n,await p.evaluate(()=>({joined:V14.net._debugRemote().joined,slot:V14.net._debugRemote().slot,pick:getComputedStyle(document.querySelector('#rm-pick')).display})),await host.evaluate(()=>Array.from(V14.net.conns.values()).map(r=>({name:r.name,slot:r.slot,pid:!!r.pid,online:r.online}))));
        throw e;
      }
      players.push(p);
    }
    await host.waitForFunction(()=>V14.__v55.jugadores().length===3,null,{timeout:10000});
    assert.deepEqual((await host.evaluate(()=>V14.__v55.jugadores().map(x=>x.nombre))).sort(),['Ana','Luis','María'].sort());
    const original=await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').slot);
    for(const invalido of [999,-1,1.5,'1']){
      await players[0].evaluate(slot=>V14.net._debugRemote().conn.send({t:'seat',slot}),invalido);
      await host.waitForTimeout(150);
      assert.equal(await host.evaluate(()=>Array.from(V14.net.conns.values()).find(r=>r.name==='Ana').slot),original,'el servidor rechaza un asiento inválido: '+invalido);
    }
    await host.evaluate(()=>V14.openGame('dial'));
    await host.waitForFunction(()=>V14.__v33api.estado()?.abierto,null,{timeout:10000});
    assert.equal(await host.evaluate(()=>V14.__v33api.arrancar()),false,'tres personas no pueden iniciar Dial sin parejas completas');
    assert.equal(await host.evaluate(()=>V14.gameOf()),'hub');
  }finally{
    if(b)await b.close();
    if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')});
  }
});
