from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

analyzer = SentimentIntensityAnalyzer()

def compute_behavioral_trust(signals):
    if not signals:
        return 50.0

    scores = [s["sentiment_score"] for s in signals if s["sentiment_score"] is not None]

    if not scores:
        return 50.0

    avg_sentiment = sum(scores) / len(scores)
    behavioral_trust = (avg_sentiment + 1) / 2 * 100
    return round(behavioral_trust, 2)

def analyze_text(text):
    scores = analyzer.polarity_scores(text)
    return scores["compound"]