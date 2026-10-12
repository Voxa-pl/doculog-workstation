import React, { useState } from 'react';
import { Settings, X, Check } from 'lucide-react';
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
      setTimeout(() => {
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">Sistem Ayarları</h2>
              <p className="text-xs text-slate-400">API Yapılandırması</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-md hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="text-xs text-slate-300 bg-slate-950/60 border border-slate-800/80 p-3 rounded-lg space-y-1">
            <p className="text-slate-300 font-medium">API Yapılandırması</p>
            <p className="text-slate-400">
              Evrak işleme servisi için API anahtarınızı tanımlayın.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-slate-300">
                API Anahtarı
              </label>
              {currentMaskedKey && (
                <span className="text-[11px] font-mono text-slate-400">
                  Mevcut: {currentMaskedKey}
                </span>
              )}
            </div>
            <input
              type="password"
              placeholder="API anahtarınızı girin..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors font-mono"
              autoFocus
            />
          </div>

          {message && (
            <div className="flex items-center space-x-1.5 text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2 rounded text-xs">
              <Check className="w-3.5 h-3.5" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2 rounded text-xs">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end space-x-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
            >
              İptal
            </button>
            <button
              type="submit"
              disabled={isSaving || !apiKey.trim()}
              className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-md shadow-sm transition-all"
            >
              {isSaving ? 'Kaydediliyor...' : 'Kaydet'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
