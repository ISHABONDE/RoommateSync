"""
Admin Promotion Script
──────────────────────
Run from inside the backend folder:

    python scripts/make_admin.py you@example.com
    python scripts/make_admin.py you@example.com --revoke
"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db import MongoDB
from database.models import users_col

def make_admin(email: str, revoke: bool = False):
    MongoDB.connect()
    email = email.lower().strip()
    user  = users_col().find_one({"email": email}, {"_id": 1, "name": 1})
    if not user:
        print(f"No user found with email: {email}")
        sys.exit(1)
    users_col().update_one({"email": email}, {"$set": {"is_admin": not revoke}})
    action = "revoked from" if revoke else "granted to"
    print(f"Admin role {action}: {user.get('name')} ({email})")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/make_admin.py <email> [--revoke]")
        sys.exit(1)
    make_admin(sys.argv[1], "--revoke" in sys.argv)