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
  Layers,
  Merge
} from 'lucide-react';

interface BatchQueueProps {
  documents: DocumentItem[];
  selectedDocId: string | null;
  summary: BatchSummary;
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
  const [searchTerm, setSearchTerm] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [checkedDocIds, setCheckedDocIds] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredDocs = documents.filter((doc) => {
    const term = searchTerm.toLowerCase();
    const fileNameMatch = doc.dosya_adi.toLowerCase().includes(term);
    const irsaliyeNoMatch = doc.veri?.header?.irsaliye_no?.toLowerCase().includes(term);
    const unvanMatch = doc.veri?.header?.alici_unvan?.toLowerCase().includes(term) ||
                       doc.veri?.header?.gonderici_unvan?.toLowerCase().includes(term);
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
    <aside className="w-80 h-full bg-slate-900/90 border-r border-slate-800 flex flex-col shrink-0 select-none">
      <div className="p-3 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Files className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-semibold text-white tracking-wide uppercase">
              Evrak Kuyruğu ({documents.length})
            </h2>
          </div>
          {isUploading ? (
            <span className="text-[10px] text-blue-400 animate-pulse font-medium">
              Yükleniyor...
            </span>
          ) : (
            documents.length >= 2 && (
              <button
                onClick={() => {
                  setIsSelectionMode(!isSelectionMode);
                  setCheckedDocIds([]);
                }}
                className={`text-[10px] px-1.5 py-0.5 rounded border transition-colors ${
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
          <div className="bg-purple-950/40 border border-purple-500/30 rounded p-1.5 flex items-center justify-between">
            <span className="text-[10px] text-purple-300 font-medium">
              {checkedDocIds.length} sayfa seçildi
            </span>
            <button
              onClick={handleMergeAction}
              disabled={checkedDocIds.length < 2}
              className="flex items-center space-x-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white px-2 py-0.5 rounded text-[10px] font-semibold transition-all shadow-sm"
            >
              <Merge className="w-3 h-3" />
              <span>Birleştir</span>
            </button>
          </div>
        )}

        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-lg p-2.5 text-center cursor-pointer transition-all ${
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
          <div className="flex flex-col items-center justify-center space-y-1 py-0.5">
            <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <UploadCloud className="w-3.5 h-3.5" />
            </div>
            <p className="text-[11px] font-medium text-slate-300">
              Dosyaları buraya sürükleyin veya göz atın
            </p>
          </div>
        </div>

        {/* Tek Tıkla Örnek Belgeyi Yeniden Yükle */}
        {onLoadDemo && (
          <button
            onClick={onLoadDemo}
            className="w-full flex items-center justify-center space-x-1.5 py-1 px-2 rounded border border-slate-800 bg-slate-950/50 hover:bg-slate-800 text-[11px] text-blue-400 hover:text-blue-300 font-medium transition-colors"
            title="Örnek sevk irsaliyesi görselini kuyruğa yükler"
          >
            <Sparkles className="w-3 h-3 text-blue-400" />
            <span>Örnek Belgeyi Yeniden Yükle</span>
          </button>
        )}

        {documents.length > 3 && (
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Ara..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-md pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredDocs.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center p-4 text-slate-500">
            {documents.length === 0 ? (
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

      {documents.length > 0 && (
        <div className="p-2 border-t border-slate-800/80 bg-slate-950/40 text-[10px] text-slate-500 flex justify-between px-3">
          <span>Kuyruk: {summary.kuyrukta}</span>
          <span>Tamamlanan: {summary.tamamlanan + summary.onaylanan}</span>
        </div>
      )}
    </aside>
  );
};
