@echo off
chcp 65001 > nul
title DocuLog Workstation - Lojistik İrsaliye İş İstasyonu
cls

echo =====================================================================
echo    DOCULOG WORKSTATION - LOJİSTİK İRSALİYE AYRIŞTIRMA İŞ İSTASYONU
echo    Yapay Zeka Destekli Masaüstü & Mobil Canlı İş İstasyonu
echo =====================================================================
echo.

cd /d "%~dp0"

:: 1. Python Kontrolü
python --version >nul 2>nul
if %errorlevel% neq 0 (
    echo [HATA] Python bulunamadı! Lütfen Python 3.10+ kurulu olduğundan emin olun.
    pause
    exit /b 1
)

:: 2. Gerekli Kütüphanelerin Hızlı Kontrolü
echo [1/2] Bağımlılıklar doğrulanıyor...
python -c "import fastapi, uvicorn, qrcode, websockets" >nul 2>nul
if %errorlevel% neq 0 (
    echo [*] Eksik paketler tespit edildi, otomatik yükleniyor...
    pip install -r backend\requirements.txt
)

:: 3. Port Kontrolü ve Temizlik (Eski açık kalan oturum varsa temizle)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /F /PID %%a >nul 2>nul
)

:: 4. Yerel Ağ IP Tespiti
for /f "delims=" %%i in ('python -c "import socket; s=socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80)); print(s.getsockname()[0]); s.close()" 2^>nul') do set LAN_IP=%%i
if "%LAN_IP%"=="" set LAN_IP=127.0.0.1

:: 5. Backend ve Web Sunucusunu Başlat (0.0.0.0 ile hem PC hem mobil erişim)
echo [2/2] İş İstasyonu başlatılıyor (FastAPI + React Desktop - Port: 8000)...
start "DocuLog Workstation Sunucusu" cmd /c "cd /d %~dp0backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"

timeout /t 2 > nul

echo.
echo =====================================================================
echo   İş İstasyonu Başarıyla Başlatıldı!
echo.
echo   * Masaüstü Arayüzü:        http://127.0.0.1:8000
echo   * Mobil Telefon Köprüsü:   http://%LAN_IP%:8000/mobile-scan
echo   * API Dokümantasyonu:      http://127.0.0.1:8000/docs
echo =====================================================================
echo.

:: 6. Uygulama Penceresini Aç (Masaüstü App Modu)
where msedge >nul 2>nul
if %errorlevel% equ 0 (
    start msedge --app=http://127.0.0.1:8000
) else (
    where chrome >nul 2>nul
    if %errorlevel% equ 0 (
        start chrome --app=http://127.0.0.1:8000
    ) else (
        start http://127.0.0.1:8000
    )
)

echo Bu pencereyi açık tutabilir veya kapatabilirsiniz.
echo İş istasyonu arka planda bağımsız olarak çalışmaya devam eder.
echo.
pause
