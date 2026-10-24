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
    <aside className="w-full md:w-72 lg:w-80 h-full bg-theme-surface border-r border-theme-subtle flex flex-col shrink-0 select-none overflow-hidden min-w-0">
      <div className="p-3 border-b border-theme-subtle space-y-2.5 min-w-0">
        <div className="flex items-center justify-between min-w-0 gap-1">
          <div className="flex items-center space-x-2 min-w-0">
            <Files className="w-4 h-4 text-blue-400 shrink-0" />
            <h2 className="text-xs font-semibold text-theme-primary tracking-wide uppercase truncate">
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
                className={`text-xs px-3 py-1.5 min-h-[34px] min-w-[64px] rounded-md border shrink-0 tactile-btn ${
                  isSelectionMode
                    ? 'bg-purple-600 border-purple-500 text-white font-semibold'
                    : 'bg-theme-card border-theme-subtle text-theme-secondary hover:text-theme-primary'
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
          <div className="bg-purple-950/40 border border-purple-500/30 rounded-lg p-2 flex items-center justify-between min-h-[40px] min-w-0">
            <span className="text-xs text-purple-300 font-medium truncate">
              {checkedDocIds.length} sayfa seçildi
            </span>
            <button
              type="button"
              onClick={handleMergeAction}
              disabled={checkedDocIds.length < 2}
              className="flex items-center space-x-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white px-3 py-1.5 min-h-[34px] rounded-md text-xs font-semibold shadow-sm shrink-0 tactile-btn-purple"
            >
              <Merge className="w-3.5 h-3.5" />
              <span>Birleştir</span>
            </button>
          </div>
        )}

        {/* Adaptif Yükleme Alanı: Liste doluyken kompakt şerit, azken ferah kutu */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg text-center cursor-pointer transition-all active:scale-[0.99] min-w-0 ${
            safeDocs.length > 3 ? 'p-2' : 'p-3'
          } ${
            isDragOver
              ? 'border-blue-500 bg-blue-500/10'
              : 'border-theme-subtle hover:border-theme-strong bg-theme-card/30 hover:bg-theme-card/60'
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
          {safeDocs.length > 3 ? (
            <div className="flex items-center justify-center space-x-2 py-0.5">
              <UploadCloud className="w-4 h-4 text-blue-400 shrink-0" />
              <p className="text-xs font-medium text-theme-secondary truncate">
                Yeni Evrak Ekle veya Sürükle
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center space-y-1.5 py-0.5">
              <div className="w-7 h-7 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <UploadCloud className="w-4 h-4" />
              </div>
              <p className="text-xs font-medium text-theme-secondary truncate max-w-full">
                Dosyaları buraya sürükleyin veya dokunun
              </p>
            </div>
          )}
        </div>

        {/* Tek Tıkla Örnek Belgeyi Yeniden Yükle */}
        {onLoadDemo && safeDocs.length <= 3 && (
          <button
            type="button"
            onClick={onLoadDemo}
            className="w-full flex items-center justify-center space-x-1.5 py-1.5 px-3 min-h-[34px] rounded-md border border-theme-subtle bg-theme-card hover:bg-theme-card-hover text-xs text-blue-400 hover:text-blue-300 font-medium shrink-0 tactile-btn"
            title="Örnek sevk irsaliyesi görselini kuyruğa yükler"
          >
            <Sparkles className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="truncate">Örnek Belgeyi Yeniden Yükle</span>
          </button>
        )}

        {safeDocs.length > 0 && (
          <div className="space-y-1.5 min-w-0">
            <div className="relative min-w-0">
              <Search className="w-4 h-4 text-theme-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Ara (dosya adı, irsaliye no, ünvan)..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-theme-card border border-theme-subtle rounded-md pl-9 pr-3 py-1.5 text-xs text-theme-primary placeholder-theme-muted focus:outline-none focus:border-blue-500 min-h-[34px]"
              />
            </div>

            {/* Linear Segmented Filter Pills (Tümü / İrsaliye / Uyumsuz) */}
            <div className="flex items-center gap-1 p-0.5 bg-theme-card/60 border border-theme-subtle rounded-md text-[10px] font-medium">
              <button
                type="button"
                onClick={() => setFilterMode('all')}
                className={`flex-1 py-1 px-1 rounded text-center transition-all ${
                  filterMode === 'all'
                    ? 'bg-theme-card text-theme-primary font-semibold shadow-sm border border-theme-subtle'
                    : 'text-theme-muted hover:text-theme-primary'
                }`}
              >
                Tümü ({safeDocs.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('invoices')}
                className={`flex-1 py-1 px-1 rounded text-center transition-all ${
                  filterMode === 'invoices'
                    ? 'bg-blue-600/25 text-blue-300 font-semibold border border-blue-500/30'
                    : 'text-theme-muted hover:text-theme-primary'
                }`}
              >
                İrsaliye ({invoiceCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterMode('non_invoices')}
                className={`flex-1 py-1 px-1 rounded text-center transition-all ${
                  filterMode === 'non_invoices'
                    ? 'bg-rose-600/25 text-rose-300 font-semibold border border-rose-500/30'
                    : 'text-theme-muted hover:text-theme-primary'
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
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-theme-muted">
            {safeDocs.length === 0 ? (
              <>
                <FolderDown className="w-7 h-7 text-theme-muted/50 mb-1.5" />
                <p className="text-xs font-medium text-theme-muted mb-2">Belge Bekleniyor</p>
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
                <AlertCircle className="w-5 h-5 text-theme-muted/50 mb-1" />
                <p className="text-xs text-theme-muted">Kayıt Bulunamadı</p>
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
        <div className="p-2 border-t border-theme-subtle bg-theme-surface text-[10px] text-theme-muted flex justify-between px-3 min-w-0 font-mono tabular-nums">
          <span>Kuyruk: {safeSummary.kuyrukta ?? 0}</span>
          <span>Tamamlanan: {(safeSummary.tamamlanan || 0) + (safeSummary.onaylanan || 0)}</span>
        </div>
      )}
    </aside>
  );
};
