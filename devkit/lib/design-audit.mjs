// design-audit.mjs — recoge métricas REALES del DOM renderizado y las convierte en hallazgos.
// No usa heurísticas de "buena práctica": todo sale de getComputedStyle y getBoundingClientRect
// sobre el layout ya calculado por Chromium.
import { evaluatePair } from './color.mjs';
import { fontFaceCss } from './browser.mjs';

/** Función que corre dentro de la página. Debe ser autocontenida. */
const COLLECT = () => {
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  // Fondo efectivo: sube por los ancestros hasta uno opaco.
  const effectiveBg = (el) => {
    let node = el;
    const stack = [];
    while (node && node !== document.documentElement) {
      const bg = getComputedStyle(node).backgroundColor;
      if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        const a = (bg.match(/rgba?\([^)]*?,\s*([\d.]+)\)/) || [])[1];
        stack.push(bg);
        if (a === undefined || Number(a) >= 1) break;
      }
      node = node.parentElement;
    }
    return stack.length ? stack : ['rgb(255, 255, 255)'];
  };

  const all = [...document.querySelectorAll('body *')];
  const visible = all.filter(vis);

  // ---- tipografía ----
  const textEls = visible.filter(
    (el) => el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()),
  );
  const fonts = {};
  const sizes = {};
  const lineHeights = {};
  const samples = [];
  for (const el of textEls.slice(0, 4000)) {
    const cs = getComputedStyle(el);
    const fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    fonts[fam] = (fonts[fam] || 0) + 1;
    sizes[cs.fontSize] = (sizes[cs.fontSize] || 0) + 1;
    lineHeights[cs.lineHeight] = (lineHeights[cs.lineHeight] || 0) + 1;
    if (samples.length < 120) {
      samples.push({
        tag: el.tagName.toLowerCase(),
        cls: (el.className && String(el.className).slice(0, 60)) || '',
        text: el.textContent.trim().slice(0, 60),
        color: cs.color,
        bgs: effectiveBg(el),
        fontSize: parseFloat(cs.fontSize),
        fontWeight: Number(cs.fontWeight) || 400,
        lineHeight: cs.lineHeight,
        letterSpacing: cs.letterSpacing,
        family: fam,
        width: Math.round(el.getBoundingClientRect().width),
      });
    }
  }

  // ---- ritmo de espaciado ----
  const spacing = {};
  const pads = [];
  for (const el of visible.slice(0, 4000)) {
    const cs = getComputedStyle(el);
    for (const p of ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'marginTop', 'marginBottom', 'gap', 'rowGap', 'columnGap']) {
      const v = parseFloat(cs[p]);
      if (Number.isFinite(v) && v > 0) {
        spacing[v] = (spacing[v] || 0) + 1;
        pads.push(v);
      }
    }
  }

  // ---- contraste por par texto/fondo ----
  const pairs = samples.map((s) => ({ ...s }));

  // ---- objetivos táctiles ----
  const interactive = visible
    .filter((el) => el.matches('a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [role=button], [role=link]'))
    .map((el) => {
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 50),
        w: Math.round(r.width), h: Math.round(r.height),
      };
    });

  // ---- imágenes ----
  const imgs = [...document.images].filter(vis).map((img) => ({
    src: (img.currentSrc || img.src || '').slice(-70),
    alt: img.hasAttribute('alt') ? img.getAttribute('alt') : null,
    w: img.naturalWidth, h: img.naturalHeight,
    hasDims: img.hasAttribute('width') && img.hasAttribute('height') || !!img.style.aspectRatio,
    lazy: img.loading === 'lazy',
  }));

  // ---- estructura ----
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].filter(vis)
    .map((h) => ({ level: Number(h.tagName[1]), text: h.textContent.trim().slice(0, 50) }));
  const inputs = [...document.querySelectorAll('input,select,textarea')].filter(vis).map((i) => ({
    type: i.type, name: i.name || i.id || '',
    labeled: !!(i.labels && i.labels.length) || !!i.getAttribute('aria-label') || !!i.getAttribute('aria-labelledby') || !!i.getAttribute('placeholder'),
    placeholderOnly: !(i.labels && i.labels.length) && !i.getAttribute('aria-label') && !!i.getAttribute('placeholder'),
  }));

  // ---- layout / overflow ----
  const vw = window.innerWidth;
  const overflow = visible
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.right > vw + 1 || r.left < -1;
    })
    .slice(0, 20)
    .map((el) => ({
      tag: el.tagName.toLowerCase(),
      cls: String(el.className).slice(0, 50),
      right: Math.round(el.getBoundingClientRect().right),
      vw,
    }));

  const doc = {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    scrollHeight: document.documentElement.scrollHeight,
    horizontalScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  };

  // el foco se prueba con teclado real desde Puppeteer (ver probeFocus)
  const focus = {
    focusables: [...document.querySelectorAll('a[href],button,input,select,textarea,[tabindex]:not([tabindex="-1"])')].length,
  };

  // ---- densidad ----
  const rects = visible.map((el) => el.getBoundingClientRect());
  const area = rects.reduce((a, r) => a + r.width * r.height, 0);
  const pageArea = Math.max(1, doc.clientWidth * doc.scrollHeight);

  return {
    url: location.href,
    title: document.title,
    lang: document.documentElement.lang || null,
    viewport: { w: innerWidth, h: innerHeight },
    counts: { elements: all.length, textNodes: textEls.length, interactive: interactive.length },
    fonts, sizes, lineHeights, samples: pairs,
    spacing: { values: spacing, total: pads.length },
    interactive, imgs, headings, inputs, overflow, doc,
    focus,
    density: { coverage: Number((area / pageArea).toFixed(3)) },
    meta: {
      description: document.querySelector('meta[name=description]')?.content || null,
      viewportMeta: document.querySelector('meta[name=viewport]')?.content || null,
      h1: document.querySelectorAll('h1').length,
    },
  };
};

const px = (v) => parseFloat(v) || 0;

/** Convierte la recolección cruda en hallazgos clasificados por severidad. */
export function analyze(raw, { minTap = 44 } = {}) {
  const findings = [];
  const add = (severity, area, id, title, detail, evidence) =>
    findings.push({ severity, area, id, title, detail, evidence });

  // --- contraste ---
  const seen = new Set();
  for (const s of raw.samples) {
    const bg = s.bgs[s.bgs.length - 1];
    const ev = evaluatePair(s.color, bg, { fontSize: s.fontSize, bold: s.fontWeight >= 700 });
    if (!ev) continue;
    const key = `${s.color}|${bg}|${Math.round(s.fontSize)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!ev.wcag.pass) {
      add('error', 'contraste', 'contrast-wcag',
        `Contraste insuficiente ${ev.wcag.ratio}:1 (mín ${ev.wcag.min}:1)`,
        `Texto ${s.color} sobre ${bg} a ${s.fontSize}px${s.fontWeight >= 700 ? ' bold' : ''}. APCA Lc ${ev.apca.lc} → ${ev.apca.usage}.`,
        `"${s.text}" · <${s.tag}${s.cls ? '.' + s.cls.split(' ')[0] : ''}>`);
    } else if (Math.abs(ev.apca.lc) < 60) {
      add('warning', 'contraste', 'contrast-apca',
        `WCAG pasa pero APCA es bajo (Lc ${ev.apca.lc})`,
        `${ev.apca.usage}. Para texto de cuerpo conviene Lc ≥ 60.`,
        `"${s.text}" · <${s.tag}>`);
    }
  }

  // --- escala tipográfica ---
  const sizeList = Object.keys(raw.sizes).map(px).filter((n) => n > 0).sort((a, b) => a - b);
  const uniq = [...new Set(sizeList)];
  if (uniq.length > 8) {
    add('warning', 'tipografía', 'type-scale-too-many',
      `${uniq.length} tamaños de fuente distintos`,
      'Una escala coherente usa 5–7 pasos. Más pasos = jerarquía difusa.',
      uniq.join(', ') + ' px');
  }
  const ratios = uniq.slice(1).map((v, i) => +(v / uniq[i]).toFixed(2));
  const inconsistent = ratios.filter((r) => r < 1.08);
  if (inconsistent.length > 2) {
    add('warning', 'tipografía', 'type-scale-collisions',
      `${inconsistent.length} pares de tamaños casi idénticos`,
      'Pasos con ratio < 1.08 no se perciben como jerarquía distinta.',
      ratios.join(' · '));
  }
  if (!uniq.includes(16)) {
    add('info', 'tipografía', 'no-base-16',
      'No hay texto a 16px',
      'El cuerpo base 16px es el estándar de legibilidad y el default de los navegadores.',
      uniq.slice(0, 6).join(', '));
  }

  // --- familias ---
  const families = Object.entries(raw.fonts).sort((a, b) => b[1] - a[1]);
  if (families.length > 3) {
    add('warning', 'tipografía', 'too-many-families',
      `${families.length} familias tipográficas en uso`,
      'Más de 3 familias suele ser ruido visual, no diseño.',
      families.map(([f, n]) => `${f}(${n})`).join(', '));
  }

  // --- longitud de línea ---
  // caracteres por línea ≈ ancho / (tamaño × 0,5) para tipografía proporcional
  const cpl = (s) => s.width / (s.fontSize * 0.5);
  const long = raw.samples.filter((s) => s.tag === 'p' && s.text.length > 80 && cpl(s) > 90);
  if (long.length) {
    add('info', 'tipografía', 'measure-long',
      `${long.length} párrafos con medida muy ancha`,
      'Por encima de ~90 caracteres por línea el ojo pierde el retorno. Ideal 45–75.',
      `≈${Math.round(Math.max(...long.map(cpl)))} caracteres por línea`);
  }
  const narrow = raw.samples.filter((s) => s.tag === 'p' && s.text.length > 80 && cpl(s) < 30);
  if (narrow.length) {
    add('info', 'tipografía', 'measure-narrow',
      `${narrow.length} párrafos con medida muy corta`,
      'Por debajo de ~30 caracteres por línea el texto se fragmenta y se lee a saltos.',
      `≈${Math.round(Math.min(...narrow.map(cpl)))} caracteres por línea`);
  }

  // --- ritmo de espaciado ---
  const vals = Object.entries(raw.spacing.values)
    .map(([v, n]) => ({ v: px(v), n }))
    .filter((x) => x.v >= 2)
    .sort((a, b) => b.n - a.n);
  if (vals.length) {
    const odd = vals.filter((x) => x.n >= 3 && x.v % 4 !== 0);
    if (odd.length > 3) {
      add('warning', 'espaciado', 'spacing-no-grid',
        `${odd.length} valores de espaciado fuera de la retícula de 4px`,
        'Una retícula (4 u 8 px) produce alineación consistente entre componentes.',
        odd.slice(0, 8).map((o) => `${o.v}px×${o.n}`).join(', '));
    }
    if (vals.length > 14) {
      add('info', 'espaciado', 'spacing-scale-large',
        `${vals.length} valores distintos de espaciado`,
        'Una escala de 6–9 tokens es más mantenible y visualmente más calmada.',
        vals.slice(0, 10).map((o) => `${o.v}px`).join(', '));
    }
  }

  // --- objetivos táctiles ---
  const small = raw.interactive.filter((i) => i.w < minTap || i.h < minTap);
  if (small.length) {
    add('error', 'interacción', 'tap-targets',
      `${small.length} controles por debajo de ${minTap}×${minTap}px`,
      'WCAG 2.5.5 (AAA) pide 44×44. 2.5.8 (AA) pide 24×24 con separación.',
      small.slice(0, 8).map((s) => `<${s.tag}> ${s.w}×${s.h} "${s.label}"`).join(' | '));
  }
  const tiny = raw.interactive.filter((i) => i.w < 24 || i.h < 24);
  if (tiny.length) {
    add('error', 'interacción', 'tap-targets-aa',
      `${tiny.length} controles incumplen incluso el mínimo AA (24×24)`,
      'Riesgo real de toques erróneos en móvil.',
      tiny.slice(0, 5).map((s) => `${s.w}×${s.h}`).join(', '));
  }

  // --- imágenes ---
  const noAlt = raw.imgs.filter((i) => i.alt === null);
  if (noAlt.length) {
    add('error', 'contenido', 'img-alt',
      `${noAlt.length} imágenes sin atributo alt`,
      'Un alt="" es válido para decorativas; ausente es un fallo de accesibilidad.',
      noAlt.slice(0, 5).map((i) => i.src).join(', '));
  }
  const noDims = raw.imgs.filter((i) => !i.hasDims);
  if (noDims.length) {
    add('warning', 'rendimiento', 'img-dims',
      `${noDims.length} imágenes sin width/height`,
      'Sin dimensiones reservadas el navegador no puede reservar espacio → CLS.',
      noDims.slice(0, 5).map((i) => i.src).join(', '));
  }
  const broken = raw.imgs.filter((i) => i.w === 0 || i.h === 0);
  if (broken.length) {
    add('error', 'contenido', 'img-broken',
      `${broken.length} imágenes no cargaron`, 'Recurso roto o ruta inválida.', broken.map((i) => i.src).join(', '));
  }

  // --- encabezados ---
  if (!raw.headings.length) {
    add('error', 'estructura', 'no-headings', 'La página no tiene encabezados', 'Sin jerarquía semántica ni outline navegable.', '');
  } else {
    let prev = 0;
    for (const h of raw.headings) {
      if (prev && h.level > prev + 1) {
        add('warning', 'estructura', 'heading-skip',
          `Salto de nivel h${prev} → h${h.level}`,
          'Los saltos rompen la navegación por lectores de pantalla.',
          `"${h.text}"`);
        break;
      }
      prev = h.level;
    }
    if (raw.meta.h1 === 0) add('warning', 'estructura', 'no-h1', 'No hay h1', 'El documento necesita un título principal.', '');
    if (raw.meta.h1 > 1) add('warning', 'estructura', 'multi-h1', `${raw.meta.h1} etiquetas h1`, 'Un solo h1 por documento es la convención.', '');
  }

  // --- formularios ---
  const unlabeled = raw.inputs.filter((i) => !i.labeled && i.type !== 'submit' && i.type !== 'button');
  if (unlabeled.length) {
    add('error', 'accesibilidad', 'input-label',
      `${unlabeled.length} campos sin etiqueta`, 'Un placeholder no es una etiqueta accesible.',
      unlabeled.map((i) => `${i.type}:${i.name}`).join(', '));
  }

  // --- overflow ---
  if (raw.doc.horizontalScroll) {
    add('error', 'layout', 'h-scroll',
      'Scroll horizontal en el documento',
      `scrollWidth ${raw.doc.scrollWidth} > clientWidth ${raw.doc.clientWidth}. Rompe la percepción de "app".`,
      raw.overflow.slice(0, 4).map((o) => `<${o.tag}.${o.cls}> right=${o.right}`).join(' | '));
  } else if (raw.overflow.length) {
    add('warning', 'layout', 'overflow-elements',
      `${raw.overflow.length} elementos desbordan el viewport`,
      'Puede ser intencional (carrusel), pero suele ser un fallo de contención.',
      raw.overflow.slice(0, 4).map((o) => `<${o.tag}> ${o.right}px`).join(' | '));
  }

  // --- foco ---
  if (raw.focus?.probed > 0 && raw.focus.withFocusStyle === 0) {
    add('error', 'accesibilidad', 'no-focus',
      'Ningún elemento muestra indicador de foco',
      'Navegación por teclado imposible de seguir. Revisar outline:none sin reemplazo.',
      `${raw.focus.probed} elementos recorridos con Tab, ninguno muestra indicador`);
  }

  // --- orden de tabulación ---
  if (raw.focus?.stuck) {
    add('error', 'accesibilidad', 'focus-trap',
      'El foco no avanza al pulsar Tab',
      'Puede haber un foco atrapado o un elemento que intercepta la navegación.',
      `último foco: ${raw.focus.order.at(-1)?.tag} "${raw.focus.order.at(-1)?.label}"`);
  }
  const sinIndicador = raw.focus?.order?.filter((o) => !o.visible) ?? [];
  if (sinIndicador.length) {
    const grave = sinIndicador.length / raw.focus.order.length > 0.5;
    add(grave ? 'error' : 'warning', 'accesibilidad', 'focus-partial',
      `${sinIndicador.length} de ${raw.focus.order.length} controles sin indicador de foco al tabular`,
      'El indicador debe estar en todos, no solo en algunos.',
      sinIndicador.slice(0, 5).map((o) => `<${o.tag}> "${o.label}"`).join(' | '));
  }

  // --- meta ---
  if (!raw.meta.viewportMeta) {
    add('error', 'responsive', 'no-viewport-meta', 'Falta meta viewport',
      'Sin ella el móvil renderiza a 980px y hace zoom-out.', '');
  }
  if (!raw.meta.description) {
    add('warning', 'seo', 'no-meta-description', 'Falta meta description', 'Afecta al CTR en resultados de búsqueda.', '');
  }
  if (!raw.lang) {
    add('warning', 'accesibilidad', 'no-lang', 'Falta lang en <html>',
      'Los lectores de pantalla eligen la pronunciación con lang.', '');
  }

  const sev = { error: 0, warning: 0, info: 0 };
  for (const f of findings) sev[f.severity]++;
  const score = Math.max(0, 100 - sev.error * 10 - sev.warning * 3 - sev.info * 0.5);

  return { findings, summary: { ...sev, score: Math.round(score) }, raw };
}

/**
 * Recorre la página con Tab como un usuario de teclado y mide el indicador de foco real.
 * `element.focus()` no activa :focus-visible; el teclado sí. Además valida el orden de tabulación.
 */
export async function probeFocus(page, steps = 12) {
  const seq = [];
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el);
      const visible =
        (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) ||
        cs.boxShadow !== 'none' ||
        cs.textDecorationLine.includes('underline');
      return {
        tag: el.tagName.toLowerCase(),
        label: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 40),
        outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`,
        boxShadow: cs.boxShadow === 'none' ? 'none' : 'sí',
        visible,
      };
    });
    if (!info) break;
    seq.push(info);
  }
  const conIndicador = seq.filter((x) => x.visible).length;
  return {
    focusables: seq.length,
    probed: seq.length,
    withFocusStyle: conIndicador,
    order: seq,
    stuck: seq.length > 1 && seq[seq.length - 1].label === seq[0].label,
  };
}

/** Ejecuta la auditoría completa contra una URL/archivo. */
export async function auditTarget(page, target) {
  await page.addStyleTag({ content: fontFaceCss() }).catch(() => {});
  // Las métricas de texto dependen de la fuente realmente aplicada: sin esta espera,
  // la medida de línea oscila entre ejecuciones y el informe no es reproducible.
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  let raw = await page.evaluate(COLLECT);
  const focus = await probeFocus(page).catch(() => null);
  if (focus) raw = { ...raw, focus };
  return analyze(raw);
}
