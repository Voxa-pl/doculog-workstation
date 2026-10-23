import React from 'react';
import { IrsaliyeHeader } from '../../types/irsaliye';
import { 
  Building2, 
  MapPin, 
  Truck, 
  Hash
} from 'lucide-react';

interface HeaderFormProps {
  header?: IrsaliyeHeader | null;
  onChange: (updatedHeader: IrsaliyeHeader) => void;
  fieldConfidences?: Record<string, number> | null;
}

export const HeaderForm: React.FC<HeaderFormProps> = ({ 
  header, 
  onChange,
  fieldConfidences = {}
}) => {
  const currentHeader: IrsaliyeHeader = header || {};
  const safeConfidences = fieldConfidences || {};

  const handleChange = (field: keyof IrsaliyeHeader, value: string) => {
    onChange({
      ...currentHeader,
      [field]: value.trim() === '' ? null : value,
    });
  };

  const getFieldStatus = (field: keyof IrsaliyeHeader, rawValue?: string | null) => {
    const rawConf = safeConfidences[field];
    const conf = typeof rawConf === 'number' && Number.isFinite(rawConf) ? rawConf : undefined;
    const value = rawValue != null ? String(rawValue) : '';
    const isCritical = ['irsaliye_no', 'duzenleme_tarihi', 'gonderici_vkn', 'alici_unvan'].includes(field);
    const isMissing = isCritical && !value.trim();

    if (isMissing || (conf !== undefined && conf < 0.60)) {
      return {
        borderClass: 'border-rose-500/80 bg-rose-500/5 focus:border-rose-500 ring-1 ring-rose-500/30',
        badgeClass: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
        text: conf !== undefined ? `%${Math.round(conf * 100)}` : 'Eksik',
        isSuspicious: true
      };
    }

    if (conf !== undefined && conf < 0.80) {
      return {
        borderClass: 'border-amber-500/80 bg-amber-500/5 focus:border-amber-500 ring-1 ring-amber-500/20',
        badgeClass: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
        text: `%${Math.round(conf * 100)}`,
        isSuspicious: true
      };
    }

    return {
      borderClass: 'border-theme-subtle focus:border-blue-500',
      badgeClass: 'text-emerald-400/80 bg-emerald-500/10 border-emerald-500/20',
      text: conf !== undefined ? `%${Math.round(conf * 100)}` : null,
      isSuspicious: false
    };
  };

  const renderInputField = (
    label: string,
    field: keyof IrsaliyeHeader,
    placeholder: string = '',
    className: string = ''
  ) => {
    const rawValue = currentHeader[field];
    const value = rawValue != null ? String(rawValue) : '';
    const status = getFieldStatus(field, value);

    return (
      <div className={`min-w-0 ${className}`}>
        <div className="flex items-center justify-between mb-1 gap-1">
          <label className="text-[10px] text-theme-muted font-medium truncate block min-w-0" title={label}>
            {label}
          </label>
          {status.text && (
            <span className={`text-[9px] font-mono px-1 py-0.2 rounded border font-semibold shrink-0 ${status.badgeClass}`}>
              {status.text}
            </span>
          )}
        </div>
        <input
          type="text"
          value={value}
          onChange={(e) => handleChange(field, e.target.value)}
          placeholder={placeholder}
          data-suspicious={status.isSuspicious ? 'true' : undefined}
          className={`w-full bg-theme-surface border rounded-md px-2.5 py-1.5 text-xs text-theme-primary transition-all outline-none min-h-[34px] truncate ${status.borderClass}`}
        />
      </div>
    );
  };

  const sevkTarihiConf = typeof safeConfidences.sevk_tarihi === 'number' && Number.isFinite(safeConfidences.sevk_tarihi)
    ? safeConfidences.sevk_tarihi
    : undefined;

  return (
    <div className="space-y-3.5 text-xs">
      {/* 1. İrsaliye ve Tarih */}
      <div className="bg-theme-card/60 border border-theme-subtle rounded-lg p-3 space-y-2.5 min-w-0">
        <div className="flex items-center space-x-1.5 text-blue-400 font-semibold uppercase text-[11px] tracking-wider">
          <Hash className="w-3.5 h-3.5 shrink-0" />
          <span>İrsaliye ve Tarih Bilgileri</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {renderInputField('İrsaliye Seri-Sıra No', 'irsaliye_no', 'Örn: A-045129')}
          {renderInputField('Belge Türü', 'irsaliye_tipi', 'Sevk İrsaliyesi')}
          {renderInputField('Düzenleme Tarihi', 'duzenleme_tarihi', 'GG.AA.YYYY')}

          <div className="min-w-0">
            <div className="flex items-center justify-between mb-1 gap-1">
              <label className="text-[10px] text-theme-muted font-medium truncate block min-w-0">
                Fiili Sevk Tarihi / Saati
              </label>
              {sevkTarihiConf !== undefined && (
                <span className="text-[9px] font-mono px-1 py-0.2 rounded border text-theme-muted bg-theme-card border-theme-subtle shrink-0">
                  %{Math.round(sevkTarihiConf * 100)}
                </span>
              )}
            </div>
            <div className="flex space-x-1.5">
              <input
                type="text"
                value={currentHeader.sevk_tarihi != null ? String(currentHeader.sevk_tarihi) : ''}
                onChange={(e) => handleChange('sevk_tarihi', e.target.value)}
                placeholder="GG.AA.YYYY"
                data-suspicious={getFieldStatus('sevk_tarihi', currentHeader.sevk_tarihi).isSuspicious ? 'true' : undefined}
                className={`w-2/3 bg-theme-surface border rounded-md px-2.5 py-1.5 text-xs text-theme-primary font-mono outline-none min-h-[34px] truncate ${getFieldStatus('sevk_tarihi', currentHeader.sevk_tarihi).borderClass}`}
              />
              <input
                type="text"
                value={currentHeader.sevk_saati != null ? String(currentHeader.sevk_saati) : ''}
                onChange={(e) => handleChange('sevk_saati', e.target.value)}
                placeholder="SS:DD"
                data-suspicious={getFieldStatus('sevk_saati', currentHeader.sevk_saati).isSuspicious ? 'true' : undefined}
                className={`w-1/3 bg-theme-surface border rounded-md px-2.5 py-1.5 text-xs text-theme-primary font-mono text-center outline-none min-h-[34px] truncate ${getFieldStatus('sevk_saati', currentHeader.sevk_saati).borderClass}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Gönderici */}
      <div className="bg-theme-card/60 border border-theme-subtle rounded-lg p-3 space-y-2 min-w-0">
        <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold uppercase text-[11px] tracking-wider">
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span>Gönderici (Çıkış Noktası / Satıcı)</span>
        </div>

        {renderInputField('Gönderici Firma Ticari Ünvanı', 'gonderici_unvan', 'Firma tam ticari ünvanı')}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {renderInputField('Gönderici VKN / TCKN', 'gonderici_vkn', '10 veya 11 hane')}
          {renderInputField('Vergi Dairesi', 'gonderici_vergi_dairesi', 'Vergi Dairesi')}
        </div>

        {renderInputField('Çıkış Deposu / Fabrika Adresi', 'gonderici_adres', 'Açık adres')}
      </div>

      {/* 3. Alıcı */}
      <div className="bg-theme-card/60 border border-theme-subtle rounded-lg p-3 space-y-2 min-w-0">
        <div className="flex items-center space-x-1.5 text-amber-400 font-semibold uppercase text-[11px] tracking-wider">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          <span>Alıcı (Varış / Teslimat Cari)</span>
        </div>

        {renderInputField('Alıcı Firma Ticari Ünvanı', 'alici_unvan', 'Teslim alacak müşteri/firma ünvanı')}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {renderInputField('Alıcı VKN / TCKN', 'alici_vkn', '10 veya 11 hane')}
          {renderInputField('Vergi Dairesi', 'alici_vergi_dairesi', 'Vergi Dairesi')}
        </div>

        {renderInputField('Fiili Teslimat Adresi', 'teslim_adresi', 'İndirme adresi / ambar varış noktası')}
      </div>

      {/* 4. Nakliye ve Lojistik */}
      <div className="bg-theme-card/60 border border-theme-subtle rounded-lg p-3 space-y-2 min-w-0">
        <div className="flex items-center space-x-1.5 text-purple-400 font-semibold uppercase text-[11px] tracking-wider">
          <Truck className="w-3.5 h-3.5 shrink-0" />
          <span>Taşıyıcı, Plaka ve Şoför</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {renderInputField('Taşıyıcı / Ambar Ünvanı', 'tasiyici_unvan', 'Ambar / Lojistik firması')}
          {renderInputField('Araç Plakası', 'plaka', 'Örn: 34 TRS 882')}
          {renderInputField('Şoför Adı Soyadı', 'sofor_ad_soyad', 'Şoför adı')}
          {renderInputField('Şoför TCKN', 'sofor_tc', '11 haneli TCKN')}
        </div>
      </div>
    </div>
  );
};
