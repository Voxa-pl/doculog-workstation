import React, { useState } from 'react';
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
  Square,
  FileText
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
  const [thumbFailed, setThumbFailed] = useState(false);
  const [fullFailed, setFullFailed] = useState(false);
  const isPdf = doc.mime_type === 'application/pdf' || (doc.dosya_adi || '').toLowerCase().endsWith('.pdf');

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
          <span className="inline-flex items-center space-x-1 text-[10px] text-emerald-400 font-medium shrink-0">
            <CheckCheck className="w-3 h-3 text-emerald-400" />
            <span className="hidden sm:inline">Onaylandı</span>
          </span>
        );
      case 'tamamlandi':
        if (isNonInvoice) {
          return (
            <span className="inline-flex items-center space-x-1 text-[10px] text-slate-400 font-medium shrink-0" title="Resmi sevk irsaliyesi değil">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <span>İrsaliye Dışı</span>
            </span>
          );
        }
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] text-blue-400 font-medium shrink-0">
            <CheckCircle2 className="w-3 h-3 text-blue-400" />
            <span className="hidden sm:inline">İşlendi</span>
          </span>
        );
      case 'isleniyor':
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] text-amber-300 font-medium shrink-0">
            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
            <span>İşleniyor</span>
          </span>
        );
      case 'hata':
        return (
          <span 
            className="inline-flex items-center space-x-1 text-[10px] text-rose-400 font-medium shrink-0 cursor-help"
            title={doc.hata_mesaji || 'Belge işlenirken hata oluştu'}
          >
            <AlertCircle className="w-3 h-3 shrink-0" />
            <span>Hata</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center space-x-1 text-[10px] text-slate-400 font-medium shrink-0">
            <Clock className="w-3 h-3 text-slate-400" />
            <span>Kuyruk</span>
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
      className={`group relative p-1.5 sm:p-2 rounded-lg border cursor-pointer select-none min-w-0 tactile-card overflow-hidden transition-all ${
        isSelected
          ? 'bg-blue-600/10 border-blue-500/80 shadow-xs ring-1 ring-blue-500/30'
          : isChecked
          ? 'bg-purple-950/30 border-purple-500/60'
          : isNonInvoice
          ? 'bg-theme-card/40 border-theme-subtle hover:border-theme-strong'
          : 'bg-theme-card/60 border-theme-subtle hover:bg-theme-card hover:border-theme-strong'
      } ${doc.durum === 'isleniyor' ? 'state-processing' : ''}`}
    >
      {/* Seçili Belge Sol İndikatörü */}
      {isSelected && (
        <div className="absolute left-0 top-1 bottom-1 w-1 bg-blue-500 rounded-r z-10" />
      )}
      <div className="flex items-center space-x-2 min-w-0">
        {/* Çoklu Seçim Checkbox */}
        {isSelectionMode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleCheck) onToggleCheck(e);
            }}
            className="flex items-center justify-center shrink-0 w-6 h-6 text-theme-muted hover:text-purple-300"
          >
            {isChecked ? (
              <CheckSquare className="w-3.5 h-3.5 text-purple-400" />
            ) : (
              <Square className="w-3.5 h-3.5 text-theme-muted/60" />
            )}
          </div>
        )}

        {/* Thumbnail */}
        <div className="w-9 h-11 rounded bg-theme-app border border-theme-subtle overflow-hidden shrink-0 relative flex items-center justify-center">
          {isPdf ? (
            <FileText className="w-4 h-4 text-purple-400 shrink-0" />
          ) : !fullFailed ? (
            <img
              src={thumbFailed ? fullUrl : thumbUrl}
              alt={doc.dosya_adi}
              className="w-full h-full object-cover"
              loading="lazy"
              onError={() => {
                if (!thumbFailed) {
                  setThumbFailed(true);
                } else {
                  setFullFailed(true);
                }
              }}
            />
          ) : (
            <FileText className="w-4 h-4 text-theme-muted shrink-0" />
          )}
          {pageCount > 1 && (
            <div className="absolute bottom-0 right-0 bg-purple-950/90 text-purple-300 text-[8px] px-0.5 rounded-tl font-bold leading-none py-0.5">
              {pageCount}S
            </div>
          )}
        </div>

        {/* Bilgiler */}
        <div className="flex-1 min-w-0 flex flex-col justify-center">
          <div className="flex items-center justify-between gap-1 min-w-0">
            <span className="text-xs font-semibold text-theme-primary truncate min-w-0" title={irsaliyeNo || doc.dosya_adi}>
              {irsaliyeNo || doc.dosya_adi}
            </span>
            <div className="flex items-center space-x-1 shrink-0">
              {getStatusBadge(doc.durum)}
              <button
                type="button"
                onClick={onDelete}
                disabled={doc.durum === 'isleniyor'}
                className={`text-theme-muted hover:text-rose-400 p-1 rounded transition-all min-w-[28px] min-h-[28px] flex items-center justify-center ${
                  doc.durum === 'isleniyor' ? 'hidden' : 'opacity-70 sm:opacity-0 sm:group-hover:opacity-100'
                }`}
                title="Kuyruktan Sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-theme-muted truncate min-w-0 mt-0.5">
            <span className="truncate text-[10px] text-theme-secondary/80">
              {doc.veri?.header?.gonderici_unvan || doc.dosya_adi}
            </span>
            <div className="flex items-center space-x-1 shrink-0 ml-1">
              {doc.durum === 'kuyrukta' && (
                <button
                  type="button"
                  onClick={onProcess}
                  className="text-[10px] text-blue-400 hover:text-blue-300 font-medium hover:underline"
                >
                  İşle
                </button>
              )}
              {doc.durum === 'hata' && (
                <button
                  type="button"
                  onClick={onProcess}
                  className="text-[10px] text-rose-400 hover:text-rose-300 font-semibold hover:underline"
                  title="Belgeyi Yeniden Oku"
                >
                  Yeniden Dene
                </button>
              )}
              {itemsCount !== undefined && itemsCount > 0 && (
                <span className="text-[10px] text-theme-muted font-mono">
                  {itemsCount} Kalem
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
