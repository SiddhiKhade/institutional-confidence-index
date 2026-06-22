from supabase import create_client, Client
from config import SUPABASE_URL, SUPABASE_KEY

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def get_institutions():
    response = supabase.table("institutions").select("*").order("created_at").execute()
    return response.data

def insert_institution(name: str, sector: str, created_by: str = "user"):
    # Check if already exists (case-insensitive)
    existing = supabase.table("institutions")\
        .select("*")\
        .ilike("name", name)\
        .execute()
    if existing.data:
        return existing.data[0], False  # (institution, was_created)
    response = supabase.table("institutions").insert({
        "name": name,
        "sector": sector,
        "is_custom": True,
        "created_by": created_by
    }).execute()
    return response.data[0], True

def delete_institution(institution_id: int):
    # Only allow deleting custom institutions
    supabase.table("ici_scores").delete().eq("institution_id", institution_id).execute()
    supabase.table("raw_signals").delete().eq("institution_id", institution_id).execute()
    supabase.table("institutions").delete().eq("id", institution_id).eq("is_custom", True).execute()

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
