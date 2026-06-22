"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer
} from "recharts";

const API_URL = "https://institutional-confidence-index.onrender.com";

const SECTOR_OPTIONS = [
  "Banking", "Finance", "Government", "Education",
  "Technology", "Healthcare", "Energy", "Media", "Custom"
];

interface Institution {
  id: number;
  name: string;
  sector: string;
  is_custom?: boolean;
}

interface ICIScore {
  id: number;
  institution_id: number;
  stated_confidence_score: number;
  behavioral_trust_score: number;
  divergence_score: number;
  zscore: number;
  created_at: string;
}

const SECTOR_COLORS: Record<string, string> = {
  Banking: "bg-blue-900/60 text-blue-300 border-blue-700",
  Finance: "bg-purple-900/60 text-purple-300 border-purple-700",
  Government: "bg-amber-900/60 text-amber-300 border-amber-700",
  Education: "bg-green-900/60 text-green-300 border-green-700",
  Technology: "bg-cyan-900/60 text-cyan-300 border-cyan-700",
  Healthcare: "bg-rose-900/60 text-rose-300 border-rose-700",
  Custom: "bg-gray-800/60 text-gray-300 border-gray-600",
};

function getSectorStyle(sector: string) {
  return SECTOR_COLORS[sector] ?? SECTOR_COLORS["Custom"];
}

export default function Home() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selected, setSelected] = useState<Institution | null>(null);
  const [scores, setScores] = useState<ICIScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newSector, setNewSector] = useState("Custom");
  const [addLoading, setAddLoading] = useState(false);
  const [addError, setAddError] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const fetchInstitutions = () =>
    axios.get(`${API_URL}/institutions`).then((res) => {
      setInstitutions(res.data);
      return res.data as Institution[];
    });

  useEffect(() => {
    fetchInstitutions().then((data) => {
      if (data.length > 0) setSelected(data[0]);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    setScores([]);
    axios.get(`${API_URL}/ici/${selected.id}`).then((res) => {
      setScores([...res.data].reverse());
    });
  }, [selected]);

  const runPipeline = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      await axios.post(`${API_URL}/run/${selected.id}`);
      const res = await axios.get(`${API_URL}/ici/${selected.id}`);
      setScores([...res.data].reverse());
    } finally {
      setLoading(false);
    }
  };

  const handleAddInstitution = async () => {
    if (!newName.trim()) { setAddError("Name is required."); return; }
    setAddLoading(true);
    setAddError("");
    try {
      const res = await axios.post(`${API_URL}/institutions`, {
        name: newName.trim(),
        sector: newSector,
      });
      const { institution, already_existed } = res.data;
      if (already_existed) {
        setAddError(`"${institution.name}" is already being tracked.`);
        setAddLoading(false);
        return;
      }
      const data = await fetchInstitutions();
      setSelected(data.find((i: Institution) => i.id === institution.id) ?? data[0]);
      setNewName("");
      setNewSector("Custom");
      setAddOpen(false);
    } catch {
      setAddError("Failed to add institution. Try again.");
    } finally {
      setAddLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await axios.delete(`${API_URL}/institutions/${id}`);
      const data = await fetchInstitutions();
      if (selected?.id === id) setSelected(data[0] ?? null);
      setDeleteConfirm(null);
    } catch {
      alert("Could not delete this institution.");
    }
  };

  const latest = scores[scores.length - 1];
  const isAlert = latest && Math.abs(latest.zscore) > 2;

  const builtIn = institutions.filter((i) => !i.is_custom);
  const custom = institutions.filter((i) => i.is_custom);

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div>
            <h1 className="text-4xl font-bold">Institutional Confidence Index</h1>
            <p className="text-gray-400 mt-1">Real-time trust divergence monitor for major institutions</p>
          </div>
          <button
            onClick={() => { setAddOpen(true); setAddError(""); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-medium transition-all mt-1 text-sm"
          >
            <span className="text-lg leading-none">+</span> Track New Org
          </button>
        </div>

        {/* Add Institution Modal */}
        {addOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-bold mb-1">Track a New Institution</h2>
              <p className="text-gray-400 text-sm mb-5">
                Enter any organisation — bank, agency, university, company. The pipeline will
                run immediately and generate its first ICI score.
              </p>

              <label className="block text-sm text-gray-400 mb-1">Organisation name</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddInstitution()}
                placeholder="e.g. OpenAI, NHS, Stanford University"
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-4"
              />

              <label className="block text-sm text-gray-400 mb-1">Sector</label>
              <select
                value={newSector}
                onChange={(e) => setNewSector(e.target.value)}
                className="w-full bg-gray-800 border border-gray-600 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-blue-500 mb-4"
              >
                {SECTOR_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>

              {addError && (
                <p className="text-red-400 text-sm mb-3">{addError}</p>
              )}

              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => { setAddOpen(false); setNewName(""); setAddError(""); }}
                  className="px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-sm transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddInstitution}
                  disabled={addLoading}
                  className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-sm font-medium transition-all"
                >
                  {addLoading ? "Adding..." : "Add & Run Pipeline"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Institution Groups */}
        <div className="mb-8 mt-6">
          {/* Built-in */}
          <div className="mb-4">
            <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Tracked Institutions</p>
            <div className="flex flex-wrap gap-2">
              {builtIn.map((inst) => (
                <button
                  key={inst.id}
                  onClick={() => setSelected(inst)}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                    selected?.id === inst.id
                      ? "bg-blue-600 text-white border-blue-600"
                      : `${getSectorStyle(inst.sector)} hover:opacity-80`
                  }`}
                >
                  {inst.name}
                  <span className="ml-2 text-xs opacity-60">{inst.sector}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Custom */}
          {custom.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-widest mb-2">Your Custom Orgs</p>
              <div className="flex flex-wrap gap-2">
                {custom.map((inst) => (
                  <div key={inst.id} className="relative group flex items-center">
                    <button
                      onClick={() => setSelected(inst)}
                      className={`pl-4 pr-8 py-2 rounded-full text-sm font-medium transition-all border ${
                        selected?.id === inst.id
                          ? "bg-blue-600 text-white border-blue-600"
                          : `${getSectorStyle(inst.sector)} hover:opacity-80`
                      }`}
                    >
                      {inst.name}
                      <span className="ml-2 text-xs opacity-60">{inst.sector}</span>
                    </button>
                    {/* Delete button */}
                    {deleteConfirm === inst.id ? (
                      <div className="absolute -top-9 left-0 flex gap-1 bg-gray-800 border border-gray-600 rounded-lg px-2 py-1 text-xs whitespace-nowrap z-10">
                        <span className="text-gray-300 mr-1">Remove?</span>
                        <button onClick={() => handleDelete(inst.id)} className="text-red-400 hover:text-red-300 font-medium">Yes</button>
                        <span className="text-gray-600">·</span>
                        <button onClick={() => setDeleteConfirm(null)} className="text-gray-400 hover:text-gray-200">No</button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(inst.id)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all text-xs leading-none"
                        title="Remove"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Selected Institution Panel */}
        {selected && (
          <>
            <div className={`rounded-2xl p-6 mb-6 ${isAlert ? "bg-red-900/40 border border-red-500" : "bg-gray-900"}`}>
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold">{selected.name}</h2>
                    {selected.is_custom && (
                      <span className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded-full border border-gray-600">
                        Custom
                      </span>
                    )}
                  </div>
                  <p className="text-gray-400">{selected.sector}</p>
                </div>
                <button
                  onClick={runPipeline}
                  disabled={loading}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-6 py-2 rounded-lg font-medium transition-all"
                >
                  {loading ? "Running..." : "Run Pipeline"}
                </button>
              </div>

              {latest ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                  <div className="bg-gray-800 rounded-xl p-4">
                    <p className="text-gray-400 text-sm">Stated Confidence</p>
                    <p className="text-3xl font-bold text-blue-400">{latest.stated_confidence_score.toFixed(1)}</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-4">
                    <p className="text-gray-400 text-sm">Behavioral Trust</p>
                    <p className="text-3xl font-bold text-green-400">{latest.behavioral_trust_score.toFixed(1)}</p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-4">
                    <p className="text-gray-400 text-sm">Divergence Score</p>
                    <p className={`text-3xl font-bold ${latest.divergence_score > 0 ? "text-red-400" : "text-green-400"}`}>
                      {latest.divergence_score > 0 ? "+" : ""}{latest.divergence_score.toFixed(1)}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-4">
                    <p className="text-gray-400 text-sm">Z-Score</p>
                    <p className={`text-3xl font-bold ${isAlert ? "text-red-400" : "text-gray-200"}`}>
                      {latest.zscore.toFixed(2)}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="mt-6 text-gray-500 text-sm">
                  No scores yet. Hit <span className="text-white font-medium">Run Pipeline</span> to generate the first ICI score for this institution.
                </div>
              )}

              {isAlert && (
                <div className="mt-4 bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-300 font-medium">
                  ⚠ Alert: Statistically significant divergence detected (Z-score {latest.zscore > 0 ? ">" : "<"} {latest.zscore > 0 ? "2" : "-2"})
                </div>
              )}
            </div>

            {/* Chart */}
            {scores.length > 1 && (
              <div className="bg-gray-900 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">ICI Score History</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={scores}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="created_at"
                      tickFormatter={(v) => new Date(v).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      tick={{ fill: "#9ca3af", fontSize: 11 }}
                    />
                    <YAxis domain={[0, 100]} tick={{ fill: "#9ca3af", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px" }}
                      labelFormatter={(v) => new Date(v).toLocaleString()}
                      formatter={(value) => (typeof value === "number" ? value.toFixed(1) : value)}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="stated_confidence_score" stroke="#60a5fa" name="Stated Confidence" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="behavioral_trust_score" stroke="#34d399" name="Behavioral Trust" dot={false} strokeWidth={2} />
                    <Line type="monotone" dataKey="divergence_score" stroke="#f87171" name="Divergence" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
