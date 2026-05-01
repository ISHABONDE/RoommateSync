"""
WebSocket Chat Events  (Flask-SocketIO)
────────────────────────────────────────
Events
───────
connect         → client connects; validates JWT from query/header
disconnect      → client disconnects
join_room       → client joins a private chat room (room = chat_request_id)
send_message    → client sends a message; saved to MongoDB + broadcast
typing          → broadcast "is typing" signal to the other participant

Usage (frontend)
─────────────────
  const socket = io(SERVER_URL, {
    query: { token: "<JWT>" }
  });
  socket.emit("join_room", { room_id: "<chat_request_id>" });
  socket.emit("send_message", { room_id: "<chat_request_id>", message: "Hello!" });
  socket.on("receive_message", (data) => { ... });
"""
import logging
from datetime import datetime, timezone

from flask_socketio import SocketIO, join_room, leave_room, emit

from database.models import chat_requests_col, messages_col
from services.user_service import decode_token, get_user_by_id

logger = logging.getLogger(__name__)

# Maps socket session id → user_id for quick lookup
_sid_to_user: dict[str, str] = {}


def register_socket_events(socketio: SocketIO) -> None:
    """Register all WebSocket event handlers on the given SocketIO instance."""

    # ── connect ────────────────────────────────────────────────────────────────

    @socketio.on("connect")
    def handle_connect(auth):
        """
        Validate JWT on connect.
        Client should pass token either as:
          - query param  ?token=<JWT>
          - auth object  { token: "<JWT>" }
        """
        from flask import request as flask_request

        token = (
            (auth or {}).get("token")
            or flask_request.args.get("token")
        )
        if not token:
            logger.warning("[WS] Connection rejected — no token.")
            return False  # reject connection

        payload = decode_token(token)
        if not payload:
            logger.warning("[WS] Connection rejected — invalid token.")
            return False

        user_id = payload["sub"]
        _sid_to_user[flask_request.sid] = user_id
        logger.info(f"[WS] User {user_id} connected (sid={flask_request.sid})")
        emit("connected", {"message": "Connected to RoommateSync chat.", "user_id": user_id})

    # ── disconnect ────────────────────────────────────────────────────────────

    @socketio.on("disconnect")
    def handle_disconnect():
        from flask import request as flask_request
        user_id = _sid_to_user.pop(flask_request.sid, "unknown")
        logger.info(f"[WS] User {user_id} disconnected (sid={flask_request.sid})")

    # ── join_room ─────────────────────────────────────────────────────────────

    @socketio.on("join_room")
    def handle_join_room(data: dict):
        """
        Client joins a Socket.IO room named after the chat_request_id.
        Both participants of the chat should call this.

        Payload: { "room_id": "<chat_request_id>" }
        """
        from flask import request as flask_request
        from bson import ObjectId

        user_id = _sid_to_user.get(flask_request.sid)
        room_id = (data or {}).get("room_id", "")

        if not user_id or not room_id:
            emit("error", {"message": "room_id is required."})
            return

        # Verify the user belongs to this chat
        try:
            req = chat_requests_col().find_one({"_id": ObjectId(room_id)})
        except Exception:
            emit("error", {"message": "Invalid room_id."})
            return

        if not req:
            emit("error", {"message": "Chat request not found."})
            return

        if user_id not in [req.get("from_user_id"), req.get("to_user_id")]:
            emit("error", {"message": "Not authorised to join this room."})
            return

        join_room(room_id)
        emit("joined_room", {"room_id": room_id, "user_id": user_id}, to=room_id)
        logger.info(f"[WS] User {user_id} joined room {room_id}")

    # ── send_message ──────────────────────────────────────────────────────────

    @socketio.on("send_message")
    def handle_send_message(data: dict):
        """
        Receive a message, persist to MongoDB, and broadcast to the room.

        Payload: { "room_id": "<chat_request_id>", "message": "Hello!" }
        Emits:   "receive_message" to all clients in the room.
        """
        from flask import request as flask_request
        from bson import ObjectId

        user_id = _sid_to_user.get(flask_request.sid)
        room_id = (data or {}).get("room_id", "")
        text    = ((data or {}).get("message") or "").strip()

        if not user_id or not room_id or not text:
            emit("error", {"message": "room_id and message are required."})
            return

        # Verify the chat request is accepted
        try:
            req = chat_requests_col().find_one({
                "_id":    ObjectId(room_id),
                "status": "accepted",
            })
        except Exception:
            emit("error", {"message": "Invalid room_id."})
            return

        if not req:
            emit("error", {"message": "Accepted chat session not found."})
            return

        if user_id not in [req.get("from_user_id"), req.get("to_user_id")]:
            emit("error", {"message": "Not authorised."})
            return

        # Persist message to MongoDB
        now = datetime.now(timezone.utc).isoformat()
        msg_doc = {
            "chat_request_id": room_id,
            "sender_id":       user_id,
            "message":         text,
            "sent_at":         now,
        }
        result     = messages_col().insert_one(msg_doc)
        message_id = str(result.inserted_id)

        # Broadcast to everyone in the room (including sender)
        payload = {
            "message_id": message_id,
            "room_id":    room_id,
            "sender_id":  user_id,
            "message":    text,
            "sent_at":    now,
        }
        emit("receive_message", payload, to=room_id)
        logger.debug(f"[WS] Message {message_id} sent to room {room_id}")

    # ── typing ─────────────────────────────────────────────────────────────────

    @socketio.on("typing")
    def handle_typing(data: dict):
        """
        Broadcast a typing indicator to the other participant.

        Payload: { "room_id": "<chat_request_id>", "is_typing": true }
        """
        from flask import request as flask_request

        user_id = _sid_to_user.get(flask_request.sid)
        room_id = (data or {}).get("room_id", "")
        if user_id and room_id:
            emit(
                "typing",
                {"room_id": room_id, "user_id": user_id, "is_typing": data.get("is_typing", True)},
                to=room_id,
                include_self=False,
            )
