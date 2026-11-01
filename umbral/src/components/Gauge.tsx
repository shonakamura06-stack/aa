"use client";

interface GaugeProps {
  value: number | null;
  band: "bajo" | "medio" | "alto" | "no calculable";
  range: [number, number] | null;
}

/**
 * Indicador semicircular del compuesto heurístico.
 * Con `value === null` no se dibuja aguja ni se inventa una cifra: se muestra
 * «no calculable» y el motivo lo aporta el panel contiguo.
 */
export function Gauge({ value, band, range }: GaugeProps) {
  if (value === null) {
    return (
      <div className="gauge">
        <div className="metric-card__value" style={{ fontSize: 22, color: "var(--paper-dim)" }}>
          No calculable
        </div>
        <div className="metric-card__note" style={{ marginTop: 6 }}>
          Sin base suficiente (longitud o número de grupos independientes).
        </div>
      </div>
    );
  }
  const radius = 52;
  const circumference = Math.PI * radius;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  const color = band === "alto" ? "#d4735a" : band === "medio" ? "#e2a458" : "#6fbbaa";
  return (
    <div className="gauge">
      <svg width="128" height="76" viewBox="0 0 128 76" role="img" aria-label={`Índice de señales ${value} de 100, banda ${band}`}>
        <path
          d="M 12 66 A 52 52 0 0 1 116 66"
          fill="none"
          stroke="#1d2426"
          strokeWidth="9"
          strokeLinecap="round"
        />
        <path
          d="M 12 66 A 52 52 0 0 1 116 66"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${circumference * pct} ${circumference}`}
        />
        <text x="64" y="58" textAnchor="middle" fill="#ebe6db" fontFamily="Iowan Old Style, Georgia, serif" fontSize="27">
          {value}
        </text>
        <text x="64" y="72" textAnchor="middle" fill="#8c948f" fontFamily="ui-monospace, monospace" fontSize="9" letterSpacing="1">
          /100
        </text>
      </svg>
      <div>
        <div className="gauge__band">
          Intensidad en banda <strong style={{ color }}>{band}</strong>
          <small>
            {range
              ? `Dispersión observada entre grupos: ${range[0]}–${range[1]} (no es intervalo de confianza)`
              : "Sin dispersión estimable con un solo grupo"}
          </small>
        </div>
      </div>
    </div>
  );
}
