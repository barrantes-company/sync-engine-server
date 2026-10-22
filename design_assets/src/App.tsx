import { useState, type ReactNode } from "react";

type WidgetId = "hero" | "comms" | "orbit" | "timeline" | "compact" | "contact";

type WidgetSpec = {
  id: WidgetId;
  name: string;
  format: string;
  focus: string;
  description: string;
};

const widgets: WidgetSpec[] = [
  {
    id: "hero",
    name: "Hero Clock",
    format: "4 × 2",
    focus: "Hora",
    description: "La hora domina la composición y la actividad queda en segundo plano.",
  },
  {
    id: "comms",
    name: "Comms Center",
    format: "4 × 2",
    focus: "Actividad",
    description: "Mensajes y llamadas tienen máxima visibilidad y acceso inmediato.",
  },
  {
    id: "orbit",
    name: "Sync Orbit",
    format: "2 × 2",
    focus: "Sincronización",
    description: "Una opción compacta centrada en el estado del motor de sincronización.",
  },
  {
    id: "timeline",
    name: "Daily Line",
    format: "4 × 2",
    focus: "Contexto",
    description: "Una lectura editorial de la fecha, hora y actividad reciente.",
  },
  {
    id: "compact",
    name: "Essential Bar",
    format: "4 × 1",
    focus: "Compacto",
    description: "La información indispensable en una barra de baja altura.",
  },
  {
    id: "contact",
    name: "Quick Contact",
    format: "4 × 2",
    focus: "Conversación",
    description: "Prioriza el último mensaje sin perder el estado general de Sync Engine.",
  },
];

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 4.8h14a2.2 2.2 0 0 1 2.2 2.2v8a2.2 2.2 0 0 1-2.2 2.2h-7L6 21v-3.8H5A2.2 2.2 0 0 1 2.8 15V7A2.2 2.2 0 0 1 5 4.8Z" />
      <path className="icon-line" d="M7.5 9.6h9M7.5 13h6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6.1 2.8 3.8 5.1-2.5 2.7a15.5 15.5 0 0 0 6 6l2.7-2.5 5.1 3.8c-1 2.6-2.8 3.9-5.2 3.4A17.1 17.1 0 0 1 2.7 8c-.5-2.4.8-4.2 3.4-5.2Z" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M19.6 8.3A8.2 8.2 0 0 0 5.2 6.2L3 8.4m0 0h5.2M3 8.4V3.2m1.4 12.5a8.2 8.2 0 0 0 14.4 2.1l2.2-2.2m0 0h-5.2m5.2 0v5.2" />
    </svg>
  );
}

function Metric({
  type,
  value,
  label,
  large = false,
}: {
  type: "message" | "phone";
  value: string;
  label: string;
  large?: boolean;
}) {
  return (
    <div className={`metric ${large ? "metric-large" : ""}`} data-layer={type === "message" ? "Contador mensajes" : "Contador llamadas"}>
      <span className="metric-icon" data-layer={type === "message" ? "Icono mensajes" : "Icono llamadas"}>
        {type === "message" ? <MessageIcon /> : <PhoneIcon />}
      </span>
      <span className="metric-copy"><b>{value}</b><small>{label}</small></span>
    </div>
  );
}

function Online({ short = false }: { short?: boolean }) {
  return (
    <div className="online" data-layer="Estado online">
      <i />
      <span>{short ? "ONLINE" : "ONLINE · SYNC"}</span>
    </div>
  );
}

function WidgetFrame({
  id,
  children,
}: {
  id: WidgetId;
  children: ReactNode;
}) {
  return (
    <article className={`android-widget widget-${id}`} data-layer="Fondo">
      <div className="surface-glow" />
      <div className="widget-border" data-layer="Borde" />
      {children}
    </article>
  );
}

function HeroWidget() {
  return (
    <WidgetFrame id="hero">
      <header className="widget-header">
        <span className="brand">SYNC <b>ENGINE</b></span>
        <Online />
      </header>
      <div className="hero-time" data-layer="Texto hora">18:37</div>
      <div className="hero-date" data-layer="Texto fecha">Jueves, 24 de septiembre</div>
      <div className="hero-metrics">
        <Metric type="message" value="3" label="mensajes" />
        <Metric type="phone" value="2" label="perdidas" />
      </div>
      <div className="hero-sync"><SyncIcon /><span>100%</span></div>
    </WidgetFrame>
  );
}

function CommsWidget() {
  return (
    <WidgetFrame id="comms">
      <div className="comms-left">
        <span className="brand">SYNC <b>ENGINE</b></span>
        <div className="comms-time" data-layer="Texto hora">18:37</div>
        <div className="comms-date" data-layer="Texto fecha">JUE · 24 SEP</div>
        <Online />
      </div>
      <div className="comms-cards">
        <Metric type="message" value="03" label="MENSAJES NUEVOS" large />
        <Metric type="phone" value="02" label="LLAMADAS PERDIDAS" large />
      </div>
      <div className="sync-strip"><SyncIcon /><span>SINCRONIZACIÓN</span><b>100%</b></div>
    </WidgetFrame>
  );
}

function OrbitWidget() {
  return (
    <WidgetFrame id="orbit">
      <header className="widget-header">
        <span className="brand">SYNC <b>ENGINE</b></span>
        <Online short />
      </header>
      <div className="orbit-ring" data-layer="Anillo sync">
        <svg viewBox="0 0 160 160" aria-hidden="true">
          <circle cx="80" cy="80" r="68" />
          <circle className="orbit-progress" cx="80" cy="80" r="68" />
        </svg>
        <div><SyncIcon /><b>100%</b><small>SYNC</small></div>
      </div>
      <div className="orbit-time" data-layer="Texto hora">18:37</div>
      <div className="orbit-date" data-layer="Texto fecha">JUEVES 24 SEP</div>
      <div className="orbit-metrics">
        <span><MessageIcon /><b>3</b></span>
        <span><PhoneIcon /><b>2</b></span>
      </div>
    </WidgetFrame>
  );
}

function TimelineWidget() {
  return (
    <WidgetFrame id="timeline">
      <div className="timeline-main">
        <div className="timeline-day">24</div>
        <div className="timeline-date" data-layer="Texto fecha"><b>JUEVES</b><span>SEPTIEMBRE</span></div>
        <Online />
      </div>
      <div className="timeline-line"><i /><i /><i /></div>
      <div className="timeline-time" data-layer="Texto hora">18:37</div>
      <div className="timeline-events">
        <span><i /><small>MENSAJES</small><b>3 nuevos</b></span>
        <span><i /><small>LLAMADAS</small><b>2 perdidas</b></span>
        <span><i /><small>SYNC</small><b>Completa</b></span>
      </div>
    </WidgetFrame>
  );
}

function CompactWidget() {
  return (
    <WidgetFrame id="compact">
      <div className="compact-time" data-layer="Texto hora">18:37</div>
      <div className="compact-date" data-layer="Texto fecha"><b>JUE 24</b><span>SEPTIEMBRE</span></div>
      <div className="compact-divider" />
      <Metric type="message" value="3" label="mensajes" />
      <Metric type="phone" value="2" label="perdidas" />
      <div className="compact-sync"><SyncIcon /><span><b>100%</b><small>SYNC</small></span></div>
      <Online short />
    </WidgetFrame>
  );
}

function ContactWidget() {
  return (
    <WidgetFrame id="contact">
      <header className="widget-header">
        <span className="brand">ÚLTIMA CONVERSACIÓN</span>
        <Online />
      </header>
      <div className="contact-avatar"><span>AL</span><i /></div>
      <div className="contact-copy">
        <b>Alex</b>
        <p>Nos vemos en 10 minutos.</p>
        <small data-layer="Texto fecha">Jueves, 24 de septiembre</small>
      </div>
      <div className="contact-time" data-layer="Texto hora">18:37</div>
      <div className="contact-actions">
        <Metric type="message" value="3" label="nuevos" />
        <Metric type="phone" value="2" label="perdidas" />
      </div>
      <div className="contact-sync"><SyncIcon /><span>SYNC 100%</span></div>
    </WidgetFrame>
  );
}

function WidgetById({ id }: { id: WidgetId }) {
  switch (id) {
    case "hero": return <HeroWidget />;
    case "comms": return <CommsWidget />;
    case "orbit": return <OrbitWidget />;
    case "timeline": return <TimelineWidget />;
    case "compact": return <CompactWidget />;
    case "contact": return <ContactWidget />;
  }
}

export default function App() {
  const [selectedId, setSelectedId] = useState<WidgetId>("hero");
  const selected = widgets.find((widget) => widget.id === selectedId) ?? widgets[0];

  return (
    <main>
      <nav className="appbar" aria-label="Sync Engine Widget Studio">
        <div className="app-logo"><span>SE</span></div>
        <div className="app-title"><b>SYNC ENGINE</b><span>WIDGET STUDIO</span></div>
        <div className="platform"><i /> ANDROID APK</div>
      </nav>

      <section className="heading">
        <div>
          <span className="eyebrow">COLECCIÓN 01 · LAUNCHER</span>
          <h1>Widgets diseñados para<br /><em>vivir en Android.</em></h1>
        </div>
        <p>
          Seis jerarquías reales. Sin efectos imposibles.<br />
          Legibles, escalables y listas para convertirse a recursos nativos.
        </p>
      </section>

      <section className="preview">
        <div className="preview-stage">
          <div className="wallpaper-glow" />
          <div className={`preview-widget preview-${selected.id}`} key={selected.id}>
            <WidgetById id={selected.id} />
          </div>
          <span className="scale-note">PREVIEW · TAMAÑO REAL ADAPTABLE</span>
        </div>
        <aside className="preview-info">
          <span className="spec-index">{String(widgets.findIndex((item) => item.id === selected.id) + 1).padStart(2, "0")} / 06</span>
          <div>
            <span className="eyebrow">{selected.focus}</span>
            <h2>{selected.name}</h2>
            <p>{selected.description}</p>
          </div>
          <dl>
            <div><dt>CUADRÍCULA</dt><dd>{selected.format}</dd></div>
            <div><dt>MARGEN</dt><dd>16 dp</dd></div>
            <div><dt>RADIO</dt><dd>28 dp</dd></div>
            <div><dt>PLATAFORMA</dt><dd>Android</dd></div>
          </dl>
          <div className="compatibility"><i /><span><b>LAUNCHER SAFE</b><small>Compatible con recursos nativos</small></span></div>
        </aside>
      </section>

      <section className="collection">
        <div className="collection-heading">
          <div><span className="eyebrow">VARIANTES</span><h2>Elige una jerarquía</h2></div>
          <p>Todos incluyen hora, fecha, actividad y estado Sync</p>
        </div>
        <div className="widget-grid">
          {widgets.map((widget, index) => (
            <button
              type="button"
              className={`widget-option ${selectedId === widget.id ? "selected" : ""}`}
              key={widget.id}
              onClick={() => setSelectedId(widget.id)}
              aria-pressed={selectedId === widget.id}
              aria-label={`Seleccionar ${widget.name}, formato ${widget.format}`}
            >
              <div className={`option-canvas option-${widget.id}`} aria-hidden="true">
                <WidgetById id={widget.id} />
              </div>
              <div className="option-meta">
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><b>{widget.name}</b><small>{widget.focus}</small></div>
                <em>{widget.format}</em>
              </div>
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
