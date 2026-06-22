import requests
import re
from database import insert_raw_signal
from nlp.sentiment import analyze_text

HEADERS = {
    "User-Agent": "ICI-project party-gazelle@email.com",
    "Accept-Encoding": "gzip, deflate"
}

# CIK numbers for known SEC filers — same map as sec_edgar.py
CIK_MAP = {
    "JPMorgan":         "0000019617",
    "Goldman Sachs":    "0000886982",
    "Bank of America":  "0000070858",
    "Wells Fargo":      "0000072971",
    "BlackRock":        "0001364742",
    "Federal Reserve":  None,
    "FDA":              None,
    "CDC":              None,
    "Harvard University": None,
}

def clean_html(html: str) -> str:
    text = re.sub(r"<[^>]+>", " ", html)
    text = re.sub(r"&nbsp;|&amp;|&lt;|&gt;|&#\d+;", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()

def fetch_earnings_transcripts(institution_name, institution_id):
    """
    Fetch earnings call content from SEC EDGAR 8-K filings.
    8-K Item 2.02 = Results of Operations (earnings releases).
    Falls back to news RSS sentiment for non-filers.
    """
    try:
        cik = CIK_MAP.get(institution_name)

        if cik:
            # Get recent 8-K filings from EDGAR submissions API
            submissions_url = f"https://data.sec.gov/submissions/CIK{cik}.json"
            resp = requests.get(submissions_url, headers=HEADERS, timeout=15)
            data = resp.json()

            recent = data.get("filings", {}).get("recent", {})
            forms        = recent.get("form", [])
            accessions   = recent.get("accessionNumber", [])
            primary_docs = recent.get("primaryDocument", [])

            processed = 0
            for i, form in enumerate(forms):
                if processed >= 3:
                    break
                if form != "8-K":
                    continue

                accession = accessions[i].replace("-", "")
                doc       = primary_docs[i]
                url       = f"https://www.sec.gov/Archives/edgar/data/{int(cik)}/{accession}/{doc}"

                try:
                    r = requests.get(url, headers=HEADERS, timeout=15)
                    if r.status_code != 200:
                        continue
                    text = clean_html(r.text)
                    words = text.split()
                    excerpt = " ".join(words[:2000])

                    if len(excerpt) > 200:
                        score = analyze_text(excerpt[:1000])
                        insert_raw_signal(
                            institution_id=institution_id,
                            source="earnings",
                            content=excerpt[:500],
                            sentiment_score=score
                        )
                        processed += 1
                        print(f"Earnings: Stored 8-K for {institution_name}")
                except Exception as e:
                    print(f"Earnings: Failed to fetch 8-K doc ({url}): {e}")
                    continue

            print(f"Earnings: Processed {processed} 8-K filings for {institution_name}")
            return processed > 0

        else:
            # Non-filers (gov agencies, universities) — use Google News RSS as proxy
            url = (
                f"https://news.google.com/rss/search"
                f"?q={institution_name.replace(' ', '+')}+statement+announcement"
                f"&hl=en-US&gl=US&ceid=US:en"
            )
            import xml.etree.ElementTree as ET
            r = requests.get(url, timeout=10, headers={"User-Agent": "Mozilla/5.0"})
            root = ET.fromstring(r.content)
            processed = 0
            for item in root.findall(".//item")[:5]:
                title = item.findtext("title") or ""
                desc  = item.findtext("description") or ""
                text  = f"{title} {desc}".strip()
                if text:
                    score = analyze_text(text)
                    insert_raw_signal(
                        institution_id=institution_id,
                        source="earnings",
                        content=text[:500],
                        sentiment_score=score
                    )
                    processed += 1

            print(f"Earnings: Stored {processed} press-release signals for {institution_name}")
            return processed > 0

    except Exception as e:
        print(f"Earnings Error for {institution_name}: {e}")
        return False
