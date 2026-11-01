import { Workspace } from "@/components/Workspace";

export default function Page() {
  return (
    <>
      <header className="site-header">
        <div className="site-header__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#e2a458" strokeWidth="1.6">
                <path d="M4 17a8 8 0 0 1 16 0" />
                <path d="M12 17l4.2-5.4" strokeLinecap="round" />
                <circle cx="12" cy="17" r="1.4" fill="#e2a458" stroke="none" />
              </svg>
            </span>
            <div>
              <div className="brand__name">Umbral</div>
              <div className="brand__tag">Análisis multimodelo de texto</div>
            </div>
          </div>
          <div className="header-spacer" />
          <div className="header-stats">
            <span className="chip chip--teal">
              <span className="dot" /> 15 analizadores propios
            </span>
            <span className="chip">4 capas: estadística · lingüística · ML · comercial</span>
            <span className="chip chip--amber">Sin almacenamiento de texto</span>
          </div>
        </div>
      </header>

      <main className="shell">
        <section className="hero">
          <div className="hero__eyebrow">Arquitectura híbrida · prioridad español</div>
          <h1>
            Estudia las señales del texto.
            <br />
            <em>No adivines al autor.</em>
          </h1>
          <p>
            Umbral ejecuta analizadores estadísticos, medidas lingüísticas, un clasificador entrenado y detectores
            comerciales por separado, y después agrega sus señales por familias metodológicas. Cada módulo declara su
            metodología, sus fórmulas, sus límites y su estado de validación.
          </p>
          <div className="principle">
            <strong>Principio científico.</strong> Una previsibilidad alta no demuestra autoría por inteligencia
            artificial; una previsibilidad baja tampoco demuestra autoría humana. Umbral describe características del
            texto y no conoce con certeza quién lo escribió. La probabilidad conjunta solo aparecería si existiera un
            agregador calibrado con datos etiquetados; hoy no existe y se declara como tal.
          </div>
        </section>

        <div className="layout">
          <Workspace />
        </div>

        <footer className="site-footer">
          <p>
            <strong style={{ color: "var(--paper-dim)" }}>Privacidad.</strong> El texto se procesa en memoria durante la
            petición y no se almacena. Los proveedores externos solo reciben texto con autorización explícita, por
            proveedor, y con retención cero cuando el proveedor lo permite.
          </p>
          <p>
            <strong style={{ color: "var(--paper-dim)" }}>Límites declarados.</strong> Los analizadores propios son en su
            mayoría métodos no validados contra corpus etiquetados. Los detectores comerciales declaran su propia
            precisión, que no se ha replicado de forma independiente en este proyecto.
          </p>
          <p className="mono" style={{ fontSize: 11.5 }}>
            Umbral · v0.1.0 · Next.js + TypeScript · agregador por bloques metodológicos · sin base de datos
          </p>
        </footer>
      </main>
    </>
  );
}
