from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# HuggingFace API is not reachable from Render (DNS resolution fails for api-inference.huggingface.co).
# Using VADER + financial domain keywords instead — runs fully locally, no network calls.
# VADER is already installed (vaderSentiment==3.3.2 in requirements.txt).

analyzer = SentimentIntensityAnalyzer()

HEDGING_PHRASES = [
    "subject to", "may differ", "cannot guarantee", "material uncertainty",
    "forward-looking", "risk factors", "no assurance", "could differ materially",
    "subject to change", "not guaranteed", "may not", "there can be no assurance",
    "future results may", "uncertainties", "cautionary", "contingent upon",
    "subject to risks", "we cannot predict", "actual results may differ",
    "subject to market conditions", "no guarantee", "subject to approval",
    "may be impacted", "subject to regulatory", "forward looking statements"
]

POSITIVE_FINANCIAL = [
    "strong", "record", "growth", "beat", "exceeded", "robust", "momentum",
    "outperform", "confident", "positive", "improve", "gain", "increase",
    "expand", "solid", "resilient", "deliver", "achieve", "excellent"
]

NEGATIVE_FINANCIAL = [
    "loss", "decline", "miss", "below", "weak", "concern", "risk",
    "challenge", "difficult", "uncertain", "volatile", "headwind",
    "pressure", "deteriorat", "impair", "writedown", "restructur"
]

def count_hedging_phrases(text):
    text_lower = text.lower()
    count = sum(1 for phrase in HEDGING_PHRASES if phrase in text_lower)
    words = len(text.split())
    density = (count / max(words, 1)) * 1000
    return density

def get_financial_sentiment(text):
    text_lower = text.lower()
    words = text_lower.split()
    total = len(words)

    pos_count = sum(1 for kw in POSITIVE_FINANCIAL if kw in text_lower)
    neg_count = sum(1 for kw in NEGATIVE_FINANCIAL if kw in text_lower)

    chunk = " ".join(words[:1000])
    vader_scores = analyzer.polarity_scores(chunk)
    vader_compound = vader_scores["compound"]  # -1 to +1

    domain_boost = (pos_count - neg_count) / max(total / 100, 1)
    domain_boost = max(-0.5, min(0.5, domain_boost))

    blended = (vader_compound * 0.6) + (domain_boost * 0.4)
    normalized = (blended + 1) / 2
    print(f"Sentiment: vader={vader_compound:.3f}, domain_boost={domain_boost:.3f}, normalized={normalized:.3f}")
    return normalized

def compute_stated_confidence(text):
    if not text or len(text.strip()) < 50:
        print("SCS: text too short, returning fallback 50.0")
        return 50.0
    hedging_density = count_hedging_phrases(text)
    sentiment_score = get_financial_sentiment(text)
    hedging_penalty = min(hedging_density / 10, 0.5)
    scs = sentiment_score - hedging_penalty
    result = max(0, min(100, scs * 100))
    print(f"SCS: sentiment={sentiment_score:.3f}, hedging={hedging_density:.2f}, penalty={hedging_penalty:.3f}, final={result:.1f}")
    return result
