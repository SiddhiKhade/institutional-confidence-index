from pytrends.request import TrendReq
from database import insert_raw_signal
import time

time.sleep(2)
pytrends = TrendReq(hl='en-US', tz=360)

def fetch_google_trends(institution_name, institution_id):
    try:
        keywords = [
            f"{institution_name} problems",
            f"{institution_name} scandal",
            f"{institution_name} lawsuit"
        ]

        trust_scores = []

        # FIX: query all 3 keywords individually to avoid rate limits, average results
        for keyword in keywords:
            try:
                pytrends.build_payload(
                    [keyword],
                    cat=0,
                    timeframe='today 3-m',
                    geo='US'
                )
                data = pytrends.interest_over_time()

                if not data.empty:
                    avg_interest = data.iloc[:, 0].mean()
                    # Higher search interest for negative terms = lower trust
                    trust_score = 1 - (avg_interest / 100)
                    trust_scores.append((keyword, avg_interest, trust_score))
                    print(f"Google Trends: '{keyword}' interest={avg_interest:.1f}, trust={trust_score:.2f}")

                time.sleep(3)  # Respect rate limits between keyword calls

            except Exception as e:
                print(f"Google Trends: Failed for keyword '{keyword}': {e}")
                time.sleep(5)
                continue

        if not trust_scores:
            print(f"Google Trends: No data returned for {institution_name}")
            return False

        # Store one aggregated signal — average across all keywords that returned data
        avg_trust = sum(t[2] for t in trust_scores) / len(trust_scores)
        summary = " | ".join([f"'{k}': {i:.1f}" for k, i, _ in trust_scores])

        insert_raw_signal(
            institution_id=institution_id,
            source="google_trends",
            content=f"Search interest ({institution_name}): {summary}",
            sentiment_score=avg_trust
        )

        print(f"Google Trends: {institution_name} — avg trust score: {avg_trust:.2f} across {len(trust_scores)} keywords")
        return True

    except Exception as e:
        print(f"Google Trends Error for {institution_name}: {e}")
        return False
