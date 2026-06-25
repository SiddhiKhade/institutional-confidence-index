import requests
import time
from config import HF_API_KEY

# Updated HuggingFace Inference API URL
API_URL = "https://api-inference.huggingface.co/models/yiyanghkust/finbert-tone"
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
    density = (count / max(words, 1)) * 1000
    return density

def get_finbert_sentiment(text):
    max_retries = 3

    for attempt in range(max_retries):
        try:
            payload = {"inputs": text[:512]}
            response = requests.post(API_URL, headers=HEADERS, json=payload, timeout=30)

            if response.status_code == 503:
                # Model loading
                wait_time = 20
                try:
                    wait_time = response.json().get("estimated_time", 20)
                except Exception:
                    pass
                print(f"FinBERT loading, waiting {wait_time}s... (attempt {attempt + 1})")
                time.sleep(wait_time)
                continue

            if response.status_code != 200:
                print(f"FinBERT HTTP {response.status_code}: {response.text[:200]}")
                time.sleep(5)
                continue

            result = response.json()

            # Handle both [[{...}]] and [{...}] response formats
            if isinstance(result, list) and len(result) > 0:
                inner = result[0]
                # Unwrap nested list if needed
                if isinstance(inner, list) and len(inner) > 0:
                    inner = inner[0]
                    scores = {item["label"]: item["score"] for item in result[0]}
                else:
                    scores = {item["label"]: item["score"] for item in result[0]}

                positive = scores.get("Positive", 0.5)
                negative = scores.get("Negative", 0.5)
                confidence = positive - negative
                normalized = (confidence + 1) / 2
                print(f"FinBERT: Positive={positive:.3f}, Negative={negative:.3f}, SCS_raw={normalized:.3f}")
                return normalized

            print(f"FinBERT unexpected response format: {result}")
            return 0.5

        except Exception as e:
            print(f"FinBERT Error (attempt {attempt + 1}): {e}")
            time.sleep(5)

    print("FinBERT: All retries failed, using fallback 0.5")
    return 0.5

def compute_stated_confidence(text):
    hedging_density = count_hedging_phrases(text)
    finbert_score = get_finbert_sentiment(text)
    hedging_penalty = min(hedging_density / 10, 0.5)
    scs = finbert_score - hedging_penalty
    print(f"SCS: finbert={finbert_score:.3f}, hedging_density={hedging_density:.2f}, penalty={hedging_penalty:.3f}, final={scs*100:.1f}")
    return max(0, min(100, scs * 100))
