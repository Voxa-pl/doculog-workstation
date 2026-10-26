import React, { useRef } from 'react';
import { 
  Layers, 
  UploadCloud, 
  ChevronRight, 
  Maximize2,
  Sparkles
} from 'lucide-react';
import { BatchSummary } from '../../types/irsaliye';

interface CollapsibleDockRailProps {
  totalDocs: number;
  summary?: BatchSummary | null;
  onTriggerPeekOpen: () => void;
  onTriggerPeekClose?: () => void;
  onUploadFiles?: (files: File[]) => void;
  onToggleFocusMode?: () => void;
}

export const CollapsibleDockRail: React.FC<CollapsibleDockRailProps> = ({
  totalDocs,
  summary,
  onTriggerPeekOpen,
  onTriggerPeekClose,
  onUploadFiles,
  onToggleFocusMode,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const safeSummary: BatchSummary = summary || {
    toplam_belge: 0,
    kuyrukta: 0,
    islenen: 0,
    tamamlanan: 0,
    hatali: 0,
    onaylanan: 0,
  };

  const approvedCount = (safeSummary.onaylanan || 0) + (safeSummary.tamamlanan || 0);
  const queuedCount = safeSummary.kuyrukta || 0;
  const processingCount = safeSummary.islenen || 0;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && onUploadFiles) {
      onUploadFiles(Array.from(files));
      e.target.value = '';
    }
  };

  return (
    <aside
      onMouseEnter={onTriggerPeekOpen}
      onMouseLeave={onTriggerPeekClose}
      className="w-12 h-full bg-theme-surface border-r border-theme-subtle flex flex-col items-center justify-between py-2 shrink-0 select-none z-20 transition-all duration-200"
      aria-label="Kuyruk Mini Çubuğu"
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp"
        className="hidden"
      />

      {/* Üst Kısım: Mini Kuyruk İkonu ve Sayaç Rozeti */}
      <div className="flex flex-col items-center gap-1.5 w-full px-1">
        <button
          type="button"
          onClick={onTriggerPeekOpen}
          title="Kuyruğu Göster (Fareyi yaklaştırın veya tıklayın)"
          className="w-8 h-8 rounded-lg bg-theme-card hover:bg-theme-card-hover border border-theme-subtle flex items-center justify-center text-theme-secondary hover:text-blue-400 relative transition-all active:scale-95 group shadow-xs"
        >
          <Layers className="w-4 h-4 transition-transform group-hover:scale-110" />
          {totalDocs > 0 && (
            <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] font-mono font-bold w-4 h-4 rounded-full flex items-center justify-center shadow-sm">
              {totalDocs > 99 ? '99+' : totalDocs}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={onTriggerPeekOpen}
          className="text-[9px] font-mono text-theme-muted hover:text-theme-primary px-1 py-0.5 rounded transition-colors"
          title="Kuyruk genişletme kısayolu: ["
        >
          [
        </button>
      </div>

      {/* Orta Kısım: Dikey Mini Durum Şeridi (Vertical Telemetry Bar) */}
      <div 
        className="flex-1 w-full flex flex-col items-center justify-center gap-1.5 py-4 overflow-hidden max-h-[50vh] cursor-pointer"
        onClick={onTriggerPeekOpen}
        title={`Durum Dağılımı: ${approvedCount} Onaylı, ${queuedCount} Kuyrukta, ${processingCount} İşleniyor`}
      >
        <div className="w-1.5 h-full max-h-40 bg-theme-card rounded-full overflow-hidden flex flex-col items-center gap-0.5 p-0.5 border border-theme-subtle">
          {/* Yeşil: Onaylanan ve Tamamlananlar */}
          {approvedCount > 0 && (
            <div
              className="w-full bg-emerald-500 rounded-full transition-all duration-300"
              style={{ height: `${Math.max(8, (approvedCount / (totalDocs || 1)) * 100)}%` }}
              title={`Onaylanan: ${approvedCount}`}
            />
          )}
          {/* Amber: Kuyrukta Bekleyenler */}
          {queuedCount > 0 && (
            <div
              className="w-full bg-amber-400 rounded-full transition-all duration-300"
              style={{ height: `${Math.max(8, (queuedCount / (totalDocs || 1)) * 100)}%` }}
              title={`Kuyrukta: ${queuedCount}`}
            />
          )}
          {/* Mavi: Ayrıştırılan / İşlenen */}
          {processingCount > 0 && (
            <div
              className="w-full bg-blue-500 rounded-full animate-pulse transition-all duration-300"
              style={{ height: `${Math.max(8, (processingCount / (totalDocs || 1)) * 100)}%` }}
              title={`İşleniyor: ${processingCount}`}
            />
          )}
        </div>
      </div>

      {/* Alt Kısım: Hızlı Ekle & Genişlet Butonları */}
      <div className="flex flex-col items-center gap-1.5 w-full px-1">
        {onUploadFiles && (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Hızlı Evrak Yükle"
            className="w-8 h-8 rounded-lg bg-blue-600/15 hover:bg-blue-600 text-blue-400 hover:text-white border border-blue-500/25 flex items-center justify-center transition-all active:scale-95 shadow-xs"
          >
            <UploadCloud className="w-4 h-4" />
          </button>
        )}

        <button
          type="button"
          onClick={onTriggerPeekOpen}
          title="Çekmeceyi Genişlet"
          className="w-7 h-7 rounded-md text-theme-muted hover:text-theme-primary hover:bg-theme-card flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
