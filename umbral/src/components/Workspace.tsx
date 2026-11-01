"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnalysisResponse, EngineRun } from "@/lib/types";
import { SAMPLES } from "@/lib/samples";
import { EngineCatalog, type CatalogEntry } from "./EngineCatalog";
import { ResultsDashboard } from "./ResultsDashboard";
import { EVIDENCE_LABEL } from "@/lib/ui/format";

type Phase = "idle" | "running" | "done" | "error";

interface ProviderInfo {
  id: string;
  name: string;
  configured: boolean;
  envKey: string;
  docsUrl: string;
  pricing: string;
  freeTier: string | null;
  spanishSupported: boolean;
  notes: string[];
  supportsZeroRetention: boolean;
  quota: { requests: number; charsSent: number; charBudget: number; remainingBudget: number; authorized: boolean };
}

function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)?/gu);
  return matches ? matches.length : 0;
}

export function Workspace() {
  const [text, setText] = useState("");
  const [language, setLanguage] = useState<"auto" | "es" | "en">("auto");
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [externalEnabled, setExternalEnabled] = useState(false);
  const [allowExternal, setAllowExternal] = useState(false);
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<Phase>("idle");
  const [runs, setRuns] = useState<Record<string, EngineRun>>({});
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [enginesResponse, providersResponse] = await Promise.all([
          fetch("/api/engines"),
          fetch("/api/providers"),
        ]);
        const enginesBody = await enginesResponse.json();
        const providersBody = await providersResponse.json();
        if (cancelled) return;
        const entries: CatalogEntry[] = enginesBody.engines;
        setCatalog(entries);
        setProviders(providersBody.providers ?? []);
        setExternalEnabled(Boolean(providersBody.externalSendingEnabled));
        setSelected(new Set(entries.filter((e) => e.availability.status === "ready").map((e) => e.meta.id)));
      } catch {
        if (!cancelled) setError("No se pudo cargar el catálogo de motores.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const words = useMemo(() => countWords(text), [text]);
  const ownCount = catalog.filter((e) => e.meta.kind !== "commercial" && e.meta.kind !== "trained-classifier").length;
  const configuredProviders = providers.filter((p) => p.configured).length;

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(
    (on: boolean) => {
      if (!on) {
        setSelected(new Set());
        return;
      }
      setSelected(new Set(catalog.filter((e) => e.availability.status === "ready").map((e) => e.meta.id)));
    },
    [catalog],
  );

  const handleConsent = useCallback((provider: string, value: boolean) => {
    setConsent((prev) => ({ ...prev, [provider]: value }));
  }, []);

  const analyze = useCallback(async () => {
    if (words === 0 || phase === "running") return;
    setPhase("running");
    setRuns({});
    setResult(null);
    setError(null);
    setNotice(null);
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const response = await fetch("/api/analyze/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          text,
          language,
          engines: [...selected],
          allowExternal,
          externalConsent: consent,
          includeEditorial: true,
        }),
      });
      if (!response.ok || !response.body) {
        const payload = await response.json().catch(() => ({ message: "Error desconocido" }));
        throw new Error(payload.message ?? `Error ${response.status}`);
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let finished = false;
      while (!finished) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          const eventLine = lines.find((l) => l.startsWith("event:"));
          const dataLine = lines.find((l) => l.startsWith("data:"));
          if (!eventLine || !dataLine) continue;
          const event = eventLine.slice(6).trim();
          const data = JSON.parse(dataLine.slice(5).trim());
          if (event === "engine") {
            const run = data as EngineRun;
            setRuns((prev) => ({ ...prev, [run.id]: run }));
          } else if (event === "complete") {
            setResult(data as AnalysisResponse);
            setPhase("done");
            finished = true;
            setNotice(null);
          } else if (event === "error") {
            setError(data.message ?? "El análisis falló.");
            setPhase("error");
            finished = true;
          }
        }
      }
      if (!finished) {
        setPhase((p) => (p === "running" ? "done" : p));
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        setPhase("idle");
        setNotice("Análisis cancelado en el cliente. Los motores propios no envían nada a terceros.");
      } else {
        setError((err as Error).message);
        setPhase("error");
      }
    } finally {
      abortRef.current = null;
    }
  }, [allowExternal, consent, language, phase, selected, text, words]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setText("");
    setResult(null);
    setRuns({});
    setPhase("idle");
    setError(null);
    setNotice(null);
  }, []);

  const exportJson = useCallback(() => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `umbral-${result.id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [result]);

  const selectedList = [...selected];
  const completed = Object.keys(runs).length;

  useEffect(() => {
    if (phase === "done" && resultsRef.current) {
      resultsRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [phase]);

  return (
    <>
      <section className="composer card" aria-label="Área de texto">
        <div className="card__head">
          <div style={{ flex: 1 }}>
            <h2 className="card__title">Texto a analizar</h2>
            <div className="card__sub">
              Se procesa en memoria. No se guarda ni se envía a terceros salvo autorización explícita.
            </div>
          </div>
          <span className="chip chip--muted">{words} palabras</span>
          <span className="chip chip--muted">{text.length} caracteres</span>
        </div>
        <div className="card__body">
          <textarea
            className="composer__textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'Pega o escribe el texto. Ejemplo: «La detección de texto generado automáticamente plantea un problema metodológico antes que técnico…»'}
            aria-label="Texto a analizar"
            spellCheck={false}
          />
          <div className="composer__meta">
            <span>Palabras <strong>{words}</strong></span>
            <span>Caracteres <strong>{text.length}</strong></span>
            <span>Oraciones <strong>{Math.max(0, (text.match(/[.!?…]+(?=\s|$)/g) ?? []).length)}</strong></span>
            <span className="muted">
              {words === 0
                ? "Sin texto"
                : words < 80
                  ? "Texto corto: la evidencia será baja"
                  : words < 200
                    ? "Longitud limitada: resultados orientativos"
                    : "Longitud adecuada para analizadores estadísticos"}
            </span>
          </div>

          <div className="controls">
            <select value={language} onChange={(e) => setLanguage(e.target.value as "auto" | "es" | "en")} aria-label="Idioma">
              <option value="auto">Detección automática de idioma</option>
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>
            <button className="btn btn--primary" onClick={analyze} disabled={phase === "running" || words < 3}>
              {phase === "running" ? "Analizando…" : "Analizar"}
            </button>
            {phase === "running" && (
              <button className="btn btn--ghost" onClick={cancel}>
                Cancelar
              </button>
            )}
            <button className="btn" onClick={clear} disabled={phase === "running"}>
              Limpiar
            </button>
            <select
              onChange={(e) => {
                const sample = SAMPLES.find((s) => s.id === e.target.value);
                if (sample) {
                  setText(sample.text);
                  setLanguage(sample.language);
                }
                e.currentTarget.selectedIndex = 0;
              }}
              defaultValue=""
              aria-label="Cargar ejemplo"
            >
              <option value="" disabled>
                Cargar ejemplo…
              </option>
              {SAMPLES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
            <span className="chip chip--muted" style={{ marginLeft: "auto" }}>
              {selected.size} motores seleccionados
            </span>
          </div>

          {configuredProviders > 0 && (
            <div className="notice" style={{ marginTop: 14 }}>
              <label className="inline">
                <input type="checkbox" checked={allowExternal} onChange={(e) => setAllowExternal(e.target.checked)} />
                Autorizar el envío del texto a proveedores externos configurados
              </label>
              <div style={{ fontSize: 12, marginTop: 6 }}>
                Sin esta autorización ningún texto sale del servidor. Marca además cada proveedor en la configuración de
                motores. {configuredProviders} proveedor(es) con clave en el servidor.
              </div>
            </div>
          )}

          {phase === "running" && (
            <div>
              <div className="progress-bar" role="progressbar" aria-valuemin={0} aria-valuemax={selected.size} aria-valuenow={completed}>
                <div className="progress-bar__fill" style={{ width: `${selected.size ? (completed / selected.size) * 100 : 0}%` }} />
              </div>
              <div className="engine-list" style={{ marginTop: 12 }}>
                {selectedList.map((id) => {
                  const run = runs[id];
                  const status = run ? run.status : "pending";
                  return (
                    <div
                      className={`engine-row ${run ? (run.status === "ok" ? "engine-row--ok" : "engine-row--error") : "engine-row--running"}`}
                      key={id}
                    >
                      <span className={run ? "" : "spinner"} aria-hidden>
                        {run ? (run.status === "ok" ? "✓" : "!") : ""}
                      </span>
                      <span>
                        <span className="engine-row__id">{id}</span>{" "}
                        <span className="muted" style={{ fontSize: 12 }}>
                          {catalog.find((c) => c.meta.id === id)?.meta.name}
                        </span>
                      </span>
                      <span className={`engine-row__status status-${run ? (run.status === "ok" ? "ok" : "error") : "running"}`}>
                        {run ? (run.status === "ok" ? `${Math.round(run.durationMs)} ms` : run.status) : "en cola"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {notice && <div className="notice notice--amber" style={{ marginTop: 14 }}>{notice}</div>}
          {error && (
            <div className="notice notice--clay" style={{ marginTop: 14 }}>
              <strong>Error:</strong> {error}
            </div>
          )}
        </div>
      </section>

      <div style={{ marginTop: 22 }}>
        <EngineCatalog
          catalog={catalog}
          selected={selected}
          onToggle={toggle}
          onSelectAll={selectAll}
          consent={consent}
          onConsent={handleConsent}
          externalEnabled={externalEnabled}
        />
      </div>

      {result && (
        <div ref={resultsRef}>
          <ResultsDashboard result={result} catalog={catalog} />
          <div className="row" style={{ marginTop: 18 }}>
            <button className="btn" onClick={exportJson}>
              Exportar informe JSON
            </button>
            <button className="btn btn--ghost" onClick={clear}>
              Analizar otro texto
            </button>
            <span className="chip chip--muted">
              Evidencia {EVIDENCE_LABEL[result.aggregate.evidence.level]} · {result.aggregate.coverage.enginesRun} motores
            </span>
          </div>
        </div>
      )}

      <div className="notice" style={{ marginTop: 22 }}>
        <strong>Motores propios disponibles:</strong> {ownCount} analizadores locales sin red.{" "}
        <strong>Proveedores externos:</strong> {configuredProviders === 0 ? "ninguno configurado" : `${configuredProviders} configurados`}.
        El clasificador entrenado permanece deshabilitado hasta disponer de un dataset licenciado y evaluación fuera de
        muestra.
      </div>
    </>
  );
}
