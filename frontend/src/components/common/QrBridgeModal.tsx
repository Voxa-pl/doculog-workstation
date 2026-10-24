import React, { useState, useEffect, useRef } from 'react';
import { 
  QrCode, 
  Smartphone, 
  X, 
  Copy, 
  Check, 
  Loader2, 
  Wifi, 
  CheckCircle2
} from 'lucide-react';
import { QrBridgeInfo, DocumentItem } from '../../types/irsaliye';
import { documentApi } from '../../services/api';

interface QrBridgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDocumentReceived: (doc: DocumentItem) => void;
}

export const QrBridgeModal: React.FC<QrBridgeModalProps> = ({
  isOpen,
  onClose,
  onDocumentReceived,
}) => {
  const [qrInfo, setQrInfo] = useState<QrBridgeInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [receivedDocName, setReceivedDocName] = useState<string>('');

  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const autoCloseTimerRef = useRef<number | null>(null);
  const copyTimerRef = useRef<number | null>(null);

  const cleanupSocketAndTimers = () => {
    if (autoCloseTimerRef.current) {
      clearTimeout(autoCloseTimerRef.current);
      autoCloseTimerRef.current = null;
    }
    if (copyTimerRef.current) {
      clearTimeout(copyTimerRef.current);
      copyTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      } catch (e) {
        // Ignore
      }
      wsRef.current = null;
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    if (!isOpen) {
      cleanupSocketAndTimers();
      setIsSuccess(false);
      setQrInfo(null);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }

    let isSubscribed = true;
    setIsLoading(true);
    setError(null);
    setIsSuccess(false);

    const initBridge = async () => {
      try {
        const info = await documentApi.getQrUrl();
        if (!isSubscribed) return;
        setQrInfo(info);
        setIsLoading(false);

        // WebSocket Bağlantısını Başlat
        const wsUrl = documentApi.getWebSocketUrl(info.session_id);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (!isSubscribed) return;
          if (pingIntervalRef.current) {
            clearInterval(pingIntervalRef.current);
          }
          pingIntervalRef.current = window.setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            }
          }, 20000);
        };

        ws.onmessage = (event) => {
          if (!isSubscribed) return;
          try {
            if (event.data === 'pong') return;
            const data = JSON.parse(event.data);
            if (data.type === 'DOCUMENT_UPLOADED' && data.document) {
              setIsSuccess(true);
              setReceivedDocName(data.document.dosya_adi || 'Mobil İrsaliye');
              onDocumentReceived(data.document);

              // 1.4 saniye sonra pencereyi otomatik ve güvenli bir şekilde kapat
              if (autoCloseTimerRef.current) clearTimeout(autoCloseTimerRef.current);
              autoCloseTimerRef.current = window.setTimeout(() => {
                if (isSubscribed) {
                  onClose();
                }
              }, 1400);
            }
          } catch (e) {
            console.error('WebSocket mesajı ayrıştırılamadı:', e);
          }
        };

        ws.onerror = (err) => {
          if (!isSubscribed) return;
          console.warn('WebSocket bağlantı uyarısı:', err);
        };
      } catch (err) {
        if (!isSubscribed) return;
        setIsLoading(false);
        setError('Yerel ağ bağlantısı veya QR kod bilgisi alınamadı.');
        console.error('QR Bridge hatası:', err);
      }
    };

    initBridge();

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      isSubscribed = false;
      cleanupSocketAndTimers();
    };
  }, [isOpen, onClose, onDocumentReceived]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (!qrInfo) return;
    navigator.clipboard.writeText(qrInfo.mobile_url);
    setIsCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div 
        className="bg-theme-surface border border-theme-subtle rounded-2xl max-w-sm w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150 min-w-0"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Üst Başlık */}
        <div className="p-4 border-b border-theme-subtle flex items-center justify-between bg-theme-surface min-w-0">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs font-semibold text-theme-primary tracking-wide truncate">
                Telefondan Canlı Yükleme
              </h3>
              <p className="text-[10px] text-theme-muted truncate">Mobile QR Bridge</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-primary p-1.5 rounded-lg hover:bg-theme-card transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Gövde */}
        <div className="p-5 flex flex-col items-center text-center min-w-0">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              <p className="text-xs text-theme-muted">QR Kod ve Yerel Ağ Köprüsü Hazırlanıyor...</p>
            </div>
          ) : error ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-2 text-rose-400">
              <p className="text-xs font-medium">{error}</p>
              <button
                onClick={onClose}
                className="mt-3 px-3 py-1.5 bg-theme-card text-xs text-theme-primary rounded-lg hover:bg-theme-card-hover border border-theme-subtle"
              >
                Kapat
              </button>
            </div>
          ) : isSuccess ? (
            <div className="py-8 flex flex-col items-center justify-center space-y-3 animate-in fade-in zoom-in-90 duration-200">
              <div className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-sm font-bold text-theme-primary">İrsaliye Başarıyla Aktarıldı!</h4>
              <p className="text-xs text-theme-secondary max-w-xs break-words">
                <span className="text-emerald-400 font-semibold">{receivedDocName}</span> ayrıştırma masasına aktarıldı.
              </p>
            </div>
          ) : (
            <>
              {/* Canlı Bağlantı Rozeti */}
              <div className="inline-flex items-center space-x-1.5 bg-emerald-950/40 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] text-emerald-300 font-medium mb-3">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <span>Canlı Bağlantı Hazır • Telefon Bekleniyor</span>
              </div>

              {/* QR Kod Kartı */}
              <div className="bg-white p-3 rounded-xl shadow-xl border-4 border-theme-subtle my-1">
                {qrInfo?.qr_data_url ? (
                  <img
                    src={qrInfo.qr_data_url}
                    alt="Telefon ile Tara"
                    className="w-48 h-48 block rounded-md"
                  />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-slate-100">
                    <QrCode className="w-12 h-12 text-slate-400" />
                  </div>
                )}
              </div>

              {/* URL ve Kopyala Butonu */}
              <div className="w-full mt-3 bg-theme-card border border-theme-subtle rounded-xl p-2 flex items-center justify-between text-left min-w-0">
                <div className="truncate mr-2 min-w-0 flex-1">
                  <div className="text-[10px] text-theme-muted font-medium uppercase truncate">Yerel Ağ Adresi (LAN)</div>
                  <div className="text-xs font-mono text-theme-secondary truncate" title={qrInfo?.mobile_url || ''}>
                    {qrInfo?.mobile_url}
                  </div>
                </div>
                <button
                  onClick={handleCopyLink}
                  className="flex items-center space-x-1 bg-theme-surface hover:bg-theme-card-hover text-theme-primary border border-theme-subtle px-2.5 py-1 rounded-md text-[11px] font-medium shrink-0 transition-colors"
                  title="Bağlantıyı Kopyala"
                >
                  {isCopied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="text-emerald-400">Kopyalandı</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-blue-400" />
                      <span>Kopyala</span>
                    </>
                  )}
                </button>
              </div>

              {/* Kullanım İpuçları */}
              <div className="w-full mt-3.5 pt-3 border-t border-theme-subtle text-[11px] text-theme-muted text-left space-y-1.5">
                <div className="flex items-start space-x-1.5">
                  <span className="w-4 h-4 rounded-full bg-theme-card text-theme-primary flex items-center justify-center text-[10px] shrink-0 font-bold mt-0.5 border border-theme-subtle">1</span>
                  <span>Telefon kameranızı QR koda doğrultun ve açın.</span>
                </div>
                <div className="flex items-start space-x-1.5">
                  <span className="w-4 h-4 rounded-full bg-theme-card text-theme-primary flex items-center justify-center text-[10px] shrink-0 font-bold mt-0.5 border border-theme-subtle">2</span>
                  <span>Açılan sayfada irsaliyenin fotoğrafını çekin.</span>
                </div>
                <div className="flex items-start space-x-1.5">
                  <span className="w-4 h-4 rounded-full bg-theme-card text-theme-primary flex items-center justify-center text-[10px] shrink-0 font-bold mt-0.5 border border-theme-subtle">3</span>
                  <span><strong>'Sisteme Aktar'</strong>a bastığınızda belge doğrudan buraya düşer.</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Alt Bilgi */}
        <div className="px-5 py-2.5 bg-theme-card border-t border-theme-subtle flex items-center justify-between text-[10px] text-theme-muted min-w-0">
          <div className="flex items-center space-x-1 truncate min-w-0">
            <Wifi className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate">Aynı Wi-Fi ağına bağlı olmalıdır</span>
          </div>
          <span className="shrink-0 font-mono text-theme-secondary">IP: {qrInfo?.lan_ip || '...'}</span>
        </div>
      </div>
    </div>
  );
};
