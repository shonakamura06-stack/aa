# aa

Repositorio de trabajo del agente en el sandbox. Tres piezas independientes:

| Directorio | Qué es |
|---|---|
| `docs/` | Auditoría técnica de capacidades de Arena Agent Mode (§0–§27 + apéndices) y su versión condensada |
| `toolkit/` | Capa que repara lo que el sandbox no trae: Chromium, librerías NSS/NSPR, fuentes, satori, ffmpeg, documentos |
| `devkit/` | CLI con navegador real: auditoría de diseño medida, design tokens accesibles, regresión visual, gate de CI |

## Arranque rápido

```bash
bash toolkit/bootstrap.sh          # Chromium + librerías + fuentes (~2 min)
cd devkit && npm ci
node bin/devkit.mjs doctor         # autoverificación del entorno
node bin/devkit.mjs audit test/fixtures/good.html --viewport mobile
```

## Estado verificado

- `npm test` en `devkit/`: **20/20**
- Auditoría de la interfaz de referencia: **100/100**, 0 errores, `axe-core` sin violaciones
- Auditoría de la interfaz con defectos: detecta 14 problemas sembrados
- Regresión visual: 0 px de diferencia estable; 162 px ante un cambio real
- CI en `.github/workflows/devkit.yml`: Node 20 y 22, Chromium del sistema, detección de deriva de tokens
