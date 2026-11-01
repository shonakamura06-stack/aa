"use client";

import { useState } from "react";
import type { EngineAvailability, EngineMeta } from "@/lib/types";
import { EVIDENCE_LABEL, KIND_CLASS, KIND_LABEL, VALIDATION_LABEL } from "@/lib/ui/format";

export interface CatalogEntry {
  meta: EngineMeta;
  availability: EngineAvailability;
  provider: { id: string; configured: boolean; envKey: string; docsUrl: string; pricing: string; freeTier: string | null; spanishSupported: boolean; notes: string[]; supportsZeroRetention: boolean } | null;
}

interface Props {
  catalog: CatalogEntry[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onSelectAll: (on: boolean) => void;
  consent: Record<string, boolean>;
  onConsent: (provider: string, value: boolean) => void;
  externalEnabled: boolean;
}

const GROUPS: Array<{ key: "statistical" | "linguistic" | "ml" | "commercial"; label: string; hint: string }> = [
  { key: "statistical", label: "Analizadores estadísticos", hint: "Cálculos reproducibles sobre el texto. No dependen de red." },
  { key: "linguistic", label: "Analizadores lingüísticos", hint: "Medidas de superficie: sintaxis, puntuación, legibilidad, conectores." },
  { key: "ml", label: "Clasificador entrenado", hint: "Solo se activa si existe un modelo entrenado con datos licenciados." },
  { key: "commercial", label: "Detectores comerciales", hint: "Envían el texto a un tercero. Requieren clave, presupuesto y consentimiento." },
];

function groupOf(meta: EngineMeta): "statistical" | "linguistic" | "ml" | "commercial" {
  if (meta.kind === "trained-classifier") return "ml";
  if (meta.kind === "commercial") return "commercial";
  return meta.kind === "linguistic" ? "linguistic" : "statistical";
}

export function EngineCatalog({ catalog, selected, onToggle, onSelectAll, consent, onConsent, externalEnabled }: Props) {
  const [open, setOpen] = useState(false);
  const runnable = catalog.filter((e) => e.availability.status === "ready");

  return (
    <div className="card">
      <div className="card__head">
        <div style={{ flex: 1 }}>
          <h3 className="card__title">Configuración de motores</h3>
          <div className="card__sub">
            {runnable.length} de {catalog.length} disponibles ahora · {selected.size} seleccionados
          </div>
        </div>
        <button className="btn btn--sm btn--ghost" onClick={() => onSelectAll(true)}>
          Seleccionar propios
        </button>
        <button className="btn btn--sm btn--ghost" onClick={() => onSelectAll(false)}>
          Ninguno
        </button>
        <button className="btn btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Ocultar detalle" : "Ver detalle"}
        </button>
      </div>
      <div className="card__body">
        <div className="config-grid">
          {catalog.map((entry) => {
            const providerId = entry.meta.id.replace("commercial.", "");
            const unavailable = entry.availability.status !== "ready";
            const checked = selected.has(entry.meta.id);
            return (
              <div key={entry.meta.id} className="config-item">
                <div className="config-item__top">
                  <label>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle(entry.meta.id)}
                      aria-label={`Activar ${entry.meta.name}`}
                    />
                    <span>
                      <span style={{ fontSize: 13.5 }}>{entry.meta.name}</span>
                      <span className={`badge ${KIND_CLASS[entry.meta.kind]}`} style={{ marginLeft: 8 }}>
                        {KIND_LABEL[entry.meta.kind]}
                      </span>
                    </span>
                  </label>
                </div>
                <div className="config-item__meta">
                  <span className="mono">{entry.meta.id}</span> · v{entry.meta.version} · {entry.meta.languages.join("/")} ·{" "}
                  {VALIDATION_LABEL[entry.meta.validation]}
                </div>
                <div className="config-item__meta" style={{ color: unavailable ? "var(--clay)" : "var(--teal)" }}>
                  {entry.availability.status === "ready" ? "Disponible" : "No disponible"}: {entry.availability.detail}
                </div>
                {entry.meta.kind === "commercial" && entry.provider && providerId !== "mock" && (
                  <div style={{ marginTop: 8 }}>
                    <label className="inline" style={{ fontSize: 12 }}>
                      <input
                        type="checkbox"
                        checked={Boolean(consent[providerId])}
                        disabled={!externalEnabled}
                        onChange={(ev) => onConsent(providerId, ev.target.checked)}
                      />
                      Autorizar envío del texto a {entry.meta.name}
                    </label>
                    <div className="config-item__meta">
                      Retención cero: {entry.provider.supportsZeroRetention ? "soportada" : "no documentada"} ·{" "}
                      {entry.provider.pricing}
                    </div>
                  </div>
                )}
                {open && (
                  <details open style={{ marginTop: 10 }}>
                    <summary style={{ fontSize: 12, color: "var(--amber)" }}>Metodología y límites</summary>
                    <div className="config-item__meta" style={{ marginTop: 8 }}>
                      <strong style={{ color: "var(--paper-dim)" }}>{entry.meta.summary}</strong>
                      <p style={{ margin: "6px 0" }}>{entry.meta.methodology}</p>
                      <div>
                        <em>Fórmulas:</em>
                        <ul style={{ margin: "4px 0 6px", paddingLeft: 16 }}>
                          {entry.meta.formulas.map((f) => (
                            <li key={f.name}>
                              {f.name}: <span className="mono">{f.expression}</span>
                              {f.note ? ` — ${f.note}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="config-item__meta" style={{ marginTop: 6 }}>
                        Grupo de dependencia: <span className="mono">{entry.meta.dependenceCluster}</span> — los motores
                        del mismo grupo comparten un único voto en el compuesto.
                      </div>
                      {entry.meta.sharesVarianceWith && entry.meta.sharesVarianceWith.length > 0 && (
                        <div className="config-item__meta" style={{ marginTop: 6 }}>
                          <em>Comparte varianza con:</em>
                          <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                            {entry.meta.sharesVarianceWith.map((share) => (
                              <li key={share.engine}>
                                <span className="mono">{share.engine}</span> — {share.reason}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <div>
                        <em>Limitaciones:</em>
                        <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                          {entry.meta.limitations.map((l) => (
                            <li key={l}>{l}</li>
                          ))}
                        </ul>
                      </div>
                      {entry.meta.signalAnchors && (
                        <p style={{ marginTop: 6 }}>
                          Anclas de señal: <span className="mono">{entry.meta.signalAnchors.points.map((p) => `[${p[0]}→${p[1]}]`).join(" ")}</span> — {entry.meta.signalAnchors.rationale}
                        </p>
                      )}
                      {entry.meta.references && entry.meta.references.length > 0 && (
                        <p style={{ marginTop: 6 }}>Referencias: {entry.meta.references.join(" · ")}</p>
                      )}
                      <p style={{ marginTop: 6 }}>Evidencia máxima declarada: {EVIDENCE_LABEL[entry.meta.validation === "heuristic" ? "low" : "medium"]}</p>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
        <p className="config-item__meta" style={{ marginTop: 14 }}>
          Cada motor declara metodología, fórmulas, limitaciones y compatibilidad lingüística. Los grupos se muestran
          por naturaleza del módulo: analizador estadístico, lingüístico, clasificador entrenado o detector comercial.
        </p>
      </div>
    </div>
  );
}

export { GROUPS, groupOf };
