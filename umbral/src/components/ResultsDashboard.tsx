"use client";

import { useMemo, useState } from "react";
import type { AnalysisResponse, EngineRun, SegmentScore } from "@/lib/types";
import type { CatalogEntry } from "./EngineCatalog";
import { Gauge } from "./Gauge";
import { EVIDENCE_LABEL, KIND_CLASS, KIND_LABEL, VALIDATION_LABEL, fmtDuration, fmtNumber } from "@/lib/ui/format";

interface Props {
  result: AnalysisResponse;
  catalog: CatalogEntry[];
}

const STATUS_LABEL: Record<EngineRun["status"], string> = {
  ok: "Completado",
  error: "Error",
  timeout: "Timeout",
  unavailable: "No disponible",
  skipped: "Omitido",
};

function ScoreBar({ value }: { value: number }) {
  return (
    <div className="mini-bar" title={`${Math.round(value * 100)} / 100`}>
      <span style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

export function ResultsDashboard({ result, catalog }: Props) {
  const [showAllEngines, setShowAllEngines] = useState(false);
  const metaById = useMemo(() => new Map(catalog.map((c) => [c.meta.id, c.meta])), [catalog]);
  const { aggregate, profile } = result;

  const sentenceRows = useMemo(() => {
    const source = result.engines.find((e) => e.id === "predictability.perplexity")?.segments
      ?? result.engines.find((e) => (e.segments?.length ?? 0) > 0)?.segments
      ?? [];
    const base = source.length > 0
      ? source
      : result.engines
          .flatMap((e) => e.segments ?? [])
          .slice(0, 0);
    const withScores = base.map((sentence) => {
      const others: Array<{ engineId: string; score: number }> = [];
      for (const run of result.engines) {
        if (!run.segments || run.id === "predictability.perplexity") continue;
        const match = run.segments.find(
          (s) => Math.abs(s.start - sentence.start) <= 4 || s.text.trim() === sentence.text.trim(),
        );
        if (match) others.push({ engineId: run.id, score: match.score });
      }
      return { ...sentence, others };
    });
    return withScores;
  }, [result.engines]);

  const enginesOk = result.engines.filter((e) => e.status === "ok");
  const enginesOther = result.engines.filter((e) => e.status !== "ok");
  const sortedEngines = showAllEngines ? [...enginesOk, ...enginesOther] : enginesOk;

  return (
    <section className="stack-16" style={{ marginTop: 26 }} aria-live="polite">
      {/* ---------- Resumen ---------- */}
      <div className="grid-4">
        <div className="metric-card">
          <div className="metric-card__label">Índice heurístico de rasgos</div>
          <Gauge value={aggregate.signalIndex} band={aggregate.signalBand} range={aggregate.signalRange} />
          <div className="metric-card__note">
            Compuesto heurístico 0–100. <strong>No es una probabilidad ni un porcentaje de autoría por IA.</strong>{" "}
            {aggregate.indexKind === "heuristic-composite" ? "Sin calibración." : ""}
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-card__label">Nivel de evidencia</div>
          <div className="metric-card__value" style={{ fontSize: 28 }}>
            {EVIDENCE_LABEL[aggregate.evidence.level]}
          </div>
          <ul className="engine-notes" style={{ marginTop: 10 }}>
            {aggregate.evidence.reasons.slice(0, 4).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
        <div className="metric-card">
          <div className="metric-card__label">Acuerdo entre motores</div>
          <div className="metric-card__value" style={{ fontSize: 24, color: "var(--paper-dim)" }}>
            No calculable
          </div>
          <div className="metric-card__note">{aggregate.agreement.reason}</div>
          {aggregate.dispersion.sd !== null && (
            <div className="metric-card__note">
              Dispersión descriptiva entre {aggregate.dispersion.groups} grupos:{" "}
              <span className="mono">σ = {aggregate.dispersion.sd.toFixed(3)}</span> ({aggregate.dispersion.spreadPoints} puntos).
              No es acuerdo ni acierto.
            </div>
          )}
        </div>
        <div className="metric-card">
          <div className="metric-card__label">Estimación de probabilidad</div>
          <div className="metric-card__value" style={{ fontSize: 18, lineHeight: 1.35, color: "var(--clay)" }}>
            No disponible
          </div>
          <div className="metric-card__note">{aggregate.probabilityMessage}</div>
        </div>
      </div>

      {/* ---------- Cobertura y avisos ---------- */}
      <div className="card">
        <div className="card__head">
          <h3 className="card__title">Qué se ejecutó realmente</h3>
          <div className="row" style={{ marginLeft: "auto", gap: 8 }}>
            <span className="chip chip--teal">
              <span className="dot" /> {aggregate.coverage.enginesRun} completados
            </span>
            <span className="chip">{aggregate.coverage.enginesUnavailable} no disponibles</span>
            <span className="chip">{aggregate.coverage.enginesFailed} con error</span>
            <span className="chip">{aggregate.coverage.enginesWithSignal} con intensidad calculada</span>
          </div>
        </div>
        <div className="card__body stack-8">
          <div className="kv" style={{ marginBottom: 8 }}>
            <dt>Idioma</dt>
            <dd>
              {profile.language === "unknown" ? "No determinado" : profile.language.toUpperCase()} · confianza{" "}
              {profile.languageConfidence} · {profile.languageMethod}
            </dd>
            <dt>Tipo de texto estimado</dt>
            <dd>{profile.contentType} (heurística de superficie)</dd>
            <dt>Longitud</dt>
            <dd>
              {profile.words} palabras · {profile.characters} caracteres · {profile.sentences} oraciones ·{" "}
              {profile.paragraphs} párrafos — {profile.lengthAssessment.message}
            </dd>
            <dt>Tiempo total</dt>
            <dd className="mono">{fmtDuration(result.timings.totalMs)} · motor {result.engineVersion}</dd>
            <dt>Proveedores externos contactados</dt>
            <dd>
              {result.privacy.externalProvidersContacted.length === 0
                ? "Ninguno"
                : result.privacy.externalProvidersContacted.join(", ")}
            </dd>
            <dt>Almacenamiento del texto</dt>
            <dd>{result.privacy.textRetained ? "Sí" : "No se almacena"}</dd>
          </div>
          {aggregate.warnings.length > 0 && (
            <div className="notice notice--clay">
              <strong>Advertencias.</strong>{" "}
              {aggregate.warnings.map((w) => (
                <span key={w}>· {w} </span>
              ))}
            </div>
          )}
          {aggregate.disagreements.length > 0 && (
            <div className="notice notice--amber">
              <strong>Desacuerdos entre metodologías.</strong> No se ocultan para producir un resultado más
              convincente:
              <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {aggregate.disagreements.map((d) => (
                  <li key={d.description}>{d.description}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Familias ---------- */}
      <div className="grid-2">
        <div className="card">
          <div className="card__head">
            <h3 className="card__title">Intensidad por grupo de dependencia</h3>
            <span className="chip chip--muted" style={{ marginLeft: "auto" }}>un grupo = un voto</span>
          </div>
          <div className="card__body">
            {aggregate.groups.length === 0 && (
              <p className="muted" style={{ fontSize: 13 }}>
                Ningún grupo aportó señal direccional utilizable en este análisis.
              </p>
            )}
            {aggregate.groups.map((f) => (
              <div className="family-bar" key={f.id}>
                <div className="family-bar__head">
                  <span>{f.label}</span>
                  <span className="mono">{f.signal === null ? "—" : `${Math.round(f.signal * 100)}/100`}</span>
                </div>
                <div className="family-bar__track">
                  <div className="family-bar__fill" style={{ width: `${Math.round((f.signal ?? 0) * 100)}%` }} />
                </div>
                <div className="family-bar__foot">
                  Peso relativo {f.weight.toFixed(2)} · {f.engines.join(", ")} · {f.note}
                </div>
              </div>
            ))}
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              Los motores que miden la misma variable subyacente comparten un único voto (dependencia declarada en cada
              motor, visible en el catálogo): añadir variantes del mismo cálculo no multiplica la influencia.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card__head">
            <h3 className="card__title">Cómo leer el resultado</h3>
          </div>
          <div className="card__body stack-8" style={{ fontSize: 13, color: "var(--paper-dim)", lineHeight: 1.65 }}>
            <p style={{ margin: 0 }}>
              El índice describe <strong>intensidad de patrones</strong> (uniformidad, repetición, previsibilidad,
              redundancia). Una puntuación elevada no demuestra autoría por IA; una puntuación baja no demuestra
              autoría humana.
            </p>
            <p style={{ margin: 0 }}>
              El nivel de evidencia describe cobertura metodológica —cuántos grupos independientes aportaron señal, con
              qué validación declarada y con cuánto texto—, no la probabilidad de haber acertado. Más motores no
              significan más fiabilidad.
            </p>
            <p style={{ margin: 0 }}>
              Los métodos propios son en su mayoría <strong>no validados</strong> contra un corpus etiquetado: sus anclas
              son explícitas y se publican en el panel de configuración.
            </p>
          </div>
        </div>
      </div>

      {/* ---------- Fragmentos ---------- */}
      {sentenceRows.length > 0 && (
        <div className="card">
          <div className="card__head">
            <h3 className="card__title">Análisis por oración</h3>
            <span className="chip chip--muted" style={{ marginLeft: "auto" }}>
              solo de motores que aportan puntuación por fragmento
            </span>
          </div>
          <div className="card__body" style={{ overflowX: "auto" }}>
            <table className="sentence-table">
              <thead>
                <tr>
                  <th style={{ width: 34 }}>#</th>
                  <th>Oración</th>
                  <th style={{ width: 120 }}>Previsibilidad</th>
                  <th style={{ width: 220 }}>Otros motores</th>
                </tr>
              </thead>
              <tbody>
                {sentenceRows.map((row, i) => (
                  <tr key={`${row.start}-${i}`}>
                    <td className="num muted">{i + 1}</td>
                    <td className="sentence-text">{row.text}</td>
                    <td>
                      <ScoreBar value={row.score} />
                    </td>
                    <td className="num">
                      {row.others.length === 0
                        ? "—"
                        : row.others.map((o) => `${o.engineId.replace("commercial.", "")} ${o.score.toFixed(2)}`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>
              La barra de previsibilidad es un percentil dentro del propio texto (1 = más previsible). No se distribuye
              la puntuación global de ningún motor entre las oraciones.
            </p>
          </div>
        </div>
      )}

      {/* ---------- Motores ---------- */}
      <div className="card">
        <div className="card__head">
          <h3 className="card__title">Resultados por motor</h3>
          <div className="card__sub" style={{ flex: 1 }}>
            {enginesOk.length} completados · {enginesOther.length} con otro estado
          </div>
          <button className="btn btn--sm btn--ghost" onClick={() => setShowAllEngines((v) => !v)}>
            {showAllEngines ? "Ocultar no ejecutados" : "Mostrar todos los estados"}
          </button>
        </div>
        <div className="card__body">
          <div className="engines-grid">
            {sortedEngines.map((run) => {
              const meta = metaById.get(run.id);
              return (
                <details className="engine-card" key={run.id}>
                  <summary className="engine-card__head">
                    <span className={`chip ${run.status === "ok" ? "chip--teal" : "chip--muted"}`}>
                      <span className="dot" /> {STATUS_LABEL[run.status]}
                    </span>
                    <span className="engine-card__name">{meta?.name ?? run.id}</span>
                    {meta && <span className={`badge ${KIND_CLASS[meta.kind]}`}>{KIND_LABEL[meta.kind]}</span>}
                    {run.simulated && <span className="badge badge--warn">SIMULADO</span>}
                    <span className="engine-card__id">{run.id}</span>
                    <span style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
                      {run.signal !== null && run.status === "ok" && (
                        <span className="chip chip--amber">señal {Math.round(run.signal * 100)}/100</span>
                      )}
                      <span className="mono muted" style={{ fontSize: 11 }}>{fmtDuration(run.durationMs)}</span>
                    </span>
                  </summary>
                  <div className="engine-card__body">
                    {meta && (
                      <dl className="kv">
                        <dt>Naturaleza</dt>
                        <dd>{KIND_LABEL[meta.kind]} · {VALIDATION_LABEL[meta.validation]}</dd>
                        <dt>Evidencia del resultado</dt>
                        <dd>{EVIDENCE_LABEL[run.evidence]}</dd>
                        <dt>Metodología</dt>
                        <dd>{meta.methodology}</dd>
                        <dt>Idiomas</dt>
                        <dd>{meta.languages.join(", ")} · mínimo {meta.minWords} palabras</dd>
                        <dt>Limitaciones</dt>
                        <dd>{meta.limitations.join(" ")}</dd>
                        {meta.signalAnchors && (
                          <>
                            <dt>Anclas de señal</dt>
                            <dd>
                              <span className="mono">
                                {meta.signalAnchors.metric}: {meta.signalAnchors.points.map((p) => `[${p[0]}→${p[1]}]`).join(" ")}
                              </span>{" "}
                              — {meta.signalAnchors.rationale}
                            </dd>
                          </>
                        )}
                      </dl>
                    )}
                    {run.error && <div className="notice notice--clay"><strong>Error:</strong> {run.error}</div>}
                    {run.notes.length > 0 && (
                      <div>
                        <div className="metric-card__label">Notas</div>
                        <ul className="engine-notes">
                          {run.notes.map((n) => (
                            <li key={n}>{n}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {run.warnings.length > 0 && (
                      <div>
                        <div className="metric-card__label">Advertencias</div>
                        <ul className="engine-warnings">
                          {run.warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {run.metrics.length > 0 && (
                      <table className="metric-table">
                        <thead>
                          <tr>
                            <th>Métrica</th>
                            <th>Valor</th>
                            <th>Lectura</th>
                          </tr>
                        </thead>
                        <tbody>
                          {run.metrics.map((m) => (
                            <tr key={m.key}>
                              <td>{m.label}</td>
                              <td className="num">{fmtNumber(m.value, m.unit)}</td>
                              <td className="desc">{m.interpretation ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {(run.segments?.length ?? 0) > 0 && (
                      <p className="muted" style={{ fontSize: 12 }}>
                        Aporta {run.segments!.length} puntuaciones por fragmento
                        {meta?.segmentUnit ? ` (${meta.segmentUnit})` : ""}. Se muestran en la tabla de oraciones.
                      </p>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      </div>

      {/* ---------- Editorial ---------- */}
      <div className="card">
        <div className="card__head">
          <h3 className="card__title">Mejora editorial</h3>
          <span className="chip chip--muted" style={{ marginLeft: "auto" }}>módulo independiente del detector</span>
        </div>
        <div className="card__body">
          <div className="notice notice--teal" style={{ marginBottom: 14 }}>
            {result.editorial.disclaimer}
          </div>
          {result.editorial.suggestions.length === 0 && (
            <p className="muted" style={{ fontSize: 13 }}>
              No se detectaron patrones que merezcan una recomendación editorial en este texto.
            </p>
          )}
          {result.editorial.suggestions.map((s) => (
            <div className="suggestion" key={s.id}>
              <div className="suggestion__head">
                <span className="badge">{s.category}</span>
                <span className={`badge ${s.severity === "alta" ? "badge--warn" : ""}`}>prioridad {s.severity}</span>
              </div>
              <div className="suggestion__msg">{s.message}</div>
              {s.excerpt && <blockquote className="suggestion__quote">«{s.excerpt}»</blockquote>}
              <div className="suggestion__advice">{s.advice}</div>
            </div>
          ))}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 12.5, lineHeight: 1.7 }}>
        {result.privacy.note} Los resultados describen características del texto; Umbral no conoce ni declara quién lo
        escribió.
      </p>
    </section>
  );
}
