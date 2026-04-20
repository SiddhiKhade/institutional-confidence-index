# institutional-confidence-index

**A live NLP system that detects divergence between what major institutions say publicly and what behavioral signals around them show.**

🔴 [Live Dashboard](https://institutional-confidence-index-nlawi5apt-siddhikhades-projects.vercel.app) | 📡 [API](https://institutional-confidence-index.onrender.com/docs)

---

## What It Does

Major institutions — banks, government agencies, universities — often project confidence in official communications while public trust quietly erodes underneath. ICI measures that gap in real time.

When a bank's SEC filings sound confident but Google searches for "[bank] problems" are spiking, that divergence is a signal. When a government agency's press releases use increasingly hedged language while news sentiment turns negative, that's a signal too. ICI quantifies these gaps, tracks them over time, and alerts when divergence becomes statistically significant.

---

## Why It Matters

Institutional trust is one of the most valuable and least-measured signals in finance, policy, and public health. The gap between what institutions *say* and what people *believe* has real consequences:

- **For investors:** Early trust erosion in a bank or financial institution often precedes regulatory action, stock decline, or credit rating changes. ICI surfaces this signal before it becomes headlines.
- **For journalists and researchers:** Detecting when an institution's language is diverging from public perception provides a data-driven basis for investigative reporting.
- **For regulators:** Monitoring institutional confidence divergence across sectors provides an early warning system for systemic risk.
- **For the public:** Transparency into how institutions are perceived vs. how they present themselves is a public good.

---

## Real-World Use Cases

**Financial Risk Monitoring** — A hedge fund or risk desk can use ICI to monitor trust divergence across major banks and financial institutions. A Z-score alert on Wells Fargo before a regulatory announcement is exactly the kind of edge quantitative teams look for.

**Regulatory Early Warning** — Government agencies can monitor peer institutions. If the FDA's behavioral trust score drops while its stated confidence stays high, that's a signal worth investigating internally.

**ESG and Reputation Analytics** — ESG research firms track reputational risk as a component of governance scoring. ICI provides a quantitative, reproducible methodology for institutional reputation monitoring.

**Investigative Journalism** — A reporter covering financial institutions can use ICI's divergence alerts as a starting point for deeper investigation — the data tells you *where* to look.

**Academic Research** — ICI provides a live dataset for studying the relationship between institutional language, public trust, and behavioral outcomes over time.

---

## The Four Scores — What They Mean and How They're Calculated

### 1. Stated Confidence Score (SCS) — Range: 0 to 100

**What it means:** How confident is the institution's official language right now?

**How it's calculated:**

Step 1 — FinBERT Analysis: SEC filings and earnings transcripts are sent to FinBERT (yiyanghkust/finbert-tone), a transformer model pretrained on financial text. It returns three probabilities: Positive, Negative, Neutral. Raw confidence = `Positive - Negative`, normalized to 0–1.

Step 2 — Hedging Phrase Detection: A custom lexicon of 25 financial hedging phrases is applied to the text. Phrases like *"subject to material uncertainty," "results may differ materially," "no assurance can be given"* are counted per 1000 words. Higher hedging density = lower confidence.

Step 3 — Final Score:
```
hedging_penalty = min(hedging_density / 10, 0.5)
SCS = (FinBERT_confidence - hedging_penalty) × 100
```

High SCS (70–100) = institution is speaking confidently in official documents.
Low SCS (0–40) = institution is heavily hedging its language.

---

### 2. Behavioral Trust Score (BTS) — Range: 0 to 100

**What it means:** What do public behavioral signals actually show about trust in this institution?

**How it's calculated:**

Step 1 — Google Trends: Search interest for "[institution] problems," "[institution] scandal," and "[institution] lawsuit" is pulled for the past 3 months. High search interest = people are actively worried = lower trust. The score is inverted: `trust = 1 - (search_interest / 100)`.

Step 2 — Google News Sentiment: Recent news headlines mentioning the institution are pulled via Google News RSS and scored using VADER (Valence Aware Dictionary and sEntiment Reasoner). VADER returns a compound score from -1 (most negative) to +1 (most positive).

Step 3 — Final Score:
```
BTS = average of all behavioral signal scores × 100
```

High BTS (70–100) = public signals show strong trust.
Low BTS (0–40) = public signals show concern or eroding trust.

---

### 3. Divergence Score — Range: typically -100 to +100

**What it means:** The gap between what the institution says and what the public shows.

**How it's calculated:**
```
Divergence = SCS - BTS
```

**Positive divergence** = institution sounds confident while public trust is low. This is the danger signal — the institution may be projecting stability while trust erodes underneath.

**Negative divergence** = institution is cautious in language but public trust is high. Generally less concerning.

**Near zero** = institution's words and public perception are aligned.

---

### 4. Z-Score — Unitless, typically -3 to +3

**What it means:** Is the current divergence unusual for *this specific institution*, relative to its own history?

**Why it matters:** JPMorgan and the CDC have completely different baseline divergence patterns. A divergence of 20 might be normal for one and alarming for the other. The Z-score measures each institution against its own historical baseline, not a universal threshold.

**How it's calculated:**

The last 30 divergence scores for the institution are pulled from the database. The Z-score is computed as:
```
Z = (current_divergence - historical_mean) / historical_std
```

**Z > 2 or Z < -2** triggers an alert — the divergence is statistically significant, more than 2 standard deviations from that institution's normal range.

---

## Architecture

```
Data Sources                NLP Pipeline              Output
─────────────               ────────────              ──────
SEC EDGAR API    ──┐
Google Trends    ──┼──▶  FinBERT (hedging)  ──▶  ICI Score Engine  ──▶  Supabase
Google News RSS  ──┘     VADER (sentiment)        (divergence +          (timestamped)
                                                   Z-score)                    │
                                                                               ▼
                                                                        Next.js Dashboard
```

**Stack:**
- Backend: Python, FastAPI, APScheduler
- NLP: FinBERT (HuggingFace Inference API), VADER, custom hedging lexicon
- Database: Supabase (PostgreSQL)
- Frontend: Next.js, Tailwind CSS, Recharts
- Deployment: Render (backend), Vercel (frontend)
- Auto-refresh: Pipeline runs every 6 hours across all 9 institutions

---

## Institutions Tracked

| Institution | Sector |
|---|---|
| JPMorgan | Banking |
| Goldman Sachs | Banking |
| Bank of America | Banking |
| Wells Fargo | Banking |
| BlackRock | Finance |
| Federal Reserve | Government |
| FDA | Government |
| CDC | Government |
| Harvard University | Education |

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/institutions` | List all tracked institutions |
| GET | `/ici/{institution_id}` | Get ICI score history for an institution |
| POST | `/run/{institution_id}` | Manually trigger pipeline for one institution |
| POST | `/run-all` | Trigger pipeline for all institutions |

Full interactive docs at `/docs`

---

## Built By

**Siddhi Khade** ```


Tell me when done.
