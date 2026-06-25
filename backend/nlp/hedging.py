import requests
import time
from config import HF_API_KEY

# ProsusAI/finbert is the supported FinBERT model on HuggingFace Inference API
# yiyanghkust/finbert-tone is not supported (missing model_type in config.json)
API_URL = "https://api-inference.huggingface.co/models/ProsusAI/finbert"

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
    headers = {
        "Authorization": f"Bearer {HF_API_KEY}",
        "Content-Type": "application/json"
    }

    for attempt in range(3):
        try:
            response = requests.post(
                API_URL,
                headers=headers,
                json={"inputs": text[:512], "options": {"wait_for_model": True}},
                timeout=60
            )

            print(f"FinBERT HTTP {response.status_code}")

            if response.status_code == 200:
                result = response.json()
                print(f"FinBERT raw response: {result}")

                # ProsusAI/finbert returns [[{label, score}, ...]]
                if isinstance(result, list) and len(result) > 0:
                    inner = result[0]
                    if isinstance(inner, list):
                        items = inner
                    else:
                        items = result

                    # Labels are "positive", "negative", "neutral" (lowercase)
                    scores = {item["label"].lower(): item["score"] for item in items if isinstance(item, dict)}
                    positive = scores.get("positive", 0.5)
                    negative = scores.get("negative", 0.5)
                    confidence = positive - negative
                    normalized = (confidence + 1) / 2
                    print(f"FinBERT: positive={positive:.3f}, negative={negative:.3f}, SCS_raw={normalized:.3f}")
                    return normalized

            elif response.status_code == 503:
                print(f"FinBERT model loading, waiting 20s... (attempt {attempt + 1})")
                time.sleep(20)
                continue

            else:
                print(f"FinBERT error {response.status_code}: {response.text[:300]}")
                time.sleep(5)

        except Exception as e:
            print(f"FinBERT exception (attempt {attempt + 1}): {e}")
            time.sleep(5)

    print("FinBERT: all retries failed, returning fallback 0.5")
    return 0.5

def compute_stated_confidence(text):
    hedging_density = count_hedging_phrases(text)
    finbert_score = get_finbert_sentiment(text)
    hedging_penalty = min(hedging_density / 10, 0.5)
    scs = finbert_score - hedging_penalty
    print(f"SCS: finbert={finbert_score:.3f}, hedging={hedging_density:.2f}, penalty={hedging_penalty:.3f}, final={scs*100:.1f}")
    return max(0, min(100, scs * 100))
