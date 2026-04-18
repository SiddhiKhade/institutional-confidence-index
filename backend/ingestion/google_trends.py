from pytrends.request import TrendReq
from database import insert_raw_signal

pytrends = TrendReq(hl='en-US', tz=360)

def fetch_google_trends(institution_name, institution_id):
    try:
        keywords = [
            f"{institution_name} problems",
            f"{institution_name} scandal",
            f"{institution_name} lawsuit"
        ]

        pytrends.build_payload(
            keywords[:1],  # Use one keyword at a time to avoid rate limits
            cat=0,
            timeframe='today 3-m',
            geo='US'
        )

        data = pytrends.interest_over_time()

        if data.empty:
            print(f"Google Trends: No data for {institution_name}")
            return False

        # Average interest score over the period (0-100)
        avg_interest = data.iloc[:, 0].mean()

        # Higher search interest = lower trust signal
        # Normalize: 100 interest = 0 trust, 0 interest = 1 trust
        trust_score = 1 - (avg_interest / 100)

        insert_raw_signal(
            institution_id=institution_id,
            source="google_trends",
            content=f"Avg search interest for '{keywords[0]}': {avg_interest:.2f}",
            sentiment_score=trust_score
        )

        print(f"Google Trends: Processed {institution_name} - interest: {avg_interest:.2f}")
        return True

    except Exception as e:
        print(f"Google Trends Error for {institution_name}: {e}")
        return False