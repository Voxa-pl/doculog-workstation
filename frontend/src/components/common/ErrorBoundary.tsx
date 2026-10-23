import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertOctagon, RefreshCw, AlertTriangle, ChevronDown, ChevronUp, Home } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  panelName?: string;
  title?: string;
  description?: string;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('ErrorBoundary yakaladı:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    });
    this.props.onReset?.();
  };

  public handleReloadPage = (): void => {
    window.location.reload();
  };

  public toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { panelName, title, description } = this.props;
      const isPanel = Boolean(panelName);

      // Panel içi (Widget/Sütun) hata görünümü
      if (isPanel) {
        return (
          <div
            data-testid={`error-boundary-${panelName?.toLowerCase().replace(/\s+/g, '-')}`}
            className="h-full w-full flex flex-col items-center justify-center p-6 text-center bg-slate-950/90 border border-rose-500/30 rounded-xl overflow-hidden select-none m-1"
          >
            <div className="w-12 h-12 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3 shadow-lg shadow-rose-500/10">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <h3 className="text-sm font-bold text-white mb-1">
              {title || `${panelName} Yüklenirken Bir Hata Oluştu`}
            </h3>

            <p className="text-xs text-slate-400 max-w-sm mb-4 leading-relaxed">
              {description || 'Bu panel render edilirken beklenmeyen bir JavaScript hatası meydana geldi. Panel durumunu sıfırlayarak kurtarabilirsiniz.'}
            </p>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={this.handleReset}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-md shadow-blue-600/20 transition-all active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Paneli Yeniden Dene</span>
              </button>

              <button
                type="button"
                onClick={this.toggleDetails}
                className="flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors"
              >
                <span>Hata Detayı</span>
                {this.state.showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>
            </div>

            {this.state.showDetails && this.state.error && (
              <div className="mt-4 w-full max-w-md text-left bg-slate-900 border border-slate-800 rounded-lg p-3 text-[11px] font-mono text-rose-300 overflow-x-auto max-h-40">
                <div className="font-bold mb-1 text-rose-400">{this.state.error.name}: {this.state.error.message}</div>
                {this.state.error.stack && (
                  <pre className="text-[10px] text-slate-400 whitespace-pre-wrap leading-tight">
                    {this.state.error.stack.slice(0, 500)}
                  </pre>
                )}
              </div>
            )}
          </div>
        );
      }

      // Tüm sayfa / Uygulama seviyesi şık kurtarma ekranı
      return (
        <div
          data-testid="error-boundary-root"
          className="h-screen w-screen flex flex-col items-center justify-center p-6 bg-slate-950 text-slate-100 select-none overflow-hidden"
        >
          <div className="max-w-md w-full bg-slate-900/90 border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-2xl flex flex-col items-center text-center backdrop-blur-md">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border-2 border-rose-500/30 flex items-center justify-center text-rose-500 mb-4 shadow-xl shadow-rose-500/10 animate-in zoom-in-95 duration-200">
              <AlertOctagon className="w-8 h-8" />
            </div>

            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/20 mb-2">
              Uygulama Hata Yakalayıcısı
            </span>

            <h2 className="text-xl font-bold text-white mb-2">
              {title || 'DocuLog Workstation Beklenmeyen Bir Hatayla Karşılaştı'}
            </h2>

            <p className="text-xs text-slate-400 mb-6 leading-relaxed">
              {description ||
                'Arayüz çalışırken beklenmeyen bir hata tespit edildi. Verileriniz güvendedir; uygulamayı sıfırlayabilir veya sayfayı yenileyebilirsiniz.'}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full">
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-600/20 transition-all active:scale-95 min-h-[42px]"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Uygulamayı Sıfırla</span>
              </button>

              <button
                type="button"
                onClick={this.handleReloadPage}
                className="w-full sm:w-auto flex-1 flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-all active:scale-95 min-h-[42px]"
              >
                <Home className="w-4 h-4" />
                <span>Sayfayı Yenile</span>
              </button>
            </div>

            <button
              type="button"
              onClick={this.toggleDetails}
              className="mt-4 text-[11px] text-slate-500 hover:text-slate-300 inline-flex items-center space-x-1 transition-colors"
            >
              <span>{this.state.showDetails ? 'Teknik detayları gizle' : 'Teknik detayları göster'}</span>
              {this.state.showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            {this.state.showDetails && this.state.error && (
              <div className="mt-4 w-full text-left bg-slate-950 border border-slate-800 rounded-lg p-3 text-[10px] font-mono text-rose-300 overflow-x-auto max-h-48 break-words">
                <div className="font-bold text-rose-400 mb-1">{this.state.error.toString()}</div>
                {this.state.error.stack && (
                  <pre className="text-slate-400 whitespace-pre-wrap leading-tight text-[9px]">
                    {this.state.error.stack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
