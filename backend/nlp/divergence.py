import numpy as np
from database import get_ici_scores, insert_ici_score, insert_alert

def compute_zscore(values):
    if len(values) < 3:
        return 0.0
    arr  = np.array(values)
    mean = np.mean(arr[:-1])
    std  = np.std(arr[:-1])
    if std == 0:
        return 0.0
    return round(float((arr[-1] - mean) / std), 3)

def compute_and_store_ici(institution_id, scs, bts):
    divergence = round(scs - bts, 2)

    historical = get_ici_scores(institution_id)
    historical_divergences = [h["divergence_score"] for h in historical if h["divergence_score"] is not None]
    historical_divergences.append(divergence)

    zscore = compute_zscore(historical_divergences)
    is_alert = abs(zscore) > 2

    insert_ici_score(
        institution_id=institution_id,
        scs=scs, bts=bts,
        divergence=divergence,
        zscore=zscore
    )

    # Auto-store alert event whenever Z crosses threshold
    if is_alert:
        insert_alert(
            institution_id=institution_id,
            zscore=zscore,
            divergence=divergence,
            scs=scs,
            bts=bts
        )
        print(f"Alert stored - Institution {institution_id}: Z={zscore}")

    print(f"ICI stored - Institution {institution_id}: SCS={scs}, BTS={bts}, Div={divergence}, Z={zscore}")

    return {
        "institution_id": institution_id,
        "stated_confidence_score": scs,
        "behavioral_trust_score": bts,
        "divergence_score": divergence,
        "zscore": zscore,
        "alert": is_alert
    }
