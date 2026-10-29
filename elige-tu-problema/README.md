# ELIGE TU PROBLEMA

**Dos opciones. Mil consecuencias absurdas.**

Juego web casual de dilemas absurdos: dos problemas, una elección y una consecuencia que no pediste. Al final, tus decisiones —no la suerte— determinan qué tipo de leyenda del caos eres.

- Un único archivo: **`index.html`** (HTML + CSS + JS nativos, sin dependencias).
- Funciona sin conexión y sin servidores: todo el contenido está dentro del archivo.
- Progreso en `localStorage`; sin cuentas, sin registro, sin datos personales.
- Preparado para publicarse tal cual en Netlify.

---

## 1. Estado actual

| Elemento | Estado |
|---|---|
| Juego completo (inicio → dilema → consecuencia → final) | ✅ Implementado y probado |
| 66 dilemas originales, 10 categorías, 10 finales | ✅ Implementado y validado |
| Modalidades rápida (5), normal (10), larga (20) | ✅ Implementado y probado |
| Reto del día determinista (fecha local) | ✅ Implementado y probado |
| Colección, estadísticas e historial local | ✅ Implementado y probado |
| Compartir nativo, copiar resumen, tarjeta PNG | ✅ Implementado y probado (lógica) |
| Guardado robusto y tolerancia a fallos | ✅ Implementado y probado |
| Páginas de privacidad, acerca y contacto | ✅ Implementado, con datos pendientes marcados |
| Espacios publicitarios y estructura AdSense | ✅ Estructura lista, **sin anuncios activos** |
| Publicación en Netlify | ⏳ Pendiente: no hay credenciales de Netlify en este entorno |
| Verificación visual en navegador real | ⏳ Pendiente: el entorno de trabajo no dispone de navegador gráfico |

Detalle de pruebas y resultados: [`PRUEBAS.md`](PRUEBAS.md).

---

## 2. Cómo abrirlo

**Local:** abre `index.html` con doble clic o arrástralo a cualquier navegador moderno. No necesita servidor.

**Servidor local opcional** (para comprobar rutas con `file://` restringido):

```bash
cd elige-tu-problema
python3 -m http.server 8000
# http://localhost:8000
```

---

## 3. Publicar en Netlify

El sitio no tiene compilación: Netlify solo tiene que servir el archivo.

### Opción A · Arrastrar y soltar (la más rápida)
1. Entra en <https://app.netlify.com/drop> con tu cuenta.
2. Arrastra **la carpeta `elige-tu-problema`** (o un ZIP con `index.html`, `robots.txt` y `netlify.toml` en la raíz).
3. Netlify publica el sitio y te da una URL `https://<nombre>.netlify.app`.
4. Comprueba la URL publicada antes de difundirla.

### Opción B · Repositorio Git (recomendada para mantener el proyecto)
1. En Netlify: **Add new site → Import an existing project** y conecta el repositorio de GitHub.
2. Configuración del sitio:
   - **Base directory:** `elige-tu-problema`
   - **Build command:** *(vacío)*
   - **Publish directory:** `.`
3. Despliega. `netlify.toml` ya incluye esas opciones y cabeceras de seguridad básicas.
4. Cada `git push` a la rama publicada volverá a desplegar el sitio.

### Opción C · Netlify CLI
```bash
npm install -g netlify-cli
netlify login
cd elige-tu-problema
netlify deploy --dir . --prod
```

### Después de publicar
- Sustituye `CONFIG.siteUrl` por tu dominio final dentro de `index.html` para que los resúmenes compartidos enlacen al sitio.
- Si añades un dominio propio, actualiza `robots.txt` con la línea `Sitemap:` cuando tengas `sitemap.xml`.
- No hay credenciales ni secretos en el proyecto: no hay nada que proteger en el repositorio.

---

## 4. Configuración (`CONFIG`, al principio del `<script>`)

```js
const CONFIG = {
  version: 1,
  storageKey: 'etp:v1',
  contactEmail: '',          // correo real de contacto (déjalo vacío si no existe)
  policyUpdated: '2026-10-29',
  siteUrl: '',               // dominio final; vacío = URL actual
  owner: '',                 // nombre o marca del responsable legal
  country: '',               // país del responsable
  showAdPlaceholders: true,  // marcadores honestos de «espacio publicitario»
  ads: { enabled: false, provider: 'adsense', client: '', slots: { left: '', right: '', bottom: '' }, ... }
};
```

- **Rellenar `contactEmail`, `owner` y `country`** hace que las páginas de Contacto y Privacidad sustituyan automáticamente los avisos «pendiente de completar».
- `showAdPlaceholders: false` oculta por completo los espacios publicitarios (clase `ads-off` en el `<body>`).

---

## 5. Contenido: cómo ampliarlo

Los dilemas están en el arreglo `DILEMMAS` (se rellena en varias llamadas a `DILEMMAS.push(...)` para mantenerlo legible). Cada dilema:

```js
{ id:'d67', cat:'cotidiana', abs:1,
  a:{ t:'Texto de la opción A',
      d:{ chaos:8, luck:-4, prestige:2 },
      c:{ title:'Titular de la consecuencia',
          text:'Consecuencia cómica, concreta y original.' } },
  b:{ t:'Texto de la opción B',
      d:{ wit:10, shame:6 },
      c:{ title:'Otro titular', text:'Otra consecuencia distinta.' } } }
```

Reglas:
- `id`: único, formato `dNN` (`d67`, `d68`…). Un test lo verifica.
- `cat`: una de las claves de `CATEGORIES` (`cotidiana`, `trabajo`, `tecnologia`, `poder`, `dinero`, `sociales`, `cosmicos`, `animales`, `imposibles`, `caos`).
- `abs`: 1 a 3 (nivel de absurdo mostrado como puntos).
- `d`: deltas de atributos. Claves válidas: `chaos`, `luck`, `prestige`, `wit`, `shame`, `survival`. Valores entre −20 y 20; el juego limita el total a 0–100.
- Cada opción debe tener consecuencia propia (no reutilizar textos).

Al arrancar, el juego ejecuta `validateContent()`: avisa en consola si hay ids duplicados, categorías inexistentes, atributos inválidos o textos incompletos. También está expuesto en `window.ETP.validateContent()`.

### Añadir o cambiar finales
`ENDINGS` define, para cada final, `name`, `emoji`, `tagline`, `desc`, tres frases (`quotes`), unos `weights` por atributo y una afinidad por categorías (`cats`). El cálculo:

1. Se calcula, para cada dilema de la partida, la media de las dos opciones (línea base) y su dispersión.
2. Se mide cuánto se ha desviado cada atributo respecto a esa línea base: la **forma** de tus decisiones.
3. Se compara esa forma con la firma (`weights`) de cada final mediante similitud de coseno.
4. Se suma un pequeño bonus por explorar una categoría más de lo que le toca por azar.
5. Se añade un desempate minúsculo y determinista derivado de las decisiones.

Consecuencia: las mismas decisiones dan siempre el mismo final; decisiones distintas producen finales distintos. En las pruebas de simulación (2000 partidas) se alcanzan los 10 finales.

---

## 6. Estado del juego y guardado

Clave de `localStorage`: **`etp:v1`**.

```json
{
  "v": 1,
  "stats": { "games": 0, "answers": 0, "ends": {}, "cats": {}, "bestStreak": 0, "dailies": 0 },
  "history": [ { "date": "...", "mode": "normal", "endingId": "genio", "attrs": {}, "total": 10 } ],
  "daily": { "lastKey": null },
  "run": { "mode": "normal", "order": ["d01"], "idx": 0, "answers": [], "attrs": {}, "streak": 0, "completed": false }
}
```

- Se guarda la partida en curso en cada decisión: recargar o cambiar de pantalla no la reinicia.
- Al cargar, todo se sanea (`sanitizeState`): tipos incorrectos, ids desconocidos, índices incoherentes o partidas imposibles se descartan sin romper el juego.
- Si `localStorage` no está disponible o falla, el juego sigue funcionando en memoria y muestra un aviso honesto.
- «Borrar todo mi progreso» pide confirmación y elimina la clave.

---

## 7. Publicidad legítima: preparación y activación

**Ahora mismo no hay anuncios.** El código incluye:

- Raíles laterales reservados en escritorio (`data-ad-slot="left"` y `"right"`).
- Un espacio bajo el juego en móvil (`data-ad-slot="bottom"`).
- Marcadores visuales claramente etiquetados como «Espacio publicitario · Sin anuncios activos».
- `mountRealAds()`, que solo se ejecuta si `ads.enabled === true` **y** `ads.client` tiene formato válido `ca-pub-…`; inserta los `<ins class="adsbygoogle">` y carga el script oficial.

### Pasos para activar Google AdSense (requieren tu cuenta)
1. Crea una cuenta en <https://adsense.google.com> y añade el sitio (dominio ya publicado y accesible).
2. Espera la revisión de contenido. Para aumentar las probabilidades de aprobación, completa antes los datos legales pendientes (ver sección 8) y revisa la política de privacidad.
3. Cuando te asignen el identificador de editor, edita `CONFIG.ads`:
   ```js
   enabled: true,
   client: 'ca-pub-XXXXXXXXXXXXXXXX',   // tu ID real
   slots: { left: '1234567890', right: '1234567890', bottom: '1234567890' } // tus IDs reales
   ```
4. En el panel de AdSense, crea los bloques de anuncio y copia sus IDs. Sin IDs válidos, el código mantiene los marcadores y avisa en consola; no inventes identificadores.
5. Si tu tráfico incluye el Espacio Económico Europeo, Reino Unido o Suiza, configura una plataforma de consentimiento (CMP) certificada y actualiza la política de privacidad **antes** de activar anuncios.
6. Publica `ads.txt` en la raíz del dominio con la línea que te indique AdSense (`google.com, pub-XXXXXXXXXXXXXXXX, DIRECT, f08c47fec0942fa0`). No se ha creado un `ads.txt` ficticio.
7. Revisa que los espacios no tapen el juego ni estén pegados a los botones de elección (el diseño ya los separa).

### Lo que este proyecto no hace (a propósito)
- No inserta anuncios falsos ni marcadores que simulen ingresos.
- No bloquea el juego para obligar a ver anuncios.
- No usa ventanas emergentes, redirecciones ni recargas automáticas.
- No incita a hacer clic en anuncios.
- No afirma que la aprobación esté garantizada ni que existan ingresos.

---

## 8. Pendientes antes de un lanzamiento público

Estos datos **no se han inventado**; aparecen marcados en la interfaz como pendientes:

1. `CONFIG.owner`, `CONFIG.country` y `CONFIG.contactEmail` (responsable legal y contacto real).
2. Sustituir el canal temporal de contacto (issues de GitHub) por el correo definitivo cuando exista. Mientras no exista, el repositorio es el único canal operativo.
3. Revisar la política de privacidad con la fecha definitiva y el proveedor publicitario, si se activa.
4. Publicar en Netlify con tu cuenta y comprobar la URL resultante.
5. Verificación visual en navegadores reales (móvil y escritorio) y prueba de la descarga de la tarjeta PNG.
6. Añadir `sitemap.xml`/`ads.txt` cuando exista dominio definitivo.

---

## 9. Pruebas

Hay una batería automatizada opcional en `tests/` (Node + jsdom). No forma parte del sitio publicado.

```bash
cd tests
npm install        # instala jsdom (dependencia solo de desarrollo)
npm test
```

Las pruebas cubren contenido, flujo completo, finales, reto diario, robustez del guardado, auditoría de accesibilidad/publicidad y la tarjeta compartible. Resultados y limitaciones: [`PRUEBAS.md`](PRUEBAS.md).

Comprobaciones manuales rápidas recomendadas antes de publicar:
1. Abrir `index.html` en móvil y escritorio reales.
2. Jugar una partida de cada modalidad y llegar al resultado.
3. Recargar a mitad de partida y comprobar que se retoma.
4. Compartir y descargar la tarjeta (en móvil y escritorio).
5. Revisar la consola sin errores.
6. Comprobar que no aparece desplazamiento horizontal.
7. Verificar que los espacios publicitarios (vacíos) no tapan contenido.

---

## 10. Estructura

```
elige-tu-problema/
├── index.html      # sitio completo: HTML, CSS, JS, contenido y configuración
├── netlify.toml    # publicación estática + cabeceras
├── robots.txt
├── README.md
├── PRUEBAS.md
└── tests/          # pruebas opcionales de desarrollo (no se publican)
```

No hay `package.json` en la raíz, ni proceso de compilación, ni dependencias de ejecución.

---

## 11. Ideas para la siguiente versión

- Más dilemas por categoría y un modo «máximo absurdo».
- Reto semanal con semilla compartida (sin servidor, usando la fecha).
- Ampliar la tarjeta compartida con temas visuales desbloqueables.
- Pequeñas variaciones de consecuencia según la racha (siempre preescritas, nunca generadas al azar).
- Traducción a otros idiomas manteniendo el archivo único.
