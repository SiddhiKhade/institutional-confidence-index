import requests
from config import HF_API_KEY

API_URL = "https://router.huggingface.co/hf-inference/models/yiyanghkust/finbert-tone"
HEADERS = {"Authorization": f"Bearer {HF_API_KEY}"}

HEDGING_PHRASES = [
    "subject to", "may differ", "cannot guarantee", "material uncertainty",
    "forward-looking", "risk factors", "no assurance", "could differ materially",
    "subject to change", "not guaranteed", "may not", "there can be no assurance",
    "future results may", "uncertainties", "cautionary", "contingent upon",
    "subject to risks", "we cannot predict", "actual results may differ",
    "subject to market conditions", "no guarantee", "subject to approval",
    "may be impacted", "subject to regulatory", "forward looking statements"
]

def count_hedging_phrases(text):
    text_lower = text.lower()
    count = sum(1 for phrase in HEDGING_PHRASES if phrase in text_lower)
    words = len(text.split())
    # Hedging density per 1000 words
    density = (count / max(words, 1)) * 1000
    return density

def get_finbert_sentiment(text):
    import time
    max_retries = 3
    
    for attempt in range(max_retries):
        try:
            payload = {"inputs": text[:512]}
            response = requests.post(API_URL, headers=HEADERS, json=payload)
            result = response.json()

            # Model is loading - wait and retry
            if isinstance(result, dict) and "error" in result and "loading" in result.get("error", "").lower():
                wait_time = result.get("estimated_time", 20)
                print(f"FinBERT loading, waiting {wait_time}s... (attempt {attempt + 1})")
                time.sleep(wait_time)
                continue

            if isinstance(result, list) and len(result) > 0:
                scores = {item["label"]: item["score"] for item in result[0]}
                confidence = scores.get("Positive", 0.5) - scores.get("Negative", 0.5)
                return (confidence + 1) / 2

            return 0.5

        except Exception as e:
            print(f"FinBERT Error (attempt {attempt + 1}): {e}")
            time.sleep(5)
    
    return 0.5

def compute_stated_confidence(text):
    hedging_density = count_hedging_phrases(text)
    finbert_score = get_finbert_sentiment(text)

    # High hedging = lower confidence
    hedging_penalty = min(hedging_density / 10, 0.5)
    scs = finbert_score - hedging_penalty

    # Normalize to 0-100
    return max(0, min(100, scs * 100))