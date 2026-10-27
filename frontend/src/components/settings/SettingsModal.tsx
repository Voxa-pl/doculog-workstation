import React, { useState, useEffect, useRef } from 'react';
import {
  Settings,
  Layout,
  Palette,
  Sparkles,
  Key,
  Database,
  RotateCcw,
  Trash2,
  QrCode,
  FileSpreadsheet,
  FileCode,
  Check,
  X,
  Shield,
  AlertTriangle,
  Eye,
  EyeOff,
  Copy,
  Wifi,
  Smartphone,
  Download,
  Loader2,
  HardDriveDownload,
  Columns,
  Sidebar,
  Maximize2,
  CheckCircle2,
  RefreshCw,
  Cpu,
  Activity,
  Sliders,
  ExternalLink,
  FileText,
} from 'lucide-react';
import {
  WorkspaceLayoutMode,
  AppTheme,
  ApiKeyStatus,
  QrBridgeInfo,
} from '../../types/irsaliye';
import { documentApi, systemApi } from '../../services/api';

export type SettingsTab = 'gorunum' | 'ai' | 'veri' | 'cihazlar';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  layoutMode: WorkspaceLayoutMode;
  onLayoutModeChange: (mode: WorkspaceLayoutMode) => void;
  theme: AppTheme;
  onThemeChange: (theme: AppTheme) => void;
  apiKeyStatus: ApiKeyStatus | null;
  onApiKeySaved?: () => void;
  onResetAllDocuments: () => Promise<void>;
  onClearAllDocuments: () => Promise<void>;
  onLoadDemoDocument: () => Promise<void>;
  onDocumentReceived?: (doc: any) => void;
  initialTab?: SettingsTab;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  layoutMode,
  onLayoutModeChange,
  theme,
  onThemeChange,
  apiKeyStatus,
  onApiKeySaved,
  onResetAllDocuments,
  onClearAllDocuments,
  onLoadDemoDocument,
  onDocumentReceived,
  initialTab = 'gorunum',
}) => {
  // Tab state
  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);

  // AI Tab states
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSavingKey, setIsSavingKey] = useState(false);
  const [keySaveMessage, setKeySaveMessage] = useState<string | null>(null);
  const [keySaveError, setKeySaveError] = useState<string | null>(null);

  const [isTestingKey, setIsTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
  } | null>(null);

  // Veri Tab states
  const [isResetting, setIsResetting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  const [isLoadingDemo, setIsLoadingDemo] = useState(false);
  const [demoMessage, setDemoMessage] = useState<string | null>(null);

  const [isCreatingBackup, setIsCreatingBackup] = useState(false);
  const [backupInfo, setBackupInfo] = useState<{
    filename: string;
    sizeBytes: number;
    sha256: string;
  } | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);

  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [clearMessage, setClearMessage] = useState<string | null>(null);

  // Cihazlar / QR Bridge states
  const [qrInfo, setQrInfo] = useState<QrBridgeInfo | null>(null);
  const [isLoadingQr, setIsLoadingQr] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [isUrlCopied, setIsUrlCopied] = useState(false);

  // Render & Performance switches (persisted in localStorage)
  const [progressiveRender, setProgressiveRender] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('doculog_progressive_render');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const [silkySmoothViewport, setSilkySmoothViewport] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('doculog_silky_viewport');
      return stored !== null ? stored === 'true' : true;
    } catch {
      return true;
    }
  });

  const modalRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  // Synchronize initialTab when modal opens
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setKeySaveMessage(null);
      setKeySaveError(null);
      setTestResult(null);
      setResetMessage(null);
      setDemoMessage(null);
      setClearMessage(null);
      setIsConfirmingClear(false);
    }
  }, [isOpen, initialTab]);

  // Keyboard shortcut listener (ESC to close, Cmd+, support)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, [isOpen, onClose]);

  // Load QR Bridge info when 'cihazlar' tab is selected
  useEffect(() => {
    if (!isOpen || activeTab !== 'cihazlar') return;

    let isSubscribed = true;
    setIsLoadingQr(true);
    setQrError(null);

    documentApi
      .getQrUrl()
      .then((info) => {
        if (!isSubscribed) return;
        setQrInfo(info);
        setIsLoadingQr(false);
      })
      .catch((err) => {
        if (!isSubscribed) return;
        setIsLoadingQr(false);
        setQrError('Yerel ağ QR köprü bağlantısı alınamadı.');
        console.error('QR Bridge yükleme hatası:', err);
      });

    return () => {
      isSubscribed = false;
    };
  }, [isOpen, activeTab]);

  // Handle Progressive render toggle
  const handleToggleProgressiveRender = () => {
    const nextVal = !progressiveRender;
    setProgressiveRender(nextVal);
    try {
      localStorage.setItem('doculog_progressive_render', String(nextVal));
    } catch (e) {
      console.warn('localStorage error:', e);
    }
  };

  // Handle Silky smooth viewport toggle
  const handleToggleSilkySmooth = () => {
    const nextVal = !silkySmoothViewport;
    setSilkySmoothViewport(nextVal);
    try {
      localStorage.setItem('doculog_silky_viewport', String(nextVal));
    } catch (e) {
      console.warn('localStorage error:', e);
    }
  };

  // AI Tab: Save Gemini API Key
  const handleSaveApiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKeyInput.trim()) return;

    setIsSavingKey(true);
    setKeySaveMessage(null);
    setKeySaveError(null);

    try {
      await documentApi.saveApiKey(apiKeyInput.trim());
      setKeySaveMessage('Google Gemini API anahtarı başarıyla güncellendi.');
      setApiKeyInput('');
      if (onApiKeySaved) {
        onApiKeySaved();
      }
    } catch (err: any) {
      if (!err?.response) {
        setKeySaveError('Sunucu bağlantısı sağlanamadı (Port 8000).');
      } else {
        setKeySaveError(
          err?.response?.data?.detail || 'API anahtarı kaydedilemedi.'
        );
      }
    } finally {
      setIsSavingKey(false);
    }
  };

  // AI Tab: Test Gemini Connection
  const handleTestConnection = async () => {
    setIsTestingKey(true);
    setTestResult(null);

    const startTime = performance.now();
    try {
      const status = await documentApi.getApiKeyStatus();
      const endTime = performance.now();
      const latency = Math.round(endTime - startTime);

      if (status.is_configured) {
        setTestResult({
          success: true,
          message: `Bağlantı Başarılı • Model: ${status.model || 'gemini-1.5-flash'}`,
          latencyMs: latency,
        });
      } else {
        setTestResult({
          success: false,
          message: 'API anahtarı henüz sisteme tanımlanmamış.',
          latencyMs: latency,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: 'Sunucu veya Google API servisi ile iletişim kurulamadı.',
      });
    } finally {
      setIsTestingKey(false);
    }
  };

  // Veri Tab: Reset All Documents
  const handleReset = async () => {
    setIsResetting(true);
    setResetMessage(null);
    try {
      await onResetAllDocuments();
      setResetMessage('Tüm irsaliyeler başarıyla okunmamış durumuna sıfırlandı.');
      setTimeout(() => setResetMessage(null), 4000);
    } catch (err: any) {
      setResetMessage('İrsaliyeler sıfırlanırken bir hata oluştu.');
    } finally {
      setIsResetting(false);
    }
  };

  // Veri Tab: Load Demo Document
  const handleLoadDemo = async () => {
    setIsLoadingDemo(true);
    setDemoMessage(null);
    try {
      await onLoadDemoDocument();
      setDemoMessage('Örnek resmi demo irsaliye başarıyla kuyruğa eklendi.');
      setTimeout(() => setDemoMessage(null), 4000);
    } catch (err: any) {
      setDemoMessage('Demo irsaliye yüklenirken hata oluştu.');
    } finally {
      setIsLoadingDemo(false);
    }
  };

  // Veri Tab: Create & Download Disaster Recovery Backup
  const handleCreateBackup = async () => {
    setIsCreatingBackup(true);
    setBackupError(null);
    setBackupInfo(null);

    try {
      const result = await systemApi.createBackup();
      if (result && result.filename) {
        setBackupInfo({
          filename: result.filename,
          sizeBytes: result.size_bytes || 0,
          sha256: result.sha256 || '',
        });

        // Otomatik indirme başlat
        const downloadUrl = systemApi.getBackupDownloadUrl(result.filename);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = result.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } else {
        throw new Error('Yedekleme yanıtı geçersiz.');
      }
    } catch (err: any) {
      console.error('Yedek alma hatası:', err);
      setBackupError(
        err?.response?.data?.detail ||
          'Ambar veritabanı yedeği oluşturulurken bir hata meydana geldi.'
      );
    } finally {
      setIsCreatingBackup(false);
    }
  };

  // Veri Tab: Clear All Documents (Double confirmation)
  const handleClearConfirm = async () => {
    setIsClearing(true);
    setClearMessage(null);
    try {
      await onClearAllDocuments();
      setIsConfirmingClear(false);
      setClearMessage('Kuyruk ve ambar hafızası başarıyla temizlendi.');
      setTimeout(() => setClearMessage(null), 4000);
    } catch (err: any) {
      setClearMessage('Kuyruk temizlenirken bir hata oluştu.');
    } finally {
      setIsClearing(false);
    }
  };

  // Cihazlar Tab: Copy Mobile Link
  const handleCopyMobileUrl = () => {
    if (!qrInfo?.mobile_url) return;
    navigator.clipboard.writeText(qrInfo.mobile_url);
    setIsUrlCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setIsUrlCopied(false), 2000);
  };

  // Cihazlar Tab: Refresh QR
  const handleRefreshQr = async () => {
    setIsLoadingQr(true);
    setQrError(null);
    try {
      const info = await documentApi.getQrUrl();
      setQrInfo(info);
    } catch (err) {
      setQrError('QR bağlantısı yenilenemedi.');
    } finally {
      setIsLoadingQr(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/75 backdrop-blur-md select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        ref={modalRef}
        className="bg-theme-surface border border-theme-subtle rounded-2xl w-full max-w-4xl h-[620px] max-h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150 min-w-0 craft-card"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Üst Başlık (Header Bar) */}
        <div className="px-6 py-4 border-b border-theme-subtle flex items-center justify-between bg-theme-surface/90 backdrop-blur-sm shrink-0 min-w-0">
          <div className="flex items-center space-x-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/25 flex items-center justify-center text-blue-400 shrink-0 shadow-sm">
              <Settings className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center space-x-2">
                <h2
                  id="settings-modal-title"
                  className="text-sm sm:text-base font-semibold text-theme-primary truncate tracking-tight"
                >
                  Ayarlar Merkezi
                </h2>
                <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 font-semibold tracking-wider">
                  Kurumsal
                </span>
              </div>
              <p className="text-xs text-theme-muted truncate">
                DocuLog Lojistik İstasyonu • Görünüm, AI ve Entegrasyon Yapılandırması
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-theme-muted bg-theme-card border border-theme-subtle rounded shadow-xs">
              ESC
            </kbd>
            <button
              onClick={onClose}
              className="text-theme-muted hover:text-theme-primary p-2 rounded-xl hover:bg-theme-card transition-colors shrink-0"
              title="Kapat (Escape)"
              aria-label="Kapat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Ana Gövde (Sidebar Tabs + Scrollable Viewport) */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Sol Dikey Sekme Menüsü (Vertical Tab Sidebar) */}
          <nav
            className="w-56 sm:w-64 border-r border-theme-subtle bg-theme-card/30 flex flex-col justify-between shrink-0 p-3 overflow-y-auto"
            aria-label="Ayarlar sekmeleri"
          >
            <div className="space-y-1.5">
              {/* Sekme 1: Görünüm & Çalışma Alanı */}
              <button
                type="button"
                onClick={() => setActiveTab('gorunum')}
                className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-left transition-all text-xs font-medium ${
                  activeTab === 'gorunum'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-xs'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-card/60 border border-transparent'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    activeTab === 'gorunum'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-theme-muted'
                  }`}
                >
                  <Layout className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">Görünüm & Düzen</div>
                  <div className="text-[10px] text-theme-muted truncate">
                    3 Sütun, Mini Ray, Temalar
                  </div>
                </div>
              </button>

              {/* Sekme 2: Sistem ve Servis Bağlantısı */}
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-left transition-all text-xs font-medium ${
                  activeTab === 'ai'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-xs'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-card/60 border border-transparent'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    activeTab === 'ai'
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-theme-muted'
                  }`}
                >
                  <Key className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">Servis Bağlantısı</div>
                  <div className="text-[10px] text-theme-muted truncate">
                    Belge Okuma ve Lisans
                  </div>
                </div>
                {apiKeyStatus?.is_configured && (
                  <span
                    className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
                    title="Servis Anahtarı Tanımlı"
                  />
                )}
              </button>

              {/* Sekme 3: Evrak & Ambar Bakımı */}
              <button
                type="button"
                onClick={() => setActiveTab('veri')}
                className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-left transition-all text-xs font-medium ${
                  activeTab === 'veri'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-xs'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-card/60 border border-transparent'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    activeTab === 'veri'
                      ? 'bg-emerald-500/20 text-emerald-400'
                      : 'text-theme-muted'
                  }`}
                >
                  <Database className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">Veri & Bakım</div>
                  <div className="text-[10px] text-theme-muted truncate">
                    Kuyruk Sıfırla, Yedek (.tar.gz)
                  </div>
                </div>
              </button>

              {/* Sekme 4: Cihazlar & Mobil QR Köprüsü */}
              <button
                type="button"
                onClick={() => setActiveTab('cihazlar')}
                className={`w-full flex items-center space-x-3 px-3.5 py-3 rounded-xl text-left transition-all text-xs font-medium ${
                  activeTab === 'cihazlar'
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-xs'
                    : 'text-theme-secondary hover:text-theme-primary hover:bg-theme-card/60 border border-transparent'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg shrink-0 ${
                    activeTab === 'cihazlar'
                      ? 'bg-sky-500/20 text-sky-400'
                      : 'text-theme-muted'
                  }`}
                >
                  <QrCode className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">Cihazlar & Köprü</div>
                  <div className="text-[10px] text-theme-muted truncate">
                    Mobil QR & ERP Formatları
                  </div>
                </div>
              </button>
            </div>

            {/* Alt Sistem Bilgisi Rozeti */}
            <div className="p-3 bg-theme-card/40 border border-theme-subtle rounded-xl text-[11px] text-theme-muted space-y-1">
              <div className="flex items-center justify-between text-theme-secondary font-medium">
                <span>DocuLog İstasyonu</span>
                <span className="font-mono text-[10px]">v1.0.4</span>
              </div>
              <p className="text-[10px] text-theme-muted leading-relaxed">
                Yerel SQLite WAL + GİB Karekod Çapraz Doğrulama
              </p>
            </div>
          </nav>

          {/* Sağ İçerik Alanı (Tab Panel Viewport - Fixed Size, Zero Reflow) */}
          <main className="flex-1 min-w-0 overflow-y-auto p-5 sm:p-6 bg-theme-surface">
            {/* ========================================================= */}
            {/* SEKME 1: GÖRÜNÜM & ÇALIŞMA ALANI */}
            {/* ========================================================= */}
            {activeTab === 'gorunum' && (
              <div className="space-y-6 tab-pane-enter">
                {/* 1. Çalışma Alanı Düzeni */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <Layout className="w-4 h-4 text-blue-400" />
                    <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                      Çalışma Alanı Düzeni (Workspace Layout)
                    </h3>
                  </div>
                  <p className="text-xs text-theme-muted mb-3.5">
                    Ekran genişliğinize ve ambar operasyon hızınıza uygun sütun mimarisini seçin.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Düzen 1: Klasik 3 Sütun */}
                    <button
                      type="button"
                      onClick={() => onLayoutModeChange('three-column')}
                      className={`relative flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        layoutMode === 'three-column'
                          ? 'bg-blue-600/10 border-blue-500 ring-2 ring-blue-500/30'
                          : 'bg-theme-card border-theme-subtle hover:border-theme-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-1.5">
                          <Columns className="w-4 h-4 text-blue-400" />
                          <span className="text-xs font-bold text-theme-primary">
                            Klasik 3 Sütun
                          </span>
                        </div>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 font-semibold">
                          Önerilen
                        </span>
                      </div>

                      {/* Mockup Sütun Çizimi */}
                      <div className="h-10 w-full bg-theme-surface border border-theme-subtle rounded-md mb-2.5 flex p-1 gap-1">
                        <div className="w-1/4 h-full bg-blue-500/25 rounded-xs" />
                        <div className="w-1/2 h-full bg-blue-500/15 rounded-xs" />
                        <div className="w-1/4 h-full bg-blue-500/25 rounded-xs" />
                      </div>

                      <p className="text-[11px] text-theme-secondary leading-snug">
                        Sabit ve dengeli ambar düzeni: Kuyruk listesi, evrak önizleme ve veri formu yan yana.
                      </p>

                      {layoutMode === 'three-column' && (
                        <div className="absolute top-2.5 right-2.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                      )}
                    </button>

                    {/* Düzen 2: Akıllı Ray (Mini Dock) */}
                    <button
                      type="button"
                      onClick={() => onLayoutModeChange('collapsible-dock')}
                      className={`relative flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        layoutMode === 'collapsible-dock'
                          ? 'bg-blue-600/10 border-blue-500 ring-2 ring-blue-500/30'
                          : 'bg-theme-card border-theme-subtle hover:border-theme-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-1.5">
                          <Sidebar className="w-4 h-4 text-sky-400" />
                          <span className="text-xs font-bold text-theme-primary">
                            Akıllı Ray
                          </span>
                        </div>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400 font-mono">
                          48px Dock
                        </span>
                      </div>

                      {/* Mockup Çizimi */}
                      <div className="h-10 w-full bg-theme-surface border border-theme-subtle rounded-md mb-2.5 flex p-1 gap-1">
                        <div className="w-2 h-full bg-sky-500/40 rounded-xs" />
                        <div className="flex-1 h-full bg-sky-500/15 rounded-xs" />
                        <div className="w-1/3 h-full bg-sky-500/25 rounded-xs" />
                      </div>

                      <p className="text-[11px] text-theme-secondary leading-snug">
                        Sol paneli 48px mini dock rayına daraltarak evrak görseline ve kalem tablosuna azami alan tanır.
                      </p>

                      {layoutMode === 'collapsible-dock' && (
                        <div className="absolute top-2.5 right-2.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                      )}
                    </button>

                    {/* Düzen 3: Odak Stüdyo (2 Sütun) */}
                    <button
                      type="button"
                      onClick={() => onLayoutModeChange('focus-studio')}
                      className={`relative flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        layoutMode === 'focus-studio'
                          ? 'bg-blue-600/10 border-blue-500 ring-2 ring-blue-500/30'
                          : 'bg-theme-card border-theme-subtle hover:border-theme-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-1.5">
                          <Maximize2 className="w-4 h-4 text-purple-400" />
                          <span className="text-xs font-bold text-theme-primary">
                            Odak Stüdyo
                          </span>
                        </div>
                        <span className="text-[9px] uppercase px-1.5 py-0.5 rounded-md bg-purple-500/10 text-purple-400 font-mono">
                          2 Sütun
                        </span>
                      </div>

                      {/* Mockup Çizimi */}
                      <div className="h-10 w-full bg-theme-surface border border-theme-subtle rounded-md mb-2.5 flex p-1 gap-1">
                        <div className="w-1/2 h-full bg-purple-500/20 rounded-xs" />
                        <div className="w-1/2 h-full bg-purple-500/20 rounded-xs" />
                      </div>

                      <p className="text-[11px] text-theme-secondary leading-snug">
                        Kuyruğu gizleyip yalnızca belge görseli ve detay formuna odaklanan çift sütunlu stüdyo modu.
                      </p>

                      {layoutMode === 'focus-studio' && (
                        <div className="absolute top-2.5 right-2.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                      )}
                    </button>
                  </div>
                </div>

                {/* 2. Görünüm Teması */}
                <div className="pt-2 border-t border-theme-subtle">
                  <div className="flex items-center space-x-2 mb-1">
                    <Palette className="w-4 h-4 text-amber-400" />
                    <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                      Görünüm Teması (Color Theme)
                    </h3>
                  </div>
                  <p className="text-xs text-theme-muted mb-3.5">
                    Fiziksel ambar aydınlatma koşullarına ve çalışma ergonominize uygun renk paleti.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Tema 1: Koyu Kurumsal */}
                    <button
                      type="button"
                      onClick={() => onThemeChange('koyu-kurumsal')}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        theme === 'koyu-kurumsal'
                          ? 'bg-blue-600/10 border-blue-500 ring-2 ring-blue-500/30'
                          : 'bg-theme-card border-theme-subtle hover:border-theme-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-theme-primary">
                          Koyu Kurumsal
                        </span>
                        {theme === 'koyu-kurumsal' && (
                          <Check className="w-3.5 h-3.5 text-blue-400" />
                        )}
                      </div>

                      {/* Renk Çemberleri */}
                      <div className="flex items-center space-x-1.5 mb-2">
                        <span className="w-4 h-4 rounded-full bg-[#020617] border border-slate-700 shadow-xs" />
                        <span className="w-4 h-4 rounded-full bg-[#0f172a] border border-slate-700 shadow-xs" />
                        <span className="w-4 h-4 rounded-full bg-[#3b82f6] shadow-xs" />
                      </div>

                      <p className="text-[11px] text-theme-secondary leading-snug">
                        Yüksek kontrastlı standart ambar ve ofis arayüzü (Slate-950).
                      </p>
                    </button>

                    {/* Tema 2: Gece Vardiyası */}
                    <button
                      type="button"
                      onClick={() => onThemeChange('gece-vardiyasi')}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        theme === 'gece-vardiyasi'
                          ? 'bg-amber-600/10 border-amber-500 ring-2 ring-amber-500/30'
                          : 'bg-theme-card border-theme-subtle hover:border-theme-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-theme-primary">
                          Gece Vardiyası
                        </span>
                        {theme === 'gece-vardiyasi' && (
                          <Check className="w-3.5 h-3.5 text-amber-400" />
                        )}
                      </div>

                      {/* Renk Çemberleri */}
                      <div className="flex items-center space-x-1.5 mb-2">
                        <span className="w-4 h-4 rounded-full bg-[#000000] border border-zinc-800 shadow-xs" />
                        <span className="w-4 h-4 rounded-full bg-[#18181b] border border-zinc-800 shadow-xs" />
                        <span className="w-4 h-4 rounded-full bg-[#f59e0b] shadow-xs" />
                      </div>

                      <p className="text-[11px] text-theme-secondary leading-snug">
                        Düşük ışık ambar terminalleri için OLED derin siyah ve kehribar vurgu.
                      </p>
                    </button>

                    {/* Tema 3: Açık Ofis */}
                    <button
                      type="button"
                      onClick={() => onThemeChange('acik-ofis')}
                      className={`flex flex-col text-left p-3.5 rounded-xl border transition-all ${
                        theme === 'acik-ofis'
                          ? 'bg-blue-600/10 border-blue-500 ring-2 ring-blue-500/30'
                          : 'bg-theme-card border-theme-subtle hover:border-theme-strong'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-theme-primary">
                          Açık Ofis
                        </span>
                        {theme === 'acik-ofis' && (
                          <Check className="w-3.5 h-3.5 text-blue-600" />
                        )}
                      </div>

                      {/* Renk Çemberleri */}
                      <div className="flex items-center space-x-1.5 mb-2">
                        <span className="w-4 h-4 rounded-full bg-[#f8fafc] border border-slate-300 shadow-xs" />
                        <span className="w-4 h-4 rounded-full bg-[#ffffff] border border-slate-300 shadow-xs" />
                        <span className="w-4 h-4 rounded-full bg-[#2563eb] shadow-xs" />
                      </div>

                      <p className="text-[11px] text-theme-secondary leading-snug">
                        Gün ışığı alan muhasebe ve yönetim birimleri için berrak aydınlık tema.
                      </p>
                    </button>
                  </div>
                </div>

                {/* 3. Render ve Animasyon Tercihleri */}
                <div className="pt-2 border-t border-theme-subtle">
                  <div className="flex items-center space-x-2 mb-1">
                    <Sliders className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                      Render & Performans Tercihleri
                    </h3>
                  </div>
                  <p className="text-xs text-theme-muted mb-3.5">
                    GPU donanım hızlandırma ve görsel efekt ayarları.
                  </p>

                  <div className="space-y-3">
                    {/* Seçenek 1: Progressive Tile Render */}
                    <div className="flex items-center justify-between p-3.5 bg-theme-card border border-theme-subtle rounded-xl">
                      <div className="min-w-0 pr-3">
                        <div className="text-xs font-semibold text-theme-primary flex items-center space-x-1.5">
                          <span>Kademeli Çözünürlük ve Hızlı Önizleme</span>
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 font-mono">
                            Aktif
                          </span>
                        </div>
                        <p className="text-[11px] text-theme-muted mt-0.5">
                          Yüksek çözünürlüklü ve taranmış belgelerde kademeli netleştirme önbelleği.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleProgressiveRender}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          progressiveRender ? 'bg-blue-600' : 'bg-slate-700'
                        }`}
                        role="switch"
                        aria-checked={progressiveRender}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            progressiveRender ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>

                    {/* Seçenek 2: Akıcı Tuval */}
                    <div className="flex items-center justify-between p-3.5 bg-theme-card border border-theme-subtle rounded-xl">
                      <div className="min-w-0 pr-3">
                        <div className="text-xs font-semibold text-theme-primary flex items-center space-x-1.5">
                          <span>Akıcı Tuval Görünümü</span>
                          <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-400 font-mono">
                            Aktif
                          </span>
                        </div>
                        <p className="text-[11px] text-theme-muted mt-0.5">
                          Yumuşak yakınlaştırma ve kaydırma hareketleri.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleToggleSilkySmooth}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          silkySmoothViewport ? 'bg-blue-600' : 'bg-slate-700'
                        }`}
                        role="switch"
                        aria-checked={silkySmoothViewport}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            silkySmoothViewport ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* SEKME 2: SERVİS BAĞLANTISI */}
            {/* ========================================================= */}
            {activeTab === 'ai' && (
              <div className="space-y-6 tab-pane-enter">
                {/* 1. API Anahtarı Yapılandırması */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <Key className="w-4 h-4 text-blue-400" />
                      <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                        Merkezi Belge Okuma Servis Bağlantısı
                      </h3>
                    </div>
                    {/* Durum Rozeti */}
                    {apiKeyStatus?.is_configured ? (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        <span>Bağlantı Aktif</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                        <span>Anahtar Tanımlanmadı</span>
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-theme-muted mb-4">
                    İrsaliye ve sevk evraklarının otomatik okunabilmesi için sistem lisans ve servis anahtarınızı tanımlayınız.
                  </p>

                  {/* Form Girişi */}
                  <form
                    onSubmit={handleSaveApiKey}
                    className="p-4 bg-theme-card border border-theme-subtle rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2 min-w-0">
                      <label className="text-xs font-semibold text-theme-secondary">
                        Servis Lisans Anahtarı
                      </label>
                      {apiKeyStatus?.masked_key && (
                        <span className="text-[11px] font-mono text-emerald-400/90 truncate">
                          Mevcut: {apiKeyStatus.masked_key}
                        </span>
                      )}
                    </div>

                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="AIzaSy..."
                        value={apiKeyInput}
                        onChange={(e) => setApiKeyInput(e.target.value)}
                        className="w-full bg-theme-surface border border-theme-subtle rounded-lg pl-3 pr-10 py-2.5 text-xs text-theme-primary placeholder-theme-muted focus:outline-none focus:border-blue-500 transition-colors font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-theme-muted hover:text-theme-primary p-1 rounded-md transition-colors"
                        title={showApiKey ? 'Gizle' : 'Göster'}
                      >
                        {showApiKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Hata & Başarı Mesajları */}
                    {keySaveMessage && (
                      <div className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-xs">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>{keySaveMessage}</span>
                      </div>
                    )}
                    {keySaveError && (
                      <div className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg text-xs break-words">
                        {keySaveError}
                      </div>
                    )}

                    {/* İşlem Butonları */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-theme-subtle">
                      {/* Test Connection Butonu */}
                      <button
                        type="button"
                        onClick={handleTestConnection}
                        disabled={isTestingKey}
                        className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-theme-secondary hover:text-theme-primary bg-theme-surface hover:bg-theme-card-hover rounded-lg border border-theme-subtle transition-all disabled:opacity-50"
                      >
                        {isTestingKey ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                            <span>Test Ediliyor...</span>
                          </>
                        ) : (
                          <>
                            <Activity className="w-3.5 h-3.5 text-blue-400" />
                            <span>Bağlantıyı Test Et</span>
                          </>
                        )}
                      </button>

                      {/* Kaydet Butonu */}
                      <button
                        type="submit"
                        disabled={isSavingKey || !apiKeyInput.trim()}
                        className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg shadow-sm transition-all"
                      >
                        {isSavingKey ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Kaydediliyor...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Kaydet</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Test Sonuç Banner'ı */}
                    {testResult && (
                      <div
                        className={`flex items-center justify-between p-2.5 rounded-lg text-xs border ${
                          testResult.success
                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                        }`}
                      >
                        <div className="flex items-center space-x-1.5">
                          {testResult.success ? (
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                          ) : (
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                          )}
                          <span>{testResult.message}</span>
                        </div>
                        {testResult.latencyMs !== undefined && (
                          <span className="font-mono text-[10px] opacity-80 shrink-0">
                            {testResult.latencyMs} ms
                          </span>
                        )}
                      </div>
                    )}
                  </form>
                </div>

                {/* 2. Metin ve Karakter Doğrulama Servisi */}
                <div className="pt-2 border-t border-theme-subtle">
                  <div className="flex items-center space-x-2 mb-1">
                    <Cpu className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                      Metin ve Karakter Doğrulama Servisi
                    </h3>
                  </div>
                  <p className="text-xs text-theme-muted mb-3.5">
                    Nokta vuruşlu yazıcı ve faks çıktılarındaki silik karakterleri ticari sözlük kurallarıyla denetleyen doğrulama modülü.
                  </p>

                  <div className="p-4 bg-theme-card border border-theme-subtle rounded-xl space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <span className="text-xs font-bold text-theme-primary">
                          Karakter Doğrulama Servisi: Hazır
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-semibold">
                        GİB & VKN Doğrulamalı
                      </span>
                    </div>

                    <p className="text-xs text-theme-secondary leading-relaxed">
                      Nokta vuruşlu yazıcı çıktılarını, silik harfleri ve Türkçe ticari terimleri standartlara uygun olarak doğrular;
                      alt toplam ve sayfa devir satırlarını kalemlerden ayıklar.
                    </p>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-theme-subtle text-[11px] text-theme-muted font-medium">
                      <div className="flex items-center space-x-1.5">
                        <Shield className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>Karakter Kurtarma</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Devir Satırı Filtresi</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <Check className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>Eğrilik Düzeltme</span>
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <QrCode className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        <span>GİB Karekod Çapraz Kontrol</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* SEKME 3: VERİ & AMBAR BAKIMI */}
            {/* ========================================================= */}
            {activeTab === 'veri' && (
              <div className="space-y-6 tab-pane-enter">
                {/* 1. Evrak Kuyruğu Bakımı */}
                <div>
                  <div className="flex items-center space-x-2 mb-1">
                    <Database className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                      Evrak Kuyruğu & Örnek Veri İşlemleri
                    </h3>
                  </div>
                  <p className="text-xs text-theme-muted mb-3.5">
                    İşlenmiş evrakları baştan kuyruğa alma veya test amaçlı örnek irsaliye yükleme işlemleri.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Buton 1: Tüm İrsaliyeleri Okunmamış Yap */}
                    <div className="p-4 bg-theme-card border border-theme-subtle rounded-xl flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <RotateCcw className="w-4 h-4 text-blue-400" />
                          <h4 className="text-xs font-bold text-theme-primary">
                            Tüm İrsaliyeleri Okunmamış Yap (Sıfırla)
                          </h4>
                        </div>
                        <p className="text-[11px] text-theme-muted leading-relaxed">
                          Okunmuş veya işlem hatası almış evrakları ilk kuyruk durumuna döndürür; toplu yeniden işlemeye hazır hale getirir.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleReset}
                        disabled={isResetting}
                        className="flex items-center justify-center space-x-1.5 w-full py-2 px-3 text-xs font-semibold bg-theme-surface hover:bg-theme-card-hover text-theme-primary border border-theme-subtle rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isResetting ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                            <span>Kuyruk Sıfırlanıyor...</span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5 text-blue-400" />
                            <span>Kuyruğu Sıfırla</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Buton 2: Örnek İrsaliye Yükle */}
                    <div className="p-4 bg-theme-card border border-theme-subtle rounded-xl flex flex-col justify-between space-y-3">
                      <div>
                        <div className="flex items-center space-x-2 mb-1">
                          <FileText className="w-4 h-4 text-blue-400" />
                          <h4 className="text-xs font-bold text-theme-primary">
                            Örnek İrsaliye Yükle
                          </h4>
                        </div>
                        <p className="text-[11px] text-theme-muted leading-relaxed">
                          Sistem doğrulaması için ambar veri tabanına 1 adet örnek resmi sevk irsaliyesi yükler.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleLoadDemo}
                        disabled={isLoadingDemo}
                        className="flex items-center justify-center space-x-1.5 w-full py-2 px-3 text-xs font-semibold bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 border border-blue-500/30 rounded-lg transition-colors disabled:opacity-50"
                      >
                        {isLoadingDemo ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                            <span>Yükleniyor...</span>
                          </>
                        ) : (
                          <>
                            <FileText className="w-3.5 h-3.5 text-blue-400" />
                            <span>Örnek İrsaliye Yükle</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Sıfırlama veya Demo Mesajı */}
                  {resetMessage && (
                    <div className="mt-3 flex items-center space-x-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-xs">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{resetMessage}</span>
                    </div>
                  )}
                  {demoMessage && (
                    <div className="mt-3 flex items-center space-x-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-xs">
                      <Check className="w-3.5 h-3.5 shrink-0" />
                      <span>{demoMessage}</span>
                    </div>
                  )}
                </div>

                {/* 2. Felaket Kurtarma Yedeği (Disaster Recovery) */}
                <div className="pt-2 border-t border-theme-subtle">
                  <div className="flex items-center space-x-2 mb-1">
                    <HardDriveDownload className="w-4 h-4 text-blue-400" />
                    <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                      Ambar Veritabanı Yedeği (Disaster Recovery)
                    </h3>
                  </div>
                  <p className="text-xs text-theme-muted mb-3.5">
                    SQLite WAL checkpoint uygulayarak tüm irsaliye kayıtlarını, görsel ekleri ve SHA-256 sağlama özetini sıkıştırılmış .tar.gz arşivi olarak indirin.
                  </p>

                  <div className="p-4 bg-theme-card border border-theme-subtle rounded-xl space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-bold text-theme-primary">
                          doculog.db + uploads/ Sıkıştırılmış Arşivi
                        </div>
                        <div className="text-[11px] text-theme-muted">
                          Format: .tar.gz • Bütünlük: SHA-256 Checksum Dosyası Dahil
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleCreateBackup}
                        disabled={isCreatingBackup}
                        className="flex items-center justify-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm transition-all disabled:opacity-50 shrink-0"
                      >
                        {isCreatingBackup ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>Arşiv Hazırlanıyor...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>Ambar Yedeği İndir (.tar.gz)</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Son Yedekleme Bilgi Rozeti */}
                    {backupInfo && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg text-xs space-y-1 text-emerald-300">
                        <div className="flex items-center space-x-1.5 font-semibold">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <span>Yedekleme Arşivi Başarıyla İndirildi</span>
                        </div>
                        <div className="font-mono text-[11px] text-theme-secondary truncate">
                          Dosya: {backupInfo.filename} ({Math.round(backupInfo.sizeBytes / 1024)} KB)
                        </div>
                        <div className="font-mono text-[10px] text-theme-muted truncate" title={backupInfo.sha256}>
                          SHA-256: {backupInfo.sha256.slice(0, 24)}...
                        </div>
                      </div>
                    )}
                    {backupError && (
                      <div className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg text-xs">
                        {backupError}
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. Tehlike Alanı (Danger Zone): Kuyruğu Temizle */}
                <div className="pt-2 border-t border-rose-500/30">
                  <div className="flex items-center space-x-2 mb-1 text-rose-400">
                    <AlertTriangle className="w-4 h-4" />
                    <h3 className="text-xs font-bold uppercase tracking-wider">
                      Tehlike Alanı (Danger Zone)
                    </h3>
                  </div>
                  <p className="text-xs text-theme-muted mb-3.5">
                    Bu işlem geri alınamaz. İstasyon hafızasındaki tüm irsaliye kayıtlarını ve görselleri kalıcı olarak siler.
                  </p>

                  <div className="p-4 bg-rose-500/5 border border-rose-500/25 rounded-xl space-y-3">
                    {!isConfirmingClear ? (
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-bold text-rose-300">
                            Kuyruğu Temizle (Tümünü Sil)
                          </div>
                          <div className="text-[11px] text-theme-muted">
                            Ambardaki tüm işlenmiş ve bekleyen irsaliyeleri kalıcı olarak yok eder.
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setIsConfirmingClear(true)}
                          className="flex items-center justify-center space-x-1.5 px-4 py-2 text-xs font-semibold bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 rounded-lg transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                          <span>Kuyruğu Temizle...</span>
                        </button>
                      </div>
                    ) : (
                      /* Çift Onay Paneli (Double Confirmation) */
                      <div className="space-y-3 animate-in fade-in duration-150">
                        <div className="flex items-start space-x-2.5 text-rose-400 bg-rose-500/15 border border-rose-500/30 p-3 rounded-lg text-xs">
                          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">Emin misiniz? </span>
                            Bu işlem veri tabanındaki tüm irsaliyeleri, ürün kalemlerini ve yüklenen belgeleri tamamen temizler. Bu işlem geri alınamaz!
                          </div>
                        </div>

                        <div className="flex items-center justify-end space-x-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setIsConfirmingClear(false)}
                            disabled={isClearing}
                            className="px-3.5 py-1.5 text-xs font-semibold text-theme-secondary hover:text-theme-primary bg-theme-surface border border-theme-subtle rounded-lg transition-colors"
                          >
                            Vazgeç
                          </button>
                          <button
                            type="button"
                            onClick={handleClearConfirm}
                            disabled={isClearing}
                            className="flex items-center space-x-1.5 px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white rounded-lg shadow-sm transition-all disabled:opacity-50"
                          >
                            {isClearing ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Siliniyor...</span>
                              </>
                            ) : (
                              <>
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Evet, Tümünü Kalıcı Olarak Sil</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {clearMessage && (
                      <div className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-xs">
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>{clearMessage}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================= */}
            {/* SEKME 4: CİHAZLAR & MOBİL QR KÖPRÜSÜ */}
            {/* ========================================================= */}
            {activeTab === 'cihazlar' && (
              <div className="space-y-6 tab-pane-enter">
                {/* 1. Telefondan Canlı Yükleme (Mobile QR Bridge) */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <Smartphone className="w-4 h-4 text-sky-400" />
                      <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                        Telefondan Canlı Yükleme (Mobile QR Bridge)
                      </h3>
                    </div>
                    {/* Canlı Bağlantı Rozeti */}
                    <span className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      <span>Canlı Köprü Hazır</span>
                    </span>
                  </div>
                  <p className="text-xs text-theme-muted mb-4">
                    Kullanıcıların telefon kameralarıyla sevk irsaliyesi fotoğrafı çekip doğrudan bu bilgisayara aktarmasını sağlar.
                  </p>

                  <div className="p-4 bg-theme-card border border-theme-subtle rounded-xl flex flex-col sm:flex-row items-center gap-5">
                    {/* QR Kod Görseli */}
                    <div className="bg-white p-2.5 rounded-xl border border-theme-subtle shadow-lg shrink-0">
                      {isLoadingQr ? (
                        <div className="w-36 h-36 flex flex-col items-center justify-center space-y-2 text-slate-400">
                          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                          <span className="text-[10px]">QR Kod Üretiliyor...</span>
                        </div>
                      ) : qrInfo?.qr_data_url ? (
                        <img
                          src={qrInfo.qr_data_url}
                          alt="Telefon ile Tara"
                          className="w-36 h-36 block rounded-md"
                        />
                      ) : (
                        <div className="w-36 h-36 flex items-center justify-center bg-slate-100 text-slate-400">
                          <QrCode className="w-10 h-10" />
                        </div>
                      )}
                    </div>

                    {/* QR Bilgileri ve İpuçları */}
                    <div className="flex-1 min-w-0 space-y-3 w-full">
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold text-theme-muted tracking-wider">
                          Yerel Ağ Adresi (LAN Web Scanner)
                        </div>
                        <div className="flex items-center space-x-2">
                          <div className="bg-theme-surface border border-theme-subtle rounded-lg px-2.5 py-1.5 text-xs font-mono text-theme-secondary truncate flex-1 select-all">
                            {qrInfo?.mobile_url || 'Bağlantı bekleniyor...'}
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyMobileUrl}
                            disabled={!qrInfo}
                            className="flex items-center space-x-1 px-3 py-1.5 bg-theme-surface hover:bg-theme-card-hover border border-theme-subtle rounded-lg text-xs font-medium text-theme-primary transition-colors shrink-0 disabled:opacity-40"
                            title="Bağlantıyı Kopyala"
                          >
                            {isUrlCopied ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                                <span className="text-emerald-400">Kopyalandı</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-blue-400" />
                                <span>Kopyala</span>
                              </>
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={handleRefreshQr}
                            disabled={isLoadingQr}
                            className="p-1.5 bg-theme-surface hover:bg-theme-card-hover border border-theme-subtle rounded-lg text-theme-muted hover:text-theme-primary transition-colors shrink-0"
                            title="QR Kodu Yenile"
                          >
                            <RefreshCw
                              className={`w-4 h-4 ${isLoadingQr ? 'animate-spin' : ''}`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* 3 Adımlı Kullanım */}
                      <div className="space-y-1.5 text-[11px] text-theme-secondary pt-1 border-t border-theme-subtle">
                        <div className="flex items-start space-x-1.5">
                          <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            1
                          </span>
                          <span>Telefon kameranızı ekrandaki QR koda doğrultun ve açın.</span>
                        </div>
                        <div className="flex items-start space-x-1.5">
                          <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            2
                          </span>
                          <span>Açılan sayfada irsaliyenin fotoğrafını çekin veya galeriden seçin.</span>
                        </div>
                        <div className="flex items-start space-x-1.5">
                          <span className="w-4 h-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                            3
                          </span>
                          <span>
                            <strong>'Sisteme Aktar'</strong>a bastığınızda belge doğrudan bilgisayarınıza düşer.
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-1.5 text-[10px] text-theme-muted">
                        <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>Telefon ve bilgisayarın aynı Wi-Fi / yerel ağda olması önerilir.</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 2. Muhasebe & ERP Entegrasyon Formatları */}
                <div className="pt-2 border-t border-theme-subtle">
                  <div className="flex items-center space-x-2 mb-1">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                    <h3 className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                      Muhasebe & ERP Entegrasyon Formatları
                    </h3>
                  </div>
                  <p className="text-xs text-theme-muted mb-3.5">
                    Kuyruktaki tüm irsaliyeleri tek tıkla kurumsal ERP sisteminize uygun formatta dışa aktarın.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {/* Format 1: Logo XML */}
                    <a
                      href={documentApi.getBatchLogoXmlUrl()}
                      download="logo_irsaliyeler.xml"
                      className="p-3.5 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle hover:border-blue-500/40 rounded-xl transition-all flex flex-col justify-between space-y-2 group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <FileCode className="w-4 h-4 text-blue-400" />
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 font-bold">
                            XML
                          </span>
                        </div>
                        <div className="text-xs font-bold text-theme-primary group-hover:text-blue-400 transition-colors">
                          Logo Tiger / Go XML
                        </div>
                        <p className="text-[11px] text-theme-muted leading-snug mt-1">
                          STFICHE ve STLINE şemasına uygun ambar fişi aktarım paketi.
                        </p>
                      </div>

                      <div className="flex items-center space-x-1 text-xs text-blue-400 font-semibold pt-1 border-t border-theme-subtle">
                        <Download className="w-3.5 h-3.5" />
                        <span>Logo XML İndir</span>
                      </div>
                    </a>

                    {/* Format 2: Standart JSON */}
                    <a
                      href={documentApi.getBatchJsonUrl()}
                      download="irsaliyeler_export.json"
                      className="p-3.5 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle hover:border-purple-500/40 rounded-xl transition-all flex flex-col justify-between space-y-2 group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <FileCode className="w-4 h-4 text-purple-400" />
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 font-bold">
                            JSON
                          </span>
                        </div>
                        <div className="text-xs font-bold text-theme-primary group-hover:text-purple-400 transition-colors">
                          Standart JSON Dökümü
                        </div>
                        <p className="text-[11px] text-theme-muted leading-snug mt-1">
                          REST API entegrasyonu, SAP ve özel yazılımlar için temiz veri dökümü.
                        </p>
                      </div>

                      <div className="flex items-center space-x-1 text-xs text-purple-400 font-semibold pt-1 border-t border-theme-subtle">
                        <Download className="w-3.5 h-3.5" />
                        <span>JSON İndir</span>
                      </div>
                    </a>

                    {/* Format 3: Toplu Excel */}
                    <a
                      href={documentApi.getBatchExcelUrl()}
                      download="irsaliyeler_mal_kabul.xlsx"
                      className="p-3.5 bg-theme-card hover:bg-theme-card-hover border border-theme-subtle hover:border-emerald-500/40 rounded-xl transition-all flex flex-col justify-between space-y-2 group"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                          <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">
                            XLSX
                          </span>
                        </div>
                        <div className="text-xs font-bold text-theme-primary group-hover:text-emerald-400 transition-colors">
                          Toplu Mal Kabul Excel
                        </div>
                        <p className="text-[11px] text-theme-muted leading-snug mt-1">
                          Kalem bazında miktar, birim, tutar ve mutabakat denetim tablosu.
                        </p>
                      </div>

                      <div className="flex items-center space-x-1 text-xs text-emerald-400 font-semibold pt-1 border-t border-theme-subtle">
                        <Download className="w-3.5 h-3.5" />
                        <span>Excel İndir</span>
                      </div>
                    </a>
                  </div>
                </div>
              </div>
            )}
          </main>
        </div>

        {/* Modal Alt Çubuk (Footer Bar) */}
        <div className="px-6 py-3 border-t border-theme-subtle bg-theme-surface flex items-center justify-between shrink-0 text-xs min-w-0">
          <div className="flex items-center space-x-3 text-[11px] text-theme-muted">
            <span className="flex items-center space-x-1">
              <kbd className="px-1.5 py-0.5 bg-theme-card border border-theme-subtle rounded font-mono text-[10px]">
                ESC
              </kbd>
              <span>Kapat</span>
            </span>
            <span className="text-theme-subtle">•</span>
            <span className="truncate">Tüm tercihler anında uygulanır ve kaydedilir.</span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm transition-all"
          >
            Tamam
          </button>
        </div>
      </div>
    </div>
  );
};
