import os
from dotenv import load_dotenv

load_dotenv()

# Supabase
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")

# HuggingFace
HF_API_KEY = os.getenv("HF_API_KEY")

# Reddit
REDDIT_CLIENT_ID = os.getenv("REDDIT_CLIENT_ID")
REDDIT_CLIENT_SECRET = os.getenv("REDDIT_CLIENT_SECRET")
REDDIT_USER_AGENT = os.getenv("REDDIT_USER_AGENT")

# Twitter/X
TWITTER_BEARER_TOKEN = os.getenv("TWITTER_BEARER_TOKEN")

# Institutions to track
INSTITUTIONS = [
    "JPMorgan", "Goldman Sachs", "Bank of America",
    "FDA", "CDC", "Harvard University",
    "Federal Reserve", "BlackRock", "Wells Fargo"
]