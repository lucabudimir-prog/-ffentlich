import React, { useState, useEffect } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip,
} from "recharts";
import {
  CalendarClock, Bot, TrendingUp, Wallet,
  Landmark, TrendingUp as TrendUpIcon,
  Plus, Edit2, Trash2, X, RotateCcw, Trash, Loader2, Inbox, Send,
  RefreshCw,
} from "lucide-react";

/* ---------------------------------------------------------------------- */
/*  DESIGN TOKENS (Marke unverändert)                                      */
/* ---------------------------------------------------------------------- */

const C = {
  bg: "#000000",
  bgSidebar: "#000000",
  panel: "#0D0D0D",
  panelAlt: "#141414",
  border: "#232323",
  borderLight: "#2E2E2E",
  text: "#E8EAF0",
  textDim: "#8892A6",
  textFaint: "#4E576A",
  amber: "#E3A23D",
  amberDim: "#8A6A32",
  green: "#3FD98E",
  greenDim: "#1C4A38",
  red: "#FF6370",
  redDim: "#4A2027",
  blue: "#5B8FEF",
  blueDim: "#2A4A7A",
};

const FONT_DISPLAY = "'Space Grotesk', sans-serif";
const FONT_BODY = "'Inter', sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";

const fmtEUR = (n) =>
  (n || 0).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });

const FX_RATES = { EUR: 1.0, USD: 0.92, GBP: 1.17, CHF: 1.04 };
const CURRENCIES = ["EUR", "USD", "GBP", "CHF"];
const valueEUR = (p) => p.shares * p.avgCost * (FX_RATES[p.currency] || 1);
const apiSymbolFor = (p) => (p.apiSymbol && p.apiSymbol.trim()) || p.ticker;

const TYPE_META = {
  ETF: { label: "ETFs", color: C.amber, colorDim: C.amberDim },
  Aktie: { label: "Einzelaktien", color: C.blue, colorDim: C.blueDim },
};

/* ---------------------------------------------------------------------- */
/*  BROWSER-STORAGE (localStorage-Adapter — Ersatz für window.storage)     */
/* ---------------------------------------------------------------------- */

const storage = {
  async get(key) {
    try {
      const v = localStorage.getItem("fcc:" + key);
      return v === null ? null : { value: v };
    } catch (e) { return null; }
  },
  async set(key, value) {
    try { localStorage.setItem("fcc:" + key, value); } catch (e) { /* noop */ }
  },
  async delete(key) {
    try { localStorage.removeItem("fcc:" + key); } catch (e) { /* noop */ }
  },
};

/* ---------------------------------------------------------------------- */
/*  ANTHROPIC-API (direkt aus dem Browser, mit eigenem API-Key)            */
/* ---------------------------------------------------------------------- */

const ADVISOR_MODEL = "claude-opus-5";

async function anthropicRequest(apiKey, body, extraBetas) {
  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };
  if (extraBetas) headers["anthropic-beta"] = extraBetas;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || `HTTP ${response.status}`);
  }
  return data;
}

const textOf = (data) =>
  (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();

/* ---------------------------------------------------------------------- */
/*  ADVISOR SYSTEM-PROMPT                                                  */
/* ---------------------------------------------------------------------- */

const ADVISOR_SYSTEM_PROMPT_TEMPLATE = `# System-Prompt: Fiduciary Advisor

## Rolle

Du bist der persönliche Finance Advisor für Luca, ein Privatanleger mit Depot bei Trade Republic. Du arbeitest auf dem Niveau eines Research-Analysten bzw. Wealth Advisors einer Top-Investmentbank (Goldman Sachs, J.P. Morgan) — präzise, faktenbasiert, ohne Marketing-Floskeln, ohne unnötige Absicherungssätze. Du sprichst Luca direkt an, auf Deutsch, informell aber fachlich auf hohem Niveau.

## Kernaufgaben

**1. News-Analyse mit Portfoliobezug**
Wenn Luca eine Nachricht, ein Ereignis oder eine Frage einbringt: Analysiere sie zuerst eigenständig (Fakten, Kontext, Marktreaktion), und leite danach explizit ab, was das *konkret* für seine gehaltenen Positionen bedeutet — nicht allgemein für "den Markt", sondern für die tatsächlichen Ticker in seinem Depot. Wenn eine Nachricht keine Relevanz für sein Portfolio hat, sag das auch klar.

**2. Makroökonomische & politische Einordnung**
Ordne Zentralbankentscheidungen (EZB, Fed), Inflationsdaten, Arbeitsmarktzahlen, geopolitische Entwicklungen (z. B. Exportkontrollen, Handelskonflikte) auf Experten-Niveau ein: Was ist der Konsens, was ist eingepreist, was ist das Überraschungspotenzial. Setze das in Bezug zu seiner Allokation (ETF-Kern vs. thematische Einzelwerte).

**3. Live-Daten-Einbindung**
Nutze für jede Analyse die aktuellsten verfügbaren Zahlen aus dem Dashboard (Positionen, Kurse, Gewichtungen, Cash-Quote). Wenn Live-Kurse für eine Position nicht verfügbar sind, sag das explizit, anstatt mit veralteten oder geschätzten Werten zu rechnen.

**4. Format**
- Kurz und dicht, keine aufgeblähten Einleitungen
- Zahlen immer konkret (Beträge, Prozent, Gewichtungen), nie vage
- Bei Empfehlungen: Trade-offs benennen, nicht nur eine Richtung
- Am Ende bei relevanten Themen: eine knappe "So wirkt sich das auf dein Depot aus"-Zusammenfassung

## Portfolio-Kontext (wird bei jeder Anfrage aktuell eingefügt)

{{PORTFOLIO_SNAPSHOT}}
— Positionen, Gewichtungen, Cash-Quote, Live-Kurse (falls vorhanden)
— Strategie: Buy-and-Hold, ETF-Kern + thematische/geopolitisch getriebene Einzelwerte
— Horizont: mittelfristig
— Bekannte Tendenz: neigt in Drawdowns zu emotionalen Verkäufen — bei Kursrückgängen daher Fakten vor Reflex liefern, nicht zusätzlich verunsichern

## Grenzen

Du bist kein zugelassener Anlageberater und ersetzt keine regulierte Beratung. Mach das an den Stellen transparent, wo es zählt (z. B. bei konkreten Kauf-/Verkaufsimpulsen), ohne es wie eine Standard-Floskel in jede Antwort zu quetschen. Ziel ist maximale analytische Substanz, nicht maximale Absicherung.`;

const ADVISOR_PROMPT_WORD_COUNT = ADVISOR_SYSTEM_PROMPT_TEMPLATE.split(/\s+/).filter(Boolean).length;

function buildPortfolioSnapshot(positionsComputed, cash, totals) {
  const { totalValue, costValue, unrealizedPLEur, unrealizedPLPercent, liveCount } = totals;
  const lines = positionsComputed.map((p) => {
    const weight = totalValue ? ((p.marketValueEur / totalValue) * 100).toFixed(1) : "0.0";
    const priceInfo = p.hasLive ? `Live-Kurs, Tagesveränderung ${p.dayChangePercent >= 0 ? "+" : ""}${p.dayChangePercent.toFixed(2)}%` : "kein Live-Kurs, Einstandsbasis";
    return `- ${p.name} (${p.ticker}, ${p.type}): ${p.shares} Stk., Marktwert ${fmtEUR(p.marketValueEur)}, ${weight}% des Portfolios, ${priceInfo}`;
  });
  return [
    `Gesamtwert: ${fmtEUR(totalValue)} | Einstandswert: ${fmtEUR(costValue)} | Cash: ${fmtEUR(cash)}`,
    `Unrealized P/L: ${liveCount > 0 ? `${unrealizedPLEur >= 0 ? "+" : ""}${fmtEUR(unrealizedPLEur)} (${unrealizedPLPercent >= 0 ? "+" : ""}${unrealizedPLPercent.toFixed(2)}%)` : "nicht verfügbar (keine Live-Kurse abgerufen)"} | Live-Kurse: ${liveCount}/${positionsComputed.length} Positionen`,
    `Positionen:`,
    ...(lines.length ? lines : ["(keine Positionen erfasst)"]),
  ].join("\n");
}

/* ---------------------------------------------------------------------- */
/*  STARTDATEN                                                             */
/* ---------------------------------------------------------------------- */

const SEED_POSITIONS = [
  { id: "seed-1", name: "iShares Core S&P 500", ticker: "CSPX", type: "ETF", shares: 9, avgCost: 545.10, currency: "EUR", broker: "Trade Republic" },
  { id: "seed-2", name: "Xtrackers MSCI World", ticker: "XDWD", type: "ETF", shares: 95, avgCost: 42.80, currency: "EUR", broker: "Trade Republic" },
  { id: "seed-3", name: "iShares Core MSCI EM IMI", ticker: "EIMI", type: "ETF", shares: 62, avgCost: 32.10, currency: "EUR", broker: "Trade Republic" },
  { id: "seed-4", name: "iShares Edge MSCI World Momentum", ticker: "IWMO", type: "ETF", shares: 28, avgCost: 68.40, currency: "EUR", broker: "Trade Republic" },
  { id: "seed-5", name: "iShares STOXX Europe 600", ticker: "EXSA", type: "ETF", shares: 33, avgCost: 47.20, currency: "EUR", broker: "Trade Republic" },
  { id: "seed-6", name: "MP Materials Corp", ticker: "MP", type: "Aktie", shares: 38, avgCost: 42.50, currency: "USD", broker: "Trade Republic" },
  { id: "seed-7", name: "Siemens Energy AG", ticker: "ENR", type: "Aktie", shares: 22, avgCost: 58.30, currency: "EUR", broker: "Trade Republic" },
  { id: "seed-8", name: "Ondas Holdings", ticker: "ONDS", type: "Aktie", shares: 410, avgCost: 3.10, currency: "USD", broker: "Trade Republic" },
];
const SEED_CASH = 640.55;

const marketOverview = [
  { name: "DAX", value: "19.847,32", chg: 0.42 },
  { name: "S&P 500", value: "6.412,85", chg: 0.18 },
  { name: "Nasdaq 100", value: "22.890,44", chg: -0.25 },
  { name: "Gold", value: "$2.687,40", chg: 0.55 },
  { name: "Bitcoin", value: "$71.240", chg: -1.85 },
  { name: "EUR/USD", value: "1,0862", chg: 0.12 },
];

const news = [
  { tag: "Portfolio", ticker: "MP", title: "Seltene Erden: Analysten diskutieren Auswirkungen neuer Exportkontrollen auf US-Zulieferer", source: "Platzhalter-Quelle", time: "vor 2 Std." },
  { tag: "Makro", ticker: "FED", title: "Fed-Vertreter äußern sich zurückhaltend vor der nächsten Zinsentscheidung", source: "Platzhalter-Quelle", time: "vor 4 Std." },
  { tag: "Portfolio", ticker: "ENR", title: "Siemens Energy: Auftragseingang im Netzgeschäft im Fokus der kommenden Quartalszahlen", source: "Platzhalter-Quelle", time: "vor 6 Std." },
  { tag: "Markt", ticker: "SPX", title: "US-Standardwerte konsolidieren nach starkem Lauf der vergangenen Wochen", source: "Platzhalter-Quelle", time: "vor 8 Std." },
  { tag: "Makro", ticker: "EZB", title: "EZB-Sitzung rückt näher — Markt erwartet Signale zum weiteren Zinspfad", source: "Platzhalter-Quelle", time: "gestern" },
  { tag: "Portfolio", ticker: "ONDS", title: "Ondas Holdings: Volatilität nach Kapitalmaßnahme bleibt erhöht", source: "Platzhalter-Quelle", time: "gestern" },
];

const events = [
  { cat: "Earnings", date: "18. Aug", title: "MP Materials — Q2 Zahlen", ticker: "MP" },
  { cat: "Earnings", date: "21. Aug", title: "Siemens Energy — Q3 Zahlen", ticker: "ENR" },
  { cat: "Zentralbank", date: "22. Aug", title: "Fed — Rede Jackson Hole", ticker: "FED" },
  { cat: "Makro", date: "27. Aug", title: "US-Verbrauchervertrauen (Conference Board)", ticker: "US" },
  { cat: "Zentralbank", date: "11. Sep", title: "EZB — Zinsentscheid", ticker: "EZB" },
  { cat: "Makro", date: "12. Sep", title: "US-Inflationsdaten (CPI)", ticker: "US" },
  { cat: "Arbeitsmarkt", date: "5. Sep", title: "US-Arbeitsmarktbericht (Non-Farm Payrolls)", ticker: "US" },
  { cat: "Dividende", date: "30. Sep", title: "Ausschüttung EXSA (STOXX Europe 600)", ticker: "EXSA" },
];

/* ---------------------------------------------------------------------- */
/*  SHARED UI ELEMENTE                                                     */
/* ---------------------------------------------------------------------- */

function GlobalStyle() {
  return (
    <style>{`
      * { box-sizing: border-box; }
      ::-webkit-scrollbar { width: 8px; height: 8px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 4px; }
      @keyframes marquee { 0% { transform: translateX(0); } 100% { transform: translateX(-50%); } }
      .marquee-track { animation: marquee 36s linear infinite; }
      .marquee-wrap:hover .marquee-track { animation-play-state: paused; }
      .tabular { font-variant-numeric: tabular-nums; }
      .scroll-smooth-y { scroll-behavior: smooth; }
      input:focus, select:focus { outline: 2px solid ${C.amberDim}; outline-offset: 0px; }
    `}</style>
  );
}

function Badge({ children, tone = "amber" }) {
  const map = {
    amber: { color: C.amber, border: C.amberDim, bg: "rgba(227,162,61,0.08)" },
    green: { color: C.green, border: C.greenDim, bg: "rgba(63,217,142,0.08)" },
    red: { color: C.red, border: C.redDim, bg: "rgba(255,99,112,0.08)" },
    dim: { color: C.textDim, border: C.border, bg: "transparent" },
  }[tone];
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-semibold tracking-widest uppercase"
      style={{ color: map.color, border: `1px solid ${map.border}`, background: map.bg, fontFamily: FONT_DISPLAY }}>
      {children}
    </span>
  );
}

function Card({ eyebrow, title, action, children, className = "", pad = "p-5", id }) {
  return (
    <div id={id} className={`rounded-xl ${pad} ${className}`} style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      {(eyebrow || title || action) && (
        <div className="flex items-start justify-between mb-4">
          <div>
            {eyebrow && <div className="text-[10px] tracking-[0.15em] uppercase mb-1" style={{ color: C.textFaint, fontFamily: FONT_DISPLAY }}>{eyebrow}</div>}
            {title && <h3 className="text-[15px] font-semibold" style={{ color: C.text, fontFamily: FONT_DISPLAY }}>{title}</h3>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function SectionHeading({ id, eyebrow, title, subtitle, action }) {
  return (
    <div id={id} className="flex items-end justify-between mb-4 pt-2 flex-wrap gap-3" style={{ scrollMarginTop: 88 }}>
      <div>
        <div className="text-[10px] tracking-[0.15em] uppercase mb-1.5" style={{ color: C.textFaint, fontFamily: FONT_DISPLAY }}>{eyebrow}</div>
        <h2 className="text-xl font-semibold" style={{ color: C.text, fontFamily: FONT_DISPLAY }}>{title}</h2>
        {subtitle && <p className="text-xs mt-1" style={{ color: C.textDim, fontFamily: FONT_BODY }}>{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function DarkTooltip({ active, payload, label, formatter }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 text-xs" style={{ background: C.panelAlt, border: `1px solid ${C.borderLight}`, color: C.text, fontFamily: FONT_MONO }}>
      {label && <div className="mb-1" style={{ color: C.textDim, fontFamily: FONT_BODY }}>{label}</div>}
      {payload.map((p, i) => <div key={i}>{formatter ? formatter(p.value) : p.value}</div>)}
    </div>
  );
}

function EmptyState({ text, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14">
      <div className="w-11 h-11 rounded-full flex items-center justify-center mb-3" style={{ background: C.panelAlt }}>
        <Inbox size={19} color={C.textFaint} />
      </div>
      <p className="text-sm mb-4 max-w-sm" style={{ color: C.textDim, fontFamily: FONT_BODY }}>{text}</p>
      {actionLabel && (
        <button onClick={onAction} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium"
          style={{ background: "rgba(227,162,61,0.12)", color: C.amber, border: `1px solid ${C.amberDim}`, fontFamily: FONT_DISPLAY }}>
          <Plus size={14} /> {actionLabel}
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  TICKER STRIP                                                           */
/* ---------------------------------------------------------------------- */

function TickerStrip() {
  const items = [...marketOverview, ...marketOverview];
  return (
    <div className="marquee-wrap w-full overflow-hidden shrink-0" style={{ background: C.bgSidebar, borderBottom: `1px solid ${C.border}`, height: 36 }}>
      <div className="marquee-track flex items-center h-full" style={{ width: "max-content" }}>
        {items.map((m, i) => (
          <div key={i} className="flex items-center gap-2 px-6 whitespace-nowrap">
            <span className="text-xs font-semibold" style={{ color: C.textDim, fontFamily: FONT_DISPLAY }}>{m.name}</span>
            <span className="text-xs tabular" style={{ color: C.text, fontFamily: FONT_MONO }}>{m.value}</span>
            <span className="text-xs tabular" style={{ color: m.chg >= 0 ? C.green : C.red, fontFamily: FONT_MONO }}>{m.chg > 0 ? "+" : ""}{m.chg.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  ANCHOR-NAV                                                             */
/* ---------------------------------------------------------------------- */

const SECTIONS = [
  { id: "portfolio", label: "Portfolio" },
  { id: "advisor", label: "Advisor" },
  { id: "news", label: "News" },
  { id: "events", label: "Events" },
  { id: "settings", label: "Settings" },
];

function AnchorNav() {
  const jump = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  return (
    <div className="w-full flex items-center gap-1 px-6 shrink-0" style={{ height: 44, background: C.bgSidebar, borderBottom: `1px solid ${C.border}` }}>
      <div className="w-6 h-6 rounded flex items-center justify-center mr-3 font-bold text-[10px]"
        style={{ background: "rgba(227,162,61,0.12)", color: C.amber, border: `1px solid ${C.amberDim}`, fontFamily: FONT_DISPLAY }}>
        FC
      </div>
      {SECTIONS.map((s) => (
        <button key={s.id} onClick={() => jump(s.id)} className="px-3 py-1.5 rounded-md text-xs font-medium"
          style={{ color: C.textDim, fontFamily: FONT_DISPLAY }}>
          {s.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  MODAL + POSITIONSFORMULAR                                              */
/* ---------------------------------------------------------------------- */

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: "rgba(5,7,11,0.72)", backdropFilter: "blur(3px)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-xl p-6" style={{ background: C.panel, border: `1px solid ${C.borderLight}` }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold" style={{ color: C.text, fontFamily: FONT_DISPLAY }}>{title}</h3>
          <button onClick={onClose} className="p-1 rounded-md" style={{ color: C.textDim }}><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="mb-4">
      <label className="block text-[11px] uppercase tracking-wide mb-1.5" style={{ color: C.textDim, fontFamily: FONT_BODY }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = { width: "100%", background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text, fontFamily: FONT_BODY, fontSize: "14px", borderRadius: "8px", padding: "9px 12px" };

function PositionForm({ initial, defaultType, onSave, onClose }) {
  const [form, setForm] = useState(initial || { name: "", ticker: "", type: defaultType || "ETF", shares: "", avgCost: "", currency: "EUR", broker: "", apiSymbol: "" });
  const [error, setError] = useState("");
  const update = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  const handleSubmit = () => {
    if (!form.name.trim() || !form.ticker.trim()) { setError("Name und Ticker sind erforderlich."); return; }
    const shares = parseFloat(form.shares);
    const avgCost = parseFloat(form.avgCost);
    if (!shares || shares <= 0) { setError("Anzahl muss größer als 0 sein."); return; }
    if (!avgCost || avgCost <= 0) { setError("Einstandskurs muss größer als 0 sein."); return; }
    setError("");
    onSave({ ...form, name: form.name.trim(), ticker: form.ticker.trim().toUpperCase(), broker: form.broker.trim(), shares, avgCost });
  };

  return (
    <Modal title={initial ? "Position bearbeiten" : "Neue Position"} onClose={onClose}>
      <Field label="Name"><input style={inputStyle} value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="z. B. Siemens Energy AG" /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Ticker"><input style={inputStyle} value={form.ticker} onChange={(e) => update("ticker", e.target.value)} placeholder="z. B. ENR" /></Field>
        <Field label="Asset-Typ">
          <select style={inputStyle} value={form.type} onChange={(e) => update("type", e.target.value)}>
            <option value="Aktie">Aktie</option>
            <option value="ETF">ETF</option>
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Anzahl"><input style={inputStyle} type="number" min="0" step="any" value={form.shares} onChange={(e) => update("shares", e.target.value)} placeholder="0" /></Field>
        <Field label="Einstandskurs"><input style={inputStyle} type="number" min="0" step="0.01" value={form.avgCost} onChange={(e) => update("avgCost", e.target.value)} placeholder="0,00" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Währung">
          <select style={inputStyle} value={form.currency} onChange={(e) => update("currency", e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Broker / Depot (optional)"><input style={inputStyle} value={form.broker} onChange={(e) => update("broker", e.target.value)} placeholder="z. B. Trade Republic" /></Field>
      </div>
      <Field label="API-Symbol für Live-Kurse (optional, falls abweichend vom Ticker)">
        <input style={inputStyle} value={form.apiSymbol || ""} onChange={(e) => update("apiSymbol", e.target.value)} placeholder="z. B. ENR.DEX oder leer lassen" />
      </Field>
      {error && <p className="text-xs mb-3" style={{ color: C.red, fontFamily: FONT_BODY }}>{error}</p>}
      <div className="flex gap-3 mt-2">
        <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: C.panelAlt, color: C.textDim, border: `1px solid ${C.border}`, fontFamily: FONT_DISPLAY }}>Abbrechen</button>
        <button onClick={handleSubmit} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: "rgba(227,162,61,0.14)", color: C.amber, border: `1px solid ${C.amberDim}`, fontFamily: FONT_DISPLAY }}>Speichern</button>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------------------- */
/*  STAT-KARTEN                                                            */
/* ---------------------------------------------------------------------- */

function StatCard({ label, value, sub, mono = true, tone }) {
  const color = tone === "green" ? C.green : tone === "red" ? C.red : C.text;
  return (
    <div className="rounded-xl p-4" style={{ background: C.panel, border: `1px solid ${C.border}` }}>
      <div className="text-[10px] uppercase tracking-wide mb-2" style={{ color: C.textFaint, fontFamily: FONT_DISPLAY }}>{label}</div>
      <div className={`text-2xl font-semibold ${mono ? "tabular" : ""}`} style={{ color, fontFamily: mono ? FONT_MONO : FONT_DISPLAY }}>{value}</div>
      {sub && <div className="text-xs mt-1" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>{sub}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  DONUT MIT ZENTRIERTEM GESAMTWERT                                       */
/* ---------------------------------------------------------------------- */

function CompositionDonut({ allocation, totalValue }) {
  return (
    <div className="flex flex-col items-center">
      <div style={{ width: "100%", height: 260, position: "relative" }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={allocation} dataKey="value" nameKey="name" innerRadius={80} outerRadius={112} paddingAngle={3} stroke="none">
              {allocation.map((a, i) => <Cell key={i} fill={a.color} />)}
            </Pie>
            <RTooltip content={<DarkTooltip formatter={(v) => fmtEUR(v)} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <div className="text-2xl font-semibold tabular" style={{ color: C.text, fontFamily: FONT_MONO }}>{fmtEUR(totalValue)}</div>
          <div className="text-[10px] uppercase tracking-widest mt-1" style={{ color: C.textFaint, fontFamily: FONT_DISPLAY }}>Gesamt · EUR</div>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 w-full mt-4">
        {allocation.map((a) => (
          <div key={a.name} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: a.color }} />
            <div>
              <div className="text-xs" style={{ color: C.textDim, fontFamily: FONT_BODY }}>{a.name}</div>
              <div className="text-xs tabular font-medium" style={{ color: C.text, fontFamily: FONT_MONO }}>
                {totalValue ? ((a.value / totalValue) * 100).toFixed(1) : "0.0"}%
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  PORTFOLIOWERT-CHART (Platzhalter mit Zeitraum-Tabs)                    */
/* ---------------------------------------------------------------------- */

function ValueChartCard() {
  const ranges = ["1W", "1M", "3M", "6M", "1Y"];
  return (
    <Card
      eyebrow="Verlauf"
      title="Portfoliowert"
      action={
        <div className="flex items-center gap-1">
          {ranges.map((r, i) => {
            const isLast = i === ranges.length - 1;
            return (
              <span key={r} className="px-2.5 py-1 rounded text-[11px] font-medium cursor-not-allowed"
                style={{
                  color: isLast ? "#0A0D13" : C.textFaint,
                  background: isLast ? C.green : "transparent",
                  border: `1px solid ${isLast ? C.green : C.border}`,
                  fontFamily: FONT_MONO,
                  fontWeight: isLast ? 600 : 500,
                }}>
                {r}
              </span>
            );
          })}
        </div>
      }
    >
      <div className="flex flex-col items-center justify-center text-center" style={{ height: 220 }}>
        <TrendingUp size={26} color={C.green} />
        <p className="text-sm mt-3 max-w-xs" style={{ color: C.textDim, fontFamily: FONT_BODY }}>
          Der Wertverlauf wird angezeigt, sobald historische Kursdaten angebunden sind.
        </p>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------- */
/*  POSITIONEN NACH ANLAGEKLASSE                                           */
/* ---------------------------------------------------------------------- */

function AssetClassBlock({ type, positions, totalValue, onEdit, onDeleteRequest }) {
  const meta = TYPE_META[type];
  const items = positions.filter((p) => p.type === type).map((p) => ({ ...p, valueEur: p.marketValueEur })).sort((a, b) => b.valueEur - a.valueEur);
  const classTotal = items.reduce((s, p) => s + p.valueEur, 0);
  const portfolioWeight = totalValue ? (classTotal / totalValue) * 100 : 0;
  const maxVal = Math.max(...items.map((p) => p.valueEur), 1);

  return (
    <div className="mb-6 last:mb-0">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: meta.color }} />
          <span className="text-sm font-semibold" style={{ color: C.text, fontFamily: FONT_DISPLAY }}>{meta.label}</span>
        </div>
        <div className="text-xs tabular" style={{ color: C.textDim, fontFamily: FONT_MONO }}>
          {fmtEUR(classTotal)} <span style={{ color: C.textFaint }}>· {portfolioWeight.toFixed(1)}% des Portfolios</span>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="text-xs pl-4" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>Keine {meta.label} vorhanden.</p>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {items.map((p) => (
              <div key={p.id} className="relative rounded-lg p-3" style={{ background: C.panelAlt, border: `1px solid ${C.border}` }}>
                <div className="flex items-start justify-between">
                  <div className="text-xs font-bold tabular" style={{ color: C.text, fontFamily: FONT_MONO }}>{p.ticker}</div>
                  <div className="text-[10px] tabular" style={{ color: C.textFaint, fontFamily: FONT_MONO }}>
                    {classTotal ? ((p.valueEur / classTotal) * 100).toFixed(1) : "0.0"}%
                  </div>
                </div>
                <div className="text-[11px] mt-1 mb-2 truncate" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>{p.name}</div>
                <div className="text-sm font-semibold tabular" style={{ color: C.text, fontFamily: FONT_MONO }}>{fmtEUR(p.valueEur)}</div>
                <div className="flex items-center gap-2 mt-1">
                  {p.hasLive ? (
                    <span className="text-[10px] tabular" style={{ color: p.dayChangePercent >= 0 ? C.green : C.red, fontFamily: FONT_MONO }}>
                      {p.dayChangePercent >= 0 ? "+" : ""}{p.dayChangePercent.toFixed(2)}% heute
                    </span>
                  ) : (
                    <span className="text-[10px]" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>Einstandskurs</span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-2">
                  <button onClick={() => onEdit(p)} className="p-1 rounded" style={{ color: C.textDim }}><Edit2 size={11} /></button>
                  <button onClick={() => onDeleteRequest(p)} className="p-1 rounded" style={{ color: C.textFaint }}><Trash2 size={11} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-2.5 justify-center">
            {items.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="text-[11px] tabular w-12 shrink-0" style={{ color: C.textDim, fontFamily: FONT_MONO }}>{p.ticker}</span>
                <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: C.panelAlt }}>
                  <div className="h-full rounded-full" style={{ width: `${(p.valueEur / maxVal) * 100}%`, background: meta.color }} />
                </div>
                <span className="text-[11px] tabular w-32 text-right shrink-0" style={{ color: C.textDim, fontFamily: FONT_MONO }}>
                  {fmtEUR(p.valueEur)} · {classTotal ? ((p.valueEur / classTotal) * 100).toFixed(1) : "0.0"}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  PORTFOLIO-SEKTION                                                      */
/* ---------------------------------------------------------------------- */

function PortfolioSection({ positions = [], cash = 0, totals, lastUpdated, onAdd, onEdit, onDelete, onFetchPrices, pricesLoading, priceFetchNote, priceFetchError, lastPriceFetch }) {
  const { totalValue = 0, costValue = 0, allocation = [], unrealizedPLEur = 0, unrealizedPLPercent = 0, liveCount = 0 } = totals || {};
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  return (
    <div>
      <SectionHeading
        id="portfolio"
        eyebrow="Personal Finance / Wealth"
        title="Finance Command Center"
        subtitle={`${positions.length} Positionen erfasst · ${liveCount > 0 ? `${liveCount}/${positions.length} mit Live-Kurs` : "Einstandsbasis"} · ${lastUpdated ? `Zuletzt bearbeitet ${lastUpdated}` : "Noch keine Änderungen"}`}
        action={
          <div className="flex items-center gap-2">
            <button onClick={onFetchPrices} disabled={pricesLoading || positions.length === 0} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: C.panelAlt, color: pricesLoading ? C.textFaint : C.text, border: `1px solid ${C.border}`, fontFamily: FONT_DISPLAY, cursor: pricesLoading || positions.length === 0 ? "not-allowed" : "pointer" }}>
              <RefreshCw size={14} className={pricesLoading ? "animate-spin" : ""} /> {pricesLoading ? "Lädt Kurse …" : "Kurse aktualisieren"}
            </button>
            <button onClick={() => { setEditing(null); setFormOpen(true); }} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: "rgba(227,162,61,0.12)", color: C.amber, border: `1px solid ${C.amberDim}`, fontFamily: FONT_DISPLAY }}>
              <Plus size={15} /> Neue Position
            </button>
          </div>
        }
      />
      <div className="flex items-center gap-3 flex-wrap">
        <Badge tone={liveCount > 0 ? "green" : "amber"}>{liveCount > 0 ? `Alpha Vantage · ${liveCount}/${positions.length} Kurse live` : "Beispieldaten · Keine Live-Kurs-Verbindung"}</Badge>
        {lastPriceFetch && <span className="text-xs" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>Kurse zuletzt abgerufen: {lastPriceFetch}</span>}
      </div>
      {priceFetchNote && !priceFetchError && <p className="text-xs mt-2" style={{ color: C.textDim, fontFamily: FONT_BODY }}>{priceFetchNote}</p>}
      {priceFetchError && <p className="text-xs mt-2" style={{ color: C.red, fontFamily: FONT_BODY }}>{priceFetchError}</p>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-5 mb-5">
        <StatCard label="Gesamtwert" value={fmtEUR(totalValue)} sub={liveCount > 0 ? "Marktwert + Cash" : "Einstand + Cash"} />
        <StatCard
          label="Unrealized P/L"
          value={liveCount > 0 ? `${unrealizedPLEur >= 0 ? "+" : ""}${fmtEUR(unrealizedPLEur)}` : "—"}
          sub={liveCount > 0 ? `${unrealizedPLPercent >= 0 ? "+" : ""}${unrealizedPLPercent.toFixed(2)}% auf Einstand · ${liveCount}/${positions.length} live` : "benötigt Live-Kurse"}
          tone={liveCount > 0 ? (unrealizedPLEur >= 0 ? "green" : "red") : undefined}
        />
        <StatCard label="Einstandswert" value={fmtEUR(costValue)} sub="Positionen, zu Kaufkursen" />
        <StatCard label="Cash-Reserve" value={fmtEUR(cash)} sub={totalValue ? `${((cash / totalValue) * 100).toFixed(1)}% des Portfolios` : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5 mb-5">
        <div className="lg:col-span-3"><ValueChartCard /></div>
        <div className="lg:col-span-2">
          <Card eyebrow="Allokation" title="Portfolio Composition">
            {positions.length === 0 && cash === 0 ? (
              <p className="text-sm py-8 text-center" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>Noch keine Daten</p>
            ) : (
              <CompositionDonut allocation={allocation} totalValue={totalValue} />
            )}
          </Card>
        </div>
      </div>

      <Card eyebrow={`${positions.length} Positionen`} title="Positionen nach Anlageklasse">
        {positions.length === 0 ? (
          <EmptyState text="Du hast noch keine Positionen angelegt. Füge deine erste Position hinzu, um dein Portfolio abzubilden." actionLabel="Position hinzufügen" onAction={() => { setEditing(null); setFormOpen(true); }} />
        ) : (
          <>
            <AssetClassBlock type="ETF" positions={positions} totalValue={totalValue} onEdit={(p) => { setEditing(p); setFormOpen(true); }} onDeleteRequest={setConfirmDelete} />
            <AssetClassBlock type="Aktie" positions={positions} totalValue={totalValue} onEdit={(p) => { setEditing(p); setFormOpen(true); }} onDeleteRequest={setConfirmDelete} />
          </>
        )}
      </Card>

      {formOpen && (
        <PositionForm initial={editing} onClose={() => setFormOpen(false)}
          onSave={(data) => { if (editing) onEdit(editing.id, data); else onAdd(data); setFormOpen(false); }} />
      )}

      {confirmDelete && (
        <Modal title="Position löschen?" onClose={() => setConfirmDelete(null)}>
          <p className="text-sm mb-5" style={{ color: C.textDim, fontFamily: FONT_BODY }}>
            Möchtest du <span style={{ color: C.text }}>{confirmDelete.name}</span> ({confirmDelete.ticker}) wirklich entfernen?
          </p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmDelete(null)} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: C.panelAlt, color: C.textDim, border: `1px solid ${C.border}`, fontFamily: FONT_DISPLAY }}>Abbrechen</button>
            <button onClick={() => { onDelete(confirmDelete.id); setConfirmDelete(null); }} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: "rgba(255,99,112,0.12)", color: C.red, border: `1px solid ${C.redDim}`, fontFamily: FONT_DISPLAY }}>Löschen</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  ADVISOR-SEKTION                                                        */
/* ---------------------------------------------------------------------- */

function AdvisorSection({ connected, messages = [], onSend, loading, error, lastActivity, onMorningBrief, onMarketScan, onUpdate, onResetRequest }) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    if (!draft.trim() || loading) return;
    onSend(draft.trim());
    setDraft("");
  };

  const actions = [
    { label: "Morning Brief generieren", onClick: onMorningBrief },
    { label: "Market Scan", onClick: onMarketScan },
    { label: "Update senden", onClick: onUpdate },
    { label: "Memory zurücksetzen", onClick: onResetRequest },
  ];

  return (
    <div>
      <SectionHeading id="advisor" eyebrow="Q&A" title="Fiduciary Advisor" subtitle="Live verbunden mit deinen Portfoliodaten — powered by Claude" />
      <Card pad="p-0">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px p-0" style={{ background: C.border, borderBottom: `1px solid ${C.border}` }}>
          {[
            { label: "Verbindung", value: connected ? "Aktiv" : "Kein API-Key" },
            { label: "Nachrichten", value: String(messages.length) },
            { label: "Letzte Aktivität", value: lastActivity || "Noch keine" },
            { label: "System-Prompt", value: `${ADVISOR_PROMPT_WORD_COUNT} Wörter` },
          ].map((s) => (
            <div key={s.label} className="p-4" style={{ background: C.panel }}>
              <div className="text-[10px] uppercase tracking-wide mb-1" style={{ color: C.textFaint, fontFamily: FONT_DISPLAY }}>{s.label}</div>
              <div className="text-sm font-medium tabular" style={{ color: C.text, fontFamily: FONT_MONO }}>{s.value}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] px-5 pt-3" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>
          Chat-Verlauf und Portfolio werden lokal in deinem Browser gespeichert (kein externer Server, keine Datenbank).
        </p>

        <div className="flex flex-wrap gap-2 p-5" style={{ borderBottom: `1px solid ${C.border}` }}>
          {actions.map((a) => (
            <button key={a.label} onClick={a.onClick} disabled={loading} className="px-3.5 py-2 rounded-lg text-xs font-medium"
              style={{ background: C.panelAlt, color: loading ? C.textFaint : C.text, border: `1px solid ${C.border}`, fontFamily: FONT_DISPLAY, cursor: loading ? "not-allowed" : "pointer" }}>
              {a.label}
            </button>
          ))}
        </div>

        {error && <p className="text-xs px-5 pt-4" style={{ color: C.red, fontFamily: FONT_BODY }}>{error}</p>}

        <div className="flex flex-col gap-4 px-5 py-5">
          {messages.length === 0 ? (
            <p className="text-sm text-center py-6" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>
              Noch keine Nachrichten — frag etwas zu deinem Portfolio oder starte mit einem Morning Brief.
            </p>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[80%]">
                  <div className="flex items-center gap-2 mb-1" style={{ justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: C.textFaint, fontFamily: FONT_DISPLAY }}>{m.role === "user" ? "Du" : "Advisor"}</span>
                    <span className="text-[10px]" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>{m.time}</span>
                  </div>
                  <div className="rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap"
                    style={{ background: m.role === "user" ? "rgba(227,162,61,0.14)" : C.panelAlt, color: C.text, border: `1px solid ${m.role === "user" ? C.amberDim : C.border}`, fontFamily: FONT_BODY }}>
                    {m.text}
                  </div>
                </div>
              </div>
            ))
          )}
          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 text-xs" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>
                <Loader2 size={13} className="animate-spin" /> Advisor denkt nach …
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 p-5" style={{ borderTop: `1px solid ${C.border}` }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            placeholder="Frage an deinen Advisor stellen — z. B. „wie ist meine Allocation?“"
            disabled={loading}
            className="flex-1 rounded-lg px-4 py-2.5 text-sm outline-none"
            style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text, fontFamily: FONT_BODY }}
          />
          <button onClick={submit} disabled={loading || !draft.trim()} className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "rgba(227,162,61,0.12)", border: `1px solid ${C.amberDim}`, cursor: loading ? "not-allowed" : "pointer" }}>
            <Send size={14} color={C.amber} />
          </button>
        </div>
      </Card>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  NEWS / EVENTS / SETTINGS SEKTIONEN                                     */
/* ---------------------------------------------------------------------- */

function NewsSection() {
  return (
    <div>
      <SectionHeading id="news" eyebrow="Markt" title="News" subtitle="Relevante Finanznachrichten für dein Portfolio und den Markt" />
      <div className="flex flex-col gap-3">
        {news.map((n, i) => (
          <Card key={i} pad="p-4">
            <div className="flex items-center gap-2 mb-2">
              <Badge tone={n.tag === "Portfolio" ? "amber" : n.tag === "Makro" ? "green" : "dim"}>{n.tag}</Badge>
              <span className="text-xs tabular" style={{ color: C.textFaint, fontFamily: FONT_MONO }}>{n.ticker}</span>
            </div>
            <h4 className="text-sm font-medium leading-snug mb-2" style={{ color: C.text, fontFamily: FONT_BODY }}>{n.title}</h4>
            <div className="flex items-center gap-2 text-xs" style={{ color: C.textFaint }}>
              <span>{n.source}</span><span>·</span><span>{n.time}</span>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

function EventsSection() {
  const iconFor = (cat) => cat === "Earnings" ? TrendUpIcon : cat === "Zentralbank" ? Landmark : cat === "Dividende" ? Wallet : CalendarClock;
  return (
    <div>
      <SectionHeading id="events" eyebrow="Kalender" title="Upcoming Events" subtitle="Earnings, Dividenden und wichtige Makrotermine" />
      <Card pad="p-0">
        <div className="flex flex-col">
          {events.map((e, i) => {
            const Icon = iconFor(e.cat);
            return (
              <div key={i} className="flex items-center justify-between px-5 py-4" style={{ borderBottom: i === events.length - 1 ? "none" : `1px solid ${C.border}` }}>
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: C.panelAlt }}><Icon size={15} color={C.amber} /></div>
                  <div>
                    <div className="text-sm font-medium" style={{ color: C.text, fontFamily: FONT_BODY }}>{e.title}</div>
                    <div className="text-xs mt-0.5" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>{e.cat}</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs tabular px-2 py-1 rounded" style={{ color: C.textDim, background: C.panelAlt, fontFamily: FONT_MONO }}>{e.ticker}</span>
                  <span className="text-sm tabular font-medium" style={{ color: C.amber, fontFamily: FONT_MONO }}>{e.date}</span>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function SettingsSection({ cash, onCashChange, onReset, onClearAll, anthropicKey, avKey, onSaveKeys }) {
  const [cashInput, setCashInput] = useState(String(cash));
  const [keyInput, setKeyInput] = useState(anthropicKey || "");
  const [avInput, setAvInput] = useState(avKey || "");
  const [keysSaved, setKeysSaved] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => setCashInput(String(cash)), [cash]);
  useEffect(() => setKeyInput(anthropicKey || ""), [anthropicKey]);
  useEffect(() => setAvInput(avKey || ""), [avKey]);

  return (
    <div>
      <SectionHeading id="settings" eyebrow="Verwaltung" title="Settings" subtitle="API-Schlüssel und Portfolio-Daten verwalten" />
      <div className="flex flex-col gap-5">
        <Card eyebrow="Verbindung" title="API-Schlüssel">
          <p className="text-xs mb-4 leading-relaxed" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>
            Der Anthropic-Key wird für den Advisor-Chat und den Live-Kursabruf benötigt (Aufrufe gehen direkt aus deinem Browser an api.anthropic.com — Key erhältlich unter console.anthropic.com).
            Der Alpha-Vantage-Key verbindet den Kursabruf mit echten Marktdaten (kostenlos unter alphavantage.co). Beide Schlüssel werden ausschließlich lokal in deinem Browser gespeichert.
          </p>
          <Field label="Anthropic API-Key">
            <input style={inputStyle} type="password" value={keyInput} onChange={(e) => { setKeyInput(e.target.value); setKeysSaved(false); }} placeholder="sk-ant-…" />
          </Field>
          <Field label="Alpha Vantage API-Key (für Live-Kurse)">
            <input style={inputStyle} type="password" value={avInput} onChange={(e) => { setAvInput(e.target.value); setKeysSaved(false); }} placeholder="z. B. XXXXXXXXXXXXXXXX" />
          </Field>
          <div className="flex items-center gap-3">
            <button onClick={() => { onSaveKeys(keyInput.trim(), avInput.trim()); setKeysSaved(true); }} className="px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: "rgba(227,162,61,0.12)", color: C.amber, border: `1px solid ${C.amberDim}`, fontFamily: FONT_DISPLAY }}>Speichern</button>
            {keysSaved && <span className="text-xs" style={{ color: C.green, fontFamily: FONT_BODY }}>Gespeichert ✓</span>}
          </div>
        </Card>
        <Card eyebrow="Kontostand" title="Cash-Bestand">
          <div className="flex items-end gap-3">
            <Field label="Cash (EUR)"><input style={{ ...inputStyle, width: 220 }} type="number" min="0" step="0.01" value={cashInput} onChange={(e) => setCashInput(e.target.value)} /></Field>
            <button onClick={() => onCashChange(parseFloat(cashInput) || 0)} className="mb-4 px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ background: "rgba(227,162,61,0.12)", color: C.amber, border: `1px solid ${C.amberDim}`, fontFamily: FONT_DISPLAY }}>Speichern</button>
          </div>
        </Card>
        <Card eyebrow="Daten" title="Portfolio-Daten">
          <p className="text-xs mb-4 leading-relaxed" style={{ color: C.textFaint, fontFamily: FONT_BODY }}>
            Deine Positionen und dein Cash-Bestand werden lokal in deinem Browser gespeichert und bleiben beim erneuten Öffnen erhalten.
            Wechselkurse für Fremdwährungen ({CURRENCIES.filter((c) => c !== "EUR").join(", ")}) sind statische Beispielwerte, keine Live-Kurse.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmReset(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium" style={{ background: C.panelAlt, color: C.textDim, border: `1px solid ${C.border}`, fontFamily: FONT_DISPLAY }}><RotateCcw size={14} /> Beispieldaten laden</button>
            <button onClick={() => setConfirmClear(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium" style={{ background: "rgba(255,99,112,0.10)", color: C.red, border: `1px solid ${C.redDim}`, fontFamily: FONT_DISPLAY }}><Trash size={14} /> Alle Daten löschen</button>
          </div>
        </Card>
      </div>

      {confirmReset && (
        <Modal title="Beispieldaten laden?" onClose={() => setConfirmReset(false)}>
          <p className="text-sm mb-5" style={{ color: C.textDim, fontFamily: FONT_BODY }}>Deine aktuellen Positionen und dein Cash-Bestand werden durch die ursprünglichen Beispieldaten ersetzt.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmReset(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: C.panelAlt, color: C.textDim, border: `1px solid ${C.border}`, fontFamily: FONT_DISPLAY }}>Abbrechen</button>
            <button onClick={() => { onReset(); setConfirmReset(false); }} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: "rgba(227,162,61,0.14)", color: C.amber, border: `1px solid ${C.amberDim}`, fontFamily: FONT_DISPLAY }}>Laden</button>
          </div>
        </Modal>
      )}
      {confirmClear && (
        <Modal title="Alle Daten löschen?" onClose={() => setConfirmClear(false)}>
          <p className="text-sm mb-5" style={{ color: C.textDim, fontFamily: FONT_BODY }}>Alle Positionen und dein Cash-Bestand werden gelöscht. Das kann nicht rückgängig gemacht werden.</p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmClear(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: C.panelAlt, color: C.textDim, border: `1px solid ${C.border}`, fontFamily: FONT_DISPLAY }}>Abbrechen</button>
            <button onClick={() => { onClearAll(); setConfirmClear(false); }} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: "rgba(255,99,112,0.12)", color: C.red, border: `1px solid ${C.redDim}`, fontFamily: FONT_DISPLAY }}>Löschen</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  FIXIERTE ADVISOR-EINGABE (unten)                                       */
/* ---------------------------------------------------------------------- */

function BottomAdvisorBar({ onSend, loading }) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    if (!draft.trim() || loading) return;
    onSend(draft.trim());
    setDraft("");
  };
  return (
    <div className="shrink-0 flex items-center gap-3 px-6" style={{ height: 60, background: C.bgSidebar, borderTop: `1px solid ${C.border}` }}>
      <Bot size={15} color={loading ? C.amber : C.textFaint} className={`shrink-0 ${loading ? "animate-pulse" : ""}`} />
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder="Frage an deinen Advisor stellen — z. B. „wie ist meine Allocation?“"
        disabled={loading}
        className="flex-1 rounded-lg px-4 py-2.5 text-sm outline-none"
        style={{ background: C.panelAlt, border: `1px solid ${C.border}`, color: C.text, fontFamily: FONT_BODY }}
      />
      <button onClick={submit} disabled={loading || !draft.trim()} className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ background: "rgba(227,162,61,0.12)", border: `1px solid ${C.amberDim}`, cursor: loading ? "not-allowed" : "pointer" }}>
        <Send size={14} color={C.amber} />
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/*  APP ROOT                                                               */
/* ---------------------------------------------------------------------- */

export default function App() {
  const [positions, setPositions] = useState([]);
  const [cash, setCash] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [livePrices, setLivePrices] = useState({});
  const [pricesLoading, setPricesLoading] = useState(false);
  const [priceFetchNote, setPriceFetchNote] = useState(null);
  const [priceFetchError, setPriceFetchError] = useState(null);
  const [lastPriceFetch, setLastPriceFetch] = useState(null);
  const [advisorMessages, setAdvisorMessages] = useState([]);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorError, setAdvisorError] = useState(null);
  const [lastAdvisorActivity, setLastAdvisorActivity] = useState(null);
  const [confirmResetAdvisor, setConfirmResetAdvisor] = useState(false);
  const [anthropicKey, setAnthropicKey] = useState("");
  const [avKey, setAvKey] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let loadedPositions = SEED_POSITIONS;
      let loadedCash = SEED_CASH;
      let loadedUpdated = null;
      let loadedLivePrices = {};
      let loadedLastFetch = null;
      let loadedAdvisorMessages = [];
      let loadedAdvisorActivity = null;
      let loadedKey = "";
      let loadedAvKey = "";
      try {
        const res = await storage.get("positions");
        if (res && res.value) loadedPositions = JSON.parse(res.value);
      } catch (e) { /* Startdaten verwenden */ }
      try {
        const res = await storage.get("cash");
        if (res && res.value !== undefined && res.value !== null) loadedCash = JSON.parse(res.value);
      } catch (e) { /* Startwert verwenden */ }
      try {
        const res = await storage.get("lastUpdated");
        if (res && res.value) loadedUpdated = JSON.parse(res.value);
      } catch (e) { /* noch nie gespeichert */ }
      try {
        const res = await storage.get("livePrices");
        if (res && res.value) loadedLivePrices = JSON.parse(res.value);
      } catch (e) { /* noch keine Kurse abgerufen */ }
      try {
        const res = await storage.get("lastPriceFetch");
        if (res && res.value) loadedLastFetch = JSON.parse(res.value);
      } catch (e) { /* noch keine Kurse abgerufen */ }
      try {
        const res = await storage.get("advisorMessages");
        if (res && res.value) loadedAdvisorMessages = JSON.parse(res.value);
      } catch (e) { /* noch keine Konversation */ }
      try {
        const res = await storage.get("lastAdvisorActivity");
        if (res && res.value) loadedAdvisorActivity = JSON.parse(res.value);
      } catch (e) { /* noch keine Aktivität */ }
      try {
        const res = await storage.get("anthropicKey");
        if (res && res.value) loadedKey = res.value;
      } catch (e) { /* kein Key */ }
      try {
        const res = await storage.get("avKey");
        if (res && res.value) loadedAvKey = res.value;
      } catch (e) { /* kein Key */ }
      if (!cancelled) {
        setPositions(loadedPositions);
        setCash(loadedCash);
        setLastUpdated(loadedUpdated);
        setLivePrices(loadedLivePrices);
        setLastPriceFetch(loadedLastFetch);
        setAdvisorMessages(loadedAdvisorMessages);
        setLastAdvisorActivity(loadedAdvisorActivity);
        setAnthropicKey(loadedKey);
        setAvKey(loadedAvKey);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveKeys = async (key, av) => {
    setAnthropicKey(key);
    setAvKey(av);
    await storage.set("anthropicKey", key);
    await storage.set("avKey", av);
  };

  const fetchLivePrices = async () => {
    if (positions.length === 0) return;
    if (!anthropicKey) {
      setPriceFetchError("Kein Anthropic-API-Key hinterlegt — trage ihn unter Settings → API-Schlüssel ein, damit Kurse abgerufen werden können.");
      return;
    }
    setPricesLoading(true);
    setPriceFetchError(null);
    setPriceFetchNote(null);
    try {
      const symbols = [...new Set(positions.map(apiSymbolFor))];
      const prompt = `Rufe für jedes der folgenden Wertpapier-Symbole die aktuelle Kursinformation über das GLOBAL_QUOTE-Tool von Alpha Vantage ab: ${symbols.join(", ")}.
Antworte ausschließlich mit einem reinen JSON-Array, kein Markdown, kein Fließtext, ein Objekt pro Symbol:
[{"symbol":"XXX","price":123.45,"changePercent":1.23,"found":true}]
Setze "found":false sowie price und changePercent auf null, wenn für ein Symbol keine Kursdaten gefunden wurden.`;

      const mcpUrl = avKey
        ? `https://mcp.alphavantage.co/mcp?apikey=${encodeURIComponent(avKey)}`
        : "https://mcp.alphavantage.co/mcp";

      let messages = [{ role: "user", content: prompt }];
      let data = null;
      for (let attempt = 0; attempt < 4; attempt++) {
        data = await anthropicRequest(anthropicKey, {
          model: ADVISOR_MODEL,
          max_tokens: 6000,
          messages,
          mcp_servers: [{ type: "url", url: mcpUrl, name: "alpha-vantage" }],
          tools: [{ type: "mcp_toolset", mcp_server_name: "alpha-vantage" }],
        }, "mcp-client-2025-11-20");
        if (data.stop_reason === "pause_turn") {
          messages = [...messages, { role: "assistant", content: data.content }];
          continue;
        }
        break;
      }

      const raw = textOf(data);
      const jsonMatch = raw.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error("Keine verwertbare Antwort erhalten");
      const parsed = JSON.parse(jsonMatch[0]);

      const next = { ...livePrices };
      let foundCount = 0;
      parsed.forEach((entry) => {
        if (!entry || !entry.symbol) return;
        const ok = !!entry.found && typeof entry.price === "number";
        if (ok) foundCount++;
        next[entry.symbol] = {
          price: ok ? entry.price : null,
          changePercent: ok && typeof entry.changePercent === "number" ? entry.changePercent : null,
          found: ok,
        };
      });
      const stamp = new Date().toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      setLivePrices(next);
      setLastPriceFetch(stamp);
      setPriceFetchNote(`${foundCount}/${symbols.length} Kurse gefunden${foundCount < symbols.length ? " — für den Rest gilt weiterhin der Einstandskurs" : ""}.`);
      await storage.set("livePrices", JSON.stringify(next));
      await storage.set("lastPriceFetch", JSON.stringify(stamp));
    } catch (e) {
      console.error("Kursabruf fehlgeschlagen", e);
      setPriceFetchError(`Kursabruf fehlgeschlagen: ${e.message || "unbekannter Fehler"} — evtl. API-Key prüfen oder Alpha-Vantage-Ratenlimit erreicht. Bitte in ein paar Minuten erneut versuchen.`);
    } finally {
      setPricesLoading(false);
    }
  };

  const touchUpdated = async () => {
    const stamp = new Date().toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    setLastUpdated(stamp);
    await storage.set("lastUpdated", JSON.stringify(stamp));
  };

  const persistPositions = async (next) => {
    setPositions(next);
    await storage.set("positions", JSON.stringify(next));
    touchUpdated();
  };
  const persistCash = async (next) => {
    setCash(next);
    await storage.set("cash", JSON.stringify(next));
    touchUpdated();
  };

  const addPosition = (data) => persistPositions([...positions, { ...data, id: (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`) }]);
  const editPosition = (id, data) => persistPositions(positions.map((p) => (p.id === id ? { ...p, ...data } : p)));
  const deletePosition = (id) => persistPositions(positions.filter((p) => p.id !== id));
  const resetToSample = () => { persistPositions(SEED_POSITIONS); persistCash(SEED_CASH); };
  const clearAll = () => { persistPositions([]); persistCash(0); };

  const positionsComputed = positions.map((p) => {
    const costBasisEur = valueEUR(p);
    const lp = livePrices[apiSymbolFor(p)];
    const hasLive = !!(lp && lp.found && typeof lp.price === "number");
    const marketValueEur = hasLive ? p.shares * lp.price * (FX_RATES[p.currency] || 1) : costBasisEur;
    return {
      ...p,
      costBasisEur,
      marketValueEur,
      hasLive,
      dayChangePercent: hasLive && typeof lp.changePercent === "number" ? lp.changePercent : null,
      plEur: marketValueEur - costBasisEur,
    };
  });

  const costValue = positionsComputed.reduce((s, p) => s + p.costBasisEur, 0);
  const marketValue = positionsComputed.reduce((s, p) => s + p.marketValueEur, 0);
  const totalValue = marketValue + cash;
  const etfValue = positionsComputed.filter((p) => p.type === "ETF").reduce((s, p) => s + p.marketValueEur, 0);
  const stockValue = positionsComputed.filter((p) => p.type === "Aktie").reduce((s, p) => s + p.marketValueEur, 0);
  const allocation = [
    { name: "ETFs", value: etfValue, color: C.amber },
    { name: "Einzelaktien", value: stockValue, color: C.blue },
    { name: "Cash", value: cash, color: C.textFaint },
  ].filter((a) => a.value > 0);
  const unrealizedPLEur = positionsComputed.reduce((s, p) => s + p.plEur, 0);
  const unrealizedPLPercent = costValue ? (unrealizedPLEur / costValue) * 100 : 0;
  const liveCount = positionsComputed.filter((p) => p.hasLive).length;
  const totals = { totalValue, costValue, allocation, unrealizedPLEur, unrealizedPLPercent, liveCount };

  const callAdvisor = async (userText) => {
    if (!anthropicKey) {
      setAdvisorError("Kein Anthropic-API-Key hinterlegt — trage ihn unter Settings → API-Schlüssel ein, um den Advisor zu nutzen.");
      return;
    }
    const stamp = new Date().toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    const userMsg = { role: "user", text: userText, time: stamp };
    const historyForApi = [...advisorMessages, userMsg].map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.text,
    }));
    const nextMessages = [...advisorMessages, userMsg];
    setAdvisorMessages(nextMessages);
    setAdvisorLoading(true);
    setAdvisorError(null);
    try {
      const systemPrompt = ADVISOR_SYSTEM_PROMPT_TEMPLATE.replace(
        "{{PORTFOLIO_SNAPSHOT}}",
        buildPortfolioSnapshot(positionsComputed, cash, totals)
      );
      const data = await anthropicRequest(anthropicKey, {
        model: ADVISOR_MODEL,
        max_tokens: 6000,
        system: systemPrompt,
        messages: historyForApi,
      });
      if (data.stop_reason === "refusal") {
        throw new Error("Die Anfrage wurde aus Sicherheitsgründen abgelehnt. Bitte anders formulieren.");
      }
      const answer = textOf(data) || "Ich konnte gerade keine Antwort generieren. Bitte erneut versuchen.";
      const assistantStamp = new Date().toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
      const assistantMsg = { role: "advisor", text: answer, time: assistantStamp };
      const finalMessages = [...nextMessages, assistantMsg];
      setAdvisorMessages(finalMessages);
      setLastAdvisorActivity(assistantStamp);
      await storage.set("advisorMessages", JSON.stringify(finalMessages));
      await storage.set("lastAdvisorActivity", JSON.stringify(assistantStamp));
    } catch (e) {
      console.error("Advisor-Anfrage fehlgeschlagen", e);
      setAdvisorError(`Anfrage fehlgeschlagen: ${e.message || "unbekannter Fehler"}. Bitte erneut versuchen.`);
    } finally {
      setAdvisorLoading(false);
    }
  };

  const handleMorningBrief = () => callAdvisor("Erstelle mir ein kurzes Morning Briefing zu meinem Portfolio: größte Positionen, aktueller Stand, und was ich heute im Blick behalten sollte.");
  const handleMarketScan = () => callAdvisor("Mach einen kurzen Market Scan: was bedeuten aktuelle Markt- und Makro-Entwicklungen für ein Portfolio mit meiner Allokation (ETF-Kern + thematische Einzelwerte)?");
  const handleAdvisorUpdate = () => callAdvisor("Gib mir ein kurzes Update: Wie sieht mein Portfolio gerade aus, und gibt es aktuell etwas, das besondere Aufmerksamkeit verdient?");
  const resetAdvisorMemory = async () => {
    setAdvisorMessages([]);
    setLastAdvisorActivity(null);
    await storage.set("advisorMessages", JSON.stringify([]));
    await storage.delete("lastAdvisorActivity");
  };

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden" style={{ background: C.bg, fontFamily: FONT_BODY }}>
      <GlobalStyle />
      <TickerStrip />
      <AnchorNav />
      <div className="flex-1 overflow-y-auto scroll-smooth-y">
        <div className="max-w-6xl mx-auto px-6 py-6">
          {loading ? (
            <div className="flex items-center justify-center py-32">
              <Loader2 size={22} color={C.textFaint} className="animate-spin" />
              <span className="ml-3 text-sm" style={{ color: C.textDim, fontFamily: FONT_BODY }}>Portfolio wird geladen …</span>
            </div>
          ) : (
            <div className="flex flex-col gap-12">
              <PortfolioSection
                positions={positionsComputed}
                cash={cash}
                totals={totals}
                lastUpdated={lastUpdated}
                onAdd={addPosition}
                onEdit={editPosition}
                onDelete={deletePosition}
                onFetchPrices={fetchLivePrices}
                pricesLoading={pricesLoading}
                priceFetchNote={priceFetchNote}
                priceFetchError={priceFetchError}
                lastPriceFetch={lastPriceFetch}
              />
              <AdvisorSection
                connected={!!anthropicKey}
                messages={advisorMessages}
                onSend={callAdvisor}
                loading={advisorLoading}
                error={advisorError}
                lastActivity={lastAdvisorActivity}
                onMorningBrief={handleMorningBrief}
                onMarketScan={handleMarketScan}
                onUpdate={handleAdvisorUpdate}
                onResetRequest={() => setConfirmResetAdvisor(true)}
              />
              <NewsSection />
              <EventsSection />
              <SettingsSection
                cash={cash}
                onCashChange={persistCash}
                onReset={resetToSample}
                onClearAll={clearAll}
                anthropicKey={anthropicKey}
                avKey={avKey}
                onSaveKeys={saveKeys}
              />
            </div>
          )}
        </div>
      </div>
      <BottomAdvisorBar onSend={callAdvisor} loading={advisorLoading} />
      {confirmResetAdvisor && (
        <Modal title="Advisor-Memory zurücksetzen?" onClose={() => setConfirmResetAdvisor(false)}>
          <p className="text-sm mb-5" style={{ color: C.textDim, fontFamily: FONT_BODY }}>
            Die gesamte Chat-Historie mit dem Advisor wird gelöscht. Das kann nicht rückgängig gemacht werden.
          </p>
          <div className="flex gap-3">
            <button onClick={() => setConfirmResetAdvisor(false)} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: C.panelAlt, color: C.textDim, border: `1px solid ${C.border}`, fontFamily: FONT_DISPLAY }}>Abbrechen</button>
            <button onClick={() => { resetAdvisorMemory(); setConfirmResetAdvisor(false); }} className="flex-1 py-2.5 rounded-lg text-sm font-medium" style={{ background: "rgba(255,99,112,0.12)", color: C.red, border: `1px solid ${C.redDim}`, fontFamily: FONT_DISPLAY }}>Zurücksetzen</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
