from typing import Dict, List, Optional
from fastapi import WebSocket
import time
import json
import re
import asyncio
import logging
from ..core.config import settings

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # session_id -> List[WebSocket]
        self.active_sessions: Dict[str, List[WebSocket]] = {}
        self._socket_locks: Dict[WebSocket, asyncio.Lock] = {}
        self._socket_ips: Dict[WebSocket, str] = {}
        self._ip_connections: Dict[str, int] = {}
        self._connection_attempts: Dict[str, List[float]] = {}
        self._loop: Optional[asyncio.AbstractEventLoop] = None

    def get_or_set_loop(self) -> Optional[asyncio.AbstractEventLoop]:
        if self._loop and self._loop.is_running():
            return self._loop
        try:
            loop = asyncio.get_running_loop()
            self._loop = loop
            return loop
        except RuntimeError:
            return self._loop

    def _is_rate_limited(self, client_ip: str) -> bool:
        """Kısa zaman aralığında aşırı bağlantı isteklerini (flood) tespit eder."""
        now = time.time()
        window = getattr(settings, "WS_RATE_LIMIT_WINDOW_SECONDS", 5.0)
        burst_limit = getattr(settings, "WS_RATE_LIMIT_BURST", 25)

        # Temizlik ve kayıt
        attempts = self._connection_attempts.get(client_ip, [])
        valid_attempts = [t for t in attempts if now - t < window]
        valid_attempts.append(now)
        self._connection_attempts[client_ip] = valid_attempts

        # Periyodik bellek temizliği
        if len(self._connection_attempts) > 500:
            stale_keys = [ip for ip, ts in self._connection_attempts.items() if not ts or (now - ts[-1] > window * 2)]
            for k in stale_keys:
                self._connection_attempts.pop(k, None)

        return len(valid_attempts) > burst_limit

    async def connect(self, websocket: WebSocket, session_id: str) -> bool:
        self.get_or_set_loop()
        client_ip = websocket.client.host if websocket.client else "unknown"

        # 1. Oturum kimliği doğrulaması ve sanitizasyonu
        if not session_id or len(session_id) > 64 or not re.match(r"^[a-zA-Z0-9_\-]+$", session_id):
            logger.warning(f"Geçersiz session_id ile bağlantı reddedildi: {session_id[:20] if session_id else ''}")
            await websocket.close(code=1008, reason="Invalid session ID format")
            return False

        # 2. Bağlantı selini (flood) önleme
        if self._is_rate_limited(client_ip):
            logger.warning(f"WebSocket flood engellendi (IP: {client_ip})")
            await websocket.close(code=1008, reason="Connection rate limit exceeded")
            return False

        # 3. Toplam aktif bağlantı limiti
        max_total = getattr(settings, "WS_MAX_TOTAL_CONNECTIONS", 100)
        if self.total_connections >= max_total:
            logger.warning(f"Toplam WebSocket bağlantı sınırı aşıldı ({self.total_connections}/{max_total})")
            await websocket.close(code=1008, reason="Server connection capacity reached")
            return False

        # 4. Oturum başına bağlantı limiti
        max_session = getattr(settings, "WS_MAX_CONNECTIONS_PER_SESSION", 20)
        current_session_count = len(self.active_sessions.get(session_id, []))
        if current_session_count >= max_session:
            logger.warning(f"Oturum bağlantı sınırı aşıldı ({session_id}: {current_session_count}/{max_session})")
            await websocket.close(code=1008, reason="Session connection limit reached")
            return False

        # 5. IP başına bağlantı limiti (yerel testler hariç)
        max_ip = getattr(settings, "WS_MAX_CONNECTIONS_PER_IP", 30)
        if client_ip not in ("127.0.0.1", "localhost", "::1"):
            if self._ip_connections.get(client_ip, 0) >= max_ip:
                logger.warning(f"IP bağlantı sınırı aşıldı ({client_ip}: {self._ip_connections.get(client_ip)}/{max_ip})")
                await websocket.close(code=1008, reason="IP connection limit reached")
                return False

        # Bağlantıyı kabul et
        await websocket.accept()

        if session_id not in self.active_sessions:
            self.active_sessions[session_id] = []
        self.active_sessions[session_id].append(websocket)
        self._socket_locks[websocket] = asyncio.Lock()
        self._socket_ips[websocket] = client_ip
        self._ip_connections[client_ip] = self._ip_connections.get(client_ip, 0) + 1

        logger.info(f"WebSocket client connected to session: {session_id} (active: {self.total_connections})")
        return True

    def disconnect(self, websocket: WebSocket, session_id: str):
        self._socket_locks.pop(websocket, None)
        client_ip = self._socket_ips.pop(websocket, None)
        if client_ip and client_ip in self._ip_connections:
            self._ip_connections[client_ip] -= 1
            if self._ip_connections[client_ip] <= 0:
                self._ip_connections.pop(client_ip, None)

        if session_id in self.active_sessions:
            if websocket in self.active_sessions[session_id]:
                self.active_sessions[session_id].remove(websocket)
            if not self.active_sessions[session_id]:
                del self.active_sessions[session_id]
        logger.info(f"WebSocket client disconnected from session: {session_id}")

    @property
    def total_connections(self) -> int:
        return sum(len(conns) for conns in self.active_sessions.values())

    async def _safe_send_json(self, websocket: WebSocket, data: dict) -> bool:
        lock = self._socket_locks.get(websocket)
        try:
            if lock:
                async with lock:
                    await asyncio.wait_for(websocket.send_json(data), timeout=2.0)
            else:
                await asyncio.wait_for(websocket.send_json(data), timeout=2.0)
            return True
        except Exception as e:
            logger.debug(f"WebSocket send failed: {e}")
            return False

    async def send_to_session(self, session_id: str, data: dict):
        if session_id in self.active_sessions:
            connections = list(self.active_sessions[session_id])
            if connections:
                tasks = [self._safe_send_json(c, data) for c in connections]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for c, success in zip(connections, results):
                    if success is not True:
                        self.disconnect(c, session_id)

    async def broadcast_all(self, data: dict):
        tasks = []
        target_connections = []
        for session_id, connections in list(self.active_sessions.items()):
            for connection in list(connections):
                tasks.append(self._safe_send_json(connection, data))
                target_connections.append((session_id, connection))

        if tasks:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            for (session_id, connection), success in zip(target_connections, results):
                if success is not True:
                    self.disconnect(connection, session_id)

    def broadcast_all_sync(self, data: dict):
        """Safely broadcast from synchronous code or background worker threads."""
        loop = self.get_or_set_loop()
        if loop and loop.is_running():
            try:
                asyncio.run_coroutine_threadsafe(self.broadcast_all(data), loop)
            except Exception as e:
                logger.warning(f"Failed to schedule sync broadcast: {e}")

ws_manager = ConnectionManager()
