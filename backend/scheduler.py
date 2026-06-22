from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.interval import IntervalTrigger
from database import get_institutions
from ingestion.sec_edgar import fetch_sec_filings
from ingestion.google_trends import fetch_google_trends
from ingestion.news_rss import fetch_news_sentiment
from ingestion.earnings import fetch_earnings_transcripts
from nlp.hedging import compute_stated_confidence
from nlp.sentiment import compute_behavioral_trust
from nlp.divergence import compute_and_store_ici
import time

scheduler = BackgroundScheduler()

def run_full_pipeline():
    print("Scheduler: Starting automated pipeline run for all institutions...")
    institutions = get_institutions()

    for institution in institutions:
        try:
            name = institution["name"]
            institution_id = institution["id"]

            print(f"Scheduler: Processing {name}...")

            fetch_sec_filings(name, institution_id)
            time.sleep(2)

            fetch_google_trends(name, institution_id)
            time.sleep(2)

            fetch_news_sentiment(name, institution_id)
            time.sleep(1)

            fetch_earnings_transcripts(name, institution_id)
            time.sleep(1)

            from database import supabase
            from datetime import datetime, timedelta, timezone

            # FIX: Only use signals from the last 30 days — prevents stale data dilution
            cutoff = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
            signals = supabase.table("raw_signals")\
                .select("*")\
                .eq("institution_id", institution_id)\
                .gte("created_at", cutoff)\
                .execute().data

            sec_signals = [s for s in signals if s["source"] == "sec_edgar"]
            behavioral_signals = [s for s in signals if s["source"] in ["google_trends", "news_rss", "earnings"]]

            sec_text = " ".join([s["content"] for s in sec_signals if s["content"]])
            scs = compute_stated_confidence(sec_text) if sec_text else 50.0
            bts = compute_behavioral_trust(behavioral_signals)

            compute_and_store_ici(institution_id, scs, bts)

            print(f"Scheduler: Completed {name}")
            time.sleep(3)

        except Exception as e:
            print(f"Scheduler Error for {institution.get('name', 'unknown')}: {e}")
            continue

    print("Scheduler: Pipeline run complete for all institutions.")

def start_scheduler():
    scheduler.add_job(
        run_full_pipeline,
        trigger=IntervalTrigger(hours=6),  # FIX: was minutes=1, now correctly every 6 hours
        id="full_pipeline",
        name="Run ICI pipeline for all institutions",
        replace_existing=True
    )
    scheduler.start()
    print("Scheduler: Started - pipeline will run every 6 hours.")
