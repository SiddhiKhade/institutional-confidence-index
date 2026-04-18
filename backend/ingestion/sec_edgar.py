import requests
from database import insert_raw_signal
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

analyzer = SentimentIntensityAnalyzer()

HEADERS = {
    "User-Agent": "ICI-project party-gazelle@email.com"
}

def fetch_sec_filings(institution_name, institution_id):
    try:
        # Search SEC EDGAR for filings
        search_url = f"https://efts.sec.gov/LATEST/search-index?q=%22{institution_name}%22&dateRange=custom&startdt=2024-01-01&forms=10-K,10-Q,8-K"
        
        response = requests.get(search_url, headers=HEADERS)
        data = response.json()
        
        hits = data.get("hits", {}).get("hits", [])
        
        for hit in hits[:5]:  # Process top 5 filings
            source_data = hit.get("_source", {})
            content = source_data.get("period_of_report", "") + " " + source_data.get("display_names", "")
            
            if content.strip():
                sentiment = analyzer.polarity_scores(content)
                score = sentiment["compound"]
                
                insert_raw_signal(
                    institution_id=institution_id,
                    source="sec_edgar",
                    content=content[:500],
                    sentiment_score=score
                )
        
        print(f"SEC: Processed {len(hits[:5])} filings for {institution_name}")
        return True
    
    except Exception as e:
        print(f"SEC Error for {institution_name}: {e}")
        return False