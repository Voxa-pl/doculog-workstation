import React, { useState, useRef, useEffect } from 'react';
import { Settings, X, Check, Key } from 'lucide-react';
import { documentApi } from '../../services/api';

export interface ApiKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  currentMaskedKey?: string;
}

export const ApiKeyModal: React.FC<ApiKeyModalProps> = ({
  isOpen,
  onClose,
  onSaved,
  currentMaskedKey,
}) => {
  const [apiKey, setApiKey] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) return;

    setIsSaving(true);
    setMessage(null);
    setError(null);

    try {
      await documentApi.saveApiKey(apiKey.trim());
      setMessage('API anahtarı başarıyla kaydedildi.');
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => {
        onSaved();
        onClose();
      }, 750);
    } catch (err: any) {
      if (!err?.response) {
        setError('Sunucu bağlantısı sağlanamadı (Port 8000).');
      } else {
        setError(err?.response?.data?.detail || 'API anahtarı kaydedilemedi.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-theme-surface border border-theme-subtle rounded-2xl max-w-md w-full shadow-2xl overflow-hidden min-w-0">
        <div className="px-5 py-4 border-b border-theme-subtle flex items-center justify-between min-w-0 bg-theme-surface">
          <div className="flex items-center space-x-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <Key className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-theme-primary truncate">Sistem Ayarları</h2>
              <p className="text-xs text-theme-muted truncate">Merkezi Belge Okuma Servis Bağlantısı</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-theme-muted hover:text-theme-primary p-1.5 rounded-lg hover:bg-theme-card transition-colors shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="text-xs text-theme-secondary bg-theme-card border border-theme-subtle p-3 rounded-xl space-y-1">
            <p className="text-theme-primary font-semibold">Servis Bağlantı Yapılandırması</p>
            <p className="text-theme-muted">
              İrsaliye ve sevk evraklarının otomatik okunabilmesi için sistem lisans ve servis anahtarınızı tanımlayınız.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 min-w-0">
              <label className="text-xs font-medium text-theme-secondary truncate">
                API Anahtarı
              </label>
              {currentMaskedKey && (
                <span className="text-[11px] font-mono text-emerald-400/90 truncate shrink-0">
                  Mevcut: {currentMaskedKey}
                </span>
              )}
            </div>
            <input
              type="password"
              placeholder="AIzaSy..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-theme-card border border-theme-subtle rounded-lg px-3 py-2 text-xs text-theme-primary placeholder-theme-muted focus:outline-none focus:border-blue-500 transition-colors font-mono"
              autoFocus
            />
          </div>

          {message && (
            <div className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-lg text-xs">
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg text-xs break-words">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-theme-subtle">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-semibold text-theme-secondary hover:text-theme-primary rounded-lg hover:bg-theme-card transition-colors border border-theme-subtle"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSaving || !apiKey.trim()}
              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-lg shadow-sm transition-all"
            >
              {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
