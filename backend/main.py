from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_institutions, get_ici_scores, insert_institution, delete_institution, get_alert_history
from ingestion.sec_edgar import fetch_sec_filings
from ingestion.google_trends import fetch_google_trends
from ingestion.earnings import fetch_earnings_transcripts
from ingestion.news_rss import fetch_news_sentiment
from nlp.hedging import compute_stated_confidence
from nlp.sentiment import compute_behavioral_trust
from nlp.divergence import compute_and_store_ici
from scheduler import start_scheduler

app = FastAPI(title="Institutional Confidence Index API")

@app.on_event("startup")
async def startup_event():
    import os
    if os.environ.get("RUN_MAIN") != "true":
        start_scheduler()
        print("Scheduler: Started successfully")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class AddInstitutionRequest(BaseModel):
    name: str
    sector: str = "Custom"

@app.get("/")
def root():
    return {"message": "ICI API is running"}

@app.get("/institutions")
def list_institutions():
    return get_institutions()

@app.post("/institutions")
def add_institution(body: AddInstitutionRequest):
    institution, was_created = insert_institution(
        name=body.name.strip(),
        sector=body.sector.strip()
    )
    if not was_created:
        return {"institution": institution, "already_existed": True}
    return {"institution": institution, "already_existed": False}

@app.delete("/institutions/{institution_id}")
def remove_institution(institution_id: int):
    institutions = get_institutions()
    institution = next((i for i in institutions if i["id"] == institution_id), None)
    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")
    if not institution.get("is_custom"):
        raise HTTPException(status_code=403, detail="Cannot delete a built-in institution")
    delete_institution(institution_id)
    return {"deleted": True, "institution_id": institution_id}

@app.get("/signals/{institution_id}")
def get_signals(institution_id: int):
    """Return recent raw signals for an institution — feeds the news feed on the dashboard."""
    from database import supabase
    from datetime import datetime, timedelta, timezone
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    data = supabase.table("raw_signals")        .select("source, content, sentiment_score, created_at")        .eq("institution_id", institution_id)        .gte("created_at", cutoff)        .order("created_at", desc=True)        .limit(10)        .execute().data
    return data


@app.get("/stats")
def get_stats():
    """Return live counts for the landing page stats bar."""
    from database import supabase
    try:
        inst_count = len(get_institutions())
        scores_count = supabase.table("ici_scores").select("id", count="exact").execute().count
        signals_count = supabase.table("raw_signals").select("id", count="exact").execute().count
        alerts_count = supabase.table("alert_history").select("id", count="exact").execute().count
        return {
            "institutions": inst_count,
            "ici_scores": scores_count or 0,
            "raw_signals": signals_count or 0,
            "alerts": alerts_count or 0,
        }
    except Exception as e:
        print(f"Stats error: {e}")
        return {"institutions": 0, "ici_scores": 0, "raw_signals": 0, "alerts": 0}

@app.get("/latest")
def get_latest_scores():
    """Return the single most recent ICI score for every institution."""
    from database import supabase
    institutions = get_institutions()
    results = []
    for inst in institutions:
        scores = supabase.table("ici_scores")            .select("*")            .eq("institution_id", inst["id"])            .order("created_at", desc=True)            .limit(1)            .execute().data
        if scores:
            results.append({**inst, **scores[0]})
    return results

@app.get("/ici/{institution_id}")
def get_ici(institution_id: int):
    scores = get_ici_scores(institution_id)
    return scores


@app.get("/alerts/{institution_id}")
def get_alerts(institution_id: int):
    """Return alert history for an institution — Z-score crossings above |2|."""
    return get_alert_history(institution_id)

@app.get("/sectors")
def get_sector_summary():
    """Return average ICI scores grouped by sector — single query via SQL."""
    from database import supabase
    try:
        # One query: latest score per institution using a distinct-on-style approach
        # Get all institutions with their latest scores in two queries (much cheaper than 9)
        institutions = get_institutions()
        inst_ids = [i["id"] for i in institutions]
        inst_map = {i["id"]: i for i in institutions}

        # Fetch latest score for all institutions at once
        all_scores = supabase.table("ici_scores")            .select("institution_id,stated_confidence_score,behavioral_trust_score,divergence_score,zscore,created_at")            .in_("institution_id", inst_ids)            .order("created_at", desc=True)            .limit(len(inst_ids) * 5)            .execute().data

        # Keep only the most recent score per institution
        seen = set()
        latest_scores = {}
        for s in all_scores:
            iid = s["institution_id"]
            if iid not in seen:
                seen.add(iid)
                latest_scores[iid] = s

        sector_map: dict = {}
        for iid, s in latest_scores.items():
            inst = inst_map.get(iid)
            if not inst:
                continue
            sector = inst["sector"] or "Other"
            if sector not in sector_map:
                sector_map[sector] = {"sector": sector, "institutions": [], "scores": []}
            sector_map[sector]["institutions"].append(inst["name"])
            sector_map[sector]["scores"].append(s)

        result = []
        for sector, data in sector_map.items():
            ss = data["scores"]
            result.append({
                "sector": sector,
                "institution_count": len(ss),
                "institutions": data["institutions"],
                "avg_scs":       round(sum(x["stated_confidence_score"] for x in ss) / len(ss), 2),
                "avg_bts":       round(sum(x["behavioral_trust_score"]  for x in ss) / len(ss), 2),
                "avg_divergence":round(sum(x["divergence_score"]        for x in ss) / len(ss), 2),
                "avg_zscore":    round(sum(x["zscore"]                  for x in ss) / len(ss), 3),
                "alert":         any(abs(x["zscore"]) > 2 for x in ss),
            })
        return sorted(result, key=lambda x: abs(x["avg_divergence"]), reverse=True)
    except Exception as e:
        print(f"Sectors error: {e}")
        return []

@app.post("/run/{institution_id}")
def run_pipeline(institution_id: int):
    institutions = get_institutions()
    institution = next((i for i in institutions if i["id"] == institution_id), None)

    if not institution:
        raise HTTPException(status_code=404, detail="Institution not found")

    name = institution["name"]

    fetch_sec_filings(name, institution_id)
    fetch_google_trends(name, institution_id)
    fetch_news_sentiment(name, institution_id)
    fetch_earnings_transcripts(name, institution_id)

    from database import supabase
    from datetime import datetime, timedelta, timezone

    # Only use signals from the last 30 days — prevents stale data diluting current scores
    cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
    signals = supabase.table("raw_signals")\
        .select("*")\
        .eq("institution_id", institution_id)\
        .gte("created_at", cutoff)\
        .execute().data

    sec_signals = [s for s in signals if s["source"] == "sec_edgar"]
    behavioral_signals = [s for s in signals if s["source"] in ["google_trends", "news_rss", "earnings"]]

    sec_text = " ".join([s["content"] for s in sec_signals if s["content"]])

    # For non-filers (gov agencies, universities), SEC text is too sparse for VADER.
    # Fall back to news RSS + earnings press releases as the stated confidence source.
    if not sec_text or len(sec_text.strip()) < 100:
        news_signals = [s for s in signals if s["source"] in ["news_rss", "earnings"]]
        sec_text = " ".join([s["content"] for s in news_signals if s["content"]])
        print(f"SCS: using news/earnings text as fallback for sparse SEC content ({len(sec_text)} chars)")

    scs = compute_stated_confidence(sec_text) if sec_text else 50.0

    bts = compute_behavioral_trust(behavioral_signals)
    result = compute_and_store_ici(institution_id, scs, bts)
    return result

@app.post("/run-all")
def run_all():
    institutions = get_institutions()
    results = []
    for institution in institutions:
        result = run_pipeline(institution["id"])
        results.append(result)
    return results
