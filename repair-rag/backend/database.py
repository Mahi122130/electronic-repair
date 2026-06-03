import os
from dotenv import load_dotenv
from postgrest import SyncPostgrestClient

# Load environment variables
load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

def test_connection():
    try:
        # Supabase API endpoint
        api_url = f"{SUPABASE_URL}/rest/v1"
        
        # Initialize the synchronous client
        client = SyncPostgrestClient(api_url, headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"})
        
        print("Successfully initialized Supabase client!")
        return True
    except Exception as e:
        print(f"Error connecting to Supabase: {e}")
        return False

if __name__ == "__main__":
    test_connection()