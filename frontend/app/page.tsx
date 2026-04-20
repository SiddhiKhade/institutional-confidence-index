"use client";
import { useEffect, useState } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

const API_URL = "https://institutional-confidence-index.onrender.com";

interface Institution {
  id: number;
  name: string;
  sector: string;
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

export default function Home() {
  const [institutions, setInstitutions] = useState<Institution[]>([]);
  const [selected, setSelected] = useState<Institution | null>(null);
  const [scores, setScores] = useState<ICIScore[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    axios.get(`${API_URL}/institutions`).then((res) => {
      setInstitutions(res.data);
      setSelected(res.data[0]);
    });
  }, []);

  useEffect(() => {
    if (!selected) return;
    axios.get(`${API_URL}/ici/${selected.id}`).then((res) => {
      setScores(res.data.reverse());
    });
  }, [selected]);

  const runPipeline = async () => {
    if (!selected) return;
    setLoading(true);
    await axios.post(`${API_URL}/run/${selected.id}`);
    const res = await axios.get(`${API_URL}/ici/${selected.id}`);
    setScores(res.data.reverse());
    setLoading(false);
  };

  const latest = scores[scores.length - 1];
  const isAlert = latest && Math.abs(latest.zscore) > 2;

  return (
    <main className="min-h-screen bg-gray-950 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold mb-2">Institutional Confidence Index</h1>
        <p className="text-gray-400 mb-8">Real-time trust divergence monitor for major institutions</p>

        {/* Institution Selector */}
        <div className="flex flex-wrap gap-2 mb-8">
          {institutions.map((inst) => (
            <button
              key={inst.id}
              onClick={() => setSelected(inst)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all ${
                selected?.id === inst.id
                  ? "bg-blue-600 text-white"
                  : "bg-gray-800 text-gray-300 hover:bg-gray-700"
              }`}
            >
              {inst.name}
            </button>
          ))}
        </div>

        {selected && (
          <>
            {/* Header Card */}
            <div className={`rounded-2xl p-6 mb-6 ${isAlert ? "bg-red-900/40 border border-red-500" : "bg-gray-900"}`}>
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">{selected.name}</h2>
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

              {latest && (
                <div className="grid grid-cols-4 gap-4 mt-6">
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
                      {latest.divergence_score.toFixed(1)}
                    </p>
                  </div>
                  <div className="bg-gray-800 rounded-xl p-4">
                    <p className="text-gray-400 text-sm">Z-Score</p>
                    <p className={`text-3xl font-bold ${isAlert ? "text-red-400" : "text-gray-200"}`}>
                      {latest.zscore.toFixed(2)}
                    </p>
                  </div>
                </div>
              )}

              {isAlert && (
                <div className="mt-4 bg-red-500/20 border border-red-500 rounded-lg p-3 text-red-300 font-medium">
                  ⚠ Alert: Statistically significant divergence detected (Z-score &gt; 2)
                </div>
              )}
            </div>

            {/* Chart */}
            {scores.length > 0 && (
              <div className="bg-gray-900 rounded-2xl p-6">
                <h3 className="text-lg font-semibold mb-4">ICI Score History</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={scores}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="created_at" tick={false} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip
                      contentStyle={{ backgroundColor: "#1f2937", border: "none" }}
                      formatter={(value: number) => value.toFixed(1)}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="stated_confidence_score" stroke="#60a5fa" name="Stated Confidence" dot={false} />
                    <Line type="monotone" dataKey="behavioral_trust_score" stroke="#34d399" name="Behavioral Trust" dot={false} />
                    <Line type="monotone" dataKey="divergence_score" stroke="#f87171" name="Divergence" dot={false} />
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