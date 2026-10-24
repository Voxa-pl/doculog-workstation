/**
 * DocuLog Workstation - Çevrimdışı Ambar Tamponu (Offline Storage Buffer)
 * Ambar metal çatısı altında veya kör noktalarda WiFi kesildiğinde
 * evrak yükleme işlemlerini yerel tamponda saklar ve bağlantı geldiğinde otomatik eşitler.
 */

export interface OfflinePendingDoc {
  id: string;
  fileName: string;
  fileSize: number;
  base64Data: string;
  mimeType: string;
  capturedAt: string;
}

const STORAGE_KEY = 'doculog_offline_buffer_v1';

export const offlineBuffer = {
  isOnline: (): boolean => {
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  },

  getPendingDocuments: (): OfflinePendingDoc[] => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw);
    } catch {
      return [];
    }
  },

  saveDocument: async (file: File): Promise<OfflinePendingDoc> => {
    const base64Data = await fileToBase64(file);
    const item: OfflinePendingDoc = {
      id: 'offline-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      fileName: file.name,
      fileSize: file.size,
      base64Data,
      mimeType: file.type || 'image/jpeg',
      capturedAt: new Date().toISOString()
    };

    const existing = offlineBuffer.getPendingDocuments();
    existing.push(item);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch (e) {
      console.warn('Offline depolama kotası doldu:', e);
    }
    window.dispatchEvent(new CustomEvent('doculog-offline-count-changed', { detail: existing.length }));
    return item;
  },

  removeDocument: (id: string): void => {
    const existing = offlineBuffer.getPendingDocuments().filter(doc => doc.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    window.dispatchEvent(new CustomEvent('doculog-offline-count-changed', { detail: existing.length }));
  },

  clearAll: (): void => {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent('doculog-offline-count-changed', { detail: 0 }));
  },

  getCount: (): number => {
    return offlineBuffer.getPendingDocuments().length;
  },

  /**
   * Çevrimdışı tamponu sunucuya aktarır (flush)
   */
  flushPending: async (uploadFn: (file: File) => Promise<any>): Promise<{ synced: number; failed: number }> => {
    const pending = offlineBuffer.getPendingDocuments();
    if (pending.length === 0) return { synced: 0, failed: 0 };

    let synced = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        const file = base64ToFile(item.base64Data, item.fileName, item.mimeType);
        await uploadFn(file);
        offlineBuffer.removeDocument(item.id);
        synced++;
      } catch (err) {
        console.error('Tampon evrak aktarılamadı:', item.fileName, err);
        failed++;
      }
    }

    return { synced, failed };
  }
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}

function base64ToFile(base64: string, filename: string, mimeType: string): File {
  const arr = base64.split(',');
  const bstr = atob(arr[1] || arr[0]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mimeType });
}
