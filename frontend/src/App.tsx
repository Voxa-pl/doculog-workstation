import React, { useState, useEffect, useCallback } from 'react';
import { 
  DocumentItem, 
  BatchSummary, 
  ApiKeyStatus,
  AppTheme,
  AppView
} from './types/irsaliye';
import { documentApi } from './services/api';
import { HeaderBar } from './components/common/HeaderBar';
import { StatusBar } from './components/common/StatusBar';
import { ApiKeyModal } from './components/common/ApiKeyModal';
import { QrBridgeModal } from './components/common/QrBridgeModal';
import { BatchQueue } from './components/queue/BatchQueue';
import { DocumentViewer } from './components/viewer/DocumentViewer';
import { DocumentEditor } from './components/editor/DocumentEditor';
import { ExecutiveDashboard } from './components/dashboard/ExecutiveDashboard';

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

  // View Navigation and Theme states
  const [activeView, setActiveView] = useState<AppView>('station');
  const [theme, setTheme] = useState<AppTheme>(() => {
    return (localStorage.getItem('doculog_theme') as AppTheme) || 'koyu-kurumsal';
  });

  // Apply data-theme attribute to DOM root and body
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem('doculog_theme', theme);
  }, [theme]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res = await documentApi.getDocuments();
      if (res.documents.length === 0) {
        try {
          const demoDoc = await documentApi.loadDemoDocument();
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
        } catch (e) {
          console.warn('Demo yüklenemedi:', e);
        }
      }

      setDocuments(res.documents);
      setSummary(res.summary);
      if (res.documents.length > 0 && !selectedDocId) {
        setSelectedDocId(res.documents[0].id);
      }
    } catch (err) {
      console.error('Kuyruk yüklenemedi:', err);
    }
  }, [selectedDocId]);

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
      const newItems = await documentApi.uploadFiles(files);
      await fetchDocuments();
      if (newItems.length > 0) {
        setSelectedDocId(newItems[0].id);
      }
    } catch (err) {
      console.error('Yükleme hatası:', err);
      alert('Dosyalar yüklenirken bir hata oluştu.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcessDoc = async (id: string) => {
    setIsProcessingCurrent(true);
    try {
      const updated = await documentApi.processDocument(id);
      setDocuments((prev) => prev.map((d) => (d.id === id ? updated : d)));
      await fetchDocuments();
    } catch (err) {
      console.error('İşlem hatası:', err);
      alert('Evrak işlenirken bir hata oluştu.');
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
      alert('Toplu işlem sırasında bir hata oluştu.');
    } finally {
      setIsProcessingBatch(false);
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      await documentApi.deleteDocument(id);
      setDocuments((prev) => {
        const next = prev.filter((d) => d.id !== id);
        if (selectedDocId === id) {
          setSelectedDocId(next.length > 0 ? next[0].id : null);
        }
        return next;
      });
      await fetchDocuments();
    } catch (err) {
      console.error('Silme hatası:', err);
    }
  };

  const handleClearAll = async () => {
    if (!window.confirm('Tüm evrak kuyruğunu temizlemek istediğinize emin misiniz?')) return;
    try {
      await documentApi.clearAll();
      setDocuments([]);
      setSelectedDocId(null);
      await fetchDocuments();
    } catch (err) {
      console.error('Temizleme hatası:', err);
    }
  };

  const handleLoadDemo = async () => {
    setIsUploading(true);
    try {
      const demoDoc = await documentApi.loadDemoDocument();
      await fetchDocuments();
      setSelectedDocId(demoDoc.id);
    } catch (err) {
      console.error('Demo yükleme hatası:', err);
    } finally {
      setIsUploading(false);
    }
  };

  const handleMergeDocuments = async (targetId: string, sourceIds: string[]) => {
    try {
      const merged = await documentApi.mergeDocuments(targetId, sourceIds);
      await fetchDocuments();
      setSelectedDocId(merged.id);
    } catch (err) {
      console.error('Birleştirme hatası:', err);
      alert('Sayfalar birleştirilirken bir hata oluştu.');
    }
  };

  const handleRotatePersist = async (derece: number) => {
    if (!selectedDocId) return;
    try {
      const updated = await documentApi.rotateDocument(selectedDocId, derece);
      setDocuments((prev) => prev.map((d) => (d.id === selectedDocId ? updated : d)));
    } catch (err) {
      console.error('Döndürme hatası:', err);
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
    handleProcessDoc(doc.id);
  };

  return (
    <div
      data-theme={theme}
      className="h-screen w-screen flex flex-col bg-theme-app text-theme-primary overflow-hidden font-sans transition-colors duration-200"
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

      {/* Ana Çalışma Alanı: DOM State Preservation ile İstasyon ve Kokpit Geçişi */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* İstasyon Görünümü: DOM'dan silinmez; gizlendiğinde form, zoom ve kuyruk durumu %100 korunur */}
        <div className={`flex-1 flex overflow-hidden ${activeView === 'station' ? 'flex' : 'hidden'}`}>
          <BatchQueue
            documents={documents}
            selectedDocId={selectedDocId}
            summary={summary}
            onSelectDoc={(id) => setSelectedDocId(id)}
            onUploadFiles={handleUploadFiles}
            onDeleteDoc={handleDeleteDoc}
            onProcessDoc={handleProcessDoc}
            onLoadDemo={handleLoadDemo}
            onMergeDocuments={handleMergeDocuments}
            isUploading={isUploading}
          />

          <DocumentViewer
            document={selectedDoc}
            onRotatePersist={handleRotatePersist}
            onProcessDoc={handleProcessDoc}
            isProcessing={isProcessingCurrent}
            onZoomChange={setZoomLevel}
          />

          <DocumentEditor
            document={selectedDoc}
            onUpdateDocument={handleUpdateDocument}
            onProcessDocument={handleProcessDoc}
            onSelectNextDoc={handleSelectNextDoc}
            isProcessing={isProcessingCurrent}
          />
        </div>

        {/* Yönetici Kokpiti Görünümü */}
        {activeView === 'dashboard' && (
          <ExecutiveDashboard
            documents={documents}
            summary={summary}
            theme={theme}
            onSwitchToStation={() => setActiveView('station')}
            onSelectDocument={(id) => setSelectedDocId(id)}
          />
        )}
      </div>

      {/* İrsaliye İstasyonu Aktifken Durum Çubuğu */}
      {activeView === 'station' && (
        <StatusBar
          selectedDoc={selectedDoc}
          zoom={zoomLevel}
        />
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
