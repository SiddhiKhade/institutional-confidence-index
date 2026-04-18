from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_institutions():
    response = supabase.table("institutions").select("*").execute()
    return response.data

def insert_raw_signal(institution_id, source, content, sentiment_score):
    supabase.table("raw_signals").insert({
        "institution_id": institution_id,
        "source": source,
        "content": content,
        "sentiment_score": sentiment_score
    }).execute()

def insert_ici_score(institution_id, scs, bts, divergence, zscore):
    supabase.table("ici_scores").insert({
        "institution_id": institution_id,
        "stated_confidence_score": scs,
        "behavioral_trust_score": bts,
        "divergence_score": divergence,
        "zscore": zscore
    }).execute()

def get_ici_scores(institution_id):
    response = supabase.table("ici_scores")\
        .select("*")\
        .eq("institution_id", institution_id)\
        .order("created_at", desc=True)\
        .limit(30)\
        .execute()
    return response.data