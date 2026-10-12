from typing import Dict, List
from fastapi import WebSocket
import json

class ConnectionManager:
    def __init__(self):
        # session_id -> List[WebSocket]
        self.active_sessions: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, session_id: str):
        await websocket.accept()
        if session_id not in self.active_sessions:
            self.active_sessions[session_id] = []
        self.active_sessions[session_id].append(websocket)

    def disconnect(self, websocket: WebSocket, session_id: str):
        if session_id in self.active_sessions:
            if websocket in self.active_sessions[session_id]:
                self.active_sessions[session_id].remove(websocket)
            if not self.active_sessions[session_id]:
                del self.active_sessions[session_id]

    async def send_to_session(self, session_id: str, data: dict):
        if session_id in self.active_sessions:
            dead_sockets = []
            for connection in self.active_sessions[session_id]:
                try:
                    await connection.send_json(data)
                except Exception:
                    dead_sockets.append(connection)
            for dead in dead_sockets:
                self.disconnect(dead, session_id)

    async def broadcast_all(self, data: dict):
        for session_id, connections in list(self.active_sessions.items()):
            dead_sockets = []
            for connection in connections:
                try:
                    await connection.send_json(data)
                except Exception:
                    dead_sockets.append(connection)
            for dead in dead_sockets:
                self.disconnect(dead, session_id)

ws_manager = ConnectionManager()
