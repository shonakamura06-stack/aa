// report.mjs — convierte resultados estructurados en Markdown legible y JSON estable.
const ICON = { error: '🔴', warning: '🟡', info: '🔵' };

export function renderMarkdown(result, { target, viewport = {}, lighthouse } = {}) {
  const vw = viewport.width ?? viewport.w ?? 0;
  const vh = viewport.height ?? viewport.h ?? 0;
  const { findings, summary, raw } = result;
  const L = [];
  L.push(`# Auditoría de diseño e interfaz`);
  L.push('');
  L.push(`**Objetivo:** \`${target}\`  `);
  L.push(`**Viewport:** ${vw}×${vh}  `);
  L.push(`**Fecha:** ${new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC  `);
  L.push(`**Puntuación del motor:** ${summary.score}/100`);
  L.push('');
  L.push(`| Métrica | Valor |`);
  L.push(`|---|---|`);
  L.push(`| Errores | ${summary.error} |`);
  L.push(`| Advertencias | ${summary.warning} |`);
  L.push(`| Observaciones | ${summary.info} |`);
  L.push(`| Elementos en el DOM | ${raw.counts.elements} |`);
  L.push(`| Elementos de texto | ${raw.counts.textNodes} |`);
  L.push(`| Controles interactivos | ${raw.counts.interactive} |`);
  L.push(`| Alto de página | ${raw.doc.scrollHeight}px (${(raw.doc.scrollHeight / Math.max(1, vh)).toFixed(1)} pantallas) |`);
  L.push(`| Ocupación visual | ${(raw.density.coverage * 100).toFixed(1)}% del área |`);
  L.push('');

  if (lighthouse) {
    L.push(`## Core Web Vitals (Lighthouse real)`);
    L.push('');
    L.push(`| Categoría | Puntuación |`);
    L.push(`|---|---|`);
    for (const [k, v] of Object.entries(lighthouse.scores)) L.push(`| ${k} | ${v === null ? 'n/d' : Math.round(v * 100)} |`);
    L.push('');
    if (lighthouse.metrics) {
      L.push(`| Métrica | Valor |`);
      L.push(`|---|---|`);
      for (const [k, v] of Object.entries(lighthouse.metrics)) L.push(`| ${k} | ${v} |`);
      L.push('');
    }
  }

  // Tipografía
  const sizes = Object.keys(raw.sizes).map((s) => ({ size: parseFloat(s), n: raw.sizes[s] })).filter((x) => x.size).sort((a, b) => b.size - a.size);
  L.push(`## Escala tipográfica medida`);
  L.push('');
  L.push(`| Tamaño | Usos |`);
  L.push(`|---:|---:|`);
  for (const s of sizes.slice(0, 14)) L.push(`| ${s.size}px | ${s.n} |`);
  L.push('');
  const fams = Object.entries(raw.fonts).sort((a, b) => b[1] - a[1]);
  L.push(`**Familias en uso:** ${fams.map(([f, n]) => `\`${f}\` (${n})`).join(' · ')}`);
  L.push('');

  // Hallazgos
  const order = { error: 0, warning: 1, info: 2 };
  const sorted = [...findings].sort((a, b) => order[a.severity] - order[b.severity]);
  L.push(`## Hallazgos`);
  L.push('');
  if (!sorted.length) L.push('_Sin hallazgos._');
  for (const f of sorted) {
    L.push(`### ${ICON[f.severity]} ${f.title}`);
    L.push('');
    L.push(`\`${f.area}\` · \`${f.id}\``);
    L.push('');
    L.push(f.detail);
    if (f.evidence) {
      L.push('');
      L.push('```');
      L.push(String(f.evidence).slice(0, 600));
      L.push('```');
    }
    L.push('');
  }
  return L.join('\n');
}

export function summarizeJson(result, meta = {}) {
  return {
    $schema: 'devkit/design-audit@1',
    generatedAt: new Date().toISOString(),
    ...meta,
    summary: result.summary,
    findings: result.findings,
    metrics: {
      fonts: result.raw.fonts,
      sizes: result.raw.sizes,
      spacing: result.raw.spacing.values,
      density: result.raw.density,
      doc: result.raw.doc,
      counts: result.raw.counts,
    },
  };
}
