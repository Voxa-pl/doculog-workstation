import axios from 'axios';
import { 
  DocumentItem, 
  QueueResponse, 
  ApiKeyStatus, 
  IrsaliyeHeader, 
  LineItem, 
  ProcessingStatus,
  QrBridgeInfo,
  DashboardMetrics
} from '../types/irsaliye';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
});

export const documentApi = {
  getDocuments: async (): Promise<QueueResponse> => {
    const res = await api.get<QueueResponse>('/documents');
    return res.data;
  },

  getDocument: async (id: string): Promise<DocumentItem> => {
    const res = await api.get<DocumentItem>(`/documents/${id}`);
    return res.data;
  },

  uploadFiles: async (files: File[]): Promise<DocumentItem[]> => {
    const formData = new FormData();
    files.forEach((file) => formData.append('files', file));
    const res = await api.post<DocumentItem[]>('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data;
  },

  processDocument: async (id: string): Promise<DocumentItem> => {
    const res = await api.post<DocumentItem>(`/documents/${id}/process`);
    return res.data;
  },

  processAllDocuments: async (): Promise<{ mesaj: string; islenen_adet: number }> => {
    const res = await api.post('/batch/process-all');
    return res.data;
  },

  resetAllDocuments: async (): Promise<{ mesaj: string; sifirlanan_adet: number }> => {
    const res = await api.post('/documents/reset-all');
    return res.data;
  },

  loadDemoDocument: async (): Promise<DocumentItem> => {
    const res = await api.post<DocumentItem>('/demo/load');
    return res.data;
  },

  mergeDocuments: async (targetDocId: string, sourceDocIds: string[]): Promise<DocumentItem> => {
    const res = await api.post<DocumentItem>('/documents/merge', {
      target_doc_id: targetDocId,
      source_doc_ids: sourceDocIds,
    });
    return res.data;
  },


  rotateDocument: async (id: string, derece: number = 90, sayfa_indeksi: number = 0): Promise<DocumentItem> => {
    const res = await api.post<DocumentItem>(`/documents/${id}/rotate`, { derece, sayfa_indeksi });
    return res.data;
  },

  updateDocumentData: async (
    id: string,
    payload: {
      header?: IrsaliyeHeader;
      kalemler?: LineItem[];
      genel_toplam_miktar?: number | null;
      genel_notlar?: string | null;
      durum?: ProcessingStatus;
    }
  ): Promise<DocumentItem> => {
    const res = await api.put<DocumentItem>(`/documents/${id}`, payload);
    return res.data;
  },

  deleteDocument: async (id: string): Promise<void> => {
    await api.delete(`/documents/${id}`);
  },

  clearAll: async (): Promise<void> => {
    await api.delete('/documents');
  },

  reconcilePo: async (docId: string): Promise<any> => {
    const res = await api.get(`/documents/${docId}/reconcile-po`);
    return res.data;
  },

  getGibQrVerification: async (docId: string): Promise<any> => {
    const res = await api.get(`/documents/${docId}/gib-qr`);
    return res.data;
  },

  getUetdsPayload: async (docId: string): Promise<any> => {
    const res = await api.get(`/documents/${docId}/uetds-payload`);
    return res.data;
  },

  deskewDocument: async (id: string): Promise<{ success: boolean; corrected: boolean; details: any; document: DocumentItem }> => {
    const res = await api.post(`/documents/${id}/deskew`);
    return res.data;
  },

  getErpLint: async (id: string): Promise<any> => {
    const res = await api.get(`/documents/${id}/erp-lint`);
    return res.data;
  },

  getSingleExcelUrl: (id: string) => `/api/documents/${id}/export-excel`,
  getSingleLogoXmlUrl: (id: string) => `/api/documents/${id}/export-logo-xml`,
  getSingleJsonUrl: (id: string) => `/api/documents/${id}/export-json`,
  getBatchExcelUrl: () => `/api/batch/export-excel`,
  getBatchLogoXmlUrl: () => `/api/batch/export-logo-xml`,
  getBatchJsonUrl: () => `/api/batch/export-json`,

  getApiKeyStatus: async (): Promise<ApiKeyStatus> => {
    const res = await api.get<ApiKeyStatus>('/settings/api-key');
    return res.data;
  },

  saveApiKey: async (apiKey: string): Promise<{ mesaj: string; is_configured: boolean }> => {
    const res = await api.post('/settings/api-key', { api_key: apiKey });
    return res.data;
  },

  getQrUrl: async (sessionId?: string): Promise<QrBridgeInfo> => {
    const url = sessionId ? `/qr-url?session_id=${sessionId}` : '/qr-url';
    const res = await api.get<QrBridgeInfo>(url);
    return res.data;
  },

  getWebSocketUrl: (sessionId: string): string => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    return `${protocol}//${host}/ws/${sessionId}`;
  },
};

export const analyticsApi = {
  getDashboardMetrics: async (): Promise<DashboardMetrics> => {
    const res = await api.get<DashboardMetrics>('/analytics');
    return res.data;
  },

  getExportReportUrl: (): string => '/api/analytics/export-report',
  exportExecutiveReportUrl: (): string => '/api/analytics/export-report',
};

export const systemApi = {
  createBackup: async (): Promise<any> => {
    const res = await api.post('/system/backup/create');
    return res.data;
  },

  getBackupStatus: async (): Promise<any> => {
    const res = await api.get('/system/backup/status');
    return res.data;
  },

  getBackupDownloadUrl: (filename: string): string => {
    return `/api/system/backup/download/${encodeURIComponent(filename)}`;
  },
};
