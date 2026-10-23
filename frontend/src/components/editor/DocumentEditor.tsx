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
  Package,
  Layers,
  Info,
  RotateCw,
  RefreshCw,
  ShieldAlert
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
  const [activeTab, setActiveTab] = useState<'all' | 'header' | 'items'>('all');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [suspiciousCount, setSuspiciousCount] = useState(0);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const jumpTimerRef = useRef<number | null>(null);
  const suspiciousTimerRef = useRef<number | null>(null);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
      if (suspiciousTimerRef.current) clearTimeout(suspiciousTimerRef.current);
    };
  }, []);

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
      if (suspiciousTimerRef.current) clearTimeout(suspiciousTimerRef.current);
      suspiciousTimerRef.current = window.setTimeout(() => {
        const suspiciousEls = window.document.querySelectorAll('[data-suspicious="true"]');
        setSuspiciousCount(suspiciousEls.length);
      }, 100);
      return () => {
        if (suspiciousTimerRef.current) clearTimeout(suspiciousTimerRef.current);
      };
    } else {
      setSuspiciousCount(0);
    }
  }, [formData]);

  // F2 Kısayolu ile Şüpheli Alana Atlama
  const jumpToNextSuspicious = () => {
    const suspiciousInputs = Array.from(window.document.querySelectorAll<HTMLInputElement>('[data-suspicious="true"]'));
    if (suspiciousInputs.length === 0) return;

    const currentIndex = suspiciousInputs.findIndex(
      (el) => el === window.document.activeElement
    );
    const nextIndex = (currentIndex + 1) % suspiciousInputs.length;
    const targetEl = suspiciousInputs[nextIndex];

    if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = window.setTimeout(() => {
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
        (e.key === '1' || e.key === '2' || e.key === '3') &&
        (e.target as HTMLElement).tagName !== 'INPUT' &&
        (e.target as HTMLElement).tagName !== 'TEXTAREA'
      ) {
        if (e.key === '1') setActiveTab('all');
        if (e.key === '2') setActiveTab('header');
        if (e.key === '3') setActiveTab('items');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formData, document, activeTab]);

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
      <aside className="w-full md:w-80 lg:w-[420px] xl:w-[480px] h-full bg-slate-900/90 border-l border-slate-800 flex flex-col shrink-0 p-6 items-center justify-center text-center select-none overflow-hidden">
        <div className="w-16 h-16 rounded-2xl bg-slate-800/60 border border-slate-700/50 flex items-center justify-center mb-3 text-slate-500">
          <FileText className="w-8 h-8 stroke-[1.5]" />
        </div>
        <h3 className="text-sm font-semibold text-slate-300">Belge Seçilmedi</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-[240px]">Sol kuyruktan incelemek istediğiniz bir irsaliyeyi seçin.</p>
      </aside>
    );
  }

  // İrsaliye dışı belge kontrolü (Örn: Su şişesi, alakasız görsel veya 0 güven skoru)
  const isNonInvoice = formData && (
    (typeof formData.guven_skoru === 'number' && Number.isFinite(formData.guven_skoru) && formData.guven_skoru === 0) ||
    (formData.genel_notlar && formData.genel_notlar.toLowerCase().includes('sevk irsaliyesi değildir'))
  );

  if (!formData || document.durum === 'kuyrukta') {
    return (
      <aside className="w-full md:w-80 lg:w-[420px] xl:w-[480px] h-full bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 p-6 items-center justify-center text-center select-none overflow-hidden">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3 text-blue-400">
          <Sparkles className="w-8 h-8 stroke-[1.5] animate-pulse" />
        </div>
        <h3 className="text-sm font-semibold text-slate-200">Ayrıştırma Bekliyor</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-[280px]">
          Otomatik optik ayrıştırma motoru ile irsaliye başlıklarını, adresleri ve ürün kalemlerini tek tıkla aktarın.
        </p>

        <button
          type="button"
          onClick={() => onProcessDocument(document.id)}
          disabled={isProcessing}
          className="mt-5 flex items-center space-x-2 craft-button-primary disabled:opacity-50 text-white px-5 py-3 rounded-xl text-xs sm:text-sm font-semibold transition-all active:scale-95 min-h-[44px]"
        >
          {isProcessing ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              <span>Belge Çözümleniyor...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Evrakı Otomatik Çözümle</span>
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

  const totalCalculatedQty = (formData.kalemler || []).reduce(
    (sum, k) => {
      const v = Number(k?.miktar);
      return sum + (Number.isFinite(v) ? v : 0);
    },
    0
  );

  return (
    <aside className="w-full md:w-80 lg:w-[420px] xl:w-[480px] h-full bg-slate-900 border-l border-slate-800 flex flex-col shrink-0 select-none overflow-hidden">
      {/* Üst Eylem ve Durum Çubuğu */}
      <div className="p-3 border-b border-slate-800 bg-slate-950/60 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <span>Doğrulama İstasyonu</span>
            </span>
            {hasUnsavedChanges && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="hidden xs:inline">Değişiklikler var</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 text-[11px]">
            {isNonInvoice ? (
              <div className="flex items-center space-x-1 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-[10px] font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>İrsaliye Dışı</span>
              </div>
            ) : suspiciousCount > 0 ? (
              <button
                type="button"
                onClick={jumpToNextSuspicious}
                className="flex items-center space-x-1 text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 px-2 py-1 min-h-[30px] rounded text-[10px] font-medium transition-all"
                title="Şüpheli alana git (Kısayol: F2)"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>{suspiciousCount} Şüpheli (F2)</span>
              </button>
            ) : (
              <div className="flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-medium">
                <CheckCheck className="w-3 h-3" />
                <span>Doğrulandı</span>
              </div>
            )}

            {!isNonInvoice && (
              <div className="flex items-center space-x-1 text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded border border-slate-700/50">
                <span className="hidden xs:inline">Güven:</span>
                <span className="font-mono font-bold text-emerald-400">
                  %{Math.round((typeof formData.guven_skoru === 'number' && Number.isFinite(formData.guven_skoru) ? formData.guven_skoru : 0.95) * 100)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Aksiyon Butonları (Net Hiyerarşi & İrsaliye Dışı Güvenlik Kilidi) */}
        <div className="flex items-center space-x-2">
          {isNonInvoice ? (
            <button
              type="button"
              disabled
              className="flex-1 flex items-center justify-center space-x-1.5 bg-rose-950/40 text-rose-300/80 border border-rose-500/30 py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-semibold cursor-not-allowed truncate select-none"
              title="Bu görsel sevk irsaliyesi niteliği taşımadığı için muhasebeye onaylanamaz."
            >
              <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
              <span className="truncate">İrsaliye Dışı (Onay Kilitli)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleApproveAndNext}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 truncate tactile-btn-emerald"
              title="Verileri onayla ve bir sonraki irsaliyeye geç (Ctrl+Enter)"
            >
              <CheckCheck className="w-4 h-4 stroke-[2.5] shrink-0" />
              <span className="truncate">Onayla & Sonraki</span>
              <span className="text-[10px] text-emerald-200/80 font-mono hidden lg:inline">(Ctrl+↵)</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onProcessDocument(document.id)}
            disabled={isProcessing}
            className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs border border-slate-700 shrink-0 tactile-icon"
            title="Belgeyi Yeniden Çözümle"
          >
            <RefreshCw className={`w-4 h-4 ${isProcessing ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {/* Dışa Aktar Dropdown */}
          <div className="relative shrink-0" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white py-2.5 px-3 min-h-[44px] rounded-xl text-xs font-semibold border border-slate-700 tactile-btn"
              title="Dışa aktarma seçenekleri"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-400 shrink-0" />
              <span className="hidden xs:inline">Dışa Aktar</span>
              <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-48 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-30 p-1 space-y-0.5">
                <a
                  href={documentApi.getSingleExcelUrl(document.id)}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-white transition-colors min-h-[38px]"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Excel Raporu (.xlsx)</span>
                </a>
                <a
                  href={documentApi.getSingleLogoXmlUrl(document.id)}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-white transition-colors min-h-[38px]"
                >
                  <FileCode className="w-4 h-4 text-blue-400" />
                  <span>Logo Tiger/Go (.xml)</span>
                </a>
                <a
                  href={documentApi.getSingleJsonUrl(document.id)}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-slate-200 hover:bg-slate-800 hover:text-white transition-colors min-h-[38px]"
                >
                  <FileJson className="w-4 h-4 text-amber-400" />
                  <span>B2B Standart JSON (.json)</span>
                </a>
              </div>
            )}
          </div>

          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={() => handleSaveChanges()}
              disabled={isSaving}
              className="p-2.5 min-w-[44px] min-h-[44px] flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs shadow-md shadow-blue-600/20 shrink-0 tactile-btn"
              title="Değişiklikleri Kaydet"
            >
              <Save className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* İrsaliye Dışı Belge Özel Uyarı Kartı */}
      {isNonInvoice && (
        <div className="m-3 p-4 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-200 space-y-2 craft-card">
          <div className="flex items-center space-x-2 font-semibold text-xs text-rose-300">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
            <span>Doğrulama Uyarısı: Belge İrsaliye Niteliği Taşımıyor</span>
          </div>
          <p className="text-[11px] text-rose-300/90 leading-relaxed font-sans">
            {formData.genel_notlar || 'Bu görselde sevk irsaliyesi başlığı, gönderici/alıcı firma veya ürün kalem tablosu tespit edilemedi.'}
          </p>
          <div className="pt-2 border-t border-rose-500/20 text-[10px] text-rose-300/75 space-y-1">
            <p className="flex items-center gap-1.5 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 shrink-0" />
              <span>Tespit: Nesne / Günlük Eşya / Alakasız Görsel</span>
            </p>
            <p className="text-slate-400">
              Yasal sevk irsaliyesi veya ambar teslim fişi formatında olmadığı için muhasebe/ERP aktarımı yapılamaz.
            </p>
          </div>
        </div>
      )}

      {/* Akıllı Sekme / Görünüm Seçici */}
      <div className="flex border-b border-slate-800 bg-slate-950/70 px-2 sm:px-3 pt-1.5 shrink-0 gap-1 overflow-x-auto no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('all')}
          className={`flex items-center space-x-1.5 px-3 py-2 min-h-[38px] text-xs font-semibold border-b-2 transition-all whitespace-nowrap tactile-btn ${
            activeTab === 'all'
              ? 'border-indigo-500 text-indigo-400 bg-slate-900/60 rounded-t'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Tümü</span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">(1)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('header')}
          className={`flex items-center space-x-1.5 px-3 py-2 min-h-[38px] text-xs font-semibold border-b-2 transition-all whitespace-nowrap tactile-btn ${
            activeTab === 'header'
              ? 'border-blue-500 text-blue-400 bg-slate-900/60 rounded-t'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Başlık & Taraflar</span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">(2)</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('items')}
          className={`flex items-center space-x-1.5 px-3 py-2 min-h-[38px] text-xs font-semibold border-b-2 transition-all whitespace-nowrap tactile-btn ${
            activeTab === 'items'
              ? 'border-blue-500 text-blue-400 bg-slate-900/60 rounded-t'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          <span>Kalemler ({formData.kalemler?.length || 0})</span>
          <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">(3)</span>
        </button>
      </div>

      {/* Form Gövdesi */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4 custom-scrollbar overscroll-contain">
        {/* Akıcı / Tümü Görünümü veya Yalnızca Başlık */}
        {(activeTab === 'all' || activeTab === 'header') && (
          <div className="space-y-4" data-tab-section="header">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-blue-400" />
                <span>İrsaliye Başlık ve Taraflar</span>
              </span>
            </div>
            <HeaderForm
              header={formData.header || {}}
              onChange={handleHeaderChange}
              fieldConfidences={formData.alan_guvenlikleri || {}}
            />
          </div>
        )}

        {/* Akıcı / Tümü Görünümü veya Yalnızca Kalemler */}
        {(activeTab === 'all' || activeTab === 'items') && (
          <div className="space-y-4 pt-2 border-t border-slate-800/60" data-tab-section="items">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-indigo-400" />
                <span>Mal ve Hizmet Kalemleri</span>
              </span>
              <span className="text-[11px] text-slate-400 font-mono">
                Toplam Miktar: <strong className="text-white">{Number.isFinite(totalCalculatedQty) ? totalCalculatedQty.toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : 0}</strong>
              </span>
            </div>
            <ItemsTable
              items={formData.kalemler || []}
              onChange={handleItemsChange}
            />
          </div>
        )}

        {/* Notlar & Kaşe / İmza Açıklamaları */}
        <div className="space-y-2 pt-2 border-t border-slate-800/60">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <div className="flex items-center space-x-1.5">
              <PenTool className="w-3.5 h-3.5 text-amber-400" />
              <span className="font-semibold text-[11px] uppercase tracking-wider">Teslim / Kaşe Notları</span>
            </div>
          </div>

          <textarea
            value={formData.genel_notlar || ''}
            onChange={(e) => handleNotesChange(e.target.value)}
            rows={3}
            placeholder="Şoför kaşesi, ambar teslim tutanağı veya ıslak imza notları..."
            className="w-full bg-slate-950/70 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all resize-none"
          />
        </div>
      </div>
    </aside>
  );
};
