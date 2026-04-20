import requests
import xml.etree.ElementTree as ET
from database import insert_raw_signal
from nlp.sentiment import analyze_text

def fetch_news_sentiment(institution_name, institution_id):
    try:
        # Google News RSS - most reliable, no API key needed
        url = f"https://news.google.com/rss/search?q={institution_name.replace(' ', '+')}&hl=en-US&gl=US&ceid=US:en"
        
        response = requests.get(url, timeout=10, headers={
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        })

        root = ET.fromstring(response.content)
        articles = []

        for item in root.findall(".//item"):
            title = item.findtext("title") or ""
            description = item.findtext("description") or ""
            text = f"{title} {description}"
            if text.strip():
                articles.append(text)

        if not articles:
            print(f"News RSS: No articles found for {institution_name}")
            return False

        for article in articles[:10]:
            score = analyze_text(article)
            insert_raw_signal(
                institution_id=institution_id,
                source="news_rss",
                content=article[:500],
                sentiment_score=score
            )

        print(f"News RSS: Processed {len(articles[:10])} articles for {institution_name}")
        return True

    except Exception as e:
        print(f"News RSS Error for {institution_name}: {e}")
        return False