import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  DocumentItem, 
  BatchSummary, 
  ApiKeyStatus,
  AppTheme,
  AppView,
  MobileTab
} from './types/irsaliye';
import { documentApi } from './services/api';
import { useLiveSync } from './hooks/useLiveSync';
import { HeaderBar } from './components/common/HeaderBar';
import { StatusBar } from './components/common/StatusBar';
import { ApiKeyModal } from './components/common/ApiKeyModal';
import { QrBridgeModal } from './components/common/QrBridgeModal';
import { BatchQueue } from './components/queue/BatchQueue';
import { DocumentViewer } from './components/viewer/DocumentViewer';
import { DocumentEditor } from './components/editor/DocumentEditor';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { 
  Inbox, 
  Eye, 
  FileEdit, 
  Layers
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
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);
  const [isQrBridgeModalOpen, setIsQrBridgeModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [isProcessingCurrent, setIsProcessingCurrent] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);

  // View Navigation, Theme and Mobile Navigation states
  const [activeView, setActiveView] = useState<AppView>('station');
  const [mobileTab, setMobileTab] = useState<MobileTab>('queue');
  const [theme, setTheme] = useState<AppTheme>(() => {
    return (localStorage.getItem('doculog_theme') as AppTheme) || 'koyu-kurumsal';
  });

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

  const { isConnected: isWsConnected } = useLiveSync({
    onDocumentsUpdated: useCallback((payload: any) => {
      fetchDocuments();
    }, [fetchDocuments]),
    onDocumentUploaded: useCallback((doc: DocumentItem) => {
      setSelectedDocId(doc.id);
      setMobileTab('viewer');
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

  const handleUploadFiles = async (files: File[]) => {
    setIsUploading(true);
    try {
      const uploaded = await documentApi.uploadFiles(files);
      setDocuments((prev) => [...uploaded, ...prev]);
      if (uploaded.length > 0) {
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

  const handleSelectDocMobile = (id: string) => {
    setSelectedDocId(id);
    // Mobilde belge seçilince doğrudan önizleme veya düzenlemeye yönlendir
    setMobileTab('viewer');
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

  const handleSelectNextDoc = () => {
    const currentIndex = documents.findIndex((d) => d.id === selectedDocId);
    if (currentIndex >= 0 && currentIndex < documents.length - 1) {
      setSelectedDocId(documents[currentIndex + 1].id);
    }
  };

  const handleExportBatchExcel = () => {
    window.open(documentApi.getBatchExcelUrl(), '_blank');
  };

  const handleMobileDocumentReceived = (doc: DocumentItem) => {
    setDocuments((prev) => {
      const exists = prev.some((d) => d.id === doc.id);
      if (exists) return prev;
      return [doc, ...prev];
    });
    setSelectedDocId(doc.id);
    setSummary((prev) => ({
      ...prev,
      toplam_belge: prev.toplam_belge + 1,
      kuyrukta: prev.kuyrukta + 1,
    }));
    setMobileTab('viewer');
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
        onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)}
        onOpenQrBridgeModal={() => setIsQrBridgeModalOpen(true)}
        onProcessAll={handleProcessAll}
        onClearAll={handleClearAll}
        onExportBatchExcel={handleExportBatchExcel}
        isProcessingBatch={isProcessingBatch}
        activeView={activeView}
        onViewChange={setActiveView}
        theme={theme}
        onThemeChange={setTheme}
      />

      {/* Ana Çalışma Alanı: Desktop 3-Sütun / Mobil Tek Sütun Tab Değişimi */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* İstasyon Görünümü */}
        <div className={`flex-1 flex flex-col md:flex-row overflow-hidden ${activeView === 'station' ? 'flex' : 'hidden'}`}>
          
          {/* 1. Sütun: Kuyruk (Desktop: Her zaman sol sütun | Mobil: 'queue' sekmesinde tam ekran) */}
          <div className={`h-full min-w-0 w-full md:w-auto overflow-hidden ${mobileTab === 'queue' ? 'flex flex-1' : 'hidden'} md:flex md:flex-none`}>
            <ErrorBoundary panelName="Evrak Kuyruğu" onReset={fetchDocuments}>
              <BatchQueue
                documents={documents}
                selectedDocId={selectedDocId}
                summary={summary}
                onSelectDoc={handleSelectDocMobile}
                onUploadFiles={handleUploadFiles}
                onDeleteDoc={handleDeleteDoc}
                onProcessDoc={handleProcessDoc}
                onLoadDemo={handleLoadDemo}
                onMergeDocuments={handleMergeDocuments}
                isUploading={isUploading}
              />
            </ErrorBoundary>
          </div>

          {/* 2. Sütun: Önizleme / Viewer (Desktop: Orta sütun | Mobil: 'viewer' sekmesinde tam ekran) */}
          <div className={`h-full min-w-0 w-full overflow-hidden ${mobileTab === 'viewer' ? 'flex flex-1' : 'hidden'} md:flex md:flex-1`}>
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

          {/* 3. Sütun: Düzenleme Formu / Editor (Desktop: Sağ sütun | Mobil: 'editor' sekmesinde tam ekran) */}
          <div className={`h-full min-w-0 w-full md:w-auto overflow-hidden ${mobileTab === 'editor' ? 'flex flex-1' : 'hidden'} md:flex md:flex-none`}>
            <ErrorBoundary panelName="Doğrulama ve Düzenleme Formu">
              <DocumentEditor
                document={selectedDoc}
                onUpdateDocument={handleUpdateDocument}
                onProcessDocument={handleProcessDoc}
                onSelectNextDoc={handleSelectNextDoc}
                isProcessing={isProcessingCurrent}
              />
            </ErrorBoundary>
          </div>
        </div>

        {/* Yönetici Kokpiti Görünümü */}
        {activeView === 'dashboard' && (
          <ErrorBoundary panelName="Yönetici Analitik Kokpiti">
            <ExecutiveDashboard
              documents={documents}
              summary={summary}
              theme={theme}
              onSwitchToStation={() => setActiveView('station')}
              onSelectDocument={(id) => {
                setSelectedDocId(id);
                setActiveView('station');
                setMobileTab('viewer');
              }}
            />
          </ErrorBoundary>
        )}
      </div>

      {/* Mobil Alt Gezinme Çubuğu (Bottom Navigation Bar) - Sadece İstasyon Aktifken */}
      {activeView === 'station' && (
        <div className="flex md:hidden h-14 bg-theme-surface border-t border-theme-subtle items-center justify-around px-2 shrink-0 z-30 shadow-lg">
          <button
            type="button"
            onClick={() => setMobileTab('queue')}
            className={`flex flex-col items-center justify-center py-1 px-3 min-h-[44px] min-w-[70px] rounded-lg transition-all active:scale-95 ${
              mobileTab === 'queue'
                ? 'text-blue-500 font-bold'
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
            className={`flex flex-col items-center justify-center py-1 px-3 min-h-[44px] min-w-[70px] rounded-lg transition-all active:scale-95 ${
              mobileTab === 'viewer'
                ? 'text-blue-500 font-bold'
                : 'text-theme-muted hover:text-theme-primary'
            }`}
          >
            <Eye className="w-5 h-5" />
            <span className="text-[10px] mt-0.5">Önizleme</span>
          </button>

          <button
            type="button"
            onClick={() => setMobileTab('editor')}
            className={`flex flex-col items-center justify-center py-1 px-3 min-h-[44px] min-w-[70px] rounded-lg transition-all active:scale-95 ${
              mobileTab === 'editor'
                ? 'text-blue-500 font-bold'
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
        <div className="hidden md:block">
          <StatusBar
            selectedDoc={selectedDoc}
            zoom={zoomLevel}
            isWsConnected={isWsConnected}
          />
        </div>
      )}

      {/* Modallar */}
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={() => setIsApiKeyModalOpen(false)}
        onSaved={fetchApiKeyStatus}
        currentMaskedKey={apiKeyStatus?.masked_key}
      />

      <QrBridgeModal
        isOpen={isQrBridgeModalOpen}
        onClose={() => setIsQrBridgeModalOpen(false)}
        onDocumentReceived={handleMobileDocumentReceived}
      />
    </div>
  );
};
