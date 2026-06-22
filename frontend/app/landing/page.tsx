"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const TICKER_DATA = [
  { name: "CDC",             div: "+26.6", z: "2.68",  alert: true  },
  { name: "Goldman Sachs",   div: "+10.8", z: "1.68",  alert: false },
  { name: "Harvard",         div: "+8.6",  z: "1.96",  alert: false },
  { name: "JPMorgan",        div: "−9.6",  z: "−1.14", alert: false },
  { name: "BlackRock",       div: "−10.1", z: "−0.72", alert: false },
  { name: "FDA",             div: "+6.5",  z: "0.99",  alert: false },
  { name: "Wells Fargo",     div: "−8.7",  z: "1.14",  alert: false },
  { name: "Federal Reserve", div: "+3.2",  z: "0.36",  alert: false },
  { name: "Bank of America", div: "+1.8",  z: "1.96",  alert: false },
];

const INSTITUTIONS = [
  { name: "CDC",              sector: "Government", z:  2.68, alert: true  },
  { name: "JPMorgan",         sector: "Banking",    z: -1.14, alert: false },
  { name: "Goldman Sachs",    sector: "Banking",    z:  1.68, alert: false },
  { name: "Bank of America",  sector: "Banking",    z:  1.96, alert: false },
  { name: "Wells Fargo",      sector: "Banking",    z:  1.14, alert: false },
  { name: "BlackRock",        sector: "Finance",    z: -0.72, alert: false },
  { name: "Federal Reserve",  sector: "Government", z:  0.36, alert: false },
  { name: "FDA",              sector: "Government", z:  0.99, alert: false },
  { name: "Harvard University", sector: "Education", z: 1.96, alert: false },
];

const SCORES = [
  {
    abbr: "SCS", label: "Stated Confidence Score", color: "text-blue-400",
    topBorder: "border-t-blue-500", range: "Range: 0 – 100",
    desc: "How confident is the institution's official language right now?",
    how: "FinBERT scores the filing tone; a 25-phrase hedging detector counts uncertainty language per 1,000 words and subtracts a penalty.",
    chips: [
      { label: "0–40 · Heavy hedging", cls: "border-red-700/40 text-red-300 bg-red-900/20" },
      { label: "40–70 · Neutral",      cls: "border-yellow-700/40 text-yellow-300 bg-yellow-900/20" },
      { label: "70–100 · Confident",   cls: "border-green-700/40 text-green-300 bg-green-900/20" },
    ],
  },
  {
    abbr: "BTS", label: "Behavioral Trust Score", color: "text-green-400",
    topBorder: "border-t-green-500", range: "Range: 0 – 100",
    desc: "What does the public's behaviour actually show about trust in this institution?",
    how: "Google Trends search interest for '[org] problems / scandal / lawsuit' is inverted and averaged with VADER sentiment across recent news headlines.",
    chips: [
      { label: "0–40 · Low trust",      cls: "border-red-700/40 text-red-300 bg-red-900/20" },
      { label: "40–70 · Mixed signals", cls: "border-yellow-700/40 text-yellow-300 bg-yellow-900/20" },
      { label: "70–100 · Strong trust", cls: "border-green-700/40 text-green-300 bg-green-900/20" },
    ],
  },
  {
    abbr: "DIV", label: "Divergence Score", color: "text-red-400",
    topBorder: "border-t-red-500", range: "Range: −100 to +100",
    desc: "The gap between what the institution says and what the public shows. The core ICI signal.",
    how: "Simply SCS − BTS. Positive divergence is the early-warning signal: the institution projects confidence while public trust erodes underneath.",
    chips: [
      { label: "+20 to +100 · Danger",    cls: "border-red-700/40 text-red-300 bg-red-900/20" },
      { label: "−10 to +10 · Aligned",    cls: "border-yellow-700/40 text-yellow-300 bg-yellow-900/20" },
      { label: "< −10 · Underconfident",  cls: "border-green-700/40 text-green-300 bg-green-900/20" },
    ],
  },
  {
    abbr: "Z", label: "Z-Score", color: "text-purple-400",
    topBorder: "border-t-purple-500", range: "Unitless · typically −3 to +3",
    desc: "Is the current divergence unusual for this institution, relative to its own history?",
    how: "(Current divergence − historical mean) ÷ historical std over the last 30 readings. Normalises each institution against itself. |Z| > 2 triggers an alert.",
    chips: [
      { label: "|Z| > 2 · Alert",  cls: "border-red-700/40 text-red-300 bg-red-900/20" },
      { label: "1–2 · Elevated",   cls: "border-yellow-700/40 text-yellow-300 bg-yellow-900/20" },
      { label: "< 1 · Normal",     cls: "border-green-700/40 text-green-300 bg-green-900/20" },
    ],
  },
];

function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setTimeout(() => el.classList.add("visible"), delay);
        obs.disconnect();
      }
    }, { threshold: 0.1 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay]);
  return <div ref={ref} className="fade-in-section">{children}</div>;
}

function Counter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        let start = 0; const step = target / 50;
        const t = setInterval(() => {
          start = Math.min(start + step, target);
          setVal(parseFloat(start.toFixed(1)));
          if (start >= target) clearInterval(t);
        }, 20);
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [target]);
  return <span ref={ref}>{Number.isInteger(target) ? Math.round(val) : val}{suffix}</span>;
}

export default function Landing() {
  const allTicker = [...TICKER_DATA, ...TICKER_DATA];
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="bg-gray-950 text-white overflow-x-hidden">

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 sm:px-8 h-14 bg-gray-950/80 backdrop-blur-md border-b border-white/5">
        <span className="text-sm font-medium tracking-wide truncate mr-4">
          ICI <span className="text-blue-400">·</span> <span className="hidden sm:inline">Institutional Confidence Index</span><span className="sm:hidden">ICI</span>
        </span>
        {/* Desktop nav */}
        <div className="hidden md:flex items-center gap-6">
          <a href="#how"          className="text-sm text-gray-400 hover:text-white transition-colors">How it works</a>
          <a href="#scores"       className="text-sm text-gray-400 hover:text-white transition-colors">Scores</a>
          <a href="#institutions" className="text-sm text-gray-400 hover:text-white transition-colors">Institutions</a>
          <Link href="/" className="bg-blue-600 hover:bg-blue-700 px-4 py-1.5 rounded-lg text-sm font-medium transition-all">
            Open dashboard →
          </Link>
        </div>
        {/* Mobile: CTA + hamburger */}
        <div className="flex items-center gap-2 md:hidden">
          <Link href="/" className="bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded-lg text-xs font-medium transition-all">
            Dashboard
          </Link>
          <button onClick={() => setMenuOpen(o => !o)} className="p-2 text-gray-400 hover:text-white">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {menuOpen
                ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed top-14 left-0 right-0 z-40 bg-gray-900 border-b border-white/10 px-4 py-4 flex flex-col gap-4 md:hidden">
          <a href="#how"          onClick={() => setMenuOpen(false)} className="text-sm text-gray-300">How it works</a>
          <a href="#scores"       onClick={() => setMenuOpen(false)} className="text-sm text-gray-300">Scores</a>
          <a href="#institutions" onClick={() => setMenuOpen(false)} className="text-sm text-gray-300">Institutions</a>
        </div>
      )}

      {/* HERO */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-4 sm:px-8 pt-24 pb-16 overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:40px_40px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-2/3 w-[300px] h-[300px] sm:w-[600px] sm:h-[600px] rounded-full bg-blue-600/10 blur-3xl pointer-events-none" />
        <div className="absolute top-2/3 left-1/3 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] sm:w-[400px] sm:h-[400px] rounded-full bg-emerald-600/7 blur-3xl pointer-events-none" />

        <div className="relative text-center max-w-3xl w-full">
          <div className="animate-fade-up-1 inline-flex items-center gap-2 bg-blue-600/15 border border-blue-500/30 rounded-full px-4 py-1.5 text-xs text-blue-300 mb-6 sm:mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 live-dot" />
            Live · Updated every 6 hours
          </div>

          <h1 className="animate-fade-up-2 text-3xl sm:text-5xl md:text-6xl font-semibold leading-tight tracking-tight mb-4 sm:mb-6">
            What institutions <span className="text-blue-400">say</span><br />
            vs. what the public <span className="text-blue-400">shows</span>
          </h1>

          <p className="animate-fade-up-3 text-sm sm:text-lg text-gray-400 leading-relaxed max-w-xl mx-auto mb-8 sm:mb-10 px-2">
            ICI measures the gap between official institutional language and real-world public trust signals — in real time, across finance, government, and education.
          </p>

          <div className="animate-fade-up-4 flex items-center justify-center gap-3 flex-wrap">
            <Link href="/" className="bg-blue-600 hover:bg-blue-700 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl text-sm font-medium transition-all">
              Open dashboard
            </Link>
            <a href="#how" className="border border-white/20 hover:border-white/40 px-5 sm:px-6 py-2.5 sm:py-3 rounded-xl text-sm transition-all">
              How it works
            </a>
          </div>

          {/* Ticker */}
          <div className="animate-fade-up-5 mt-10 sm:mt-12 w-full text-left">
            <p className="text-xs text-gray-600 uppercase tracking-widest mb-2 pl-1">Live divergence scores</p>
            <div className="overflow-hidden rounded-xl border border-white/5">
              <div className="flex gap-3 p-3 ticker-inner">
                {allTicker.map((d, i) => (
                  <div key={i} className={`flex-shrink-0 rounded-lg px-3 sm:px-4 py-3 min-w-[130px] sm:min-w-[150px] border ${d.alert ? "border-red-500/40 bg-red-500/5" : "border-white/8 bg-white/3"}`}>
                    <p className="text-xs font-medium text-white mb-2 truncate">{d.name}</p>
                    <div className="flex gap-3">
                      <div className="text-xs text-gray-500">Div<span className={`block text-sm font-medium ${d.div.startsWith("+") ? "text-red-400" : "text-emerald-400"}`}>{d.div}</span></div>
                      <div className="text-xs text-gray-500">Z<span className={`block text-sm font-medium ${d.alert ? "text-red-400" : "text-gray-300"}`}>{d.z}</span></div>
                    </div>
                    {d.alert && <p className="text-xs text-red-400 mt-1.5">⚠ Alert</p>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* STATS */}
      <div className="border-y border-white/5 bg-white/2">
        <div className="max-w-4xl mx-auto px-4 sm:px-8 py-10 sm:py-12 grid grid-cols-3 gap-4 sm:gap-8 text-center">
          {[
            { target: 9,   suffix: "",   label: "Institutions tracked" },
            { target: 100, suffix: "k+", label: "ICI scores computed" },
            { target: 1.5, suffix: "M+", label: "Raw signals processed" },
          ].map((s) => (
            <FadeIn key={s.label}>
              <div className="text-2xl sm:text-4xl font-semibold text-white mb-1">
                <Counter target={s.target} suffix={s.suffix} />
              </div>
              <div className="text-xs sm:text-sm text-gray-500">{s.label}</div>
            </FadeIn>
          ))}
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="how" className="py-16 sm:py-24 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto">
          <FadeIn><p className="text-xs text-blue-400 uppercase tracking-widest mb-3">How it works</p></FadeIn>
          <FadeIn><h2 className="text-2xl sm:text-3xl font-semibold mb-3 tracking-tight">A two-sided signal engine</h2></FadeIn>
          <FadeIn><p className="text-gray-400 leading-relaxed max-w-lg mb-10 sm:mb-12 text-sm sm:text-base">ICI ingests data from multiple sources, runs it through a custom NLP pipeline, and surfaces a single divergence score that tells you whether an institution's words match public behaviour.</p></FadeIn>

          <FadeIn>
            {/* Desktop: 4-col row. Mobile: 2x2 grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 rounded-xl overflow-hidden border border-white/8">
              {[
                { icon: "📄", step: "Official language", title: "SEC filings",       tags: ["10-K", "10-Q", "8-K", "Earnings calls"] },
                { icon: "🧠", step: "NLP analysis",      title: "FinBERT + hedging", tags: ["Tone detection", "25 hedge phrases", "VADER"] },
                { icon: "📡", step: "Public signals",    title: "Behaviour data",    tags: ["Google Trends", "News RSS", "3 keywords"] },
                { icon: "📊", step: "Output",            title: "ICI score",         tags: ["SCS", "BTS", "Divergence", "Z-score"] },
              ].map((p, i) => (
                <div key={p.step} className={`p-4 sm:p-5 bg-white/3 border-white/8 ${i % 2 === 0 ? "border-r" : ""} ${i < 2 ? "border-b md:border-b-0" : ""} ${i === 1 || i === 3 ? "md:border-r" : ""} ${i < 3 ? "md:border-r" : ""}`}>
                  <div className="text-xl mb-2 sm:mb-3">{p.icon}</div>
                  <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{p.step}</p>
                  <p className="text-xs sm:text-sm font-medium text-white mb-2 sm:mb-3">{p.title}</p>
                  <div className="flex flex-wrap gap-1">
                    {p.tags.map((t) => (
                      <span key={t} className="text-xs bg-white/6 border border-white/10 rounded px-1.5 py-0.5 text-gray-400">{t}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </FadeIn>
        </div>
      </section>

      {/* SCORES */}
      <section id="scores" className="py-16 sm:py-24 px-4 sm:px-8 bg-white/1 border-y border-white/5">
        <div className="max-w-4xl mx-auto">
          <FadeIn><p className="text-xs text-blue-400 uppercase tracking-widest mb-3">Score guide</p></FadeIn>
          <FadeIn><h2 className="text-2xl sm:text-3xl font-semibold mb-3 tracking-tight">What each number means</h2></FadeIn>
          <FadeIn><p className="text-gray-400 leading-relaxed max-w-lg mb-10 sm:mb-12 text-sm sm:text-base">ICI produces four scores per institution per run. Here is exactly what they measure and how to read them.</p></FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {SCORES.map((s, i) => (
              <FadeIn key={s.abbr} delay={i * 80}>
                <div className={`bg-white/3 border border-white/8 rounded-xl p-4 sm:p-6 border-t-2 ${s.topBorder}`}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-white">{s.label}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-md bg-white/10 ${s.color}`}>{s.abbr}</span>
                  </div>
                  <p className="text-xs text-gray-600 mb-2">{s.range}</p>
                  <p className="text-sm text-gray-300 leading-relaxed mb-2">{s.desc}</p>
                  <p className="text-xs text-gray-500 leading-relaxed mb-4">{s.how}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.chips.map((c) => (
                      <span key={c.label} className={`text-xs px-2 py-0.5 rounded-md border ${c.cls}`}>{c.label}</span>
                    ))}
                  </div>
                </div>
              </FadeIn>
            ))}
          </div>
        </div>
      </section>

      {/* INSTITUTIONS */}
      <section id="institutions" className="py-16 sm:py-24 px-4 sm:px-8">
        <div className="max-w-4xl mx-auto">
          <FadeIn><p className="text-xs text-blue-400 uppercase tracking-widest mb-3">Coverage</p></FadeIn>
          <FadeIn><h2 className="text-2xl sm:text-3xl font-semibold mb-3 tracking-tight">Institutions currently tracked</h2></FadeIn>
          <FadeIn><p className="text-gray-400 leading-relaxed max-w-lg mb-10 sm:mb-12 text-sm sm:text-base">Nine major institutions across banking, finance, government, and education — plus any orgs you add on the dashboard.</p></FadeIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {INSTITUTIONS.map((inst, i) => {
              const zCls = Math.abs(inst.z) > 2 ? "text-red-400" : Math.abs(inst.z) > 1.5 ? "text-yellow-400" : "text-emerald-400";
              const sign = inst.z > 0 ? "+" : "";
              return (
                <FadeIn key={inst.name} delay={i * 50}>
                  <div className={`flex items-center justify-between p-4 rounded-xl border transition-all hover:bg-white/4 ${inst.alert ? "border-red-500/30 bg-red-500/5" : "border-white/8 bg-white/2"}`}>
                    <div>
                      <p className="text-sm font-medium text-white">{inst.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{inst.sector}</p>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className={`text-base font-semibold ${zCls}`}>{sign}{inst.z.toFixed(2)}</p>
                      <p className="text-xs text-gray-600">Z-score</p>
                    </div>
                  </div>
                </FadeIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 px-4 sm:px-8 text-center border-t border-white/5">
        <FadeIn>
          <div className="max-w-xl mx-auto">
            <h2 className="text-2xl sm:text-3xl font-semibold mb-4 tracking-tight">Start tracking</h2>
            <p className="text-gray-400 leading-relaxed mb-8 text-sm sm:text-base">Open the dashboard to explore all nine institutions, add your own, and run the pipeline on demand.</p>
            <Link href="/" className="inline-block bg-blue-600 hover:bg-blue-700 px-8 py-3 rounded-xl text-sm font-medium transition-all">
              Open dashboard →
            </Link>
          </div>
        </FadeIn>
      </section>

      {/* FOOTER */}
      <footer className="px-4 sm:px-8 py-6 border-t border-white/5 text-center">
        <p className="text-xs text-gray-600">Built by Siddhi Khade · Institutional Confidence Index · Data refreshes every 6 hours</p>
      </footer>
    </div>
  );
}
