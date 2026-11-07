const {test}=require('node:test');
const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_CORE||'playwright-core');
test('Importación revisa, guarda, conserva acentos y llega al banco real del Impostor', {timeout:45000}, async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try {
  await page.goto('http://127.0.0.1:8000/?entrada=off');await page.waitForTimeout(1600);if(await page.locator('#v40-skip').isVisible())await page.locator('#v40-skip').click();
  await page.evaluate(()=>openImporterModal());await page.locator('#im-game').selectOption('palabras');
  const raw='ÑANDÚXYZ | Aves | pista uno\nNANDUXYZ | Aves | pista dos\nÑANDÚXYZ | Mitología | pista tres\nÑANDÚXYZ | Aves | pista uno\nMALFORMADA\n';
  await page.locator('#im-text').fill(raw);assert.equal(await page.locator('#im-lines').innerText(),'1\n2\n3\n4\n5\n6');
  await page.locator('#im-insert').click();await page.waitForFunction(()=>document.querySelector('#im-status')?.textContent==='Listo para importar');
  assert.equal(await page.locator('#im-valid').innerText(),'3');assert.equal(await page.locator('#im-dups').innerText(),'1');assert.equal(await page.locator('#im-junk').innerText(),'1');assert.match(await page.locator('#im-totals').innerText(),/5 registros candidatos · 1 líneas vacías/);
  await page.locator('[data-tab="dups"]').click();assert.equal(await page.locator('#im-report tbody tr').count(),1);assert.match(await page.locator('#im-report tbody').innerText(),/ÑANDÚXYZ/);
  const download=page.waitForEvent('download');await page.locator('#im-export').click();const archivo=await download;assert.equal(archivo.suggestedFilename(),'informe-importacion.json');const stream=await archivo.createReadStream();let chunks=[];for await(const c of stream)chunks.push(c);const informe=JSON.parse(Buffer.concat(chunks).toString('utf8'));assert.equal(informe.totales.validas,3);assert.equal(informe.registros[0].line,1);
  await page.locator('#im-text').fill(raw+'OTRO | Otro | pista\n');assert.equal(await page.locator('#im-insert').innerText(),'Analizar datos');assert.equal(await page.locator('#im-export').isDisabled(),true);
  await page.locator('#im-text').fill(raw);await page.locator('#im-dup').uncheck();await page.locator('#im-insert').click();await page.waitForFunction(()=>document.querySelector('#im-status')?.textContent==='Listo para importar');assert.equal(await page.locator('#im-insert').isDisabled(),true);assert.match(await page.locator('#im-summary').innerText(),/bloquean/);
  await page.locator('#im-dup').check();await page.locator('#im-insert').click();await page.waitForFunction(()=>document.querySelector('#im-status')?.textContent==='Listo para importar');
  await page.locator('#im-insert').click();assert.equal(await page.locator('#im-status').innerText(),'Importación completada');
  const datos=await page.evaluate(()=>{const a=V14.__v67.importados('impostor:general:palabras');return {a,x:V14.__v67.sacar('impostor:general:palabras',[])};});assert.equal(datos.a.length,3);assert.ok(datos.x&&datos.a.some(x=>x.word===datos.x.word&&x.category===datos.x.category));
  await page.locator('[data-im="clear"]').click();assert.equal(await page.locator('#im-text').inputValue(),'');assert.equal((await page.evaluate(()=>V14.__v67.importados('impostor:general:palabras'))).length,3);
  await page.locator('#im-file').setInputFiles({name:'entrada.txt',mimeType:'text/plain',buffer:Buffer.from('ÁRBOLXYZ | Bosque | pista\r\n')});await page.waitForFunction(()=>document.querySelector('#im-text')?.value.includes('ÁRBOLXYZ'));
  await page.locator('#im-insert').click();await page.waitForFunction(()=>document.querySelector('#im-status')?.textContent==='Listo para importar');
  await page.evaluate(()=>{const o=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='sintonia:bolsa:impostor:general:palabras')throw Error('cuota simulada');return o.call(this,k,v)};window.__restaurarSetItem=()=>Storage.prototype.setItem=o;});
  await page.locator('#im-insert').click();assert.equal(await page.locator('#im-status').innerText(),'Error');assert.match(await page.locator('#im-message').innerText(),/No se pudo guardar/);assert.match(await page.locator('#im-text').inputValue(),/ÁRBOLXYZ/);await page.evaluate(()=>window.__restaurarSetItem());
  assert.equal((await page.evaluate(()=>V14.__v67.importados('impostor:general:palabras'))).length,3);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
test('Migración de historial legado conserva claves estructuradas y solo reinicia al pedirlo', {timeout:20000}, async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();try{await page.goto('http://127.0.0.1:8000/?entrada=off');const result=await page.evaluate(()=>{
  const v=V14.__v67,pref='sintonia:bolsa:';
  const fixtures=[{id:'test:migracion:texto',item:'Ñandú Azul',key:JSON.stringify('nandu azul')},{id:'test:migracion:array',item:['Árbol','Ñandú'],key:JSON.stringify(['arbol','nandu'])},{id:'test:migracion:objeto',item:{z:'Ñandú',a:['Árbol']},key:JSON.stringify({a:['arbol'],z:'nandu'})},{id:'test:migracion:palabra',item:{word:'ÑANDÚ',category:'Aves',hint:'Pico'},key:JSON.stringify('nandu')}];
  return fixtures.map(f=>{localStorage.setItem(pref+f.id,JSON.stringify({usados:{[f.key]:true},importados:[]}));const antes=v.restantes(f.id,[f.item]);const reinicio=v.reiniciar(f.id);const despues=v.restantes(f.id,[f.item]);const sacada=v.sacar(f.id,[f.item]);const agotada=v.restantes(f.id,[f.item]);return {antes,reinicio,despues,agotada,sacada};});
 });for(const x of result){assert.equal(x.antes,0);assert.equal(x.reinicio,true);assert.equal(x.despues,1);assert.ok(x.sacada);assert.equal(x.agotada,0);}}
 finally{await browser.close();}
});
