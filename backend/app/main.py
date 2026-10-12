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

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(settings.UPLOAD_DIR)), name="uploads")
app.include_router(router, prefix=settings.API_PREFIX)

from fastapi.responses import HTMLResponse
from fastapi import WebSocket, WebSocketDisconnect
from .services.connection_manager import ws_manager

@app.websocket("/ws/{session_id}")
async def websocket_endpoint(websocket: WebSocket, session_id: str):
    await ws_manager.connect(websocket, session_id)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, session_id)
    except Exception:
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

