import requests
import re
from database import insert_raw_signal

HEADERS = {
    "User-Agent": "ICI-project party-gazelle@email.com",
    "Accept-Encoding": "gzip, deflate"
}

# Map common institution names to their SEC CIK numbers for precise lookup
CIK_MAP = {
    "JPMorgan":         "0000019617",
    "Goldman Sachs":    "0000886982",
    "Bank of America":  "0000070858",
    "Wells Fargo":      "0000072971",
    "BlackRock":        "0001364742",
    "Federal Reserve":  None,   # Not an SEC filer
    "FDA":              None,   # Not an SEC filer
    "CDC":              None,   # Not an SEC filer
    "Harvard University": None, # Not an SEC filer
}

def clean_html(html: str) -> str:
    """Strip HTML tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;|&amp;|&lt;|&gt;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def fetch_filing_text(filing_url: str) -> str:
    """Fetch actual text content from an SEC filing document."""
    try:
        resp = requests.get(filing_url, headers=HEADERS, timeout=15)
        if resp.status_code != 200:
            return ""
        text = clean_html(resp.text)
        # Return first 3000 words — enough for FinBERT + hedging analysis
        words = text.split()
        return " ".join(words[:3000])
    except Exception as e:
        print(f"SEC filing fetch error: {e}")
        return ""

def fetch_sec_filings(institution_name, institution_id):
    try:
        cik = CIK_MAP.get(institution_name)

        if cik:
            # Use EDGAR submissions API for known filers — gets real filing index
            submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
            resp = requests.get(submissions_url, headers=HEADERS, timeout=15)
            data = resp.json()

            recent = data.get("filings", {}).get("recent", {})
            forms = recent.get("form", [])
            accessions = recent.get("accessionNumber", [])
            primary_docs = recent.get("primaryDocument", [])

            # Find most recent 10-K or 10-Q
            target_forms = {"10-K", "10-Q"}
            filings_processed = 0

            for i, form in enumerate(forms):
                if filings_processed >= 3:
                    break
                if form not in target_forms:
                    continue

                accession = accessions[i].replace("-", "")
                doc = primary_docs[i]
                filing_url = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession}/{doc}"

                print(f"SEC: Fetching {form} for {institution_name}: {filing_url}")
                text = fetch_filing_text(filing_url)

                if text and len(text) > 200:
                    insert_raw_signal(
                        institution_id=institution_id,
                        source="sec_edgar",
                        content=text[:2000],  # Store up to 2000 chars
                        sentiment_score=None   # Scored by hedging.py, not VADER
                    )
                    filings_processed += 1

            print(f"SEC: Processed {filings_processed} real filings for {institution_name}")

        else:
            # Non-filer (government agencies, universities) — search news/press releases via EDGAR
            # Fall back to full-text search for press releases and speeches
            search_url = (
                f"https://efts.sec.gov/LATEST/search-index?q=%22{institution_name.replace(' ', '+')}%22"
                f"&dateRange=custom&startdt=2024-01-01&forms=8-K"
            )
            resp = requests.get(search_url, headers=HEADERS, timeout=15)
            hits = resp.json().get("hits", {}).get("hits", [])

            filings_processed = 0
            for hit in hits[:3]:
                src = hit.get("_source", {})
                # Try to get the actual document URL
                entity_id = src.get("entity_id", "")
                accession = src.get("file_num", "") or src.get("period_of_report", "")
                # Use display content as fallback — still better than just metadata
                display = src.get("file_date", "") + " " + " ".join(
                    src.get("display_names", []) if isinstance(src.get("display_names"), list) else []
                )
                description = src.get("period_of_report", "") + " " + src.get("form_type", "")
                content = f"{display} {description}".strip()
                if content:
                    insert_raw_signal(
                        institution_id=institution_id,
                        source="sec_edgar",
                        content=content[:500],
                        sentiment_score=None
                    )
                    filings_processed += 1

            print(f"SEC: Processed {filings_processed} filings (non-filer fallback) for {institution_name}")

        return True

    except Exception as e:
        print(f"SEC Error for {institution_name}: {e}")
        return False
