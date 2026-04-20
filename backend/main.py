from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import get_institutions, get_ici_scores
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

@app.get("/")
def root():
    return {"message": "ICI API is running"}

@app.get("/institutions")
def list_institutions():
    return get_institutions()

@app.get("/ici/{institution_id}")
def get_ici(institution_id: int):
    scores = get_ici_scores(institution_id)
    return scores

@app.post("/run/{institution_id}")
def run_pipeline(institution_id: int):
    institutions = get_institutions()
    institution = next((i for i in institutions if i["id"] == institution_id), None)
    
    if not institution:
        return {"error": "Institution not found"}
    
    name = institution["name"]
    
    # Step 1: Fetch SEC filings
    fetch_sec_filings(name, institution_id)
    
    # Step 2: Fetch Google Trends
    fetch_google_trends(name, institution_id)

     # Step 3: Fetch News RSS
    fetch_news_sentiment(name, institution_id)
    
    # Step 4: Fetch Earnings Transcripts
    fetch_earnings_transcripts(name, institution_id)

    # Step 3: Get raw signals from DB and compute scores
    from database import supabase
    signals = supabase.table("raw_signals")\
        .select("*")\
        .eq("institution_id", institution_id)\
        .execute().data
    
    sec_signals = [s for s in signals if s["source"] == "sec_edgar"]
    behavioral_signals = [s for s in signals if s["source"] in ["google_trends", "news_rss", "earnings"]]
    # Compute SCS from SEC filings
    sec_text = " ".join([s["content"] for s in sec_signals if s["content"]])
    scs = compute_stated_confidence(sec_text) if sec_text else 50.0
    
    # Compute BTS from behavioral signals
    bts = compute_behavioral_trust(behavioral_signals)
    
    # Compute and store ICI
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