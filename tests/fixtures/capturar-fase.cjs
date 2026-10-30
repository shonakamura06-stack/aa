'use strict';
const fs=require('node:fs');
const path=require('node:path');
module.exports=async function capturar(page,nombre){
 if(!process.env.SINTONIA_EVIDENCIA)return;
 const dir=path.resolve(process.env.SINTONIA_EVIDENCIA);fs.mkdirSync(dir,{recursive:true});
 await page.screenshot({path:path.join(dir,nombre+'.png'),fullPage:false});
};
