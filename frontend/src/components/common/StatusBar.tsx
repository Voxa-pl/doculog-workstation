import React from 'react';
import { DocumentItem } from '../../types/irsaliye';
import { Keyboard, Activity, HardDrive } from 'lucide-react';

interface StatusBarProps {
  selectedDoc: DocumentItem | null;
  zoom: number;
  isWsConnected?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ selectedDoc, zoom, isWsConnected = true }) => {
  const isProcessing = selectedDoc?.durum === 'isleniyor';
  const rawBytes = Number(selectedDoc?.boyut_bytes);
  const safeBytes = Number.isFinite(rawBytes) ? rawBytes : 0;
  const safeZoom = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;

  return (
    <footer className="h-7 bg-slate-950 border-t border-slate-800/80 px-3 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0 font-mono min-w-0">
      <div className="flex items-center space-x-3 min-w-0">
        <div className={`flex items-center space-x-1.5 shrink-0 ${isProcessing ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
          <Activity className="w-3 h-3" />
          <span>{isProcessing ? 'İşleniyor...' : 'Sistem Hazır'}</span>
        </div>
        <span className="text-slate-600 shrink-0">|</span>
        <div className="flex items-center space-x-1.5 text-slate-400 shrink-0">
          <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse' : 'bg-amber-400'}`} />
          <span className="text-[10px] hidden xs:inline">{isWsConnected ? 'Canlı Senkron (PC/Mobil)' : 'Senkron Bekliyor'}</span>
        </div>
        {selectedDoc && (
          <>
            <span className="text-slate-600 shrink-0">|</span>
            <div className="flex items-center space-x-1 text-slate-300 min-w-0">
              <HardDrive className="w-3 h-3 text-slate-500 shrink-0" />
              <span className="truncate max-w-[140px] sm:max-w-[220px]" title={selectedDoc.dosya_adi}>
                {selectedDoc.dosya_adi}
              </span>
              <span className="text-slate-500 shrink-0">
                ({(safeBytes / 1024).toFixed(1)} KB)
              </span>
            </div>
            <span className="text-slate-600 shrink-0">|</span>
            <span className="shrink-0">Ölçek: %{Math.round(safeZoom * 100)}</span>
          </>
        )}
      </div>

      <div className="hidden md:flex items-center space-x-3 text-slate-400 shrink-0">
        <div className="flex items-center space-x-1">
          <Keyboard className="w-3 h-3 text-slate-500" />
          <span>Kısayollar:</span>
        </div>
        <span><kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px]">R</kbd> Döndür</span>
        <span><kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px]">F</kbd> Sığdır</span>
        <span><kbd className="bg-slate-800 text-amber-300 px-1 py-0.5 rounded text-[10px]">F2</kbd> Şüpheli</span>
        <span><kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px]">Ctrl+Enter</kbd> Onayla</span>
      </div>
    </footer>
  );
};
