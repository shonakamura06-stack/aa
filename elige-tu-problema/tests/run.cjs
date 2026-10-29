#!/usr/bin/env node
/* Ejecuta todas las suites en orden y resume el resultado. */
const { spawnSync } = require('child_process');
const suites = ['content', 'flow', 'endings', 'daily', 'robustness', 'audit', 'sharecard'];
let failed = 0;
for (const suite of suites) {
  process.stdout.write('\n▶ ' + suite + '.test\n');
  const result = spawnSync(process.execPath, [require('path').join(__dirname, suite + '.test.cjs')], { stdio: 'inherit' });
  if (result.status !== 0) { failed++; console.log('✗ ' + suite + ' FALLÓ'); }
}
console.log('\n' + (failed ? '✗ ' + failed + ' suite(s) con fallos' : '✓ Todas las suites pasaron (' + suites.length + ')'));
process.exit(failed ? 1 : 0);
