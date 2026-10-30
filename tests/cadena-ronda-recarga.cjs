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

test('Una frase atrasada de Historia no se acepta tras recargar al anfitrión',{timeout:90000},async()=>{
  const server=fork(path.join(__dirname,'fixtures','senal-local.cjs'),{stdio:['ignore','ignore','inherit','ipc']});
  const port=await new Promise((resolve,reject)=>{server.once('message',resolve);server.once('error',reject)});
  let b;
  try{
    b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--no-zygote','--single-process','--disable-dev-shm-usage']});
    const host=await b.newPage();await host.goto('http://127.0.0.1:8000/?entrada=off');await host.waitForTimeout(1200);await host.evaluate(senalLocal,port);
    await host.evaluate(()=>{V14.settings.gameMode='servidor';V14.net.host()});
    await host.waitForFunction(()=>V14.net.status==='open',null,{timeout:10000});const code=await host.evaluate(()=>V14.net.code),players=[];
    for(const [n,ip] of [['Ana','127.0.0.2'],['Luis','127.0.0.3']]){
      const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await ctx.newPage();
      await p.goto('http://'+ip+':8000/?mando&sala='+code);await p.waitForTimeout(700);await p.evaluate(senalLocal,port);
      await p.locator('#rm-name').fill(n);await p.locator('#rm-enter').click();
      await p.waitForFunction(()=>V14.net._debugRemote().joined||getComputedStyle(document.querySelector('#rm-pick')).display!=='none',null,{timeout:10000});
      if(!await p.evaluate(()=>V14.net._debugRemote().joined)){await p.waitForFunction(()=>V14.net._debugRemote().slot!=null,null,{timeout:10000});await p.locator('#rm-ready').click()}
      await p.waitForFunction(()=>V14.net._debugRemote().joined,null,{timeout:10000});players.push(p);
    }
    await host.waitForFunction(()=>V14.__v55.jugadores().length===2,null,{timeout:10000});
    await host.evaluate(()=>{V14.settings.onboarded.cadena=true;V14.openGame('cadena');V14.__v59.empezar()});
    await host.waitForFunction(()=>V14.gameOf()==='cadena'&&V14.__v59.estado().fase==='escribir',null,{timeout:10000});
    const anterior=await host.evaluate(()=>V14.__v59.estado());await host.evaluate(()=>V14.saveSessionNow());
    await host.reload({waitUntil:'domcontentloaded'});await host.evaluate(senalLocal,port);
    await host.waitForFunction(c=>V14.net.status==='open'&&V14.net.code===c,code,{timeout:20000});
    await host.waitForFunction(()=>V14.__v55.jugadores().length===2,null,{timeout:20000});
    await players[0].waitForFunction(()=>V14.net._debugRemote().joined&&V14.net._debugRemote().conn?.open,null,{timeout:15000});
    await host.evaluate(()=>{V14.settings.onboarded.cadena=true;V14.openGame('cadena');V14.__v59.empezar()});
    await host.waitForFunction(()=>V14.gameOf()==='cadena'&&V14.__v59.estado().fase==='escribir',null,{timeout:10000});
    const actual=await host.evaluate(()=>V14.__v59.estado());
    assert.equal(actual.slot,anterior.slot);assert.equal(actual.turno,anterior.turno);
    await players[0].evaluate(c=>V14.net._debugRemote().conn.send({t:'secrettext',v:'Texto que pertenece a la ronda anterior',round:c.ronda,turn:c.turno}),anterior);
    await host.waitForTimeout(400);
    assert.equal((await host.evaluate(()=>V14.__v59.estado())).frases.length,0,'la frase anterior no altera la historia nueva');
    await players[0].evaluate(c=>V14.net._debugRemote().conn.send({t:'secrettext',v:'La frase legítima de esta historia',round:c.ronda,turn:c.turno}),actual);
    await host.waitForFunction(()=>V14.__v59.estado().frases.length===1,null,{timeout:5000});
    assert.equal((await host.evaluate(()=>V14.__v59.estado())).frases[0].texto,'La frase legítima de esta historia');
  }finally{if(b)await b.close();if(server.exitCode===null&&server.signalCode===null)await new Promise(resolve=>{server.once('exit',resolve);server.kill('SIGTERM')})}
});
