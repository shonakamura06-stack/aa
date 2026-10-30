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

test('Solo el mando acusado puede tomar su decisión en Yo Nunca Nunca',{timeout:80000},async()=>{
  const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});
  const port=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject)});
  let b;
  try{
    b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
    const host=await b.newPage();
    await host.goto('http://127.0.0.1:8000/?entrada=off');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);
    await host.evaluate(()=>{V14.settings.gameMode='servidor';V14.net.host()});
    await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});
    const code=await host.evaluate(()=>V14.net.code),players=[];
    for(const [n,ip] of [['Ana','127.0.0.2'],['Luis','127.0.0.3']]){
      const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
      const p=await ctx.newPage();await p.goto('http://'+ip+':8000/?mando&sala='+code);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);
      await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();
      await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});
      if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}
      await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p);
    }
    await host.waitForFunction(()=>V14.__v55.jugadores().length===2,null,{timeout:10000});
    const slots=await host.evaluate(()=>Object.fromEntries(V14.__v55.jugadores().map(p=>[p.nombre,p.slot])));
    await host.evaluate(()=>{V14.settings.onboarded.yonunca=true;V14.openGame('yonunca')});
    await host.waitForFunction(()=>V14.gameOf()==='yonunca',null,{timeout:10000});
    await host.evaluate(()=>V14.__v62.empezar());
    await players[0].locator('#rm-actions [data-act^="yn:abrir:"]').click({timeout:8000});
    await host.waitForFunction(()=>V14.__v62.estado().fase==='votando',null,{timeout:5000});
    for(const p of players) await p.locator('#rm-actions [data-act^="yn:panel:"][data-act$=":'+slots.Ana+'"]').click({timeout:8000});
    await host.waitForFunction(()=>V14.__v62.estado().fase==='acusado',null,{timeout:5000});
    const antes=await host.evaluate(()=>({estado:V14.__v62.estado(),puntaje:V14.G().teams.map(x=>x.score)}));
    assert.equal(antes.estado.fase,'acusado');assert.equal(antes.estado.acusado,slots.Ana);
    await players[0].locator('#rm-actions [data-act^="yn:conf:"]').waitFor({state:'visible',timeout:8000});
    assert.equal(await players[1].locator('#rm-actions [data-act^="yn:conf:"]').count(),0);
    await players[1].evaluate(round=>V14.net._debugRemote().conn.send({t:'action',id:'yn:nego:'+round}),antes.estado.ronda);
    await host.waitForTimeout(400);
    assert.deepEqual(await host.evaluate(()=>({estado:V14.__v62.estado(),puntaje:V14.G().teams.map(x=>x.score)})),antes,'el mando de Luis no puede decidir por Ana');
    await players[0].locator('#rm-actions [data-act^="yn:conf:"]').click();
    await host.waitForFunction(()=>V14.__v62.estado().fase==='contexto',null,{timeout:5000});
    const contexto=await host.evaluate(()=>V14.__v62.estado());
    for(const id of ['yn:enviar:'+contexto.ronda,'yn:fin:'+contexto.ronda,'yn:enviar:'+(contexto.ronda-1),'yn:enviar']){
      await players[1].evaluate(id=>V14.net._debugRemote().conn.send({t:'action',id}),id);await host.waitForTimeout(200);
      assert.deepEqual(await host.evaluate(()=>V14.__v62.estado()),contexto,'solo Ana puede enviar su contexto');
    }
    for(const id of ['yn:enviar:'+(contexto.ronda-1),'yn:enviar']){
      await players[0].evaluate(id=>V14.net._debugRemote().conn.send({t:'action',id}),id);await host.waitForTimeout(200);
      assert.deepEqual(await host.evaluate(()=>V14.__v62.estado()),contexto,'el propio mando no puede usar acciones de otra ronda o sin ronda');
    }
    await players[0].locator('#rm-actions [data-act^="yn:enviar:"]').click({timeout:8000});
    await host.waitForFunction(()=>V14.__v62.estado().fase==='resultado',null,{timeout:5000});
    assert.equal(await host.evaluate(()=>V14.__v62.estado().cobrado),true);
  }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
