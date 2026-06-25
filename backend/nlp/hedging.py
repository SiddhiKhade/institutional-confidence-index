import time
from config import HF_API_KEY

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
    try:
        from huggingface_hub import InferenceClient
        client = InferenceClient(
            provider="hf-inference",
            api_key=HF_API_KEY,
        )

        result = client.text_classification(
            text[:512],
            model="yiyanghkust/finbert-tone"
        )

        # result is a list of ClassificationOutputElement with .label and .score
        scores = {item.label: item.score for item in result}
        positive = scores.get("Positive", 0.5)
        negative = scores.get("Negative", 0.5)
        confidence = positive - negative
        normalized = (confidence + 1) / 2
        print(f"FinBERT: Positive={positive:.3f}, Negative={negative:.3f}, SCS_raw={normalized:.3f}")
        return normalized

    except Exception as e:
        print(f"FinBERT Error: {e}")
        # Fallback: use hedging density only
        return 0.5

def compute_stated_confidence(text):
    hedging_density = count_hedging_phrases(text)
    finbert_score = get_finbert_sentiment(text)
    hedging_penalty = min(hedging_density / 10, 0.5)
    scs = finbert_score - hedging_penalty
    print(f"SCS: finbert={finbert_score:.3f}, hedging_density={hedging_density:.2f}, penalty={hedging_penalty:.3f}, final={scs*100:.1f}")
    return max(0, min(100, scs * 100))
