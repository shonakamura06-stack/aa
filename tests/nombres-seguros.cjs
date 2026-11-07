'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
test('Los nombres de participantes se muestran como texto, no como HTML', {timeout:30000},async()=>{
 const b=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});const p=await b.newPage();
 try{await p.addInitScript(()=>{window.f=()=>{window.ejecuciones=(window.ejecuciones||0)+1};localStorage.setItem('sintonia.tour.v45',JSON.stringify({at:Date.now()}))});await p.goto('http://127.0.0.1:8000/');await p.locator('#v21-boot').waitFor({state:'hidden'});await p.locator('#v40-welcome [data-v40="local"]').click();
 const nombre='<svg/onload=f()>', nombre2='" onfocus="f()';for(const n of [nombre,nombre2]){await p.locator('#v40-local-nombre').fill(n);await p.locator('#v40-local-form button').click()};await p.locator('#v40-sala-jugar').click();
 assert.deepEqual(await p.evaluate(()=>V14.G().teams.map(t=>t.name)),[nombre,nombre2]);assert.equal(await p.locator('.hub-team-name svg').count(),0,'el nombre no debe crear elementos SVG');assert.equal(await p.locator('.hub-team-name').first().textContent(),nombre);
 await p.evaluate(()=>renderManageTeamsList());assert.equal(await p.locator('#manage-teams-list-box input').first().inputValue(),nombre);assert.equal(await p.locator('#manage-teams-list-box input').nth(1).inputValue(),nombre2);assert.equal(await p.locator('#manage-teams-list-box input').nth(1).getAttribute('onfocus'),null);assert.equal(await p.locator('#manage-teams-list-box svg').count(),0);
 assert.equal(await p.evaluate(()=>window.ejecuciones||0),0);
 }finally{await b.close()}
});
