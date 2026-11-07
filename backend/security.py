"""Passwords (bcrypt) and login tokens (JWT)."""
import os
import time

import bcrypt
import jwt

# Set JWT_SECRET to a long random text in production (Vercel > Settings > Environment Variables).
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-secret-change-me-before-deploying-12345")
JWT_ALGORITHM = "HS256"
TOKEN_HOURS = int(os.getenv("TOKEN_HOURS", "8"))
BCRYPT_ROUNDS = int(os.getenv("BCRYPT_ROUNDS", "12"))  # higher = slower to crack


def hash_password(password: str) -> str:
    # bcrypt only reads the first 72 bytes, so we cut at 72 on purpose.
    return bcrypt.hashpw(password.encode()[:72], bcrypt.gensalt(BCRYPT_ROUNDS)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode()[:72], password_hash.encode())
    except ValueError:
        return False


def create_token(user_id: int, role: str) -> str:
    now = int(time.time())
    payload = {"sub": str(user_id), "role": role, "iat": now, "exp": now + TOKEN_HOURS * 3600}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str):
    """Return the payload, or None if the token is fake, changed or expired."""
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.PyJWTError:
        return None
