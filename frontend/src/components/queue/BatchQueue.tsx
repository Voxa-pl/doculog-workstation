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
  type QueueFilterMode = 'all' | 'invoices' | 'pending' | 'non_invoices';
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

  const isDocPending = (doc: DocumentItem) => {
    if (isDocNonInvoice(doc)) return false;
    return doc.durum === 'kuyrukta' || doc.durum === 'isleniyor' || doc.durum === 'hata';
  };

  const isDocInvoice = (doc: DocumentItem) => {
    if (isDocNonInvoice(doc)) return false;
    return doc.durum === 'tamamlandi' || doc.durum === 'onaylandi';
  };

  const invoiceCount = safeDocs.filter(isDocInvoice).length;
  const pendingCount = safeDocs.filter(isDocPending).length;
  const nonInvoiceCount = safeDocs.filter(isDocNonInvoice).length;

  // Türkçe Karakter Normalizasyonu (BUG-04 Çözümü)
  const normalizeTr = (s?: string | null) => (s || '').toLocaleLowerCase('tr-TR').trim();

  const filteredDocs = safeDocs.filter((doc) => {
    // 1. Kategori Filtresi (4 Kategori: Tümü, İrsaliye, Bekleyen, Uyumsuz)
    if (filterMode === 'invoices') {
      if (!isDocInvoice(doc)) return false;
    } else if (filterMode === 'pending') {
      if (!isDocPending(doc)) return false;
    } else if (filterMode === 'non_invoices') {
      if (!isDocNonInvoice(doc)) return false;
    }

    // 2. Arama Filtresi
    const term = normalizeTr(searchTerm);
    if (!term) return true;
    const fileNameMatch = normalizeTr(doc?.dosya_adi).includes(term);
    const irsaliyeNoMatch = normalizeTr(doc?.veri?.header?.irsaliye_no).includes(term);
    const unvanMatch =
      normalizeTr(doc?.veri?.header?.alici_unvan).includes(term) ||
      normalizeTr(doc?.veri?.header?.gonderici_unvan).includes(term);
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

  const validCheckedDocIds = checkedDocIds.filter((id) => safeDocs.some((d) => d.id === id));

  const handleMergeAction = () => {
    if (validCheckedDocIds.length < 2 || !onMergeDocuments) return;
    const targetId = validCheckedDocIds[0];
    const sourceIds = validCheckedDocIds.slice(1);
    onMergeDocuments(targetId, sourceIds);
    setCheckedDocIds([]);
    setIsSelectionMode(false);
  };

  return (
    <aside 
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="w-full h-full bg-theme-surface border-r border-theme-subtle flex flex-col shrink-0 select-none overflow-hidden relative min-w-0"
    >
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,.pdf"
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Sürükle-Bırak Tam Panel Katmanı */}
      {isDragOver && (
        <div className="absolute inset-0 bg-blue-600/20 border-2 border-dashed border-blue-500 backdrop-blur-xs z-30 flex flex-col items-center justify-center pointer-events-none p-4 text-center">
          <UploadCloud className="w-9 h-9 text-blue-400 mb-2 animate-bounce" />
          <span className="text-xs font-bold text-white">Evrakları Buraya Bırakın</span>
          <span className="text-[10px] text-blue-200 mt-1">PDF, PNG, JPG anında kuyruğa alınır</span>
        </div>
      )}

      {/* Sabit 48px Datum Üst Başlık Çubuğu */}
      <header className="h-12 border-b border-theme-subtle bg-theme-surface/95 px-3 flex items-center justify-between shrink-0 min-w-0 gap-1.5">
        <div className="flex items-center space-x-2 min-w-0">
          <Files className="w-4 h-4 text-blue-400 shrink-0" />
          <h2 className="text-xs font-bold text-theme-primary uppercase tracking-wider truncate">
            Kuyruk ({safeDocs.length})
          </h2>
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {isUploading ? (
            <span className="text-[10px] text-blue-400 animate-pulse font-medium">
              Yükleniyor...
            </span>
          ) : (
            <>
              {(safeDocs.length >= 2 || isSelectionMode) && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSelectionMode(!isSelectionMode);
                    setCheckedDocIds([]);
                  }}
                  className={`text-xs px-2.5 py-1 min-h-[30px] rounded-md border shrink-0 transition-all font-medium ${
                    isSelectionMode
                      ? 'bg-purple-600 border-purple-500 text-white font-semibold'
                      : 'bg-theme-card border-theme-subtle text-theme-secondary hover:text-theme-primary'
                  }`}
                  title="Çok sayfalı irsaliyeleri birleştirmek için seçin"
                >
                  {isSelectionMode ? 'İptal' : 'Birleştir'}
                </button>
              )}

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center space-x-1 bg-blue-600 hover:bg-blue-500 text-white text-xs px-2.5 py-1 min-h-[30px] rounded-md font-semibold transition-all shadow-xs shrink-0 active:scale-95"
                title="Yeni evrak ekle veya sürükle"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>+ Yükle</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* Çoklu Seçim Birleştirme Bildirim Çubuğu */}
      {isSelectionMode && (
        <div className="bg-purple-950/40 border-b border-purple-500/30 px-3 py-1.5 flex items-center justify-between min-h-[38px] shrink-0 min-w-0">
          <span className="text-xs text-purple-300 font-medium truncate">
            {checkedDocIds.length} sayfa seçildi
          </span>
          <button
            type="button"
            onClick={handleMergeAction}
            disabled={checkedDocIds.length < 2}
            className="flex items-center space-x-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white px-2.5 py-1 rounded-md text-xs font-semibold shadow-xs shrink-0"
          >
            <Merge className="w-3.5 h-3.5" />
            <span>Birleştir</span>
          </button>
        </div>
      )}

      {/* Arama & Linear Segmentli Filtreleme Şeridi */}
      {safeDocs.length > 0 && (
        <div className="p-2 border-b border-theme-subtle space-y-1.5 shrink-0 bg-theme-surface min-w-0">
          <div className="relative min-w-0">
            <Search className="w-3.5 h-3.5 text-theme-muted absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Ara (dosya adı, no, firma)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-theme-card border border-theme-subtle rounded-md pl-8 pr-2.5 py-1 text-xs text-theme-primary placeholder-theme-muted focus:outline-none focus:border-blue-500 min-h-[30px]"
            />
          </div>

          <div className="grid grid-cols-4 gap-1 p-0.5 bg-theme-card/60 border border-theme-subtle rounded-md text-[10px] font-medium">
            <button
              type="button"
              onClick={() => setFilterMode('all')}
              className={`py-1 px-0.5 rounded text-center transition-all truncate ${
                filterMode === 'all'
                  ? 'bg-theme-card text-theme-primary font-semibold shadow-xs border border-theme-subtle'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
              title={`Tüm Evraklar (${safeDocs.length})`}
            >
              Tümü ({safeDocs.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('invoices')}
              className={`py-1 px-0.5 rounded text-center transition-all truncate ${
                filterMode === 'invoices'
                  ? 'bg-blue-600/25 text-blue-300 font-semibold border border-blue-500/30'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
              title={`Doğrulanmış Sevk İrsaliyeleri (${invoiceCount})`}
            >
              İrsaliye ({invoiceCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('pending')}
              className={`py-1 px-0.5 rounded text-center transition-all truncate ${
                filterMode === 'pending'
                  ? 'bg-amber-600/25 text-amber-300 font-semibold border border-amber-500/30'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
              title={`Bekleyen ve Hata Alan Evraklar (${pendingCount})`}
            >
              Bekleyen ({pendingCount})
            </button>
            <button
              type="button"
              onClick={() => setFilterMode('non_invoices')}
              className={`py-1 px-0.5 rounded text-center transition-all truncate ${
                filterMode === 'non_invoices'
                  ? 'bg-rose-600/25 text-rose-300 font-semibold border border-rose-500/30'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
              title={`Uyumsuz / İrsaliye Olmayanlar (${nonInvoiceCount})`}
            >
              Uyumsuz ({nonInvoiceCount})
            </button>
          </div>
        </div>
      )}

      {/* Evrak Listesi */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 overscroll-contain min-w-0">
        {filteredDocs.length === 0 ? (
          <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center p-4 text-theme-muted">
            {safeDocs.length === 0 ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="cursor-pointer border-2 border-dashed border-theme-subtle hover:border-theme-strong rounded-xl p-6 w-full flex flex-col items-center justify-center transition-colors group"
              >
                <div className="w-10 h-10 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center mb-2 group-hover:scale-105 transition-transform">
                  <FolderDown className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-theme-primary mb-1">Evrak Yükleyin</p>
                <p className="text-[11px] text-theme-muted mb-3 max-w-[180px]">
                  PDF veya görsel dosyalarını buraya bırakın veya tıklayın
                </p>
                {onLoadDemo && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onLoadDemo();
                    }}
                    className="flex items-center space-x-1.5 text-xs bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-blue-400 hover:text-blue-300 px-3 py-1.5 rounded-md font-medium transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Örnek Belge Yükle</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="py-8">
                <AlertCircle className="w-6 h-6 text-theme-muted/50 mx-auto mb-1.5" />
                <p className="text-xs text-theme-muted">Filtreye uygun kayıt bulunamadı</p>
              </div>
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

      {/* Kuyruk Alt Bilgi Şeridi */}
      {safeDocs.length > 0 && (
        <div className="p-2 border-t border-theme-subtle bg-theme-surface text-[10px] text-theme-muted flex justify-between px-3 min-w-0 font-mono tabular-nums shrink-0">
          <span>Kuyruk: {safeSummary.kuyrukta ?? 0}</span>
          <span>Tamamlanan: {(safeSummary.tamamlanan || 0) + (safeSummary.onaylanan || 0)}</span>
        </div>
      )}
    </aside>
  );
};
