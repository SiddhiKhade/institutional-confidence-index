from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from database import get_institutions, get_ici_scores, insert_institution, delete_institution
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

@app.get("/ici/{institution_id}")
def get_ici(institution_id: int):
    scores = get_ici_scores(institution_id)
    return scores

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
    signals = supabase.table("raw_signals")\
        .select("*")\
        .eq("institution_id", institution_id)\
        .execute().data

    sec_signals = [s for s in signals if s["source"] == "sec_edgar"]
    behavioral_signals = [s for s in signals if s["source"] in ["google_trends", "news_rss", "earnings"]]

    sec_text = " ".join([s["content"] for s in sec_signals if s["content"]])
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
