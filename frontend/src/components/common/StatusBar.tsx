import React, { useState, useEffect } from 'react';
import { DocumentItem } from '../../types/irsaliye';
import { Keyboard, Activity, HardDrive, RefreshCw } from 'lucide-react';
import { offlineBuffer } from '../../utils/offlineBuffer';

interface StatusBarProps {
  selectedDoc: DocumentItem | null;
  zoom: number;
  isWsConnected?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ selectedDoc, zoom, isWsConnected = true }) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [offlineCount, setOfflineCount] = useState<number>(0);
  const [isFlushing, setIsFlushing] = useState<boolean>(false);

  useEffect(() => {
    setIsOnline(navigator.onLine);
    setOfflineCount(offlineBuffer.getCount());

    const handleOnline = () => {
      setIsOnline(true);
      if (offlineBuffer.getCount() > 0) {
        setIsFlushing(true);
        setTimeout(() => setIsFlushing(false), 2000);
      }
    };
    const handleOffline = () => setIsOnline(false);
    const handleCountChange = (e: any) => setOfflineCount(e.detail || 0);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('doculog-offline-count-changed', handleCountChange);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('doculog-offline-count-changed', handleCountChange);
    };
  }, []);

  const isProcessing = selectedDoc?.durum === 'isleniyor';
  const rawBytes = Number(selectedDoc?.boyut_bytes);
  const safeBytes = Number.isFinite(rawBytes) ? rawBytes : 0;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  return (
    <footer className="h-7 bg-theme-surface border-t border-theme-subtle px-3 flex items-center justify-between text-[11px] text-theme-muted select-none shrink-0 font-mono min-w-0 transition-colors">
      <div className="flex items-center space-x-3 min-w-0">
        <div className={`flex items-center space-x-1.5 shrink-0 ${isProcessing ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
          <Activity className="w-3 h-3" />
          <span>{isProcessing ? 'İşleniyor...' : 'Sistem Hazır'}</span>
        </div>
        <span className="text-theme-muted/50 shrink-0">|</span>

        {/* Canlı / Çevrimdışı Durum Göstergesi (Zero-Panic Ambar Tamponu) */}
        {!isOnline ? (
          <div className="flex items-center space-x-1.5 text-amber-300 font-mono text-[10px] bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full select-none shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)] animate-pulse shrink-0" />
            <span className="font-semibold">Ambar Çevrimdışı</span>
            {offlineCount > 0 && (
              <>
                <span className="text-amber-500/80">•</span>
                <span>Tamponda {offlineCount} Evrak</span>
              </>
            )}
          </div>
        ) : isFlushing ? (
          <div className="flex items-center space-x-1.5 text-emerald-300 font-mono text-[10px] bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full select-none shrink-0">
            <RefreshCw className="w-3 h-3 text-emerald-400 animate-spin shrink-0" />
            <span className="font-semibold">Tampon Eşitleniyor...</span>
          </div>
        ) : (
          <div className="flex items-center space-x-1.5 text-theme-secondary shrink-0">
            <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-[10px] hidden xs:inline">{isWsConnected ? 'Canlı Senkron (PC/Mobil)' : 'Senkron Bekliyor'}</span>
          </div>
        )}
        {selectedDoc && (
          <>
            <span className="text-theme-muted/50 shrink-0">|</span>
            <div className="flex items-center space-x-1 text-theme-primary min-w-0">
              <HardDrive className="w-3 h-3 text-theme-muted shrink-0" />
              <span className="truncate max-w-[140px] sm:max-w-[220px]" title={selectedDoc.dosya_adi}>
                {selectedDoc.dosya_adi}
              </span>
              <span className="text-theme-muted shrink-0">
                ({(safeBytes / 1024).toFixed(1)} KB)
              </span>
            </div>
            <span className="text-theme-muted/50 shrink-0">|</span>
            <span className="shrink-0 text-theme-secondary">Ölçek: %{Math.round(safeZoom * 100)}</span>
          </>
        )}
      </div>

      <div className="hidden md:flex items-center space-x-3 text-theme-muted shrink-0">
        <div className="flex items-center space-x-1">
          <Keyboard className="w-3 h-3 text-theme-muted" />
          <span>Kısayollar:</span>
        </div>
        <span><kbd className="bg-theme-card text-theme-secondary border border-theme-subtle px-1 py-0.5 rounded text-[10px]">R</kbd> Döndür</span>
        <span><kbd className="bg-theme-card text-theme-secondary border border-theme-subtle px-1 py-0.5 rounded text-[10px]">F</kbd> Sığdır</span>
        <span><kbd className="bg-theme-card text-amber-400 border border-theme-subtle px-1 py-0.5 rounded text-[10px]">F2</kbd> Şüpheli</span>
        <span><kbd className="bg-theme-card text-emerald-400 border border-theme-subtle px-1 py-0.5 rounded text-[10px]">Ctrl+Enter</kbd> Onayla</span>
      </div>
    </footer>
  );
};
