import React from 'react';
import { 
  DocumentItem, 
  ProcessingStatus 
} from '../../types/irsaliye';
import { 
  CheckCircle2, 
  AlertCircle, 
  Clock, 
  Loader2, 
  Trash2, 
  CheckCheck,
  RotateCw,
  Layers,
  CheckSquare,
  Square
} from 'lucide-react';

interface QueueItemProps {
  doc: DocumentItem;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onProcess: (e: React.MouseEvent) => void;
  isSelectionMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (e: React.MouseEvent) => void;
}

export const QueueItem: React.FC<QueueItemProps> = ({
  doc,
  isSelected,
  onSelect,
  onDelete,
  onProcess,
  isSelectionMode = false,
  isChecked = false,
  onToggleCheck,
}) => {
  const isNonInvoice = Boolean(
    doc.veri && (
      (typeof doc.veri.guven_skoru === 'number' && Number.isFinite(doc.veri.guven_skoru) && doc.veri.guven_skoru === 0) ||
      (doc.veri.genel_notlar && doc.veri.genel_notlar.toLowerCase().includes('sevk irsaliyesi değildir')) ||
      (!doc.veri.header?.irsaliye_no && !doc.veri.header?.gonderici_unvan && (!doc.veri.kalemler || doc.veri.kalemler.length === 0))
    )
  );

  const getStatusBadge = (status: ProcessingStatus) => {
    switch (status) {
      case 'onaylandi':
        return (
          <span className="flex items-center space-x-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium shrink-0 state-morph-badge state-verified-pop shadow-sm shadow-emerald-500/20">
            <CheckCheck className="w-3 h-3 text-emerald-400" />
            <span>Onaylandı</span>
          </span>
        );
      case 'tamamlandi':
        if (isNonInvoice) {
          return (
            <span className="flex items-center space-x-1 text-[10px] text-rose-300 bg-rose-500/15 border border-rose-500/30 px-1.5 py-0.5 rounded font-medium shrink-0 state-morph-badge">
              <AlertCircle className="w-3 h-3 text-rose-400" />
              <span>İrsaliye Dışı</span>
            </span>
          );
        }
        return (
          <span className="flex items-center space-x-1 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded font-medium shrink-0 state-morph-badge state-verified-pop">
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
            <span>İşlendi</span>
          </span>
        );
      case 'isleniyor':
        return (
          <span className="flex items-center space-x-1 text-[10px] text-amber-300 bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.5 rounded font-medium shrink-0 state-morph-badge">
            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
            <span>İşleniyor...</span>
          </span>
        );
      case 'hata':
        return (
          <span className="flex items-center space-x-1 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded font-medium shrink-0 state-morph-badge">
            <AlertCircle className="w-3 h-3" />
            <span>Hata</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1 text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-medium shrink-0 state-morph-badge">
            <Clock className="w-3 h-3" />
            <span>Kuyrukta</span>
          </span>
        );
    }
  };

  const irsaliyeNo = doc.veri?.header?.irsaliye_no;
  const itemsCount = Array.isArray(doc.veri?.kalemler) ? doc.veri.kalemler.length : undefined;
  const pageCount = Array.isArray(doc.sayfalar) && doc.sayfalar.length > 0 ? doc.sayfalar.length : 1;
  const safeBytes = Number.isFinite(Number(doc.boyut_bytes)) ? Number(doc.boyut_bytes) : 0;

  const versionParam = doc.guncellenme_ts ? `?t=${doc.guncellenme_ts}` : '';
  const thumbUrl = `/uploads/thumb_${doc.id}.jpg${versionParam}`;
  const fullUrl = `${doc.dosya_url}${versionParam}`;

  return (
    <div
      onClick={onSelect}
      className={`group relative p-2.5 rounded-lg border cursor-pointer select-none min-w-0 tactile-card overflow-hidden ${
        isSelected
          ? 'bg-blue-600/10 border-blue-500 shadow-sm ring-1 ring-blue-500/30'
          : isChecked
          ? 'bg-purple-950/30 border-purple-500/60'
          : isNonInvoice
          ? 'bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50'
          : 'bg-theme-card/70 border-theme-subtle hover:bg-theme-card hover:border-theme-strong'
      } ${doc.durum === 'isleniyor' ? 'state-processing' : ''}`}
    >
      {/* Seçili Belge Sol Akrilik Şerit (Linear Craft Indicator) */}
      {isSelected && (
        <div className="absolute left-0 top-1.5 bottom-1.5 w-1 bg-blue-500 rounded-r shadow-[0_0_8px_rgba(59,130,246,0.8)] z-10" />
      )}
      <div className="flex space-x-2.5 min-w-0">
        {/* Çoklu Seçim Checkbox */}
        {isSelectionMode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleCheck) onToggleCheck(e);
            }}
            className="flex items-center justify-center shrink-0 min-w-[36px] min-h-[36px] text-theme-muted hover:text-purple-300 tactile-icon"
          >
            {isChecked ? (
              <CheckSquare className="w-4 h-4 text-purple-400" />
            ) : (
              <Square className="w-4 h-4 text-theme-muted/60" />
            )}
          </div>
        )}

        <div className="w-14 h-16 rounded bg-theme-app border border-theme-subtle overflow-hidden shrink-0 relative flex items-center justify-center">
          <img
            src={thumbUrl}
            alt={doc.dosya_adi}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              if (target.src !== fullUrl) {
                target.src = fullUrl;
              } else {
                target.style.display = 'none';
              }
            }}
          />
          {pageCount > 1 && (
            <div className="absolute top-0.5 left-0.5 bg-purple-950/90 text-purple-300 border border-purple-500/40 text-[9px] px-1 rounded flex items-center font-bold">
              <Layers className="w-2.5 h-2.5 mr-0.5" />
              {pageCount}S
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
              <span className="text-xs font-medium text-theme-primary truncate min-w-0 flex-1" title={doc.dosya_adi}>
                {doc.dosya_adi}
              </span>
              <button
                type="button"
                onClick={onDelete}
                className="opacity-80 sm:opacity-0 sm:group-hover:opacity-100 text-theme-muted hover:text-rose-400 min-w-[34px] min-h-[34px] flex items-center justify-center p-1 rounded-md shrink-0 tactile-icon"
                title="Kuyruktan Sil"
                aria-label="Kuyruktan Sil"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            <div className="text-[11px] font-mono text-theme-secondary truncate min-w-0">
              {irsaliyeNo ? (
                <span className="text-blue-400 font-semibold truncate block" title={irsaliyeNo}>{irsaliyeNo}</span>
              ) : (
                <span>{(safeBytes / 1024).toFixed(0)} KB</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-theme-subtle min-w-0 gap-1">
            <div className="shrink-0">{getStatusBadge(doc.durum)}</div>

            {doc.durum === 'kuyrukta' && (
              <button
                type="button"
                onClick={onProcess}
                className="text-[11px] bg-blue-600/20 hover:bg-blue-600 border border-blue-500/30 text-blue-300 hover:text-white px-2.5 py-1 min-h-[30px] rounded-md font-semibold shrink-0 flex items-center justify-center tactile-btn"
              >
                İşle
              </button>
            )}

            {itemsCount !== undefined && itemsCount > 0 && (
              <span className="text-[10px] text-theme-muted font-medium font-mono shrink-0">
                {itemsCount} Kalem
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
