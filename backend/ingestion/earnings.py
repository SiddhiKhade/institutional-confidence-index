import requests
from bs4 import BeautifulSoup
from database import insert_raw_signal
from nlp.sentiment import analyze_text

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
}

# Motley Fool search URL for earnings transcripts
def fetch_earnings_transcripts(institution_name, institution_id):
    try:
        # Search for earnings call transcripts on Motley Fool
        search_url = f"https://www.fool.com/search/solr.aspx?q={institution_name.replace(' ', '+')}+earnings+call+transcript"
        
        response = requests.get(search_url, headers=HEADERS, timeout=10)
        soup = BeautifulSoup(response.content, "html.parser")

        # Find article links
        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            if "earnings-call-transcript" in href:
                if href.startswith("/"):
                    href = f"https://www.fool.com{href}"
                links.append(href)

        links = list(set(links))[:3]  # Top 3 unique transcript links

        if not links:
            print(f"Earnings: No transcripts found for {institution_name}")
            return False

        articles_processed = 0
        for link in links:
            try:
                article_response = requests.get(link, headers=HEADERS, timeout=10)
                article_soup = BeautifulSoup(article_response.content, "html.parser")

                # Extract main article text
                paragraphs = article_soup.find_all("p")
                text = " ".join([p.get_text() for p in paragraphs[:20]])

                if len(text) > 100:
                    score = analyze_text(text[:1000])
                    insert_raw_signal(
                        institution_id=institution_id,
                        source="earnings",
                        content=text[:500],
                        sentiment_score=score
                    )
                    articles_processed += 1

            except Exception as e:
                print(f"Earnings article error ({link}): {e}")
                continue

        print(f"Earnings: Processed {articles_processed} transcripts for {institution_name}")
        return True

    except Exception as e:
        print(f"Earnings Error for {institution_name}: {e}")
        return False