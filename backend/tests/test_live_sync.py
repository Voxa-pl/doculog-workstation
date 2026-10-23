import asyncio
import json
import os
import unittest
from pathlib import Path
import websockets
import httpx

BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws"

class TestMultiDeviceLiveSync(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.http_client = httpx.AsyncClient(base_url=BASE_URL, timeout=30.0)

    async def asyncTearDown(self):
        await self.http_client.aclose()

    async def test_websocket_connection_and_heartbeat(self):
        """PC ve Mobil gibi iki istemcinin bağlanabilmesi ve ping-pong çalışması"""
        async with websockets.connect(f"{WS_URL}/pc-session") as ws_pc, \
                   websockets.connect(f"{WS_URL}/mobile-session") as ws_mobile:
            
            # Ping gönder ve pong al
            await ws_pc.send("ping")
            resp_pc = await asyncio.wait_for(ws_pc.recv(), timeout=3.0)
            self.assertEqual(resp_pc, "pong")

            await ws_mobile.send(json.dumps({"type": "ping"}))
            resp_mob = await asyncio.wait_for(ws_mobile.recv(), timeout=3.0)
            data = json.loads(resp_mob)
            self.assertEqual(data.get("type"), "pong")

    async def test_live_sync_workflow(self):
        """Tam uçtan uca senkronizasyon testi:
        - Upload
        - Rotate
        - Edit / Approve
        - Mobile Upload
        - Process
        - Delete
        Tüm adımlarda bağlı tüm istemcilere (PC & Mobil) anında DOCUMENTS_UPDATED yayını teyit edilir.
        """
        async with websockets.connect(f"{WS_URL}/desktop-workstation") as ws_pc, \
                   websockets.connect(f"{WS_URL}/mobile-device") as ws_mobile:

            # 1. Yükleme Testi (Upload)
            dummy_file_path = "/tmp/test_irsaliye.jpg"
            # Basit bir test görseli oluştur
            from PIL import Image
            img = Image.new("RGB", (200, 200), color="white")
            img.save(dummy_file_path, "JPEG")

            with open(dummy_file_path, "rb") as f:
                res = await self.http_client.post(
                    "/api/upload",
                    files={"files": ("test_irsaliye.jpg", f, "image/jpeg")}
                )
            self.assertEqual(res.status_code, 200)
            uploaded_docs = res.json()
            self.assertTrue(len(uploaded_docs) > 0)
            doc_id = uploaded_docs[0]["id"]

            # Hem PC hem Mobil DOCUMENTS_UPDATED almalı
            msg_pc = json.loads(await asyncio.wait_for(ws_pc.recv(), timeout=3.0))
            msg_mobile = json.loads(await asyncio.wait_for(ws_mobile.recv(), timeout=3.0))

            self.assertEqual(msg_pc["type"], "DOCUMENTS_UPDATED")
            self.assertEqual(msg_pc["action"], "upload")
            self.assertEqual(msg_mobile["type"], "DOCUMENTS_UPDATED")
            self.assertEqual(msg_mobile["action"], "upload")

            # 2. Döndürme Testi (Rotate)
            res = await self.http_client.post(
                f"/api/documents/{doc_id}/rotate",
                json={"derece": 90}
            )
            self.assertEqual(res.status_code, 200)

            msg_pc = json.loads(await asyncio.wait_for(ws_pc.recv(), timeout=3.0))
            msg_mobile = json.loads(await asyncio.wait_for(ws_mobile.recv(), timeout=3.0))
            self.assertEqual(msg_pc["type"], "DOCUMENTS_UPDATED")
            self.assertEqual(msg_pc["action"], "rotate")
            self.assertEqual(msg_mobile["type"], "DOCUMENTS_UPDATED")
            self.assertEqual(msg_mobile["action"], "rotate")

            # 3. Güncelleme / Onaylama Testi (Update / Approve)
            res = await self.http_client.put(
                f"/api/documents/{doc_id}",
                json={
                    "durum": "onaylandi",
                    "header": {
                        "irsaliye_no": "IRS-2026-TEST",
                        "gonderici_unvan": "Canlı Test A.Ş."
                    }
                }
            )
            self.assertEqual(res.status_code, 200)

            msg_pc = json.loads(await asyncio.wait_for(ws_pc.recv(), timeout=3.0))
            msg_mobile = json.loads(await asyncio.wait_for(ws_mobile.recv(), timeout=3.0))
            self.assertEqual(msg_pc["type"], "DOCUMENTS_UPDATED")
            self.assertEqual(msg_pc["action"], "update")
            self.assertEqual(msg_pc.get("durum"), "onaylandi")
            self.assertEqual(msg_mobile["type"], "DOCUMENTS_UPDATED")
            self.assertEqual(msg_mobile["action"], "update")
            self.assertEqual(msg_mobile.get("durum"), "onaylandi")

            # 4. Mobil Yükleme Testi (Mobile Upload)
            with open(dummy_file_path, "rb") as f:
                res = await self.http_client.post(
                    "/api/mobile-upload",
                    data={"session_id": "qr-scanner-session"},
                    files={"files": ("mobile_scan.jpg", f, "image/jpeg")}
                )
            self.assertEqual(res.status_code, 200)
            mob_doc = res.json()
            mob_doc_id = mob_doc["id"]

            # Broadcast kanallarında DOCUMENTS_UPDATED ve NEW_DOCUMENT_IN_QUEUE gelmeli
            rec_pc_types = []
            rec_pc_types.append(json.loads(await asyncio.wait_for(ws_pc.recv(), timeout=3.0))["type"])
            rec_pc_types.append(json.loads(await asyncio.wait_for(ws_pc.recv(), timeout=3.0))["type"])
            self.assertIn("DOCUMENTS_UPDATED", rec_pc_types)

            rec_mob_types = []
            rec_mob_types.append(json.loads(await asyncio.wait_for(ws_mobile.recv(), timeout=3.0))["type"])
            rec_mob_types.append(json.loads(await asyncio.wait_for(ws_mobile.recv(), timeout=3.0))["type"])
            self.assertIn("DOCUMENTS_UPDATED", rec_mob_types)

            # 5. Silme Testi (Delete)
            res = await self.http_client.delete(f"/api/documents/{doc_id}")
            self.assertEqual(res.status_code, 200)

            msg_pc = json.loads(await asyncio.wait_for(ws_pc.recv(), timeout=3.0))
            msg_mobile = json.loads(await asyncio.wait_for(ws_mobile.recv(), timeout=3.0))
            self.assertEqual(msg_pc["type"], "DOCUMENTS_UPDATED")
            self.assertEqual(msg_pc["action"], "delete")
            self.assertEqual(msg_mobile["type"], "DOCUMENTS_UPDATED")
            self.assertEqual(msg_mobile["action"], "delete")

            # İkinci belgeyi de temizle
            res = await self.http_client.delete(f"/api/documents/{mob_doc_id}")
            self.assertEqual(res.status_code, 200)
            msg_pc = json.loads(await asyncio.wait_for(ws_pc.recv(), timeout=3.0))
            self.assertEqual(msg_pc["type"], "DOCUMENTS_UPDATED")

            # Temizlik
            if os.path.exists(dummy_file_path):
                os.remove(dummy_file_path)

    async def test_concurrent_connections_and_broadcasting(self):
        """Çok sayıda cihaz eşzamanlı bağlıyken WebSocket kilit ve yayın sağlamlığı"""
        num_clients = 10
        sockets = []
        try:
            for i in range(num_clients):
                ws = await websockets.connect(f"{WS_URL}/device-{i}")
                sockets.append(ws)

            # Bir güncelleme tetikle (demo load)
            res = await self.http_client.post("/api/demo/load")
            self.assertEqual(res.status_code, 200)
            doc_data = res.json()
            doc_id = doc_data["id"]

            # 10 istemcinin tümü DOCUMENTS_UPDATED almalı
            for idx, ws in enumerate(sockets):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
                self.assertEqual(msg["type"], "DOCUMENTS_UPDATED", f"Client {idx} failed")
                self.assertEqual(msg["action"], "demo_load")

            # Silme işlemi tetikle
            res = await self.http_client.delete(f"/api/documents/{doc_id}")
            self.assertEqual(res.status_code, 200)

            for idx, ws in enumerate(sockets):
                msg = json.loads(await asyncio.wait_for(ws.recv(), timeout=5.0))
                self.assertEqual(msg["type"], "DOCUMENTS_UPDATED")
                self.assertEqual(msg["action"], "delete")

        finally:
            for ws in sockets:
                await ws.close()

if __name__ == "__main__":
    unittest.main()
