"use client";
import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import Link from "next/link";

const API_URL = "https://institutional-confidence-index.onrender.com";

const SECTOR_OPTIONS = ["Banking","Finance","Government","Education","Technology","Healthcare","Energy","Media","Custom"];

const SECTOR_PILL: Record<string, string> = {
  Banking:    "bg-blue-900/50 text-blue-300 border-blue-700/60",
  Finance:    "bg-purple-900/50 text-purple-300 border-purple-700/60",
  Government: "bg-amber-900/50 text-amber-300 border-amber-700/60",
  Education:  "bg-green-900/50 text-green-300 border-green-700/60",
  Technology: "bg-cyan-900/50 text-cyan-300 border-cyan-700/60",
  Healthcare: "bg-rose-900/50 text-rose-300 border-rose-700/60",
  Custom:     "bg-gray-800/60 text-gray-300 border-gray-600/60",
};
const pillStyle = (s: string) => SECTOR_PILL[s] ?? SECTOR_PILL.Custom;

const SCORE_META = [
  { key:"scs", label:"Stated Confidence Score", abbr:"SCS", color:"text-blue-400",   topBar:"border-t-blue-500",   range:"Range: 0 – 100",          desc:"How confident is the institution's official language right now? Drawn from SEC filings and earnings transcripts.", how:"FinBERT scores the filing tone; a 25-phrase hedging detector counts uncertainty language per 1,000 words and subtracts a penalty.", chips:[{label:"0–40 · Heavy hedging",cls:"bg-red-900/30 text-red-300 border-red-700/40"},{label:"40–70 · Neutral",cls:"bg-yellow-900/30 text-yellow-300 border-yellow-700/40"},{label:"70–100 · Confident",cls:"bg-green-900/30 text-green-300 border-green-700/40"}] },
  { key:"bts", label:"Behavioral Trust Score",  abbr:"BTS", color:"text-green-400",  topBar:"border-t-green-500",  range:"Range: 0 – 100",          desc:"What does the public's behaviour actually show about trust in this institution?", how:"Google Trends search interest for '[org] problems / scandal / lawsuit' (inverted) is averaged with VADER sentiment across recent news headlines.", chips:[{label:"0–40 · Low trust",cls:"bg-red-900/30 text-red-300 border-red-700/40"},{label:"40–70 · Mixed",cls:"bg-yellow-900/30 text-yellow-300 border-yellow-700/40"},{label:"70–100 · Strong",cls:"bg-green-900/30 text-green-300 border-green-700/40"}] },
  { key:"div", label:"Divergence Score",        abbr:"DIV", color:"text-red-400",    topBar:"border-t-red-500",    range:"Range: −100 to +100",     desc:"The gap between what the institution says and what the public shows. The core ICI signal.", how:"Simply SCS − BTS. Positive divergence means the institution projects confidence while public trust erodes underneath.", chips:[{label:"+20 to +100 · Danger",cls:"bg-red-900/30 text-red-300 border-red-700/40"},{label:"−10 to +10 · Aligned",cls:"bg-yellow-900/30 text-yellow-300 border-yellow-700/40"},{label:"< −10 · Underconfident",cls:"bg-green-900/30 text-green-300 border-green-700/40"}] },
  { key:"z",   label:"Z-Score",                abbr:"Z",   color:"text-purple-400", topBar:"border-t-purple-500", range:"Unitless · typically −3 to +3", desc:"Is the current divergence unusual for this institution, relative to its own history?", how:"(Current divergence − historical mean) ÷ historical std over the last 30 readings. |Z| > 2 triggers an alert.", chips:[{label:"|Z| > 2 · Alert",cls:"bg-red-900/30 text-red-300 border-red-700/40"},{label:"1–2 · Elevated",cls:"bg-yellow-900/30 text-yellow-300 border-yellow-700/40"},{label:"< 1 · Normal",cls:"bg-green-900/30 text-green-300 border-green-700/40"}] },
];

interface Institution { id: number; name: string; sector: string; is_custom?: boolean; }
interface ICIScore { id:number; institution_id:number; stated_confidence_score:number; behavioral_trust_score:number; divergence_score:number; zscore:number; created_at:string; }
interface RawSignal { source:string; content:string; sentiment_score:number|null; created_at:string; }
interface AlertEvent { id:number; institution_id:number; zscore:number; divergence_score:number; stated_confidence_score:number; behavioral_trust_score:number; created_at:string; }
interface SectorSummary { sector:string; institution_count:number; institutions:string[]; avg_scs:number; avg_bts:number; avg_divergence:number; avg_zscore:number; alert:boolean; }

const timeAgo = (iso: string) => {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3.6e6);
  if (h < 1) return "< 1h ago";
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
};

const sentimentLabel = (score: number | null) => {
  if (score === null) return { label:"Neutral", cls:"bg-gray-700 text-gray-300" };
  if (score > 0.05)  return { label:"Positive", cls:"bg-green-900/60 text-green-300" };
  if (score < -0.05) return { label:"Negative", cls:"bg-red-900/60 text-red-300" };
  return { label:"Neutral", cls:"bg-gray-700 text-gray-300" };
};

const SOURCE_LABEL: Record<string,string> = {
  sec_edgar:"SEC Filing", google_trends:"Google Trends", news_rss:"News", earnings:"Earnings 8-K"
};

function trendArrow(scores: ICIScore[]) {
  if (scores.length < 5) return null;
  const recent = scores.slice(-5).map(s => s.divergence_score);
  const first = recent.slice(0, 2).reduce((a,b) => a+b, 0) / 2;
  const last  = recent.slice(-2).reduce((a,b) => a+b, 0) / 2;
  const delta = last - first;
  if (Math.abs(delta) < 1) return { arrow:"→", label:"Stable", cls:"text-gray-400" };
  if (delta > 0) return { arrow:"↑", label:`+${delta.toFixed(1)} divergence`, cls:"text-red-400" };
  return { arrow:"↓", label:`${delta.toFixed(1)} divergence`, cls:"text-green-400" };
}

function divergenceExplanation(inst: Institution, latest: ICIScore, signals: RawSignal[]): string {
  if (!latest) return "";
  const name = inst.name;
  const div  = latest.divergence_score;
  const scs  = latest.stated_confidence_score;
  const bts  = latest.behavioral_trust_score;
  const z    = latest.zscore;

  // Find most recent Google Trends signal
  const trendSig = signals.find(s => s.source === "google_trends");
  const trendLine = trendSig
    ? trendSig.content.replace(/^.*?:\s*/, "").split("|")[0].trim()
    : null;

  if (Math.abs(div) < 5) {
    return `${name}'s official language and public trust signals are closely aligned (divergence ${div > 0 ? "+" : ""}${div.toFixed(1)}). No significant gap detected.`;
  }
  if (div > 0) {
    const severity = div > 20 ? "significantly" : "moderately";
    const zNote = Math.abs(z) > 2 ? ` This is statistically unusual for ${name} (Z-score ${z.toFixed(2)}).` : "";
    const trend = trendLine ? ` ${trendLine}.` : "";
    return `${name} is ${severity} more confident in its official statements (SCS ${scs.toFixed(0)}) than public signals suggest (BTS ${bts.toFixed(0)}).${trend}${zNote}`;
  }
  return `${name} is speaking more cautiously in official statements (SCS ${scs.toFixed(0)}) than public trust signals warrant (BTS ${bts.toFixed(0)}). The public appears to trust ${name} more than its own language suggests.`;
}

export default function Dashboard() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selected, setSelected]       = useState<Institution | null>(null);
  const [compareInst, setCompareInst] = useState<Institution | null>(null);
  const [scores, setScores]           = useState<ICIScore[]>([]);
  const [compareScores, setCompareScores] = useState<ICIScore[]>([]);
  const [signals, setSignals]         = useState<RawSignal[]>([]);
  const [alerts, setAlerts]           = useState<AlertEvent[]>([]);
  const [sectors, setSectors]         = useState<SectorSummary[]>([]);
  const [loading, setLoading]         = useState(false);
  const [addOpen, setAddOpen]         = useState(false);
  const [newName, setNewName]         = useState("");
  const [newSector, setNewSector]     = useState("Custom");
  const [addLoading, setAddLoading]   = useState(false);
  const [addError, setAddError]       = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [activeTab, setActiveTab]     = useState<"signals"|"alerts"|"sectors">("signals");
  const [backendStatus, setBackendStatus] = useState<"loading"|"ok"|"error">("loading");

  const fetchInstitutions = () =>
    axios.get(`${API_URL}/institutions`, { timeout: 60000 })
      .then(r => { setInstitutions(r.data); setBackendStatus("ok"); return r.data as Institution[]; })
      .catch(() => { setBackendStatus("error"); return [] as Institution[]; });

  const fetchSectors = () =>
    axios.get(`${API_URL}/sectors`).then(r => setSectors(r.data)).catch(() => {});

  useEffect(() => {
    setBackendStatus("loading");
    fetchInstitutions().then(d => { if (d.length) setSelected(d[0]); });
    fetchSectors();
  }, []);

  useEffect(() => {
    if (!selected) return;
    setScores([]); setSignals([]); setAlerts([]);
    axios.get(`${API_URL}/ici/${selected.id}`).then(r => setScores([...r.data].reverse()));
    axios.get(`${API_URL}/signals/${selected.id}`).then(r => setSignals(r.data)).catch(() => {});
    axios.get(`${API_URL}/alerts/${selected.id}`).then(r => setAlerts(r.data)).catch(() => {});
  }, [selected]);

  useEffect(() => {
    if (!compareInst) { setCompareScores([]); return; }
    axios.get(`${API_URL}/ici/${compareInst.id}`).then(r => setCompareScores([...r.data].reverse()));
  }, [compareInst]);

  const runPipeline = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/run/${selected.id}`);
      const [r1, r2, r3] = await Promise.all([
        axios.get(`${API_URL}/ici/${selected.id}`),
        axios.get(`${API_URL}/signals/${selected.id}`).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/alerts/${selected.id}`).catch(() => ({ data: [] })),
      ]);
      setScores([...r1.data].reverse());
      setSignals(r2.data);
      setAlerts(r3.data);
      fetchSectors();
    } finally { setLoading(false); }
  };

  const handleAdd = async () => {
    if (!newName.trim()) { setAddError("Name is required."); return; }
    setAddLoading(true); setAddError("");
    try {
      const r = await axios.post(`${API_URL}/institutions`, { name: newName.trim(), sector: newSector });
      const { institution, already_existed } = r.data;
      if (already_existed) { setAddError(`"${institution.name}" is already being tracked.`); return; }
      const data = await fetchInstitutions();
      setSelected(data.find((i: Institution) => i.id === institution.id) ?? data[0]);
      setNewName(""); setNewSector("Custom"); setAddOpen(false);
    } catch { setAddError("Failed to add. Try again."); }
    finally { setAddLoading(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/institutions/${id}`);
      const data = await fetchInstitutions();
      if (selected?.id === id) setSelected(data[0] ?? null);
      setDeleteConfirm(null);
    } catch { alert("Could not delete."); }
  };

  // Merge scores for compare chart
  const mergedScores = scores.map((s, i) => ({
    ...s,
    [`${selected?.name}_bts`]: s.behavioral_trust_score,
    [`${selected?.name}_div`]: s.divergence_score,
    [`${compareInst?.name}_bts`]: compareScores[i]?.behavioral_trust_score ?? null,
    [`${compareInst?.name}_div`]: compareScores[i]?.divergence_score ?? null,
  }));

  const latest  = scores[scores.length - 1];
  const isAlert = latest && Math.abs(latest.zscore) > 2;
  const trend   = trendArrow(scores);
  const explanation = latest && selected ? divergenceExplanation(selected, latest, signals) : "";
  const builtIn = institutions.filter(i => !i.is_custom);
  const custom  = institutions.filter(i => i.is_custom);

  return (
    <main className="min-h-screen bg-gray-950 text-white">

      {/* NAV */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 sm:px-8 h-14 bg-gray-950/80 backdrop-blur border-b border-white/5">
        <Link href="/landing" className="text-sm font-medium text-white tracking-wide">
          ICI <span className="text-blue-400">·</span> Institutional Confidence Index
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          <button onClick={() => setCompareMode(m => !m)} className={`text-xs sm:text-sm px-2 sm:px-3 py-1.5 rounded-lg border transition-all ${compareMode ? "bg-blue-600/20 border-blue-500/50 text-blue-300" : "border-white/10 text-gray-400 hover:text-white"}`}>
            {compareMode ? "Exit compare" : "Compare"}
          </button>
          <button onClick={() => setExplainerOpen(o => !o)} className="hidden sm:block text-sm text-gray-400 hover:text-white transition-colors">
            Score guide
          </button>
          <button onClick={() => { setAddOpen(true); setAddError(""); }} className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 px-3 sm:px-4 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-all">
            + Track new org
          </button>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-8">

        {/* SCORE EXPLAINER */}
        {explainerOpen && (
          <div className="mb-6 sm:mb-8 bg-gray-900 border border-white/10 rounded-2xl p-4 sm:p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-lg font-semibold">What each score means</h2>
                <p className="text-sm text-gray-400 mt-0.5">ICI produces four scores per institution per pipeline run.</p>
              </div>
              <button onClick={() => setExplainerOpen(false)} className="text-gray-500 hover:text-white text-sm">Close ✕</button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {SCORE_META.map(s => (
                <div key={s.key} className={`bg-gray-800/60 border border-white/10 rounded-xl p-3 sm:p-4 border-t-2 ${s.topBar}`}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-white">{s.label}</span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-md bg-white/10 ${s.color}`}>{s.abbr}</span>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">{s.range}</p>
                  <p className="text-sm text-gray-300 leading-relaxed mb-2">{s.desc}</p>
                  <p className="text-xs text-gray-500 leading-relaxed mb-3">{s.how}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.chips.map(c => <span key={c.label} className={`text-xs px-2 py-0.5 rounded-md border ${c.cls}`}>{c.label}</span>)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* BACKEND STATUS */}
        {backendStatus === "loading" && (
          <div className="mb-6 flex items-center gap-3 bg-gray-900 border border-white/10 rounded-xl px-4 py-3">
            <div className="w-4 h-4 rounded-full border-2 border-blue-500/40 border-t-blue-400 animate-spin shrink-0" />
            <div>
              <p className="text-sm text-gray-300 font-medium">Connecting to backend...</p>
              <p className="text-xs text-gray-500 mt-0.5">Render may take up to 60 seconds to wake up on the free tier.</p>
            </div>
          </div>
        )}
        {backendStatus === "error" && (
          <div className="mb-6 bg-red-900/20 border border-red-500/40 rounded-xl px-4 py-3">
            <p className="text-sm text-red-300 font-medium">⚠ Could not reach the backend</p>
            <p className="text-xs text-red-400/70 mt-0.5">
              The Render service may be down or still starting.{" "}
              <button onClick={() => { setBackendStatus("loading"); fetchInstitutions().then(d => { if (d.length) setSelected(d[0]); }); }}
                className="underline hover:text-red-300 transition-colors">Retry</button>
            </p>
          </div>
        )}

        {/* INSTITUTION PILLS */}
        <div className="mb-6 sm:mb-8">
          {compareMode && (
            <div className="mb-3 px-3 py-2 bg-blue-600/10 border border-blue-500/30 rounded-lg text-xs text-blue-300">
              Compare mode: select a second institution to overlay on the chart.
            </div>
          )}
          <p className="text-xs text-gray-500 uppercase tracking-widest mb-2 mt-2">Tracked institutions</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {builtIn.map(inst => (
              <button key={inst.id}
                onClick={() => compareMode && selected?.id !== inst.id ? setCompareInst(inst) : setSelected(inst)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all border ${
                  selected?.id === inst.id ? "bg-blue-600 text-white border-blue-600"
                  : compareInst?.id === inst.id ? "bg-purple-600 text-white border-purple-600"
                  : `${pillStyle(inst.sector)} hover:opacity-80`
                }`}
              >
                {inst.name}
                <span className="ml-1.5 text-xs opacity-50">{inst.sector}</span>
              </button>
            ))}
          </div>
          {custom.length > 0 && (
            <>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Your custom orgs</p>
              <div className="flex flex-wrap gap-2">
                {custom.map(inst => (
                  <div key={inst.id} className="relative group flex items-center">
                    <button onClick={() => compareMode && selected?.id !== inst.id ? setCompareInst(inst) : setSelected(inst)}
                      className={`pl-4 pr-8 py-1.5 rounded-full text-sm font-medium transition-all border ${
                        selected?.id === inst.id ? "bg-blue-600 text-white border-blue-600"
                        : compareInst?.id === inst.id ? "bg-purple-600 text-white border-purple-600"
                        : `${pillStyle(inst.sector)} hover:opacity-80`
                      }`}
                    >
                      {inst.name}
                      <span className="ml-1.5 text-xs opacity-50">{inst.sector}</span>
                    </button>
                    {deleteConfirm === inst.id ? (
                      <div className="absolute -top-9 left-0 flex gap-1.5 items-center bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-xs whitespace-nowrap z-10">
                        <span className="text-gray-300">Remove?</span>
                        <button onClick={() => handleDelete(inst.id)} className="text-red-400 hover:text-red-300 font-medium">Yes</button>
                        <span className="text-gray-600">·</span>
                        <button onClick={() => setDeleteConfirm(null)} className="text-gray-400">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeleteConfirm(inst.id)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs">✕</button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {selected && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">

            {/* LEFT — main panel */}
            <div className="lg:col-span-2 space-y-4 sm:space-y-6">

              {/* SCORE CARD */}
              <div className={`rounded-2xl p-6 ${isAlert ? "bg-red-900/20 border border-red-500/50" : "bg-gray-900 border border-white/5"}`}>
                <div className="flex justify-between items-start mb-4 sm:mb-6 gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl sm:text-2xl font-semibold">{selected.name}</h2>
                      {compareInst && <span className="text-sm text-gray-500">vs <span className="text-purple-400">{compareInst.name}</span></span>}
                      {selected.is_custom && <span className="text-xs bg-gray-800 text-gray-400 border border-gray-700 px-2 py-0.5 rounded-full">Custom</span>}
                    </div>
                    <p className="text-gray-400 text-sm mt-0.5">{selected.sector}</p>
                    {latest && (
                      <div className="flex items-center gap-3 mt-1">
                        <p className="text-xs text-gray-600">Last updated {timeAgo(latest.created_at)}</p>
                        {trend && (
                          <span className={`text-xs font-medium ${trend.cls}`}>
                            {trend.arrow} {trend.label}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <button onClick={runPipeline} disabled={loading}
                    className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 sm:px-5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all shrink-0">
                    {loading ? "Running..." : "Run pipeline"}
                  </button>
                </div>

                {latest ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
                      {[
                        { label:"Stated Confidence", value:latest.stated_confidence_score, cls:"text-blue-400" },
                        { label:"Behavioral Trust",  value:latest.behavioral_trust_score,  cls:"text-green-400" },
                        { label:"Divergence",        value:latest.divergence_score,        cls:latest.divergence_score > 0 ? "text-red-400" : "text-green-400", prefix:latest.divergence_score > 0 ? "+" : "" },
                        { label:"Z-Score",           value:latest.zscore,                  cls:isAlert ? "text-red-400" : "text-gray-200", decimals:2 },
                      ].map(m => (
                        <div key={m.label} className="bg-gray-800/60 rounded-xl p-3 sm:p-4">
                          <p className="text-xs text-gray-400 mb-1">{m.label}</p>
                          <p className={`text-2xl font-semibold ${m.cls}`}>{m.prefix ?? ""}{m.value.toFixed(m.decimals ?? 1)}</p>
                        </div>
                      ))}
                    </div>

                    {/* DIVERGENCE EXPLANATION */}
                    {explanation && (
                      <div className="mt-4 bg-gray-800/40 border border-white/8 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wide">What this means</p>
                        <p className="text-sm text-gray-300 leading-relaxed">{explanation}</p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-gray-500">No scores yet — hit <span className="text-white font-medium">Run pipeline</span> to generate the first ICI score.</p>
                )}

                {isAlert && (
                  <div className="mt-4 bg-red-500/10 border border-red-500/40 rounded-lg px-4 py-3 text-sm text-red-300 font-medium">
                    ⚠ Alert: statistically significant divergence detected (|Z-score| &gt; 2)
                  </div>
                )}
              </div>

              {/* CHART */}
              {scores.length > 1 && (
                <div className="bg-gray-900 border border-white/5 rounded-2xl p-4 sm:p-6">
                  <h3 className="text-sm font-medium mb-4 text-gray-300">
                    {compareMode && compareInst ? `${selected.name} vs ${compareInst.name} — divergence & trust` : "ICI score history"}
                  </h3>
                  <ResponsiveContainer width="100%" height={220}>
                    {compareMode && compareInst ? (
                      <LineChart data={mergedScores}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="created_at" tickFormatter={v => new Date(v).toLocaleDateString("en-US",{month:"short",day:"numeric"})} tick={{fill:"#6b7280",fontSize:11}} interval="preserveStartEnd" />
                        <YAxis domain={[0,100]} tick={{fill:"#6b7280",fontSize:11}} />
                        <Tooltip contentStyle={{backgroundColor:"#111827",border:"1px solid #374151",borderRadius:"8px",fontSize:"12px"}} labelFormatter={v => new Date(v).toLocaleString()} formatter={(v) => (typeof v === "number" ? v.toFixed(1) : String(v ?? ""))} />
                        <Legend wrapperStyle={{fontSize:"12px",color:"#9ca3af"}} />
                        <Line type="monotone" dataKey={`${selected.name}_bts`}    stroke="#60a5fa" name={`${selected.name} BTS`}    dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey={`${selected.name}_div`}    stroke="#f87171" name={`${selected.name} Div`}    dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey={`${compareInst.name}_bts`} stroke="#a78bfa" name={`${compareInst.name} BTS`} dot={false} strokeWidth={2} strokeDasharray="4 2" />
                        <Line type="monotone" dataKey={`${compareInst.name}_div`} stroke="#fb923c" name={`${compareInst.name} Div`} dot={false} strokeWidth={2} strokeDasharray="4 2" />
                      </LineChart>
                    ) : (
                      <LineChart data={scores}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                        <XAxis dataKey="created_at" tickFormatter={v => new Date(v).toLocaleDateString("en-US",{month:"short",day:"numeric"})} tick={{fill:"#6b7280",fontSize:11}} interval="preserveStartEnd" />
                        <YAxis domain={[0,100]} tick={{fill:"#6b7280",fontSize:11}} />
                        <Tooltip contentStyle={{backgroundColor:"#111827",border:"1px solid #374151",borderRadius:"8px",fontSize:"12px"}} labelFormatter={v => new Date(v).toLocaleString()} formatter={(v) => (typeof v === "number" ? v.toFixed(1) : String(v ?? ""))} />
                        <Legend wrapperStyle={{fontSize:"12px",color:"#9ca3af"}} />
                        <Line type="monotone" dataKey="stated_confidence_score" stroke="#60a5fa" name="Stated Confidence" dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="behavioral_trust_score"  stroke="#34d399" name="Behavioral Trust"  dot={false} strokeWidth={2} />
                        <Line type="monotone" dataKey="divergence_score"        stroke="#f87171" name="Divergence"        dot={false} strokeWidth={2} />
                      </LineChart>
                    )}
                  </ResponsiveContainer>
                </div>
              )}

              {/* SECTOR AGGREGATION */}
              {sectors.length > 0 && (
                <div className="bg-gray-900 border border-white/5 rounded-2xl p-4 sm:p-6">
                  <h3 className="text-sm font-medium text-gray-300 mb-4">Sector overview</h3>
                  <div className="space-y-2 sm:space-y-3">
                    {sectors.map(sec => (
                      <div key={sec.sector} className={`flex items-center gap-2 sm:gap-4 p-2 sm:p-3 rounded-xl border ${sec.alert ? "border-red-500/30 bg-red-500/5" : "border-white/5 bg-white/2"}`}>
                        <div className="w-28 shrink-0">
                          <p className="text-sm font-medium text-white">{sec.sector}</p>
                          <p className="text-xs text-gray-500">{sec.institution_count} institution{sec.institution_count > 1 ? "s" : ""}</p>
                        </div>
                        <div className="flex gap-2 sm:gap-4 flex-1 flex-wrap">
                          {[
                            { label:"Avg SCS", value:sec.avg_scs,       cls:"text-blue-400" },
                            { label:"Avg BTS", value:sec.avg_bts,       cls:"text-green-400" },
                            { label:"Avg Div", value:sec.avg_divergence, cls:sec.avg_divergence > 0 ? "text-red-400" : "text-green-400", prefix:sec.avg_divergence > 0 ? "+" : "" },
                            { label:"Avg Z",   value:sec.avg_zscore,    cls:sec.alert ? "text-red-400" : "text-gray-300", decimals:2 },
                          ].map(m => (
                            <div key={m.label} className="text-center min-w-[52px]">
                              <p className="text-xs text-gray-500">{m.label}</p>
                              <p className={`text-sm font-semibold ${m.cls}`}>{m.prefix ?? ""}{m.value.toFixed(m.decimals ?? 1)}</p>
                            </div>
                          ))}
                        </div>
                        {sec.alert && <span className="text-xs text-red-400 shrink-0">⚠ Alert</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT — tabbed panel */}
            <div className="space-y-4 sm:space-y-6 lg:sticky lg:top-20">
              <div className="bg-gray-900 border border-white/5 rounded-2xl overflow-hidden">
                {/* Tabs */}
                <div className="flex border-b border-white/5">
                  {(["signals","alerts","sectors"] as const).map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)}
                      className={`flex-1 py-3 text-xs font-medium capitalize transition-colors ${activeTab === tab ? "text-white border-b-2 border-blue-500" : "text-gray-500 hover:text-gray-300"}`}>
                      {tab}{tab === "alerts" && alerts.length > 0 ? ` (${alerts.length})` : ""}
                    </button>
                  ))}
                </div>

                <div className="p-5">
                  {/* SIGNALS TAB */}
                  {activeTab === "signals" && (
                    signals.length > 0 ? (
                      <div className="space-y-3">
                        {signals.map((sig, i) => {
                          const s = sentimentLabel(sig.sentiment_score);
                          return (
                            <div key={i} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                              <div className="flex items-start gap-2 mb-1">
                                <span className={`text-xs px-1.5 py-0.5 rounded font-medium shrink-0 ${s.cls}`}>{s.label}</span>
                                <span className="text-xs text-gray-500 shrink-0">{SOURCE_LABEL[sig.source] ?? sig.source}</span>
                              </div>
                              <p className="text-xs text-gray-300 leading-relaxed line-clamp-2">{sig.content}</p>
                              <p className="text-xs text-gray-600 mt-0.5">{timeAgo(sig.created_at)}</p>
                            </div>
                          );
                        })}
                      </div>
                    ) : <p className="text-xs text-gray-500">Run the pipeline to see signals.</p>
                  )}

                  {/* ALERTS TAB */}
                  {activeTab === "alerts" && (
                    alerts.length > 0 ? (
                      <div className="space-y-3">
                        {alerts.map((a, i) => (
                          <div key={i} className="border-b border-white/5 pb-3 last:border-0 last:pb-0">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-red-400 font-medium">⚠ Z = {a.zscore.toFixed(2)}</span>
                              <span className="text-xs text-gray-600">{timeAgo(a.created_at)}</span>
                            </div>
                            <p className="text-xs text-gray-400">
                              Div: <span className={a.divergence_score > 0 ? "text-red-400" : "text-green-400"}>{a.divergence_score > 0 ? "+" : ""}{a.divergence_score.toFixed(1)}</span>
                              {" · "}SCS: <span className="text-blue-400">{a.stated_confidence_score.toFixed(1)}</span>
                              {" · "}BTS: <span className="text-green-400">{a.behavioral_trust_score.toFixed(1)}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">No alerts recorded yet for {selected.name}. Alerts trigger when |Z-score| &gt; 2.</p>
                    )
                  )}

                  {/* SECTORS TAB (quick ref) */}
                  {activeTab === "sectors" && (
                    sectors.length > 0 ? (
                      <div className="space-y-2">
                        {sectors.map(sec => (
                          <div key={sec.sector} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                            <div>
                              <p className="text-xs font-medium text-white">{sec.sector}</p>
                              <p className="text-xs text-gray-600">{sec.institutions.join(", ")}</p>
                            </div>
                            <div className="text-right shrink-0 ml-2">
                              <p className={`text-sm font-semibold ${sec.avg_divergence > 0 ? "text-red-400" : "text-green-400"}`}>
                                {sec.avg_divergence > 0 ? "+" : ""}{sec.avg_divergence.toFixed(1)}
                              </p>
                              <p className="text-xs text-gray-600">avg div</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p className="text-xs text-gray-500">Loading sector data...</p>
                  )}
                </div>
              </div>

              {/* SCORE QUICK REF */}
              <div className="bg-gray-900 border border-white/5 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-medium text-gray-300">Score guide</h3>
                  <button onClick={() => setExplainerOpen(true)} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">Full guide ↑</button>
                </div>
                <div className="space-y-3">
                  {[
                    { abbr:"SCS", label:"Stated Confidence", color:"text-blue-400",   desc:"Official language tone" },
                    { abbr:"BTS", label:"Behavioral Trust",  color:"text-green-400",  desc:"Public signals & search" },
                    { abbr:"DIV", label:"Divergence",        color:"text-red-400",    desc:"SCS − BTS gap" },
                    { abbr:"Z",   label:"Z-Score",           color:"text-purple-400", desc:"Unusual vs own history?" },
                  ].map(s => (
                    <div key={s.abbr} className="flex items-center gap-2 sm:gap-3">
                      <span className={`text-xs font-semibold w-8 shrink-0 ${s.color}`}>{s.abbr}</span>
                      <div>
                        <p className="text-xs font-medium text-gray-300">{s.label}</p>
                        <p className="text-xs text-gray-500">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ADD MODAL */}
      {addOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 sm:p-6 w-full max-w-md shadow-2xl">
            <h2 className="text-lg font-semibold mb-1">Track a new institution</h2>
            <p className="text-sm text-gray-400 mb-5 leading-relaxed">Enter any organisation — the pipeline runs immediately and generates a first ICI score.</p>
            <label className="block text-xs text-gray-400 mb-1">Organisation name</label>
            <input type="text" value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === "Enter" && handleAdd()}
              placeholder="e.g. OpenAI, NHS, Stanford University"
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4" />
            <label className="block text-xs text-gray-400 mb-1">Sector</label>
            <select value={newSector} onChange={e => setNewSector(e.target.value)}
              className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500 mb-4">
              {SECTOR_OPTIONS.map(s => <option key={s}>{s}</option>)}
            </select>
            {addError && <p className="text-red-400 text-xs mb-3">{addError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setAddOpen(false); setNewName(""); setAddError(""); }} className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-all">Cancel</button>
              <button onClick={handleAdd} disabled={addLoading} className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-all">
                {addLoading ? "Adding..." : "Add & run pipeline"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

