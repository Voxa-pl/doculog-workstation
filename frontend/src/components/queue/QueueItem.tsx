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
  const getStatusBadge = (status: ProcessingStatus) => {
    switch (status) {
      case 'onaylandi':
        return (
          <span className="flex items-center space-x-1 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded font-medium">
            <CheckCheck className="w-3 h-3" />
            <span>Onaylandı</span>
          </span>
        );
      case 'tamamlandi':
        return (
          <span className="flex items-center space-x-1 text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded font-medium">
            <CheckCircle2 className="w-3 h-3" />
            <span>İşlendi</span>
          </span>
        );
      case 'isleniyor':
        return (
          <span className="flex items-center space-x-1 text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded font-medium animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>İşleniyor...</span>
          </span>
        );
      case 'hata':
        return (
          <span className="flex items-center space-x-1 text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded font-medium">
            <AlertCircle className="w-3 h-3" />
            <span>Hata</span>
          </span>
        );
      default:
        return (
          <span className="flex items-center space-x-1 text-[10px] text-slate-400 bg-slate-800 border border-slate-700 px-1.5 py-0.5 rounded font-medium">
            <Clock className="w-3 h-3" />
            <span>Kuyrukta</span>
          </span>
        );
    }
  };

  const irsaliyeNo = doc.veri?.header?.irsaliye_no;
  const itemsCount = doc.veri?.kalemler?.length;
  const pageCount = doc.sayfalar?.length || 1;

  return (
    <div
      onClick={onSelect}
      className={`group relative p-2.5 rounded-lg border transition-all cursor-pointer select-none ${
        isSelected
          ? 'bg-blue-950/40 border-blue-500 shadow-md ring-1 ring-blue-500/30'
          : isChecked
          ? 'bg-purple-950/30 border-purple-500/60'
          : 'bg-slate-900/60 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
      }`}
    >
      <div className="flex space-x-2.5">
        {/* Çoklu Seçim Checkbox */}
        {isSelectionMode && (
          <div
            onClick={(e) => {
              e.stopPropagation();
              if (onToggleCheck) onToggleCheck(e);
            }}
            className="flex items-center justify-center shrink-0 text-slate-400 hover:text-purple-300"
          >
            {isChecked ? (
              <CheckSquare className="w-4 h-4 text-purple-400" />
            ) : (
              <Square className="w-4 h-4 text-slate-600" />
            )}
          </div>
        )}

        <div className="w-14 h-16 rounded bg-slate-950 border border-slate-800 overflow-hidden shrink-0 relative flex items-center justify-center">
          <img
            src={doc.dosya_url}
            alt={doc.dosya_adi}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
          {doc.donus_acisi > 0 && (
            <div className="absolute bottom-0.5 right-0.5 bg-black/70 text-slate-300 text-[9px] px-1 rounded flex items-center">
              <RotateCw className="w-2 h-2 mr-0.5" />
              {doc.donus_acisi}°
            </div>
          )}
          {pageCount > 1 && (
            <div className="absolute top-0.5 left-0.5 bg-purple-950/90 text-purple-300 border border-purple-500/40 text-[9px] px-1 rounded flex items-center font-bold">
              <Layers className="w-2.5 h-2.5 mr-0.5" />
              {pageCount}S
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
          <div>
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-xs font-medium text-white truncate" title={doc.dosya_adi}>
                {doc.dosya_adi}
              </span>
              <button
                onClick={onDelete}
                className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-0.5 transition-opacity"
                title="Kuyruktan Sil"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="text-[11px] font-mono text-slate-400 truncate">
              {irsaliyeNo ? (
                <span className="text-blue-300 font-semibold">{irsaliyeNo}</span>
              ) : (
                <span>{(doc.boyut_bytes / 1024).toFixed(0)} KB</span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between mt-1.5 pt-1 border-t border-slate-800/60">
            <div>{getStatusBadge(doc.durum)}</div>

            {doc.durum === 'kuyrukta' && (
              <button
                onClick={onProcess}
                className="text-[10px] bg-blue-600/20 hover:bg-blue-600 border border-blue-500/30 text-blue-300 hover:text-white px-1.5 py-0.5 rounded transition-all font-medium"
              >
                İşle
              </button>
            )}

            {itemsCount !== undefined && itemsCount > 0 && (
              <span className="text-[10px] text-slate-400 font-medium">
                {itemsCount} Kalem
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
