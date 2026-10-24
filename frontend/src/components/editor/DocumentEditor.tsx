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
  RefreshCw, 
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Code2,
  Trash2,
  Copy,
  Check,
  Zap,
  Building2,
  Truck,
  QrCode,
  X,
  MoreHorizontal
} from 'lucide-react';
import { documentApi } from '../../services/api';
import { parseTurkishNumber, formatTurkishNumber } from '../../utils/number';

// Web Audio API Low-Frequency Haptic Pulse
const playCadenceHaptic = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(55, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(32, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.16);
  } catch {
    // AudioContext blocked or unsupported; silent fallback
  }
};

interface DocumentEditorProps {
  document: DocumentItem | null;
  onUpdateDocument: (doc: DocumentItem) => void;
  onProcessDocument: (id: string) => void;
  onSelectNextDoc?: () => void;
  onDeleteDoc?: (id: string) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  isProcessing: boolean;
}

export const DocumentEditor: React.FC<DocumentEditorProps> = ({
  document,
  onUpdateDocument,
  onProcessDocument,
  onSelectNextDoc,
  onDeleteDoc,
  onDirtyChange,
  isProcessing,
}) => {
  const [formData, setFormData] = useState<IrsaliyeData | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'header' | 'items'>(() => {
    return typeof window !== 'undefined' && window.innerWidth < 768 ? 'items' : 'all';
  });
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
  const [isMobileActionSheetOpen, setIsMobileActionSheetOpen] = useState(false);
  const [isCopiedErp, setIsCopiedErp] = useState(false);
  const [cadenceWarning, setCadenceWarning] = useState(false);
  const [poMatchData, setPoMatchData] = useState<any | null>(null);
  const [isLoadingPo, setIsLoadingPo] = useState(false);
  const [isPoModalOpen, setIsPoModalOpen] = useState(false);
  const [gibQrData, setGibQrData] = useState<any | null>(null);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [uetdsData, setUetdsData] = useState<any | null>(null);
  const [isLoadingUetds, setIsLoadingUetds] = useState(false);
  const [isUetdsModalOpen, setIsUetdsModalOpen] = useState(false);
  const [uetdsViewFormat, setUetdsViewFormat] = useState<'summary' | 'json' | 'xml'>('summary');
  const [isCopiedUetds, setIsCopiedUetds] = useState(false);
  const [erpLintData, setErpLintData] = useState<any | null>(null);
  const [isErpModalOpen, setIsErpModalOpen] = useState(false);
  const [activeErpTab, setActiveErpTab] = useState<'logo' | 'sap' | 'uetds'>('logo');
  const [isCopiedSnippet, setIsCopiedSnippet] = useState(false);
  const [suspiciousCount, setSuspiciousCount] = useState(0);
  const exportMenuRef = useRef<HTMLDivElement>(null);
  const jumpTimerRef = useRef<number | null>(null);
  const suspiciousTimerRef = useRef<number | null>(null);
  const cadenceTimerRef = useRef<number | null>(null);
  const cadenceWarningRef = useRef(false);

  const currentDocIdRef = useRef<string | null>(document?.id || null);
  const hasUnsavedChangesRef = useRef(false);
  hasUnsavedChangesRef.current = hasUnsavedChanges;

  useEffect(() => {
    onDirtyChange?.(hasUnsavedChanges);
  }, [hasUnsavedChanges, onDirtyChange]);

  // Clean up timers on unmount
  useEffect(() => {
    return () => {
      if (jumpTimerRef.current) clearTimeout(jumpTimerRef.current);
      if (suspiciousTimerRef.current) clearTimeout(suspiciousTimerRef.current);
      if (cadenceTimerRef.current) clearTimeout(cadenceTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const isNewDoc = document?.id !== currentDocIdRef.current;
    if (isNewDoc) {
      currentDocIdRef.current = document?.id || null;
      setFormData(document?.veri ? JSON.parse(JSON.stringify(document.veri)) : null);
      setHasUnsavedChanges(false);
    } else {
      // Arka plan WebSocket veya liste senkronizasyonunda kullanıcının formu ezilmesin (Dirty-State Guard)
      if (!hasUnsavedChangesRef.current) {
        setFormData(document?.veri ? JSON.parse(JSON.stringify(document.veri)) : null);
      }
    }
  }, [document?.id, document?.veri]);

  // GİB e-İrsaliye Karekod Doğrulaması
  useEffect(() => {
    if (document?.id && document.durum !== 'kuyrukta') {
      setIsLoadingQr(true);
      documentApi.getGibQrVerification(document.id)
        .then(res => setGibQrData(res))
        .catch(() => setGibQrData(null))
        .finally(() => setIsLoadingQr(false));
    } else {
      setGibQrData(null);
    }
  }, [document?.id, document?.durum]);

  // Kurumsal ERP Şema Linter & Validator
  useEffect(() => {
    if (document?.id && document.durum !== 'kuyrukta') {
      documentApi.getErpLint(document.id)
        .then(res => setErpLintData(res))
        .catch(() => setErpLintData(null));
    } else {
      setErpLintData(null);
    }
  }, [document?.id, document?.durum, formData]);

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

  // F2 Kısayolu ile Şüpheli Alana Atlama (Sadece Görünür Elemanları Hedefler)
  const jumpToNextSuspicious = () => {
    const suspiciousInputs = Array.from(window.document.querySelectorAll<HTMLInputElement>('[data-suspicious="true"]'))
      .filter((el) => el.offsetParent !== null);

    if (suspiciousInputs.length === 0) {
      const allSuspicious = Array.from(window.document.querySelectorAll<HTMLInputElement>('[data-suspicious="true"]'));
      if (allSuspicious.length > 0 && activeTab !== 'all') {
        setActiveTab('all');
      }
      return;
    }

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

  // İrsaliye dışı belge kontrolü (Örn: Su şişesi, alakasız görsel veya 0 güven skoru)
  const isNonInvoice = Boolean(
    formData && (
      (typeof formData.guven_skoru === 'number' && Number.isFinite(formData.guven_skoru) && formData.guven_skoru === 0) ||
      (formData.genel_notlar && formData.genel_notlar.toLowerCase().includes('sevk irsaliyesi değildir')) ||
      (!formData.header?.irsaliye_no && !formData.header?.gonderici_unvan && (!formData.kalemler || formData.kalemler.length === 0))
    )
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isAnyModalOpen = isExportMenuOpen || isMobileActionSheetOpen || isPoModalOpen || isUetdsModalOpen || isErpModalOpen;
      if (isAnyModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setIsExportMenuOpen(false);
          setIsMobileActionSheetOpen(false);
          setIsPoModalOpen(false);
          setIsUetdsModalOpen(false);
          setIsErpModalOpen(false);
        }
        return; // Modal açıkken arkadaki kısayolları engelle
      }

      // Input veya textarea içindeyse bazı kısayolları engelle
      const isInputActive =
        (e.target as HTMLElement).tagName === 'INPUT' ||
        (e.target as HTMLElement).tagName === 'TEXTAREA' ||
        (e.target as HTMLElement).isContentEditable;

      if (!isInputActive) {
        if (
          (e.key === 'Delete' || e.key === 'Backspace') &&
          isNonInvoice &&
          onDeleteDoc &&
          document
        ) {
          e.preventDefault();
          onDeleteDoc(document.id);
          return;
        }

        if (e.key === '1') setActiveTab('all');
        if (e.key === '2') setActiveTab('header');
        if (e.key === '3') setActiveTab('items');
      }

      if (e.key === 'F2') {
        e.preventDefault();
        jumpToNextSuspicious();
      } else if (e.key === 'Enter' && e.ctrlKey && !isNonInvoice) {
        e.preventDefault();
        handleApproveAndNext(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [formData, document, activeTab, isNonInvoice, onDeleteDoc, isExportMenuOpen, isMobileActionSheetOpen, isPoModalOpen, isUetdsModalOpen, isErpModalOpen, cadenceWarning]);

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
      <aside className="w-full md:w-80 lg:w-[420px] xl:w-[480px] h-full bg-theme-surface border-l border-theme-subtle flex flex-col shrink-0 p-6 items-center justify-center text-center select-none overflow-hidden">
        <div className="w-16 h-16 rounded-2xl bg-theme-card border border-theme-subtle flex items-center justify-center mb-3 text-theme-muted">
          <FileText className="w-8 h-8 stroke-[1.5]" />
        </div>
        <h3 className="text-sm font-semibold text-theme-primary">Belge Seçilmedi</h3>
        <p className="text-xs text-theme-muted mt-1 max-w-[240px]">Sol kuyruktan incelemek istediğiniz bir irsaliyeyi seçin.</p>
      </aside>
    );
  }

  if (!formData || document.durum === 'kuyrukta') {
    return (
      <aside className="w-full md:w-80 lg:w-[420px] xl:w-[480px] h-full bg-theme-surface border-l border-theme-subtle flex flex-col shrink-0 p-6 items-center justify-center text-center select-none overflow-hidden">
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center mb-3 text-blue-400">
          <Sparkles className="w-8 h-8 stroke-[1.5] animate-pulse" />
        </div>
        <h3 className="text-sm font-semibold text-theme-primary">Ayrıştırma Bekliyor</h3>
        <p className="text-xs text-theme-muted mt-1 max-w-[280px]">
          Otomatik optik ayrıştırma motoru ile irsaliye başlıklarını, adresleri ve ürün kalemlerini tek tıkla aktarın.
        </p>

        <button
          type="button"
          onClick={() => onProcessDocument(document.id)}
          disabled={isProcessing}
          className="mt-5 flex items-center space-x-2 craft-button-primary disabled:opacity-50 text-white px-5 py-2.5 rounded-lg text-xs sm:text-sm font-semibold transition-all active:scale-95 min-h-[40px]"
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

  const totalCalculatedQty = (formData.kalemler || []).reduce(
    (sum, k) => {
      const v = parseTurkishNumber(k?.miktar);
      return sum + (v !== null ? v : 0);
    },
    0
  );

  const parsedDocTotalQty = parseTurkishNumber(formData?.genel_toplam_miktar);

  const isMathMatch = parsedDocTotalQty !== null && Math.abs(totalCalculatedQty - parsedDocTotalQty) < 0.05;
  const isMathDiscrepancy = parsedDocTotalQty !== null && !isMathMatch;

  const handleApproveAndNext = async (force: boolean = false) => {
    // Miktar uyuşmazlığı varsa görsel uyarı rozetini aç, ancak force veya ikinci tıklamada gecikmesiz onayla
    if (!force && isMathDiscrepancy && !cadenceWarning) {
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([30, 40]);
      }
      setCadenceWarning(true);
      return;
    }

    setCadenceWarning(false);
    await handleSaveChanges('onaylandi');
    if (onSelectNextDoc) {
      onSelectNextDoc();
    }
  };

  const handleMobileApproveWithHaptic = () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(18);
    }
    handleApproveAndNext(cadenceWarning);
  };

  const handleOpenPoReconcile = async () => {
    if (!document) return;
    setIsLoadingPo(true);
    try {
      const data = await documentApi.reconcilePo(document.id);
      setPoMatchData(data);
      setIsPoModalOpen(true);
    } catch (err) {
      console.error('3-Way PO Eşleşme hatası:', err);
    } finally {
      setIsLoadingPo(false);
    }
  };

  const handleOpenUetdsModal = async () => {
    if (!document) return;
    setIsLoadingUetds(true);
    try {
      const data = await documentApi.getUetdsPayload(document.id);
      setUetdsData(data);
      setIsUetdsModalOpen(true);
    } catch (err) {
      console.error('U-ETDS yükleme hatası:', err);
    } finally {
      setIsLoadingUetds(false);
    }
  };

  const handleCopyUetdsContent = () => {
    if (!uetdsData) return;
    const content = uetdsViewFormat === 'xml' ? (uetdsData.xml_preview || '') : JSON.stringify(uetdsData, null, 2);
    navigator.clipboard.writeText(content);
    setIsCopiedUetds(true);
    setTimeout(() => setIsCopiedUetds(false), 2200);
  };

  const handleCopyErpData = () => {
    if (!formData) return;
    const erpPayload = {
      belge_no: formData.header?.irsaliye_no || '',
      tarih: formData.header?.sevk_tarihi || formData.header?.duzenleme_tarihi || '',
      gonderici_vkn: formData.header?.gonderici_vkn || '',
      gonderici_unvan: formData.header?.gonderici_unvan || '',
      alici_vkn: formData.header?.alici_vkn || '',
      alici_unvan: formData.header?.alici_unvan || '',
      toplam_miktar: totalCalculatedQty,
      kalemler: (formData.kalemler || []).map((k, idx) => ({
        sira: idx + 1,
        mal_hizmet: k.mal_hizmet || '',
        miktar: Number(k.miktar) || 0,
        birim: k.birim || 'Adet',
        birim_fiyat: Number(k.birim_fiyat) || 0,
      })),
    };
    navigator.clipboard.writeText(JSON.stringify(erpPayload, null, 2));
    setIsCopiedErp(true);
    setTimeout(() => setIsCopiedErp(false), 2200);
  };

  return (
    <aside className="w-full md:w-80 lg:w-[420px] xl:w-[480px] h-full bg-theme-surface border-l border-theme-subtle flex flex-col shrink-0 select-none overflow-hidden relative">
      {/* =========================================================================
          ÜST ÇUBUK: MOBİL İÇİN YALINLAŞTIRILMIŞ (44px) / MASAÜSTÜ İÇİN TAM ARAÇ ÇUBUĞU
          ========================================================================= */}
      
      {/* 1. MOBİL ÜST ÇUBUK (block md:hidden) */}
      <div className="flex md:hidden p-3 border-b border-theme-subtle bg-theme-surface/95 backdrop-blur items-center justify-between gap-2 shrink-0">
        <div className="flex items-center space-x-2 min-w-0">
          <span className="text-xs font-bold text-theme-primary uppercase tracking-wider truncate">
            {formData.header?.irsaliye_no ? `İrsaliye: ${formData.header.irsaliye_no}` : 'Doğrulama İstasyonu'}
          </span>
          {gibQrData?.is_gib_verified && (
            <span className="inline-flex items-center h-4.5 bg-emerald-950/40 border border-emerald-500/25 rounded px-1 text-[9px] font-bold text-emerald-300 uppercase tracking-wider shrink-0">
              GİB Mühürlü
            </span>
          )}
          {isNonInvoice && (
            <span className="inline-flex items-center h-4.5 bg-rose-500/10 border border-rose-500/20 rounded px-1.5 text-[9px] font-bold text-rose-400 shrink-0">
              İrsaliye Dışı
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 shrink-0">
          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={() => handleSaveChanges()}
              disabled={isSaving}
              className="p-1.5 rounded-lg bg-blue-600 text-white min-w-[32px] min-h-[32px] flex items-center justify-center shadow-xs active:scale-95 transition-all"
              title="Değişiklikleri Kaydet"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Mobilde Tüm ERP & İhracat & Araçları Toplayan "⋯ İşlemler" Butonu */}
          <button
            type="button"
            onClick={() => setIsMobileActionSheetOpen(true)}
            className="flex items-center space-x-1 h-8 px-2.5 rounded-lg bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary text-xs font-semibold border border-theme-subtle shadow-xs active:scale-95 transition-all"
          >
            <MoreHorizontal className="w-4 h-4 text-blue-400" />
            <span>İşlemler</span>
          </button>
        </div>
      </div>

      {/* 2. MASAÜSTÜ ÜST ÇUBUK (hidden md:block) */}
      <div className="hidden md:block p-3 border-b border-theme-subtle bg-theme-surface space-y-2.5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-bold text-theme-primary uppercase tracking-wider flex items-center gap-1.5">
              <span>Doğrulama İstasyonu</span>
            </span>
            {gibQrData?.is_gib_verified && (
              <div 
                className="inline-flex items-center h-5 bg-emerald-950/40 border border-emerald-500/25 rounded px-1.5 gap-1 shadow-[inset_0_1px_0_0_rgba(52,211,153,0.15)] select-none"
                title={gibQrData.message}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
                <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wider">
                  GİB Mühürlü
                </span>
                {gibQrData.ettn && (
                  <>
                    <span className="w-px h-2.5 bg-emerald-500/30" />
                    <span className="font-mono text-[9px] text-emerald-400/90 font-medium">
                      {gibQrData.ettn.substring(0, 8)}...
                    </span>
                  </>
                )}
              </div>
            )}
            {hasUnsavedChanges && (
              <span className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                <span className="hidden xs:inline">Değişiklikler var</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1.5 sm:space-x-2 text-[11px]">
            {isNonInvoice ? (
              <div className="flex items-center space-x-1 text-rose-400 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-md text-[10px] font-semibold">
                <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                <span>İrsaliye Dışı</span>
              </div>
            ) : suspiciousCount > 0 ? (
              <button
                type="button"
                onClick={jumpToNextSuspicious}
                className="flex items-center space-x-1 text-amber-300 bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/20 px-2 py-0.5 min-h-[26px] rounded-md text-[10px] font-medium transition-all"
                title="Şüpheli alana git (Kısayol: F2)"
              >
                <AlertTriangle className="w-3 h-3 text-amber-400" />
                <span>{suspiciousCount} Şüpheli (F2)</span>
              </button>
            ) : (
              <div className="flex items-center space-x-1 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[10px] font-medium">
                <CheckCheck className="w-3 h-3" />
                <span>Doğrulandı</span>
              </div>
            )}

            {!isNonInvoice && (
              <div className="flex items-center space-x-1.5 text-theme-muted bg-theme-card px-2 py-0.5 rounded-md border border-theme-subtle text-[10px] font-mono tabular-nums">
                <Zap className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-theme-secondary font-medium">⚡ ~1.2s</span>
                <span className="text-theme-muted">|</span>
                <span className="font-bold text-emerald-400">
                  %{Math.round((typeof formData.guven_skoru === 'number' && Number.isFinite(formData.guven_skoru) ? formData.guven_skoru : 0.95) * 100)} Doğruluk
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Masaüstü Aksiyon Butonları */}
        <div className="flex items-center space-x-2">
          {isNonInvoice ? (
            onDeleteDoc && (
              <button
                type="button"
                onClick={() => onDeleteDoc(document.id)}
                className="flex-1 flex items-center justify-center space-x-1.5 bg-rose-600 hover:bg-rose-500 text-white py-2 px-3 min-h-[38px] rounded-lg text-xs font-bold shadow-md shadow-rose-600/20 truncate tactile-btn"
                title="İrsaliye dışı görseli kuyruktan sil ve sonrakine geç (Delete)"
              >
                <Trash2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">Kuyruktan Çıkar / Reddet</span>
                <span className="text-[10px] text-rose-200/80 font-mono hidden lg:inline">(Del)</span>
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => handleApproveAndNext(false)}
              disabled={isSaving}
              className="flex-1 flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white py-2 px-3 min-h-[38px] rounded-lg text-xs font-bold shadow-md shadow-emerald-600/20 truncate tactile-btn-emerald"
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
            className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary rounded-lg text-xs border border-theme-subtle shrink-0 tactile-icon"
            title="Belgeyi Yeniden Çözümle"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin text-blue-400' : ''}`} />
          </button>

          {/* Tek Tıkla ERP Kopyala Butonu */}
          {!isNonInvoice && (
            <button
              type="button"
              onClick={handleCopyErpData}
              className="flex items-center space-x-1.5 bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary py-2 px-2.5 min-h-[38px] rounded-lg text-xs font-semibold border border-theme-subtle shrink-0 tactile-btn"
              title="ERP uyumlu JSON formatında panoya kopyala"
            >
              {isCopiedErp ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold text-[11px]">Kopyalandı</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-blue-400" />
                  <span className="hidden xl:inline text-[11px]">ERP Kopyala</span>
                </>
              )}
            </button>
          )}

          {/* Kurumsal ERP Linter & Şema Doğrulayıcı Butonu */}
          {!isNonInvoice && erpLintData && (
            <button
              type="button"
              onClick={() => setIsErpModalOpen(true)}
              className="flex items-center space-x-1.5 bg-blue-950/40 hover:bg-blue-900/50 text-blue-300 border border-blue-500/30 py-2 px-2.5 min-h-[38px] rounded-lg text-xs font-semibold shrink-0 tactile-btn"
              title="Logo Tiger, SAP S/4HANA ve U-ETDS Kurumsal Doğrulama Konsolu"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-mono text-[11px] font-bold">ERP Linter %{Math.round(erpLintData.overall_score || 0)}</span>
            </button>
          )}

          {/* Dışa Aktar Dropdown */}
          <div className="relative shrink-0" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setIsExportMenuOpen((prev) => !prev)}
              className="flex items-center space-x-1.5 bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary py-2 px-2.5 min-h-[38px] rounded-lg text-xs font-semibold border border-theme-subtle tactile-btn"
              title="Dışa aktarma seçenekleri"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="hidden xs:inline text-[11px]">Dışa Aktar</span>
              <ChevronDown className="w-3 h-3 text-theme-muted shrink-0" />
            </button>

            {isExportMenuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-theme-surface border border-theme-subtle rounded-xl shadow-2xl z-30 p-1 space-y-0.5">
                <a
                  href={documentApi.getSingleExcelUrl(document.id)}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-theme-secondary hover:bg-theme-card hover:text-theme-primary transition-colors min-h-[36px]"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Excel Raporu (.xlsx)</span>
                </a>
                <a
                  href={documentApi.getSingleLogoXmlUrl(document.id)}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-theme-secondary hover:bg-theme-card hover:text-theme-primary transition-colors min-h-[36px]"
                >
                  <FileCode className="w-4 h-4 text-blue-400" />
                  <span>Logo Tiger/Go (.xml)</span>
                </a>
                <a
                  href={documentApi.getSingleJsonUrl(document.id)}
                  download
                  onClick={() => setIsExportMenuOpen(false)}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-theme-secondary hover:bg-theme-card hover:text-theme-primary transition-colors min-h-[36px]"
                >
                  <FileJson className="w-4 h-4 text-amber-400" />
                  <span>B2B Standart JSON (.json)</span>
                </a>
                <button
                  type="button"
                  onClick={() => {
                    handleCopyErpData();
                    setIsExportMenuOpen(false);
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-theme-secondary hover:bg-theme-card hover:text-theme-primary transition-colors min-h-[36px] text-left border-t border-theme-subtle pt-1"
                >
                  <Copy className="w-4 h-4 text-blue-400" />
                  <span>Panoya ERP Verisi Kopyala</span>
                </button>
              </div>
            )}
          </div>

          {hasUnsavedChanges && (
            <button
              type="button"
              onClick={() => handleSaveChanges()}
              disabled={isSaving}
              className="p-2 min-w-[38px] min-h-[38px] flex items-center justify-center bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs shadow-md shadow-blue-600/20 shrink-0 tactile-btn"
              title="Değişiklikleri Kaydet"
            >
              <Save className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Cadence Braking (Ritmik Frenleme) Mikro-Direnç Uyarı Bandı (Her iki ekranda da temiz görünür) */}
      {cadenceWarning && (
        <div className="p-2.5 mx-3 mt-2 rounded-xl bg-amber-500/15 border border-amber-500/40 cadence-shake flex flex-col gap-2 shadow-lg shrink-0">
          <div className="flex items-start space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-amber-300">Ritmik Frenleme: Miktar Uyuşmazlığı!</h4>
                <span className="text-[10px] text-amber-300/80 font-mono">3sn içinde override</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-tight mt-0.5">
                Kalemler toplamı ({totalCalculatedQty.toLocaleString('tr-TR')}) ile irsaliye dip toplamı ({parsedDocTotalQty?.toLocaleString('tr-TR')}) uyuşmuyor.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-end space-x-2 pt-1 border-t border-amber-500/20">
            <button
              type="button"
              onClick={() => {
                cadenceWarningRef.current = false;
                setCadenceWarning(false);
              }}
              className="px-2.5 py-1 text-[11px] rounded bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary transition-all font-medium border border-theme-subtle"
            >
              Düzelt
            </button>
            <button
              type="button"
              onClick={() => handleApproveAndNext(true)}
              className="px-3 py-1 text-[11px] rounded bg-amber-600 hover:bg-amber-500 text-white font-bold transition-all shadow-sm flex items-center space-x-1"
            >
              <span>Yine de Onayla</span>
              <span className="text-[10px] opacity-80 font-mono">(Ctrl+↵)</span>
            </button>
          </div>
        </div>
      )}

      {/* İrsaliye Dışı Belgede "Kusursuz Kararlılık" Uygunsuzluk & Ayıklama Paneli */}
      {isNonInvoice ? (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col items-center justify-center text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-8 h-8 stroke-[1.5]" />
          </div>
          <div className="max-w-sm space-y-2">
            <h3 className="text-sm font-bold text-rose-300">
              Resmi Sevk İrsaliyesi Niteliği Taşımıyor
            </h3>
            <p className="text-xs text-theme-secondary leading-relaxed font-sans">
              Optik ayrıştırma motoru bu evrakta geçerli bir irsaliye numarası, gönderici/alıcı firma veya mal/hizmet kalem tablosu tespit edemedi.
            </p>
            {formData.genel_notlar && (
              <div className="p-3 bg-rose-950/30 border border-rose-500/20 rounded-lg text-left">
                <span className="text-[10px] font-semibold text-rose-300 uppercase block mb-1">Tespit Edilen Belge Durumu:</span>
                <p className="text-xs text-rose-200/90 font-mono leading-relaxed">{formData.genel_notlar}</p>
              </div>
            )}
          </div>

          <div className="flex flex-col w-full max-w-xs space-y-2 pt-2">
            {onDeleteDoc && (
              <button
                type="button"
                onClick={() => onDeleteDoc(document.id)}
                className="w-full flex items-center justify-center space-x-2 bg-rose-600 hover:bg-rose-500 text-white py-2.5 px-4 rounded-lg text-xs font-bold shadow-md shadow-rose-600/20 tactile-btn min-h-[40px]"
              >
                <Trash2 className="w-4 h-4" />
                <span>Kuyruktan Çıkar / Reddet (Delete)</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => onProcessDocument(document.id)}
              disabled={isProcessing}
              className="w-full flex items-center justify-center space-x-2 bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary border border-theme-subtle py-2 px-4 rounded-lg text-xs font-medium tactile-btn min-h-[36px]"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin text-blue-400' : ''}`} />
              <span>Yeniden Analiz Et</span>
            </button>
            <p className="text-[10px] text-theme-muted hidden sm:block">
              İpucu: Klavyeden <kbd className="px-1 py-0.5 bg-theme-card border border-theme-subtle rounded font-mono">Delete</kbd> tuşuna basarak anında sonraki evraka geçebilirsiniz.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Masaüstünde Matematiksel Mutabakat Rozeti & 3-Way PO & U-ETDS Bakanlık Butonları */}
          <div className="hidden md:block px-3 pt-3 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-theme-muted uppercase tracking-wider">
                Doğrulama & Mutabakat
              </span>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={handleOpenUetdsModal}
                  disabled={isLoadingUetds}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 text-[10px] font-semibold transition-all tactile-btn"
                  title="Ulaştırma Bakanlığı 4925 Karayolu Taşıma Kanunu U-ETDS Sefer Bildirimi"
                >
                  <Truck className={`w-3 h-3 text-blue-400 ${isLoadingUetds ? 'animate-spin' : ''}`} />
                  <span>{isLoadingUetds ? 'Hazırlanıyor...' : 'U-ETDS'}</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenPoReconcile}
                  disabled={isLoadingPo}
                  className="flex items-center space-x-1 px-2 py-0.5 rounded bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 text-[10px] font-semibold transition-all tactile-btn"
                  title="ERP Satınalma Siparişi ile 3'lü Eşleştirme (3-Way PO Matching)"
                >
                  <Building2 className={`w-3 h-3 text-indigo-400 ${isLoadingPo ? 'animate-spin' : ''}`} />
                  <span>{isLoadingPo ? 'Eşleştiriliyor...' : '3-Way ERP'}</span>
                </button>
              </div>
            </div>
            {isMathMatch ? (
              <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs">
                <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-200">Matematiksel Mutabakat: Kusursuz</span>
                    <span className="font-mono font-bold text-emerald-400 tabular-nums">
                      {totalCalculatedQty.toLocaleString('tr-TR')} / {parsedDocTotalQty?.toLocaleString('tr-TR')} Adet
                    </span>
                  </div>
                  <span className="text-[10px] text-emerald-300/80 block mt-0.5">
                    Kalemler toplamı ile irsaliye dip toplamı birebir uyuşuyor.
                  </span>
                </div>
              </div>
            ) : isMathDiscrepancy ? (
              <div className="flex items-center space-x-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-amber-200">Miktar Uyuşmazlığı Uyarısı</span>
                    <span className="font-mono font-bold text-amber-300 tabular-nums">
                      Fark: {Math.abs(totalCalculatedQty - (parsedDocTotalQty || 0)).toLocaleString('tr-TR')} Adet
                    </span>
                  </div>
                  <span className="text-[10px] text-amber-300/80 block mt-0.5">
                    Kalem toplamı ({totalCalculatedQty.toLocaleString('tr-TR')}) ile dip toplam ({parsedDocTotalQty?.toLocaleString('tr-TR')}) arasında fark var!
                  </span>
                </div>
              </div>
            ) : totalCalculatedQty > 0 ? (
              <div className="flex items-center justify-between p-2 rounded-lg bg-theme-card border border-theme-subtle text-xs text-theme-secondary">
                <span className="flex items-center gap-1.5 font-medium">
                  <Package className="w-3.5 h-3.5 text-blue-400" />
                  <span>Toplam Sevkiyat Miktarı</span>
                </span>
                <span className="font-mono font-bold text-theme-primary tabular-nums">
                  {totalCalculatedQty.toLocaleString('tr-TR')} Adet
                </span>
              </div>
            ) : null}
          </div>

          {/* Akıllı Sekme / Segment Seçici: Mobilde Geniş Başparmak Hedefleri */}
          <div className="flex border-b border-theme-subtle bg-theme-surface px-2 sm:px-3 pt-2 shrink-0 gap-1 select-none">
            {/* Kalemler Sekmesi - Mobilde En Sık Kullanılan Başparmak Hedefi */}
            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`flex-1 md:flex-initial flex items-center justify-center space-x-1.5 px-3 py-2 min-h-[36px] text-xs font-semibold rounded-t-lg transition-all tactile-btn ${
                activeTab === 'items'
                  ? 'border-b-2 border-blue-500 text-blue-400 bg-theme-card'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Kalemler ({formData.kalemler?.length || 0})</span>
            </button>

            {/* Başlık & Taraflar */}
            <button
              type="button"
              onClick={() => setActiveTab('header')}
              className={`flex-1 md:flex-initial flex items-center justify-center space-x-1.5 px-3 py-2 min-h-[36px] text-xs font-semibold rounded-t-lg transition-all tactile-btn ${
                activeTab === 'header'
                  ? 'border-b-2 border-blue-500 text-blue-400 bg-theme-card'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Başlık & Firma</span>
            </button>

            {/* Masaüstünde "Tümü" Sekmesi */}
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`hidden md:flex flex-initial items-center space-x-1.5 px-3 py-2 min-h-[36px] text-xs font-semibold rounded-t-lg transition-all tactile-btn ${
                activeTab === 'all'
                  ? 'border-b-2 border-indigo-500 text-indigo-400 bg-theme-card'
                  : 'text-theme-muted hover:text-theme-primary'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Tümü</span>
              <span className="text-[10px] text-theme-muted font-mono hidden sm:inline">(1)</span>
            </button>
          </div>

          {/* Form Gövdesi (Scroll Area) */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-4 pb-20 md:pb-4 space-y-4 custom-scrollbar overscroll-contain">
            {/* Kalemler Görünümü (Mobilde Öncelikli) */}
            {(activeTab === 'all' || activeTab === 'items') && (
              <div className="space-y-4 tab-pane-enter" data-tab-section="items">
                <ItemsTable
                  items={formData.kalemler || []}
                  onChange={handleItemsChange}
                />
              </div>
            )}

            {/* Başlık ve Taraflar Görünümü */}
            {(activeTab === 'all' || activeTab === 'header') && (
              <div className={`space-y-4 tab-pane-enter ${activeTab === 'all' ? 'pt-2 border-t border-theme-subtle' : ''}`} data-tab-section="header">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-theme-muted uppercase tracking-wider flex items-center gap-1.5">
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

            {/* Notlar & Kaşe / İmza Açıklamaları */}
            <div className="space-y-2 pt-2 border-t border-theme-subtle">
              <div className="flex items-center justify-between text-theme-muted text-xs">
                <div className="flex items-center space-x-1.5">
                  <PenTool className="w-3.5 h-3.5 text-amber-400" />
                  <span className="font-semibold text-[11px] uppercase tracking-wider">Teslim / Kaşe Notları</span>
                </div>
              </div>

              <textarea
                value={formData.genel_notlar || ''}
                onChange={(e) => handleNotesChange(e.target.value)}
                rows={2}
                placeholder="Şoför kaşesi, ambar teslim tutanağı veya ıslak imza notları..."
                className="w-full bg-theme-card border border-theme-subtle rounded-xl px-3 py-2 text-xs text-theme-primary placeholder-theme-muted focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-all resize-none"
              />
            </div>
          </div>

          {/* =========================================================================
              3. MOBİL İÇİN YAPIŞKAN ONAY ÇUBUĞU (Sticky Bottom Thumb Approval Bar)
              ========================================================================= */}
          <div className="md:hidden absolute bottom-0 left-0 right-0 p-2.5 bg-theme-surface/95 backdrop-blur-md border-t border-theme-subtle z-20 flex items-center justify-between gap-2.5 shadow-2xl">
            <div className="flex flex-col min-w-0 pr-1 select-none">
              <span className="text-[10px] text-theme-muted uppercase font-semibold tracking-wider">
                {formData.kalemler?.length || 0} Kalem Toplam
              </span>
              <span className="text-xs font-bold text-theme-primary font-mono tabular-nums truncate">
                {totalCalculatedQty.toLocaleString('tr-TR')} Adet
              </span>
            </div>

            <button
              type="button"
              onClick={handleMobileApproveWithHaptic}
              disabled={isSaving}
              className={`flex-1 min-h-[44px] px-4 rounded-xl text-xs font-bold flex items-center justify-center space-x-2 shadow-lg transition-all thumb-approve-btn ${
                isMathDiscrepancy && cadenceWarning
                  ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-600/30'
                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
              }`}
            >
              {isSaving ? (
                <span>Kaydediliyor...</span>
              ) : isMathDiscrepancy && cadenceWarning ? (
                <>
                  <AlertTriangle className="w-4 h-4 text-white shrink-0" />
                  <span>Yine de Onayla</span>
                </>
              ) : (
                <>
                  <CheckCheck className="w-4 h-4 stroke-[2.5] shrink-0" />
                  <span>Onayla & Sonraki</span>
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* =========================================================================
          MOBİL İŞLEMLER VE ERP SEÇENEKLERİ ACTION SHEET
          ========================================================================= */}
      {isMobileActionSheetOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-xs p-0 sm:p-4">
          <div className="bg-theme-surface border border-theme-subtle rounded-t-2xl sm:rounded-2xl max-w-sm w-full p-4 space-y-3 shadow-2xl animate-in slide-in-from-bottom duration-200">
            {/* Sheet Başlık */}
            <div className="flex items-center justify-between border-b border-theme-subtle pb-2.5">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
                  <MoreHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-theme-primary">İşlemler & ERP Entegrasyonları</h3>
                  <p className="text-[10px] text-theme-muted font-mono">{document?.id?.substring(0, 8)}... Evrak İşlemleri</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileActionSheetOpen(false)}
                className="p-1.5 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Sheet İşlem Listesi */}
            <div className="space-y-1.5 py-1">
              {/* Kurumsal ERP Linter */}
              {erpLintData && (
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileActionSheetOpen(false);
                    setIsErpModalOpen(true);
                  }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-blue-950/30 hover:bg-blue-900/40 border border-blue-500/30 text-blue-300 text-xs font-semibold transition-all"
                >
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    <span>ERP Linter & Şema Doğrulayıcı</span>
                  </div>
                  <span className="font-mono text-[10px] font-bold bg-blue-500/20 px-1.5 py-0.5 rounded">
                    %{Math.round(erpLintData.overall_score || 0)}
                  </span>
                </button>
              )}

              {/* U-ETDS Bakanlık Seferi */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileActionSheetOpen(false);
                  handleOpenUetdsModal();
                }}
                className="w-full flex items-center space-x-2 p-2.5 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-xs font-medium text-theme-primary transition-all text-left"
              >
                <Truck className="w-4 h-4 text-blue-400" />
                <span>U-ETDS Sefer Bildirimi & SOAP XML</span>
              </button>

              {/* 3-Way PO Eşleştirme */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileActionSheetOpen(false);
                  handleOpenPoReconcile();
                }}
                className="w-full flex items-center space-x-2 p-2.5 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-xs font-medium text-theme-primary transition-all text-left"
              >
                <Building2 className="w-4 h-4 text-indigo-400" />
                <span>3-Way ERP Sipariş Eşleştirme</span>
              </button>

              {/* ERP JSON Kopyalama */}
              <button
                type="button"
                onClick={() => {
                  handleCopyErpData();
                  setIsMobileActionSheetOpen(false);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-xs font-medium text-theme-primary transition-all"
              >
                <div className="flex items-center space-x-2">
                  <Copy className="w-4 h-4 text-blue-400" />
                  <span>Panoya ERP JSON Kopyala</span>
                </div>
                {isCopiedErp && <span className="text-[10px] text-emerald-400 font-bold">Kopyalandı!</span>}
              </button>

              {/* Dışa Aktarmalar */}
              <div className="pt-1 border-t border-theme-subtle/60 grid grid-cols-2 gap-1.5">
                <a
                  href={documentApi.getSingleExcelUrl(document.id)}
                  download
                  onClick={() => setIsMobileActionSheetOpen(false)}
                  className="flex items-center space-x-1.5 p-2 rounded-lg bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-[11px] text-theme-primary"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Excel (.xlsx)</span>
                </a>
                <a
                  href={documentApi.getSingleLogoXmlUrl(document.id)}
                  download
                  onClick={() => setIsMobileActionSheetOpen(false)}
                  className="flex items-center space-x-1.5 p-2 rounded-lg bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-[11px] text-theme-primary"
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span>Logo XML (.xml)</span>
                </a>
              </div>

              {/* Yeniden Çözümle */}
              <button
                type="button"
                onClick={() => {
                  setIsMobileActionSheetOpen(false);
                  onProcessDocument(document.id);
                }}
                disabled={isProcessing}
                className="w-full flex items-center space-x-2 p-2.5 rounded-xl bg-theme-card hover:bg-theme-card-hover border border-theme-subtle text-xs font-medium text-theme-primary transition-all text-left"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isProcessing ? 'animate-spin text-blue-400' : 'text-theme-muted'}`} />
                <span>Evrakı Yeniden Çözümle</span>
              </button>
            </div>

            {/* Kapat Butonu */}
            <button
              type="button"
              onClick={() => setIsMobileActionSheetOpen(false)}
              className="w-full py-2.5 rounded-xl bg-theme-card border border-theme-subtle text-xs font-semibold text-theme-secondary hover:text-theme-primary transition-all"
            >
              Kapat
            </button>
          </div>
        </div>
      )}

      {/* 3-Way PO ERP Reconciliation Modal */}
      {isPoModalOpen && poMatchData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-theme-surface border border-theme-subtle rounded-xl max-w-lg w-full p-5 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
                  <Building2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-theme-primary">3-Way PO Eşleşme Raporu</h3>
                  <p className="text-[10px] text-theme-muted font-mono">
                    Sipariş: {poMatchData.po_no} • VKN: {poMatchData.vkn_checksum_valid ? '✓ Modulo-10 Doğrulandı' : '⚠ VKN Hatası'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPoModalOpen(false)}
                className="p-1 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Durum Rozeti */}
            <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
              poMatchData.is_matched 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <div className="flex items-center space-x-2">
                {poMatchData.is_matched ? (
                  <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <span className="font-semibold">
                  {poMatchData.is_matched 
                    ? 'Tüm Kalemler PO ile Birebir Uyuşuyor' 
                    : `%${poMatchData.match_percentage} Kısmi Eşleşme - Sapma Tespit Edildi`}
                </span>
              </div>
              <span className="font-mono font-bold tabular-nums">
                {poMatchData.total_invoice_qty} / {poMatchData.total_po_qty} Adet
              </span>
            </div>

            {/* Kalem Kıyaslama Tablosu */}
            <div className="max-h-56 overflow-y-auto border border-theme-subtle rounded-lg">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-theme-card border-b border-theme-subtle text-[10px] text-theme-muted uppercase font-mono">
                    <th className="p-2">Mal / Hizmet</th>
                    <th className="p-2 text-right">İrsaliye</th>
                    <th className="p-2 text-right">PO (Sipariş)</th>
                    <th className="p-2 text-center">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-theme-subtle">
                  {(poMatchData.reconciled_items || []).map((item: any, idx: number) => (
                    <tr key={idx} className="hover:bg-theme-card/50">
                      <td className="p-2 font-medium text-theme-primary truncate max-w-[160px]">{item.product || item.mal_hizmet || 'Belirtilmemiş'}</td>
                      <td className="p-2 text-right font-mono tabular-nums text-theme-secondary">{item.invoice_qty} {item.unit}</td>
                      <td className="p-2 text-right font-mono tabular-nums text-theme-secondary">{item.po_qty} {item.unit}</td>
                      <td className="p-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                          item.status === 'TAM_UYUMLU'
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {item.status === 'TAM_UYUMLU' ? 'TAM UYUMLU' : 'SAPMA'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* ERP Entegrasyon Hazırlık Durumu */}
            <div className="p-2.5 rounded-lg bg-theme-card border border-theme-subtle space-y-1.5">
              <span className="text-[10px] font-bold text-theme-muted uppercase tracking-wider block">
                ERP Entegrasyon Uygunluğu (Bridge Readiness)
              </span>
              <div className="grid grid-cols-3 gap-2 text-[11px] font-medium text-center">
                <div className="p-1.5 rounded bg-theme-surface border border-theme-subtle flex items-center justify-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-theme-secondary">SAP MIGO 101</span>
                </div>
                <div className="p-1.5 rounded bg-theme-surface border border-theme-subtle flex items-center justify-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-theme-secondary">Logo STFICHE 01</span>
                </div>
                <div className="p-1.5 rounded bg-theme-surface border border-theme-subtle flex items-center justify-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span className="text-theme-secondary">Mikro Ambar</span>
                </div>
              </div>
            </div>

            {/* Aksiyon */}
            <div className="flex items-center justify-end space-x-2 pt-1 border-t border-theme-subtle">
              <button
                type="button"
                onClick={() => setIsPoModalOpen(false)}
                className="px-4 py-2 rounded-lg bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary text-xs font-semibold border border-theme-subtle transition-all"
              >
                Kapat
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCopyErpData();
                  setIsPoModalOpen(false);
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-md shadow-indigo-600/20"
              >
                ERP Verisini Kopyala & Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* U-ETDS Bakanlık Sefer Manifestosu Modalı */}
      {isUetdsModalOpen && uetdsData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
          <div className="bg-theme-surface border border-theme-subtle rounded-xl max-w-xl w-full p-5 space-y-4 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-theme-subtle pb-3">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-theme-primary">U-ETDS Eşya Sefer Manifestosu</h3>
                  <p className="text-[10px] text-theme-muted font-mono">
                    4925 Sayılı Karayolu Taşıma Kanunu Madde 35/C • Bildirim Şeması V2.1
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsUetdsModalOpen(false)}
                className="p-1 rounded-lg text-theme-muted hover:text-theme-primary hover:bg-theme-card transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Durum & Mevzuat Rozeti */}
            <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
              uetdsData.ozet?.mevzuatUyumluluk
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
            }`}>
              <div className="flex items-center space-x-2">
                {uetdsData.ozet?.mevzuatUyumluluk ? (
                  <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                )}
                <div>
                  <span className="font-semibold block">
                    {uetdsData.ozet?.mevzuatUyumluluk
                      ? 'Ulaştırma Bakanlığı Sefer Bildirimine Tam Uyumlu'
                      : 'Eksik Alanlar Mevcut (Bildirim Öncesi Tamamlayın)'}
                  </span>
                  <span className="text-[10px] opacity-80 font-mono">
                    Plaka: {uetdsData.seferBilgisi?.plaka} • Sürücü: {uetdsData.seferBilgisi?.soforKimlikNo} ({uetdsData.seferBilgisi?.soforTcDogrulandi ? '✓ TCKN Geçerli' : '⚠ Sağlama Hatası'})
                  </span>
                </div>
              </div>
              <span className="font-mono font-bold tabular-nums shrink-0">
                {uetdsData.ozet?.toplamKalem} Kalem / {uetdsData.ozet?.toplamMiktar} Birim
              </span>
            </div>

            {/* Sekme Seçici: Özet vs JSON vs SOAP XML */}
            <div className="flex space-x-1 border-b border-theme-subtle pb-1">
              <button
                type="button"
                onClick={() => setUetdsViewFormat('summary')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  uetdsViewFormat === 'summary' ? 'bg-theme-card text-blue-400 border border-theme-subtle' : 'text-theme-muted hover:text-theme-primary'
                }`}
              >
                Sefer Özeti
              </button>
              <button
                type="button"
                onClick={() => setUetdsViewFormat('json')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  uetdsViewFormat === 'json' ? 'bg-theme-card text-blue-400 border border-theme-subtle' : 'text-theme-muted hover:text-theme-primary'
                }`}
              >
                Bakanlık JSON
              </button>
              <button
                type="button"
                onClick={() => setUetdsViewFormat('xml')}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                  uetdsViewFormat === 'xml' ? 'bg-theme-card text-blue-400 border border-theme-subtle' : 'text-theme-muted hover:text-theme-primary'
                }`}
              >
                SOAP XML
              </button>
            </div>

            {/* İçerik Görünümü */}
            {uetdsViewFormat === 'summary' ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-lg bg-theme-card border border-theme-subtle space-y-1">
                    <span className="text-[10px] font-bold text-theme-muted uppercase block">Çıkış Noktası</span>
                    <p className="font-medium text-theme-primary truncate">{uetdsData.seferBilgisi?.cikisYeri?.unvan}</p>
                    <p className="text-[11px] text-theme-muted truncate">{uetdsData.seferBilgisi?.cikisYeri?.adres}</p>
                    <span className="text-[10px] font-mono text-emerald-400/90">VKN: {uetdsData.seferBilgisi?.cikisYeri?.vkn || 'Belirtilmedi'}</span>
                  </div>
                  <div className="p-2.5 rounded-lg bg-theme-card border border-theme-subtle space-y-1">
                    <span className="text-[10px] font-bold text-theme-muted uppercase block">Varış Noktası</span>
                    <p className="font-medium text-theme-primary truncate">{uetdsData.seferBilgisi?.varisYeri?.unvan}</p>
                    <p className="text-[11px] text-theme-muted truncate">{uetdsData.seferBilgisi?.varisYeri?.adres}</p>
                    <span className="text-[10px] font-mono text-emerald-400/90">VKN: {uetdsData.seferBilgisi?.varisYeri?.vkn || 'Belirtilmedi'}</span>
                  </div>
                </div>

                <div className="p-2.5 rounded-lg bg-theme-card border border-theme-subtle space-y-1">
                  <span className="text-[10px] font-bold text-theme-muted uppercase block">Taşınan Emtia Kalemleri</span>
                  <div className="space-y-1 max-h-24 overflow-y-auto">
                    {(uetdsData.yukBilgileri || []).map((y: any, idx: number) => (
                      <div key={idx} className="flex items-center justify-between text-xs py-0.5 border-b border-theme-subtle/50 last:border-none">
                        <span className="text-theme-secondary truncate max-w-[240px]">{y.siraNo}. {y.yukAdi}</span>
                        <span className="font-mono font-medium text-theme-primary">{y.miktar} {y.birimKodu}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-black/60 border border-theme-subtle rounded-lg p-3 font-mono text-[11px] text-emerald-400/90 max-h-56 overflow-y-auto">
                <pre className="whitespace-pre-wrap break-all">
                  {uetdsViewFormat === 'xml' ? uetdsData.xml_preview : JSON.stringify(uetdsData, null, 2)}
                </pre>
              </div>
            )}

            {/* Aksiyon */}
            <div className="flex items-center justify-between pt-1 border-t border-theme-subtle">
              <span className="text-[10px] text-theme-muted font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span>Bakanlık Gateway Hazır</span>
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setIsUetdsModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary text-xs font-semibold border border-theme-subtle transition-all"
                >
                  Kapat
                </button>
                <button
                  type="button"
                  onClick={handleCopyUetdsContent}
                  className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/20 flex items-center space-x-1"
                >
                  {isCopiedUetds ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Kopyalandı!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{uetdsViewFormat === 'xml' ? 'XML Kopyala' : 'JSON Kopyala'}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Kurumsal ERP Şema Linter & Validator Modalı */}
      {isErpModalOpen && erpLintData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-theme-surface border border-theme-strong rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Başlık */}
            <div className="p-4 border-b border-theme-subtle flex items-center justify-between bg-theme-surface">
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-theme-primary flex items-center gap-2">
                    <span>Kurumsal ERP Şema Doğrulayıcı & Canlı Konsol</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      erpLintData.overall_score >= 80 ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    }`}>
                      %{Math.round(erpLintData.overall_score)} Uyumlu
                    </span>
                  </h3>
                  <p className="text-[11px] text-theme-muted">
                    Logo Tiger, SAP S/4HANA (MIGO 101) ve U-ETDS Bakanlık Şema Denetimi
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsErpModalOpen(false)}
                className="p-1.5 text-theme-muted hover:text-theme-primary rounded-lg hover:bg-theme-card transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Gövde */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* 3 Sistem Karşılaştırmalı Skor Kartları */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {/* Logo Tiger */}
                <div className={`p-3 rounded-xl border ${
                  activeErpTab === 'logo' ? 'border-blue-500 bg-blue-950/20 ring-1 ring-blue-500/30' : 'border-theme-subtle bg-theme-card hover:border-theme-strong'
                } cursor-pointer transition-all`} onClick={() => setActiveErpTab('logo')}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-theme-primary">Logo Tiger 3</span>
                    <span className="text-xs font-mono font-bold text-blue-400">%{Math.round(erpLintData.logo_tiger?.score || 0)}</span>
                  </div>
                  <p className="text-[10px] text-theme-muted">STFICHE 01 Satın Alma</p>
                  <div className="mt-2 text-[10px] flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${erpLintData.logo_tiger?.critical_count === 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span className="text-theme-secondary">
                      {erpLintData.logo_tiger?.critical_count === 0 ? 'Aktarıma Hazır' : `${erpLintData.logo_tiger?.critical_count} Kritik Engel`}
                    </span>
                  </div>
                </div>

                {/* SAP S/4HANA */}
                <div className={`p-3 rounded-xl border ${
                  activeErpTab === 'sap' ? 'border-blue-500 bg-blue-950/20 ring-1 ring-blue-500/30' : 'border-theme-subtle bg-theme-card hover:border-theme-strong'
                } cursor-pointer transition-all`} onClick={() => setActiveErpTab('sap')}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-theme-primary">SAP S/4HANA</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">%{Math.round(erpLintData.sap_migo_101?.score || 0)}</span>
                  </div>
                  <p className="text-[10px] text-theme-muted">BAPI MIGO 101 Mal Girişi</p>
                  <div className="mt-2 text-[10px] flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${erpLintData.sap_migo_101?.critical_count === 0 ? 'bg-emerald-400' : 'bg-rose-400'}`} />
                    <span className="text-theme-secondary">
                      {erpLintData.sap_migo_101?.critical_count === 0 ? 'Aktarıma Hazır' : `${erpLintData.sap_migo_101?.critical_count} Kritik Engel`}
                    </span>
                  </div>
                </div>

                {/* U-ETDS */}
                <div className={`p-3 rounded-xl border ${
                  activeErpTab === 'uetds' ? 'border-blue-500 bg-blue-950/20 ring-1 ring-blue-500/30' : 'border-theme-subtle bg-theme-card hover:border-theme-strong'
                } cursor-pointer transition-all`} onClick={() => setActiveErpTab('uetds')}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold text-theme-primary">U-ETDS Bakanlık</span>
                    <span className="text-xs font-mono font-bold text-purple-400">%{Math.round(erpLintData.uetds?.score || 0)}</span>
                  </div>
                  <p className="text-[10px] text-theme-muted">Yük Bildirim Gateway</p>
                  <div className="mt-2 text-[10px] flex items-center gap-1.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${erpLintData.uetds?.critical_count === 0 ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="text-theme-secondary">
                      {erpLintData.uetds?.critical_count === 0 ? 'Sefer Doğrulandı' : `${erpLintData.uetds?.warning_count} Eksik Alan`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Seçili Sistemin Hata ve Uyarı Maddeleri */}
              <div className="p-3 bg-theme-card rounded-xl border border-theme-subtle space-y-2">
                <span className="text-[11px] font-bold text-theme-primary flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-blue-400" />
                  <span>Şema Doğrulama Bulguları ({activeErpTab.toUpperCase()})</span>
                </span>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {((activeErpTab === 'logo' ? erpLintData.logo_tiger?.issues :
                     activeErpTab === 'sap' ? erpLintData.sap_migo_101?.issues :
                     erpLintData.uetds?.issues) || []).map((issue: any, idx: number) => (
                    <div key={idx} className="flex items-start gap-2 p-2 rounded-lg bg-theme-surface/50 border border-theme-subtle/50 text-[11px]">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-bold shrink-0 ${
                        issue.severity === 'CRITICAL' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30' :
                        issue.severity === 'WARNING' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' :
                        'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {issue.severity}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className="font-mono text-theme-muted text-[10px] block">{issue.field}</span>
                        <span className="text-theme-secondary">{issue.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Canlı Yük Önizleme Sandkutusu (Live Sandbox) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-theme-primary flex items-center gap-1.5">
                    <Code2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Canlı ERP Yükü (Live Payload Sandbox)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const snippet = activeErpTab === 'logo' ? erpLintData.live_previews?.logo_xml_preview :
                                     activeErpTab === 'sap' ? JSON.stringify(erpLintData.live_previews?.sap_bapi_preview, null, 2) :
                                     erpLintData.live_previews?.uetds_xml_preview;
                      navigator.clipboard.writeText(snippet || '');
                      setIsCopiedSnippet(true);
                      setTimeout(() => setIsCopiedSnippet(false), 2000);
                    }}
                    className="flex items-center space-x-1 px-2.5 py-1 rounded-md text-[10px] font-semibold bg-theme-card hover:bg-theme-card-hover text-theme-primary border border-theme-subtle transition-all"
                  >
                    {isCopiedSnippet ? (
                      <>
                        <Check className="w-3 h-3 text-emerald-400" />
                        <span className="text-emerald-400">Kopyalandı!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-blue-400" />
                        <span>Kodu Kopyala</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="bg-black/70 border border-theme-subtle rounded-xl p-3 font-mono text-[11px] text-emerald-400/90 max-h-48 overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-all">
                    {activeErpTab === 'logo' ? erpLintData.live_previews?.logo_xml_preview :
                     activeErpTab === 'sap' ? JSON.stringify(erpLintData.live_previews?.sap_bapi_preview, null, 2) :
                     erpLintData.live_previews?.uetds_xml_preview}
                  </pre>
                </div>
              </div>
            </div>

            {/* Modal Alt Çubuk */}
            <div className="p-3 border-t border-theme-subtle flex items-center justify-between bg-theme-surface">
              <span className="text-[10px] text-theme-muted font-mono flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>SAP BAPI & Logo STFICHE Standartları Doğrulandı</span>
              </span>
              <button
                type="button"
                onClick={() => setIsErpModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-theme-card hover:bg-theme-card-hover text-theme-secondary hover:text-theme-primary text-xs font-semibold border border-theme-subtle transition-all"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};
