from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .core.config import settings
from .api.routes import router

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Türkiye Lojistik Sektörü İçin Masaüstü Evrak & Sevk İrsaliyesi Ayrıştırma İş İstasyonu API'si",
)

cors_origins = settings.CORS_ORIGINS
allow_creds = "*" not in cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=allow_creds,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")
app.include_router(router, prefix=settings.API_PREFIX)

from fastapi.responses import HTMLResponse
from fastapi import WebSocket, WebSocketDisconnect
from .services.connection_manager import ws_manager
import json
import time

@app.on_event("startup")
async def startup_event():
    ws_manager.get_or_set_loop()
    # Zombi Evrak Temizliği: Sunucu yeniden başladığında 'isleniyor' durumunda kilitli kalan evrakları kurtar
    try:
        from .services.document_repo import doc_repo
        from .models.irsaliye import ProcessingStatus
        docs = doc_repo.get_all()
        stale_count = 0
        for d in docs:
            if d.durum == ProcessingStatus.ISLENIYOR:
                d.durum = ProcessingStatus.HATA
                d.hata_mesaji = "Sunucu yeniden başlatıldığı için işlem yarıda kaldı. Lütfen tekrar deneyin."
                doc_repo.save(d)
                stale_count += 1
        if stale_count > 0:
            print(f"[Startup Stale Cleaner] {stale_count} adet zombi evrak kurtarıldı.")
    except Exception as stale_err:
        print(f"[Startup Stale Cleaner Hata]: {stale_err}")

@app.websocket("/ws")
@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str = "global"):
    connected = await ws_manager.connect(websocket, session_id)
    if not connected:
        return

    try:
        msg_count = 0
        last_reset = time.time()
        while True:
            data = await websocket.receive_text()

            # İleti selini (flood) önleme: Saniyede en fazla 60 mesaj
            now = time.time()
            if now - last_reset > 1.0:
                msg_count = 0
                last_reset = now
            msg_count += 1
            if msg_count > 60:
                await websocket.close(code=1008, reason="Message rate limit exceeded")
                break

            if data == "ping":
                await websocket.send_text("pong")
            else:
                try:
                    parsed = json.loads(data)
                    if isinstance(parsed, dict) and parsed.get("type") == "ping":
                        await websocket.send_json({"type": "pong"})
                except Exception:
                    pass
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        ws_manager.disconnect(websocket, session_id)

@app.get("/mobile-scan", response_class=HTMLResponse)
async def mobile_scan_page():
    template_path = settings.BACKEND_DIR / "app" / "templates" / "mobile_scan.html"
    if template_path.exists():
        with open(template_path, "r", encoding="utf-8") as f:
            return HTMLResponse(content=f.read())
    return HTMLResponse(content="<h1>Mobil tarayıcı şablonu bulunamadı</h1>", status_code=404)

frontend_dist = settings.WORKSPACE_DIR / "frontend" / "dist"
if frontend_dist.exists():
    app.mount("/", StaticFiles(directory=str(frontend_dist), html=True), name="frontend")
else:
    @app.get("/")
    async def root():
        return {
            "sistem": settings.PROJECT_NAME,
            "versiyon": settings.VERSION,
            "durum": "calisiyor",
            "model": settings.GEMINI_MODEL
        }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host=settings.HOST, port=settings.PORT, reload=False)

