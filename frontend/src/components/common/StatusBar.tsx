import React from 'react';
import { DocumentItem } from '../../types/irsaliye';
import { Keyboard, Activity, HardDrive } from 'lucide-react';

interface StatusBarProps {
  selectedDoc: DocumentItem | null;
  zoom: number;
}

export const StatusBar: React.FC<StatusBarProps> = ({ selectedDoc, zoom }) => {
  const isProcessing = selectedDoc?.durum === 'isleniyor';

  return (
    <footer className="h-7 bg-slate-950 border-t border-slate-800/80 px-3 flex items-center justify-between text-[11px] text-slate-400 select-none shrink-0 font-mono">
      <div className="flex items-center space-x-3">
        <div className={`flex items-center space-x-1.5 ${isProcessing ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
          <Activity className="w-3 h-3" />
          <span>{isProcessing ? 'İşleniyor...' : 'Sistem Hazır'}</span>
        </div>
        {selectedDoc && (
          <>
            <span className="text-slate-600">|</span>
            <div className="flex items-center space-x-1 text-slate-300">
              <HardDrive className="w-3 h-3 text-slate-500" />
              <span className="truncate max-w-[200px]">{selectedDoc.dosya_adi}</span>
              <span className="text-slate-500">
                ({(selectedDoc.boyut_bytes / 1024).toFixed(1)} KB)
              </span>
            </div>
            <span className="text-slate-600">|</span>
            <span>Ölçek: %{Math.round(zoom * 100)}</span>
          </>
        )}
      </div>

      <div className="hidden md:flex items-center space-x-3 text-slate-400">
        <div className="flex items-center space-x-1">
          <Keyboard className="w-3 h-3 text-slate-500" />
          <span>Kısayollar:</span>
        </div>
        <span><kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px]">R</kbd> Döndür</span>
        <span><kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px]">F</kbd> Sığdır</span>
        <span><kbd className="bg-slate-800 text-amber-300 px-1 py-0.5 rounded text-[10px]">F2</kbd> Şüpheli Alana Git</span>
        <span><kbd className="bg-slate-800 text-slate-300 px-1 py-0.5 rounded text-[10px]">Ctrl+Enter</kbd> Onayla</span>
      </div>

    </footer>
  );
};
