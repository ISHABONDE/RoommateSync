from __future__ import annotations
from pymongo import MongoClient
from pymongo.database import Database
from config import config


class MongoDB:
    _client: MongoClient | None = None
    _db: Database | None = None

    @classmethod
    def connect(cls) -> None:
        if cls._client is None:
            cls._client = MongoClient(config.MONGO_URI)
            cls._db = cls._client[config.MONGO_DB_NAME]
            print(f"[MongoDB] Connected -> {config.MONGO_DB_NAME}")

    @classmethod
    def get_db(cls) -> Database:
        if cls._db is None:
            cls.connect()
        return cls._db

    @classmethod
    def close(cls) -> None:
        if cls._client:
            cls._client.close()
            cls._client = None
            cls._db = None
            print("[MongoDB] Connection closed.")


def get_db() -> Database:
    return MongoDB.get_db()
