#!/usr/bin/env bash
# Verificación completa: tipos, pruebas, build y comprobación de endpoints.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "== 1/4 TypeScript estricto =="
npx tsc --noEmit

echo "== 2/4 Pruebas automatizadas =="
npx vitest run

echo "== 3/4 Build de producción =="
npm run build

echo "== 4/4 Comprobación de endpoints (servidor efímero) =="
PORT=3123 npx next start -H 127.0.0.1 -p 3123 &
SERVER_PID=$!
trap 'kill $SERVER_PID 2>/dev/null || true' EXIT
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3123/api/health >/dev/null; then break; fi
  sleep 1
done

echo "-- health --"
curl -sf http://127.0.0.1:3123/api/health | head -c 400; echo
echo "-- engines --"
curl -sf http://127.0.0.1:3123/api/engines | python3 -c "
import json,sys
d=json.load(sys.stdin)
sin=[e['meta']['id'] for e in d['engines'] if not e['meta'].get('dependenceCluster')]
print(d['count'],'motores,',d['ownAnalyzers'],'propios, sin grupo de dependencia:',len(sin))
sys.exit(1 if sin else 0)"
echo "-- analyze --"
curl -sf http://127.0.0.1:3123/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"text":"La ciudad amaneció con niebla y el mercado abrió antes de lo previsto. Los vendedores discutían el precio del pan mientras un perro dormía entre las cajas. Nadie parecía tener prisa, salvo la mujer que contaba monedas en silencio. Al mediodía la niebla se fue y con ella la calma."}' \
  | python3 -c "
import json,sys
d=json.load(sys.stdin); a=d['aggregate']
assert a['probability'] is None, 'la probabilidad debe ser null'
assert a['authorshipConclusion'] is None, 'no debe haber veredicto de autoría'
assert a['agreement']['score'] is None, 'el acuerdo no debe ser numérico'
assert 'hash' not in json.dumps(d.get('text', {})), 'no debe exponerse una huella del texto'
print('indice',a['signalIndex'],a['signalBand'],'evidencia',a['evidence']['level'],'acuerdo',a['agreement']['label'],'motores_ok',a['coverage']['enginesRun'])"

echo "-- cuerpo de 3 MB (se espera 413) --"
python3 -c "print('{\"text\":\"' + 'a'*3000000 + '\"}')" > /tmp/umbral-big.json
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:3123/api/analyze \
  -H 'Content-Type: application/json' --data-binary @/tmp/umbral-big.json)
rm -f /tmp/umbral-big.json
echo "HTTP $CODE"
test "$CODE" = "413" || { echo "FALLO: se esperaba 413 y se obtuvo $CODE"; exit 1; }

echo "OK: verificación completa"
