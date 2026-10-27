import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  DocumentItem, 
  BatchSummary, 
  ApiKeyStatus,
  AppTheme,
  AppView,
  MobileTab,
  WorkspaceLayoutMode
} from './types/irsaliye';
import { documentApi } from './services/api';
import { useLiveSync } from './hooks/useLiveSync';
import { HeaderBar } from './components/common/HeaderBar';
import { StatusBar } from './components/common/StatusBar';
import { SettingsModal, SettingsTab } from './components/settings/SettingsModal';
import { BatchQueue } from './components/queue/BatchQueue';
import { CollapsibleDockRail } from './components/queue/CollapsibleDockRail';
import { DocumentViewer } from './components/viewer/DocumentViewer';
import { DocumentEditor } from './components/editor/DocumentEditor';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Code-Splitting: Yönetici Analitik Kokpiti (Executive Dashboard) İsteğe Bağlı Lazy-Load
const ExecutiveDashboard = React.lazy(() =>
  import('./components/dashboard/ExecutiveDashboard').then((m) => ({
    default: m.ExecutiveDashboard,
  }))
);
import { 
  Inbox, 
  Eye, 
  FileEdit, 
  Layers,
  AlertTriangle,
  Pin,
  ChevronLeft,
  Sidebar
} from 'lucide-react';

export const App: React.FC = () => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [summary, setSummary] = useState<BatchSummary>({
    toplam_belge: 0,
    kuyrukta: 0,
    islenen: 0,
    tamamlanan: 0,
    hatali: 0,
    onaylanan: 0,
  });
  const [apiKeyStatus, setApiKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [settingsInitialTab, setSettingsInitialTab] = useState<SettingsTab>('gorunum');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isProcessingCurrent, setIsProcessingCurrent] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [isEditorDirty, setIsEditorDirty] = useState(false);
  const isEditorDirtyRef = useRef(false);
  isEditorDirtyRef.current = isEditorDirty;
  const [pendingDocId, setPendingDocId] = useState<string | null>(null);
  const [isUnsavedModalOpen, setIsUnsavedModalOpen] = useState(false);

  // View Navigation, Theme, Layout and Mobile Navigation states
  const [activeView, setActiveView] = useState<AppView>('station');
  const [mobileTab, setMobileTab] = useState<MobileTab>('queue');
  const [theme, setTheme] = useState<AppTheme>(() => {
    return (localStorage.getItem('doculog_theme') as AppTheme) || 'koyu-kurumsal';
  });
  const [layoutMode, setLayoutMode] = useState<WorkspaceLayoutMode>(() => {
    try {
      const saved = localStorage.getItem('doculog_layout_mode');
      if (saved === 'three-column' || saved === 'collapsible-dock' || saved === 'focus-studio') {
        return saved as WorkspaceLayoutMode;
      }
    } catch (e) {
      console.warn('Layout mode okunamadı:', e);
    }
    return 'three-column'; // Varsayılan: Kararlı ve Sabit Klasik 3 Sütun
  });

  // Kalıcı düzen modu kaydı
  useEffect(() => {
    try {
      localStorage.setItem('doculog_layout_mode', layoutMode);
    } catch (e) {
      console.warn('Layout mode kaydedilemedi:', e);
    }
  }, [layoutMode]);

  // Akıllı Çekmece (Peek Drawer) Hover Zamanlama Kontrolü
  const [isQueuePeeking, setIsQueuePeeking] = useState(false);
  const enterTimerRef = useRef<number | null>(null);
  const leaveTimerRef = useRef<number | null>(null);

  const handleTriggerPeekOpen = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (!isQueuePeeking && layoutMode === 'collapsible-dock') {
      enterTimerRef.current = window.setTimeout(() => {
        setIsQueuePeeking(true);
        enterTimerRef.current = null;
      }, 110); // 110ms Intent gating threshold
    }
  }, [isQueuePeeking, layoutMode]);

  const handleTriggerPeekImmediate = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
    if (enterTimerRef.current !== null) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    setIsQueuePeeking(true);
  }, []);

  const handleCancelPeekClose = useCallback(() => {
    if (leaveTimerRef.current !== null) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const handleSchedulePeekClose = useCallback(() => {
    if (enterTimerRef.current !== null) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    leaveTimerRef.current = window.setTimeout(() => {
      setIsQueuePeeking(false);
      leaveTimerRef.current = null;
    }, 280); // 280ms Grace period buffer
  }, []);

  // Timer cleanup
  useEffect(() => {
    return () => {
      if (enterTimerRef.current) clearTimeout(enterTimerRef.current);
      if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
    };
  }, []);

  // Klavye kısayolu '[' ile Akıllı Çekmece / Odak Stüdyo döngüsü ve 'Esc' ile kapatma
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const activeEl = document.activeElement as HTMLElement | null;
      const currentEl = target || activeEl;

      if (currentEl) {
        const tagName = currentEl.tagName?.toLowerCase();
        const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
        const isContentEditable = currentEl.isContentEditable;
        if (isInput || isContentEditable) {
          return; // Form alanlarında yazı yazılıyorken kısayolu yutma
        }
      }

      // Ctrl+, veya Cmd+, ile Ayarlar modalını aç
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsModalOpen((prev) => !prev);
        return;
      }

      if (e.key === 'Escape' && isQueuePeeking) {
        e.preventDefault();
        setIsQueuePeeking(false);
        return;
      }

      if (e.key === '[' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        setLayoutMode((prev) => {
          if (prev === 'focus-studio') return 'collapsible-dock';
          if (prev === 'collapsible-dock') return 'focus-studio';
          return 'collapsible-dock';
        });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQueuePeeking]);

  // Apply data-theme attribute to DOM root and body
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('doculog_theme', theme);
  }, [theme]);

  const isInitialMountRef = useRef(true);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await documentApi.getDocuments();
      const docs = Array.isArray(res?.documents) ? res.documents : [];
      const batchSummary = res?.summary || {
        toplam_belge: 0,
        kuyrukta: 0,
        islenen: 0,
        tamamlanan: 0,
        hatali: 0,
        onaylanan: 0,
      };

      if (docs.length === 0 && isInitialMountRef.current) {
        isInitialMountRef.current = false;
        try {
          const demoDoc = await documentApi.loadDemoDocument();
          if (demoDoc) {
            setDocuments([demoDoc]);
            setSelectedDocId(demoDoc.id);
            setSummary({
              toplam_belge: 1,
              kuyrukta: 0,
              islenen: 0,
              tamamlanan: 1,
              hatali: 0,
              onaylanan: 0,
            });
            return;
          }
        } catch (e) {
          console.warn('Demo yüklenemedi:', e);
        }
      }
      isInitialMountRef.current = false;

      setDocuments(docs);
      setSummary(batchSummary);
      setSelectedDocId((prev) => {
        if (!prev && docs.length > 0) {
          return docs[0].id;
        }
        if (prev && !docs.some((d) => d.id === prev)) {
          return docs.length > 0 ? docs[0].id : null;
        }
        return prev;
      });
    } catch (err) {
      console.error('Kuyruk yüklenemedi:', err);
    }
  }, []);

  const wsDebounceTimerRef = useRef<number | null>(null);

  const { isConnected: isWsConnected } = useLiveSync({
    onDocumentsUpdated: useCallback((payload: any) => {
      // 300ms trailing debounce: Toplu işlem fırtınasında tarayıcı ve sunucu yükünü dengeler
      if (wsDebounceTimerRef.current) {
        clearTimeout(wsDebounceTimerRef.current);
      }
      wsDebounceTimerRef.current = window.setTimeout(() => {
        fetchDocuments();
      }, 300);
    }, [fetchDocuments]),
    onDocumentUploaded: useCallback((doc: DocumentItem) => {
      // Aktif olarak form üzerinde düzenleme yapılıyorsa odak bozulmasın
      if (!isEditorDirtyRef.current) {
        setSelectedDocId(doc.id);
        setMobileTab('viewer');
      }
    }, []),
  });

  const fetchApiKeyStatus = useCallback(async () => {
    try {
      const status = await documentApi.getApiKeyStatus();
      setApiKeyStatus(status);
    } catch (err) {
      console.error('API anahtar durumu alınamadı:', err);
    }
  }, []);

  useEffect(() => {
    fetchDocuments();
    fetchApiKeyStatus();
  }, []);

  const selectedDoc = documents.find((d) => d.id === selectedDocId) || null;

  const requestSelectDoc = useCallback((targetId: string) => {
    setMobileTab('viewer');
    if (targetId === selectedDocId) return;
    if (isEditorDirtyRef.current) {
      setPendingDocId(targetId);
      setIsUnsavedModalOpen(true);
      return;
    }
    setSelectedDocId(targetId);
  }, [selectedDocId]);

  const handleDiscardAndSwitch = () => {
    setIsEditorDirty(false);
    if (pendingDocId) {
      setSelectedDocId(pendingDocId);
      setPendingDocId(null);
      setMobileTab('viewer');
    }
    setIsUnsavedModalOpen(false);
  };

  const handleCancelSwitch = () => {
    setPendingDocId(null);
    setIsUnsavedModalOpen(false);
  };

  const handleUploadFiles = async (files: File[]) => {
    setIsUploading(true);
    try {
      const uploaded = await documentApi.uploadFiles(files);
      setDocuments((prev) => [...uploaded, ...prev]);
      if (uploaded.length > 0 && !isEditorDirtyRef.current) {
        setSelectedDocId(uploaded[0].id);
        setMobileTab('viewer');
      }
      fetchDocuments();
    } catch (err) {
      console.error('Dosya yükleme hatası:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await documentApi.deleteDocument(id);
      setDocuments((prev) => prev.filter((d) => d.id !== id));
      if (selectedDocId === id) {
        const remaining = documents.filter((d) => d.id !== id);
        setSelectedDocId(remaining.length > 0 ? remaining[0].id : null);
      }
      fetchDocuments();
    } catch (err) {
      console.error('Silme hatası:', err);
    }
  };

  const handleProcessDoc = async (id: string) => {
    setIsProcessingCurrent(true);
    try {
      const updated = await documentApi.processDocument(id);
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      fetchDocuments();
      // İşlem bitince mobilde düzenleme formuna odaklan
      setMobileTab('editor');
    } catch (err) {
      console.error('Ayrıştırma hatası:', err);
    } finally {
      setIsProcessingCurrent(false);
    }
  };

  const handleProcessAll = async () => {
    setIsProcessingBatch(true);
    try {
      await documentApi.processAllDocuments();
      await fetchDocuments();
    } catch (err) {
      console.error('Toplu işlem hatası:', err);
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const handleResetAllDocuments = async () => {
    if (!window.confirm('Tüm okunmuş veya hata durumundaki evraklar sıfırlanıp okunmamış (kuyrukta) durumuna getirilecek. Devam etmek istiyor musunuz?')) return;
    try {
      await documentApi.resetAllDocuments();
      await fetchDocuments();
    } catch (err) {
      console.error('Evrakları sıfırlama hatası:', err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Tüm belgeler silinecek. Emin misiniz?')) return;
    try {
      await documentApi.clearAll();
      setDocuments([]);
      setSelectedDocId(null);
      fetchDocuments();
    } catch (err) {
      console.error('Kuyruk temizleme hatası:', err);
    }
  };

  const handleLoadDemo = async () => {
    try {
      const demoDoc = await documentApi.loadDemoDocument();
      setDocuments((prev) => [demoDoc, ...prev]);
      setSelectedDocId(demoDoc.id);
      fetchDocuments();
      setMobileTab('viewer');
    } catch (err) {
      console.error('Demo yükleme hatası:', err);
    }
  };

  const handleMergeDocuments = async (targetDocId: string, sourceDocIds: string[]) => {
    try {
      const mergedDoc = await documentApi.mergeDocuments(targetDocId, sourceDocIds);
      setDocuments((prev) => {
        const remaining = prev.filter((d) => !sourceDocIds.includes(d.id) || d.id === targetDocId);
        return remaining.map((d) => (d.id === targetDocId ? mergedDoc : d));
      });
      setSelectedDocId(targetDocId);
      fetchDocuments();
    } catch (err) {
      console.error('Evrak birleştirme hatası:', err);
    }
  };

  const handleRotatePersist = async (derece: number, sayfaIndeksi: number = 0) => {
    if (!selectedDocId) return;
    try {
      const updated = await documentApi.rotateDocument(selectedDocId, derece, sayfaIndeksi);
      setDocuments((prev) => prev.map((d) => (d.id === selectedDocId ? updated : d)));
    } catch (err) {
      console.error('Döndürme hatası:', err);
      throw err;
    }
  };

  const handleUpdateDocument = (updatedDoc: DocumentItem) => {
    setDocuments((prev) => prev.map((d) => (d.id === updatedDoc.id ? updatedDoc : d)));
    fetchDocuments();
  };

  const handleSelectNextDoc = useCallback(() => {
    const currentIndex = documents.findIndex((d) => d.id === selectedDocId);
    if (currentIndex >= 0 && currentIndex < documents.length - 1) {
      requestSelectDoc(documents[currentIndex + 1].id);
    }
  }, [documents, selectedDocId, requestSelectDoc]);

  const handleSelectPrevDoc = useCallback(() => {
    const currentIndex = documents.findIndex((d) => d.id === selectedDocId);
    if (currentIndex > 0) {
      requestSelectDoc(documents[currentIndex - 1].id);
    }
  }, [documents, selectedDocId, requestSelectDoc]);

  // Linear / Vim Tarzı Klavye Kısayolları (J = Sonraki, K = Önceki Evrak)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isUnsavedModalOpen) {
        if (e.key === 'Escape') {
          e.preventDefault();
          handleCancelSwitch();
        }
        return;
      }

      // Input veya textarea içindeyse kısayolları engelle
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      if (e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        handleSelectNextDoc();
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        handleSelectPrevDoc();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [documents, selectedDocId, isUnsavedModalOpen, handleSelectNextDoc, handleSelectPrevDoc]);

  const handleExportBatchExcel = () => {
    window.open(documentApi.getBatchExcelUrl(), '_blank');
  };

  const handleMobileDocumentReceived = (doc: DocumentItem) => {
    setDocuments((prev) => {
      const exists = prev.some((d) => d.id === doc.id);
      if (exists) return prev;
      return [doc, ...prev];
    });
    setSummary((prev) => ({
      ...prev,
      toplam_belge: prev.toplam_belge + 1,
      kuyrukta: prev.kuyrukta + 1,
    }));
    if (!isEditorDirtyRef.current) {
      setSelectedDocId(doc.id);
      setMobileTab('viewer');
    }
    handleProcessDoc(doc.id);
  };

  return (
    <div
      data-theme={theme}
      className="h-[100dvh] w-screen flex flex-col bg-theme-app text-theme-primary overflow-hidden font-sans transition-colors duration-200 ambient-glow-subtle"
    >
      <HeaderBar
        summary={summary}
        apiKeyStatus={apiKeyStatus}
        onOpenSettings={(tab) => {
          if (tab) setSettingsInitialTab(tab);
          setIsSettingsModalOpen(true);
        }}
        onProcessAll={handleProcessAll}
        isProcessingBatch={isProcessingBatch}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      {/* Ana Çalışma Alanı: Desktop 3 Farklı Mod / Mobil Sekme Değişimi */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* İstasyon Görünümü */}
        <div className={`flex-1 flex flex-col md:flex-row overflow-hidden relative ${activeView === 'station' ? 'flex' : 'hidden'}`}>
          
          {/* Mobil Sütun: Kuyruk (Yalnızca mobil cihazlarda 'queue' sekmesinde tam ekran) */}
          <div className={`h-full min-w-0 w-full overflow-hidden ${mobileTab === 'queue' ? 'flex flex-1' : 'hidden'} md:hidden`}>
            <ErrorBoundary panelName="Evrak Kuyruğu" onReset={fetchDocuments}>
              <BatchQueue
                documents={documents}
                selectedDocId={selectedDocId}
                summary={summary}
                onSelectDoc={requestSelectDoc}
                onUploadFiles={handleUploadFiles}
                onDeleteDoc={handleDeleteDoc}
                onProcessDoc={handleProcessDoc}
                onLoadDemo={handleLoadDemo}
                onMergeDocuments={handleMergeDocuments}
                isUploading={isUploading}
              />
            </ErrorBoundary>
          </div>

          {/* Desktop Mod 1: Klasik Sabit 3 Sütun (lg ve üzeri ekranlar) */}
          {layoutMode === 'three-column' && (
            <div className="hidden lg:flex h-full min-w-0 w-64 xl:w-72 shrink-0 overflow-hidden border-r border-theme-subtle">
              <ErrorBoundary panelName="Evrak Kuyruğu" onReset={fetchDocuments}>
                <BatchQueue
                  documents={documents}
                  selectedDocId={selectedDocId}
                  summary={summary}
                  onSelectDoc={requestSelectDoc}
                  onUploadFiles={handleUploadFiles}
                  onDeleteDoc={handleDeleteDoc}
                  onProcessDoc={handleProcessDoc}
                  onLoadDemo={handleLoadDemo}
                  onMergeDocuments={handleMergeDocuments}
                  isUploading={isUploading}
                />
              </ErrorBoundary>
            </div>
          )}

          {/* Desktop Mod 2: Akıllı Çekmece (48px Mini Ray + Hover Peek Drawer) */}
          {layoutMode === 'collapsible-dock' && (
            <>
              {/* 48px Sabit Mini Ray */}
              <div className="hidden lg:flex h-full shrink-0">
                <CollapsibleDockRail
                  totalDocs={documents.length}
                  summary={summary}
                  onTriggerPeekOpen={handleTriggerPeekImmediate}
                  onTriggerPeekClose={handleSchedulePeekClose}
                  onUploadFiles={handleUploadFiles}
                />
              </div>

              {/* Arka Plan Cam Katmanı (Çekmece Açıkken) */}
              <div
                onClick={() => setIsQueuePeeking(false)}
                className={`hidden lg:block fixed inset-0 z-30 bg-black/20 backdrop-blur-[1px] peek-drawer-backdrop ${
                  isQueuePeeking ? 'is-active' : ''
                }`}
              />

              {/* Akıllı Çekmece Gövdesi (Floating Overlay Panel) */}
              <div
                onMouseEnter={handleCancelPeekClose}
                onMouseLeave={handleSchedulePeekClose}
                className={`hidden lg:flex absolute top-0 bottom-0 left-12 w-72 lg:w-80 z-40 bg-theme-surface/95 backdrop-blur-md border-r border-theme-strong shadow-2xl flex-col peek-drawer-panel ${
                  isQueuePeeking ? 'is-open' : ''
                }`}
                style={{
                  boxShadow: isQueuePeeking
                    ? 'inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 12px 0 36px -4px rgba(0, 0, 0, 0.7)'
                    : 'none',
                }}
              >
                {/* Çekmece Üst Başlığı & Sabitle / Kapat */}
                <div className="h-11 border-b border-theme-subtle px-3 flex items-center justify-between shrink-0 bg-theme-surface/90">
                  <div className="flex items-center space-x-2">
                    <Layers className="w-4 h-4 text-blue-400" />
                    <span className="text-xs font-bold text-theme-primary uppercase tracking-wider">
                      Evrak Kuyruğu ({documents.length})
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <button
                      type="button"
                      onClick={() => {
                        setLayoutMode('three-column');
                        setIsQueuePeeking(false);
                      }}
                      title="Çekmeceyi Sabitle (Sabit 3-Sütun Modu)"
                      className="p-1.5 rounded-md text-theme-muted hover:text-blue-400 hover:bg-theme-card transition-colors"
                    >
                      <Pin className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsQueuePeeking(false)}
                      title="Çekmeceyi Kapat (Esc)"
                      className="p-1.5 rounded-md text-theme-muted hover:text-theme-primary hover:bg-theme-card transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Kuyruk Listesi */}
                <div className="flex-1 overflow-hidden">
                  <ErrorBoundary panelName="Evrak Kuyruğu" onReset={fetchDocuments}>
                    <BatchQueue
                      documents={documents}
                      selectedDocId={selectedDocId}
                      summary={summary}
                      onSelectDoc={(id) => {
                        requestSelectDoc(id);
                      }}
                      onUploadFiles={handleUploadFiles}
                      onDeleteDoc={handleDeleteDoc}
                      onProcessDoc={handleProcessDoc}
                      onLoadDemo={handleLoadDemo}
                      onMergeDocuments={handleMergeDocuments}
                      isUploading={isUploading}
                    />
                  </ErrorBoundary>
                </div>
              </div>
            </>
          )}

          {/* 2. Sütun: Önizleme / Viewer (Desktop: Esnek dengeli orta sütun | Mobil/Tablet: 'viewer' sekmesinde tam ekran) */}
          <div className={`h-full min-w-0 w-full overflow-hidden ${mobileTab === 'viewer' ? 'flex flex-1' : 'hidden'} lg:flex lg:flex-1 relative`}>
            {/* Desktop Mod 3 (Süper Odak): Kuyruğu Açma Yüzer Butonu */}
            {layoutMode === 'focus-studio' && (
              <button
                type="button"
                onClick={() => setLayoutMode('collapsible-dock')}
                title="Kuyruğu Aç (Kısayol: [ )"
                className="absolute top-2.5 left-2.5 z-20 hidden lg:flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-theme-surface/90 hover:bg-theme-card text-theme-secondary hover:text-theme-primary border border-theme-subtle shadow-md backdrop-blur-sm text-xs font-medium transition-all group active:scale-95"
              >
                <Sidebar className="w-3.5 h-3.5 text-blue-400 group-hover:scale-110 transition-transform" />
                <span>Kuyruk</span>
                <span className="text-[10px] font-mono text-theme-muted bg-theme-panel px-1 py-0.2 rounded border border-theme-subtle">[</span>
              </button>
            )}

            <ErrorBoundary panelName="Evrak Önizleme Masası">
              <DocumentViewer
                document={selectedDoc}
                onRotatePersist={handleRotatePersist}
                onProcessDoc={handleProcessDoc}
                isProcessing={isProcessingCurrent}
                onZoomChange={setZoomLevel}
              />
            </ErrorBoundary>
          </div>

          {/* 3. Sütun: Düzenleme Formu / Editor (Desktop: Ferah sağ sütun | Mobil/Tablet: 'editor' sekmesinde tam ekran) */}
          <div className={`h-full min-w-0 w-full lg:w-[440px] xl:w-[480px] 2xl:w-[540px] shrink-0 overflow-hidden ${mobileTab === 'editor' ? 'flex flex-1' : 'hidden'} lg:flex border-l border-theme-subtle`}>
            <ErrorBoundary panelName="Doğrulama ve Düzenleme Formu">
              <DocumentEditor
                document={selectedDoc}
                onUpdateDocument={handleUpdateDocument}
                onProcessDocument={handleProcessDoc}
                onSelectNextDoc={handleSelectNextDoc}
                onDeleteDoc={handleDeleteDoc}
                onDirtyChange={setIsEditorDirty}
                isProcessing={isProcessingCurrent}
              />
            </ErrorBoundary>
          </div>
        </div>

        {/* Yönetici Kokpiti Görünümü */}
        {activeView === 'dashboard' && (
          <ErrorBoundary panelName="Yönetici Analitik Kokpiti">
            <React.Suspense
              fallback={
                <div className="flex-1 h-full flex items-center justify-center p-8 bg-theme-app text-theme-muted text-xs font-mono">
                  Yönetici Analitik Kokpiti Yükleniyor...
                </div>
              }
            >
              <ExecutiveDashboard
                documents={documents}
                summary={summary}
                theme={theme}
                onSwitchToStation={() => setActiveView('station')}
                onSelectDocument={(id) => {
                  requestSelectDoc(id);
                  setActiveView('station');
                }}
              />
            </React.Suspense>
          </ErrorBoundary>
        )}
      </div>

      {/* Mobil ve Tablet Alt Gezinme Çubuğu (Bottom Navigation Bar) - lg altında aktif, iOS Safe Area uyumlu */}
      {activeView === 'station' && (
        <div className="flex lg:hidden min-h-[56px] pb-safe bg-theme-surface border-t border-theme-subtle items-center justify-around px-2 shrink-0 z-30 shadow-lg">
          <button
            type="button"
            onClick={() => setMobileTab('queue')}
            className={`flex flex-col items-center justify-center py-1.5 px-3 min-h-[44px] min-w-[72px] rounded-xl transition-all active:scale-95 ${
              mobileTab === 'queue'
                ? 'text-blue-500 font-bold bg-blue-500/10'
                : 'text-theme-muted hover:text-theme-primary'
            }`}
          >
            <div className="relative">
              <Inbox className="w-5 h-5" />
              {summary.kuyrukta > 0 && (
                <span className="absolute -top-1 -right-2 bg-amber-500 text-white rounded-full text-[9px] w-4 h-4 flex items-center justify-center font-bold">
                  {summary.kuyrukta}
                </span>
              )}
            </div>
            <span className="text-[10px] mt-0.5">Kuyruk ({documents.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('viewer')}
            className={`flex flex-col items-center justify-center py-1.5 px-3 min-h-[44px] min-w-[72px] rounded-xl transition-all active:scale-95 ${
              mobileTab === 'viewer'
                ? 'text-blue-500 font-bold bg-blue-500/10'
                : 'text-theme-muted hover:text-theme-primary'
            }`}
          >
            <Eye className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Önizleme</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('editor')}
            className={`flex flex-col items-center justify-center py-1.5 px-3 min-h-[44px] min-w-[72px] rounded-xl transition-all active:scale-95 ${
              mobileTab === 'editor'
                ? 'text-blue-500 font-bold bg-blue-500/10'
                : 'text-theme-muted hover:text-theme-primary'
            }`}
          >
            <FileEdit className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Düzenle / Onayla</span>
          </button>
        </div>
      )}

      {/* İrsaliye İstasyonu Aktifken Masaüstü Durum Çubuğu */}
      {activeView === 'station' && (
        <div className="hidden lg:block">
          <StatusBar
            selectedDoc={selectedDoc}
            zoom={zoomLevel}
            isWsConnected={isWsConnected}
          />
        </div>
      )}

      {/* Modallar */}
      {/* Merkezi İstasyon & Sistem Ayarları Modalı */}
      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        layoutMode={layoutMode}
        onLayoutModeChange={(mode) => {
          setLayoutMode(mode);
          try {
            localStorage.setItem('doculog_layout_mode', mode);
          } catch (e) {}
        }}
        theme={theme}
        onThemeChange={(newTheme) => {
          setTheme(newTheme);
          try {
            localStorage.setItem('doculog_theme', newTheme);
          } catch (e) {}
        }}
        apiKeyStatus={apiKeyStatus}
        onApiKeySaved={fetchApiKeyStatus}
        onResetAllDocuments={handleResetAllDocuments}
        onClearAllDocuments={handleClearAll}
        onLoadDemoDocument={handleLoadDemo}
        onDocumentReceived={handleMobileDocumentReceived}
        initialTab={settingsInitialTab}
      />

      {/* Kaydedilmemiş Değişiklikler Uyarı Modalı */}
      {isUnsavedModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={handleCancelSwitch}
        >
          <div 
            className="w-full max-w-md bg-theme-surface border border-amber-500/30 rounded-xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-lg bg-amber-500/10 text-amber-400 shrink-0 border border-amber-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-theme-primary">
                  Kaydedilmemiş Değişiklikler Var
                </h3>
                <p className="text-xs text-theme-muted leading-relaxed">
                  Şu anki evrak üzerinde yaptığınız düzenlemeleri henüz kaydetmediniz. Başka bir evraka geçerseniz bu değişiklikler kaybolacaktır.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-theme-subtle">
              <button
                type="button"
                onClick={handleCancelSwitch}
                className="px-3.5 py-1.5 text-xs font-medium text-theme-muted hover:text-theme-primary bg-theme-panel hover:bg-theme-subtle rounded-lg border border-theme-subtle transition-colors"
              >
                Düzenlemeye Devam Et
              </button>
              <button
                type="button"
                onClick={handleDiscardAndSwitch}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-rose-600 hover:bg-rose-500 rounded-lg shadow-sm transition-colors"
              >
                Değişiklikleri Yoksay ve Geç
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
