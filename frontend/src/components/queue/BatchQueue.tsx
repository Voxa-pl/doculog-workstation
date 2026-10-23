import React, { useState, useRef } from 'react';
import { 
  DocumentItem, 
  BatchSummary 
} from '../../types/irsaliye';
import { QueueItem } from './QueueItem';
import { 
  UploadCloud, 
  Search, 
  Files, 
  FolderDown, 
  AlertCircle,
  Sparkles,
  Merge
} from 'lucide-react';

interface BatchQueueProps {
  documents?: DocumentItem[] | null;
  selectedDocId: string | null;
  summary?: BatchSummary | null;
  onSelectDoc: (id: string) => void;
  onUploadFiles: (files: File[]) => void;
  onDeleteDoc: (id: string) => void;
  onProcessDoc: (id: string) => void;
  onLoadDemo?: () => void;
  onMergeDocuments?: (targetDocId: string, sourceDocIds: string[]) => void;
  isUploading: boolean;
}

export const BatchQueue: React.FC<BatchQueueProps> = ({
  documents,
  selectedDocId,
  summary,
  onSelectDoc,
  onUploadFiles,
  onDeleteDoc,
  onProcessDoc,
  onLoadDemo,
  onMergeDocuments,
  isUploading,
}) => {
  type QueueFilterMode = 'all' | 'invoices' | 'non_invoices';
  const [filterMode, setFilterMode] = useState<QueueFilterMode>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [checkedDocIds, setCheckedDocIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const safeDocs = Array.isArray(documents) ? documents : [];
  const safeSummary: BatchSummary = summary || {
    toplam_belge: 0,
    kuyrukta: 0,
    islenen: 0,
    tamamlanan: 0,
    hatali: 0,
    onaylanan: 0,
  };

  const isDocNonInvoice = (doc: DocumentItem) => {
    return Boolean(
      doc.veri && (
        (typeof doc.veri.guven_skoru === 'number' && Number.isFinite(doc.veri.guven_skoru) && doc.veri.guven_skoru === 0) ||
        (doc.veri.genel_notlar && doc.veri.genel_notlar.toLowerCase().includes('sevk irsaliyesi değildir')) ||
        (!doc.veri.header?.irsaliye_no && !doc.veri.header?.gonderici_unvan && (!doc.veri.kalemler || doc.veri.kalemler.length === 0))
      )
    );
  };

  const invoiceCount = safeDocs.filter((d) => d.durum !== 'kuyrukta' && !isDocNonInvoice(d)).length;
  const nonInvoiceCount = safeDocs.filter((d) => isDocNonInvoice(d)).length;

  const filteredDocs = safeDocs.filter((doc) => {
    // 1. Kategori Filtresi
    if (filterMode === 'invoices') {
      if (isDocNonInvoice(doc)) return false;
    } else if (filterMode === 'non_invoices') {
      if (!isDocNonInvoice(doc)) return false;
    }

    // 2. Arama Filtresi
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    const fileNameMatch = (doc?.dosya_adi || '').toLowerCase().includes(term);
    const irsaliyeNoMatch = (doc?.veri?.header?.irsaliye_no || '').toLowerCase().includes(term);
    const unvanMatch =
      (doc?.veri?.header?.alici_unvan || '').toLowerCase().includes(term) ||
      (doc?.veri?.header?.gonderici_unvan || '').toLowerCase().includes(term);
    return fileNameMatch || !!irsaliyeNoMatch || !!unvanMatch;
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files);
      onUploadFiles(filesArray);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files);
      onUploadFiles(filesArray);
      e.target.value = '';
    }
  };

  const toggleCheck = (docId: string) => {
    setCheckedDocIds((prev) =>
      prev.includes(docId) ? prev.filter((id) => id !== docId) : [...prev, docId]
    );
  };

  const handleMergeAction = () => {
    if (checkedDocIds.length < 2 || !onMergeDocuments) return;
    const targetId = checkedDocIds[0];
    const sourceIds = checkedDocIds.slice(1);
    onMergeDocuments(targetId, sourceIds);
    setCheckedDocIds([]);
    setIsSelectionMode(false);
  };

  return (
    <aside className="w-full md:w-72 lg:w-80 h-full bg-slate-900/90 border-r border-slate-800 flex flex-col shrink-0 select-none overflow-hidden min-w-0">
      <div className="p-3 border-b border-slate-800 space-y-2.5 min-w-0">
        <div className="flex items-center justify-between min-w-0 gap-1">
          <div className="flex items-center space-x-2 min-w-0">
            <Files className="w-4 h-4 text-blue-400 shrink-0" />
            <h2 className="text-xs font-semibold text-white tracking-wide uppercase truncate">
              Evrak Kuyruğu ({safeDocs.length})
            </h2>
          </div>
          {isUploading ? (
            <span className="text-[10px] text-blue-400 animate-pulse font-medium shrink-0">
              Yükleniyor...
            </span>
          ) : (
            safeDocs.length >= 2 && (
              <button
                type="button"
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setCheckedDocIds([]);
                }}
                className={`text-xs px-3 py-1.5 min-h-[38px] min-w-[64px] rounded-lg border shrink-0 tactile-btn ${
                  isSelectionMode
                    ? 'bg-purple-600 border-purple-500 text-white font-semibold'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
                title="Çok sayfalı irsaliyeleri birleştirmek için seçin"
              >
                {isSelectionMode ? 'İptal' : 'Birleştir'}
              </button>
            )
          )}
        </div>

        {/* Çoklu Seçim Birleştirme Bildirim Çubuğu */}
        {isSelectionMode && (
          <div className="bg-purple-950/40 border border-purple-500/30 rounded-lg p-2 flex items-center justify-between min-h-[44px] min-w-0">
            <span className="text-xs text-purple-300 font-medium truncate">
              {checkedDocIds.length} sayfa seçildi
            </span>
            <button
              type="button"
              onClick={handleMergeAction}
              disabled={checkedDocIds.length < 2}
              className="flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white px-3 py-1.5 min-h-[38px] rounded-lg text-xs font-semibold shadow-sm shrink-0 tactile-btn-purple"
            >
              <Merge className="w-3.5 h-3.5" />
              <span>Birleştir</span>
            </button>
          </div>
        )}

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-all active:scale-[0.99] min-w-0 ${
            isDragOver
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-slate-800 hover:border-slate-700 bg-slate-950/40 hover:bg-slate-950/60'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf"
            className="hidden"
            onChange={handleFileInputChange}
          />
          <div className="flex flex-col items-center justify-center space-y-1.5 py-0.5">
            <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <UploadCloud className="w-4 h-4" />
            </div>
            <p className="text-xs font-medium text-slate-300 truncate max-w-full">
              Dosyaları buraya sürükleyin veya dokunun
            </p>
          </div>
        </div>

        {/* Tek Tıkla Örnek Belgeyi Yeniden Yükle */}
        {onLoadDemo && (
          <button
            type="button"
            onClick={onLoadDemo}
            className="w-full flex items-center justify-center space-x-1.5 py-2 px-3 min-h-[40px] rounded-lg border border-slate-800 bg-slate-950/50 hover:bg-slate-800 text-xs text-blue-400 hover:text-blue-300 font-medium shrink-0 tactile-btn"
            title="Örnek sevk irsaliyesi görselini kuyruğa yükler"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate">Örnek Belgeyi Yeniden Yükle</span>
          </button>
        )}

        {safeDocs.length > 3 && (
          <div className="space-y-1.5 min-w-0">
            <div className="relative min-w-0">
              <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ara (dosya adı, irsaliye no, ünvan)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 min-h-[38px]"
              />
            </div>

            {/* Linear Segmented Filter Pills (Tümü / İrsaliye / Uyumsuz) */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-950/70 border border-slate-800/80 rounded-lg text-[10px] font-medium">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`flex-1 py-1 px-1 rounded text-center transition-all ${
                  filterMode === 'all'
                    ? 'bg-slate-800 text-white font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Tümü ({safeDocs.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('invoices')}
                className={`flex-1 py-1 px-1 rounded text-center transition-all ${
                  filterMode === 'invoices'
                    ? 'bg-blue-600/30 text-blue-300 font-semibold border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                İrsaliye ({invoiceCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('non_invoices')}
                className={`flex-1 py-1 px-1 rounded text-center transition-all ${
                  filterMode === 'non_invoices'
                    ? 'bg-rose-600/30 text-rose-300 font-semibold border border-rose-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Uyumsuz ({nonInvoiceCount})
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2 overscroll-contain min-w-0">
        {filteredDocs.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-slate-500">
            {safeDocs.length === 0 ? (
              <>
                <FolderDown className="w-7 h-7 text-slate-700/60 mb-1.5" />
                <p className="text-xs font-medium text-slate-500 mb-2">Belge Bekleniyor</p>
                {onLoadDemo && (
                  <button
                    onClick={onLoadDemo}
                    className="text-[11px] bg-blue-600 hover:bg-blue-500 text-white px-2.5 py-1 rounded font-medium transition-colors"
                  >
                    Örnek Belgeyi Yükle
                  </button>
                )}
              </>
            ) : (
              <>
                <AlertCircle className="w-5 h-5 text-slate-700/60 mb-1" />
                <p className="text-xs text-slate-500">Kayıt Bulunamadı</p>
              </>
            )}
          </div>
        ) : (
          filteredDocs.map((doc) => (
            <QueueItem
              key={doc.id}
              doc={doc}
              isSelected={doc.id === selectedDocId}
              isSelectionMode={isSelectionMode}
              isChecked={checkedDocIds.includes(doc.id)}
              onToggleCheck={() => toggleCheck(doc.id)}
              onSelect={() => onSelectDoc(doc.id)}
              onDelete={(e) => {
                e.stopPropagation();
                onDeleteDoc(doc.id);
              }}
              onProcess={(e) => {
                e.stopPropagation();
                onProcessDoc(doc.id);
              }}
            />
          ))
        )}
      </div>

      {safeDocs.length > 0 && (
        <div className="p-2 border-t border-slate-800/80 bg-slate-950/40 text-[10px] text-slate-500 flex justify-between px-3 min-w-0">
          <span>Kuyruk: {safeSummary.kuyrukta ?? 0}</span>
          <span>Tamamlanan: {(safeSummary.tamamlanan || 0) + (safeSummary.onaylanan || 0)}</span>
        </div>
      )}
    </aside>
  );
};
