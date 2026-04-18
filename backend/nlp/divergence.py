import numpy as np
from database import get_ici_scores, insert_ici_score

def compute_zscore(values):
    """Compute rolling Z-score for the latest value in a series."""
    if len(values) < 3:
        return 0.0  # Not enough data points yet
    
    arr = np.array(values)
    mean = np.mean(arr[:-1])  # Mean of all except latest
    std = np.std(arr[:-1])    # Std of all except latest
    
    if std == 0:
        return 0.0
    
    zscore = (arr[-1] - mean) / std
    return round(float(zscore), 3)

def compute_and_store_ici(institution_id, scs, bts):
    """
    Compute ICI divergence score and Z-score, then store in Supabase.
    ICI = SCS - BTS
    Positive = institution talking confident while public is worried (alert)
    Negative = institution cautious but public trusts them
    """
    divergence = round(scs - bts, 2)
    
    # Get historical scores for Z-score calculation
    historical = get_ici_scores(institution_id)
    historical_divergences = [h["divergence_score"] for h in historical if h["divergence_score"] is not None]
    historical_divergences.append(divergence)
    
    zscore = compute_zscore(historical_divergences)
    
    # Store in Supabase
    insert_ici_score(
        institution_id=institution_id,
        scs=scs,
        bts=bts,
        divergence=divergence,
        zscore=zscore
    )
    
    print(f"ICI Score stored - Institution {institution_id}: SCS={scs}, BTS={bts}, Divergence={divergence}, Z={zscore}")
    
    return {
        "institution_id": institution_id,
        "stated_confidence_score": scs,
        "behavioral_trust_score": bts,
        "divergence_score": divergence,
        "zscore": zscore,
        "alert": abs(zscore) > 2
    }