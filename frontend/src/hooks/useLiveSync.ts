import { useEffect, useRef, useState, useCallback } from 'react';
import { documentApi } from '../services/api';
import { DocumentItem } from '../types/irsaliye';

export interface LiveSyncPayload {
  type: string;
  action?: string;
  document_id?: string;
  count?: number;
  session_id?: string;
  document?: DocumentItem;
  durum?: string;
}

interface UseLiveSyncOptions {
  onDocumentsUpdated: (payload?: LiveSyncPayload) => void;
  onDocumentUploaded?: (doc: DocumentItem) => void;
}

export const useLiveSync = ({
  onDocumentsUpdated,
  onDocumentUploaded,
}: UseLiveSyncOptions) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const pingIntervalRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const isMountedRef = useRef<boolean>(true);

  const onDocumentsUpdatedRef = useRef(onDocumentsUpdated);
  onDocumentsUpdatedRef.current = onDocumentsUpdated;

  const onDocumentUploadedRef = useRef(onDocumentUploaded);
  onDocumentUploadedRef.current = onDocumentUploaded;

  const clearTimers = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const closeExistingSocket = useCallback(() => {
    if (wsRef.current) {
      try {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        if (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING) {
          wsRef.current.close();
        }
      } catch (e) {
        // Ignore teardown error
      }
      wsRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!isMountedRef.current) return;

    // Teardown any existing socket before reconnecting
    closeExistingSocket();
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }

    try {
      const wsUrl = documentApi.getWebSocketUrl('global');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!isMountedRef.current) {
          ws.close();
          return;
        }
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);

        // Yeniden bağlanıldığında veritabanı durumunu hemen çekip senkronize et
        onDocumentsUpdatedRef.current?.({ type: 'DOCUMENTS_UPDATED', action: 'reconnect_sync' });

        // Start ping heartbeat every 20s
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
        }
        pingIntervalRef.current = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 20000);
      };

      ws.onmessage = (event) => {
        if (!isMountedRef.current) return;
        try {
          if (event.data === 'pong') return;
          const data: LiveSyncPayload = JSON.parse(event.data);

          if (
            data.type === 'DOCUMENTS_UPDATED' ||
            data.type === 'NEW_DOCUMENT_IN_QUEUE' ||
            data.type === 'QUEUE_STATUS_UPDATED'
          ) {
            onDocumentsUpdatedRef.current?.(data);
          } else if (data.type === 'DOCUMENT_UPLOADED') {
            if (data.document && onDocumentUploadedRef.current) {
              onDocumentUploadedRef.current(data.document);
            }
            onDocumentsUpdatedRef.current?.(data);
          }
        } catch (e) {
          // Ignore parse error or plain text message
        }
      };

      ws.onclose = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }

        // Exponential backoff reconnect
        if (!reconnectTimeoutRef.current && isMountedRef.current) {
          reconnectAttemptsRef.current += 1;
          const delay = Math.min(1000 * Math.pow(1.4, reconnectAttemptsRef.current), 10000);
          reconnectTimeoutRef.current = window.setTimeout(() => {
            reconnectTimeoutRef.current = null;
            if (isMountedRef.current) {
              connect();
            }
          }, delay);
        }
      };

      ws.onerror = () => {
        if (!isMountedRef.current) return;
        setIsConnected(false);
        try {
          ws.close();
        } catch (e) {
          // Ignore
        }
      };
    } catch (err) {
      if (!isMountedRef.current) return;
      setIsConnected(false);
      if (!reconnectTimeoutRef.current && isMountedRef.current) {
        reconnectAttemptsRef.current += 1;
        const delay = Math.min(2000 * reconnectAttemptsRef.current, 10000);
        reconnectTimeoutRef.current = window.setTimeout(() => {
          reconnectTimeoutRef.current = null;
          if (isMountedRef.current) {
            connect();
          }
        }, delay);
      }
    }
  }, [closeExistingSocket]);

  useEffect(() => {
    isMountedRef.current = true;
    connect();

    return () => {
      isMountedRef.current = false;
      clearTimers();
      closeExistingSocket();
    };
  }, [connect, clearTimers, closeExistingSocket]);

  return { isConnected };
};
