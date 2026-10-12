import React, { useState, useEffect, useRef } from 'react';
import { 
  DocumentItem, 
  IrsaliyeData, 
  IrsaliyeHeader, 
  LineItem, 
  ProcessingStatus 
} from '../../types/irsaliye';
import { HeaderForm } from './HeaderForm';
import { ItemsTable } from './ItemsTable';
import { 
  FileSpreadsheet, 
  FileCode,
  FileJson,
  ChevronDown,
  CheckCheck, 
  Save, 
  Sparkles, 
  PenTool, 
  FileText,
  AlertTriangle,
  Table
} from 'lucide-react';
import { documentApi } from '../../services/api';

interface DocumentEditorProps {
  document: DocumentItem | null;
  onUpdateDocument: (doc: DocumentItem) => void;
  onProcessDocument: (id: string) => void;
  onSelectNextDoc?: () => void;
  isProcessing: boolean;
}

export const DocumentEditor: React.FC<DocumentEditorProps> = ({
  document,
  onUpdateDocument,
  onProcessDocument,
  onSelectNextDoc,
  isProcessing,
}) => {
  const [formData, setFormData] = useState<IrsaliyeData | null>(null);
  const [activeTab, setActiveTab] = useState<'header' | 'items'>('header');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [suspiciousCount, setSuspiciousCount] = useState(0);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (document?.veri) {
      setFormData(JSON.parse(JSON.stringify(document.veri)));
      setHasUnsavedChanges(false);
    } else {
      setFormData(null);
      setHasUnsavedChanges(false);
    }
  }, [document?.id, document?.veri]);

  // Şüpheli alan sayısını güncelle
  useEffect(() => {
    if (formData) {
      const timer = setTimeout(() => {
        const suspiciousEls = window.document.querySelectorAll('[data-suspicious="true"]');
        setSuspiciousCount(suspiciousEls.length);
      }, 100);
      return () => clearTimeout(timer);
    } else {
      setSuspiciousCount(0);
    }
  }, [formData]);

  // F2 Kısayolu ile Şüpheli Alana Atlama (Sekmeler Arası Otomatik Geçiş)
  const jumpToNextSuspicious = () => {
    const suspiciousInputs = Array.from(window.document.querySelectorAll<HTMLInputElement>('[data-suspicious="true"]'));
    if (suspiciousInputs.length === 0) return;

    const currentIndex = suspiciousInputs.findIndex(
      (el) => el === window.document.activeElement
    );
    const nextIndex = (currentIndex + 1) % suspiciousInputs.length;
    const targetEl = suspiciousInputs[nextIndex];

    const isInItems = !!targetEl.closest('[data-tab-section="items"]');
    if (isInItems && activeTab !== 'items') {
      setActiveTab('items');
    } else if (!isInItems && activeTab !== 'header') {
      setActiveTab('header');
    }

    setTimeout(() => {
      targetEl.focus();
      targetEl.select();
    }, 60);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F2') {
        e.preventDefault();
        jumpToNextSuspicious();
      } else if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault();
        handleApproveAndNext();
      } else if (
        (e.key === '1' || e.key === '2') &&
        (e.target as HTMLElement).tagName !== 'INPUT' &&
        (e.target as HTMLElement).tagName !== 'TEXTAREA'
      ) {
        if (e.key === '1') setActiveTab('header');
        if (e.key === '2') setActiveTab('items');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formData, document, activeTab]);

  // Dışa aktarma menüsünü dışarı tıklandığında kapat
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setIsExportMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!document) {
    return (
      <aside className="w-96 lg:w-[450px] xl:w-[480px] h-full bg-slate-900/90 border-l border-slate-800 flex flex-col shrink-0 p-6 items-center justify-center text-center select-none">
        <FileText className="w-10 h-10 stroke-[1.2] mb-2 text-slate-700/50" />
        <p className="text-xs font-medium text-slate-500">Seçim Yapılmadı</p>
      </aside>
    );
  }

  if (!formData || document.durum === 'kuyrukta') {
    return (
      <aside className="w-96 lg:w-[450px] xl:w-[480px] h-full bg-slate-900/90 border-l border-slate-800 flex flex-col shrink-0 p-6 items-center justify-center text-center select-none">
        <FileText className="w-10 h-10 stroke-[1.2] mb-2 text-slate-700/50" />
        <p className="text-xs font-medium text-slate-500">Belge Bekleniyor</p>

        <button
          onClick={() => onProcessDocument(document.id)}
          disabled={isProcessing}
          className="mt-4 flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-xs font-medium shadow-sm transition-all"
        >
          {isProcessing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>İşleniyor...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Belgeyi İşle</span>
            </>
          )}
        </button>
      </aside>
    );
  }

  const handleHeaderChange = (newHeader: IrsaliyeHeader) => {
    if (!formData) return;
    setFormData({
      ...formData,
      header: newHeader,
    });
    setHasUnsavedChanges(true);
  };

  const handleItemsChange = (newItems: LineItem[]) => {
    if (!formData) return;
    setFormData({
      ...formData,
      kalemler: newItems,
    });
    setHasUnsavedChanges(true);
  };

  const handleNotesChange = (notes: string) => {
    if (!formData) return;
    setFormData({
      ...formData,
      genel_notlar: notes,
    });
    setHasUnsavedChanges(true);
  };

  const handleSaveChanges = async (newStatus?: ProcessingStatus) => {
    if (!formData || !document) return;
    setIsSaving(true);
    try {
      const statusToSet = newStatus || document.durum;
      const updatedDoc = await documentApi.updateDocumentData(document.id, {
        header: formData.header,
        kalemler: formData.kalemler,
        genel_toplam_miktar: formData.genel_toplam_miktar,
        genel_notlar: formData.genel_notlar,
        durum: statusToSet,
      });
      onUpdateDocument(updatedDoc);
      setHasUnsavedChanges(false);
    } catch (err) {
      console.error('Kaydetme hatası:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleApproveAndNext = async () => {
    await handleSaveChanges('onaylandi');
    if (onSelectNextDoc) {
      onSelectNextDoc();
    }
  };

  return (
    <aside className="w-96 lg:w-[450px] xl:w-[480px] h-full bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 select-none">
      <div className="p-3 border-b border-slate-800 bg-slate-950/40 space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-semibold text-white uppercase tracking-wider">
              Doğrulama & Düzenleme
            </span>
            {hasUnsavedChanges && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" title="Kaydedilmemiş değişiklikler var" />
            )}
          </div>

          <div className="flex items-center space-x-2 text-[11px]">
            {suspiciousCount > 0 ? (
              <button
                onClick={jumpToNextSuspicious}
                className="flex items-center space-x-1 text-amber-300 bg-amber-500/10 border border-amber-500/20 hover:bg-amber-500/20 px-1.5 py-0.5 rounded text-[10px] font-medium transition-all"
                title="Şüpheli alana git (Kısayol: F2)"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>{suspiciousCount} Şüpheli (F2)</span>
              </button>
            ) : (
              <div className="flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded text-[10px] font-medium">
                <span>Tam Doğrulandı</span>
              </div>
            )}

            <div className="flex items-center space-x-1 text-slate-400">
              <span>Güven:</span>
              <span className="font-mono font-semibold text-emerald-400">
                %{Math.round((formData.guven_skoru || 0.95) * 100)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={handleApproveAndNext}
            disabled={isSaving}
            className="flex-1 flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white py-1.5 px-3 rounded-lg text-xs font-semibold shadow-md shadow-emerald-600/20 transition-all"
            title="Verileri onayla ve bir sonraki irsaliyeye geç (Ctrl+Enter)"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Onayla & Sonraki</span>
          </button>

          {/* Dışa Aktar Dropdown */}
          <div className="relative" ref={exportMenuRef}>
            <button
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="flex items-center space-x-1 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white py-1.5 px-2.5 rounded-lg text-xs font-medium border border-slate-700 transition-all"
              title="Dışa aktarma formatları"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Dışa Aktar</span>
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1 w-44 bg-slate-900 border border-slate-800 rounded-lg shadow-xl z-30 p-1 space-y-0.5">
                <a
                  href={documentApi.getSingleExcelUrl(document.id)}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Excel İndir (.xlsx)</span>
                </a>
                <a
                  href={documentApi.getSingleLogoXmlUrl(document.id)}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span>Logo XML (.xml)</span>
                </a>
                <a
                  href={documentApi.getSingleJsonUrl(document.id)}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="flex items-center space-x-2 px-2.5 py-1.5 rounded text-xs text-slate-200 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5 text-amber-400" />
                  <span>Standart JSON (.json)</span>
                </a>
              </div>
            )}
          </div>

          {hasUnsavedChanges && (
            <button
              onClick={() => handleSaveChanges()}
              disabled={isSaving}
              className="p-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs transition-all"
              title="Değişiklikleri Kaydet"
            >
              <Save className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sekmeler: 1. İrsaliye & Taraflar | 2. Kalemler Tablosu */}
      <div className="flex border-b border-slate-800 bg-slate-950/70 px-3 pt-1.5 shrink-0">
        <button
          onClick={() => setActiveTab('header')}
          className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'header'
              ? 'border-blue-500 text-blue-400 bg-slate-900/60 rounded-t'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>İrsaliye & Taraflar</span>
          <span className="text-[10px] text-slate-500 font-mono">(1)</span>
        </button>

        <button
          onClick={() => setActiveTab('items')}
          className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-semibold border-b-2 transition-all ${
            activeTab === 'items'
              ? 'border-blue-500 text-blue-400 bg-slate-900/60 rounded-t'
              : 'border-transparent text-slate-400 hover:text-slate-200 hover:border-slate-700'
          }`}
        >
          <Table className="w-3.5 h-3.5" />
          <span>Kalemler Tablosu</span>
          <span className="bg-slate-800 text-blue-300 text-[10px] px-1.5 py-0.5 rounded-full font-mono font-bold">
            {formData.kalemler?.length || 0}
          </span>
          <span className="text-[10px] text-slate-500 font-mono">(2)</span>
        </button>
      </div>

      {activeTab === 'header' ? (
        <div data-tab-section="header" className="flex-1 overflow-y-auto p-3.5 space-y-4">
          <HeaderForm
            header={formData.header}
            onChange={handleHeaderChange}
            fieldConfidences={formData.alan_guvenlikleri || {}}
          />

          <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
            <div className="flex items-center space-x-1.5 text-slate-400 font-semibold uppercase text-[11px] tracking-wider">
              <PenTool className="w-3.5 h-3.5" />
              <span>Teslimat & İrsaliye Notları</span>
            </div>
            <textarea
              rows={3}
              value={formData.genel_notlar || ''}
              onChange={(e) => handleNotesChange(e.target.value)}
              placeholder="Teslimat, kaşe veya ek evrak notları..."
              className="w-full bg-slate-900 border border-slate-800 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 font-sans"
            />
          </div>
        </div>
      ) : (
        <div data-tab-section="items" className="flex-1 overflow-y-auto p-3.5 space-y-4">
          <ItemsTable
            items={formData.kalemler}
            onChange={handleItemsChange}
          />
        </div>
      )}
    </aside>
  );
};
