import React from 'react';
import { IrsaliyeHeader } from '../../types/irsaliye';
import { 
  Building2, 
  MapPin, 
  Truck, 
  Hash,
  AlertTriangle
} from 'lucide-react';

interface HeaderFormProps {
  header: IrsaliyeHeader;
  onChange: (updatedHeader: IrsaliyeHeader) => void;
  fieldConfidences?: Record<string, number>;
}

export const HeaderForm: React.FC<HeaderFormProps> = ({ 
  header, 
  onChange,
  fieldConfidences = {}
}) => {
  const handleChange = (field: keyof IrsaliyeHeader, value: string) => {
    onChange({
      ...header,
      [field]: value || null,
    });
  };

  const getFieldStatus = (field: keyof IrsaliyeHeader, value?: string | null) => {
    const conf = fieldConfidences[field];
    const isCritical = ['irsaliye_no', 'duzenleme_tarihi', 'gonderici_vkn', 'alici_unvan'].includes(field);
    const isMissing = isCritical && (!value || !value.trim());

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
      borderClass: 'border-slate-800 focus:border-blue-500',
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
    const value = header[field];
    const status = getFieldStatus(field, value);

    return (
      <div className={className}>
        <div className="flex items-center justify-between mb-1">
          <label className="text-[10px] text-slate-400 font-medium block">
            {label}
          </label>
          {status.text && (
            <span className={`text-[9px] font-mono px-1 py-0.2 rounded border font-semibold ${status.badgeClass}`}>
              {status.text}
            </span>
          )}
        </div>
        <input
          type="text"
          value={value || ''}
          onChange={(e) => handleChange(field, e.target.value)}
          placeholder={placeholder}
          data-suspicious={status.isSuspicious ? 'true' : undefined}
          className={`w-full bg-slate-900 border rounded px-2 py-1.5 text-white transition-all outline-none ${status.borderClass}`}
        />
      </div>
    );
  };

  return (
    <div className="space-y-3.5 text-xs">
      {/* 1. İrsaliye ve Tarih */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2.5">
        <div className="flex items-center space-x-1.5 text-blue-400 font-semibold uppercase text-[11px] tracking-wider">
          <Hash className="w-3.5 h-3.5" />
          <span>İrsaliye ve Tarih Bilgileri</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {renderInputField('İrsaliye Seri-Sıra No', 'irsaliye_no', 'Örn: A-045129')}
          {renderInputField('Belge Türü', 'irsaliye_tipi', 'Sevk İrsaliyesi')}
          {renderInputField('Düzenleme Tarihi', 'duzenleme_tarihi', 'GG.AA.YYYY')}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[10px] text-slate-400 font-medium block">
                Fiili Sevk Tarihi / Saati
              </label>
              {fieldConfidences.sevk_tarihi !== undefined && (
                <span className="text-[9px] font-mono px-1 py-0.2 rounded border text-slate-400 bg-slate-800 border-slate-700">
                  %{Math.round(fieldConfidences.sevk_tarihi * 100)}
                </span>
              )}
            </div>
            <div className="flex space-x-1">
              <input
                type="text"
                value={header.sevk_tarihi || ''}
                onChange={(e) => handleChange('sevk_tarihi', e.target.value)}
                placeholder="GG.AA.YYYY"
                data-suspicious={getFieldStatus('sevk_tarihi', header.sevk_tarihi).isSuspicious ? 'true' : undefined}
                className={`w-2/3 bg-slate-900 border rounded px-2 py-1.5 text-white font-mono outline-none ${getFieldStatus('sevk_tarihi', header.sevk_tarihi).borderClass}`}
              />
              <input
                type="text"
                value={header.sevk_saati || ''}
                onChange={(e) => handleChange('sevk_saati', e.target.value)}
                placeholder="SS:DD"
                data-suspicious={getFieldStatus('sevk_saati', header.sevk_saati).isSuspicious ? 'true' : undefined}
                className={`w-1/3 bg-slate-900 border rounded px-2 py-1.5 text-white font-mono text-center outline-none ${getFieldStatus('sevk_saati', header.sevk_saati).borderClass}`}
              />
            </div>
          </div>
        </div>
      </div>

      {/* 2. Gönderici */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
        <div className="flex items-center space-x-1.5 text-emerald-400 font-semibold uppercase text-[11px] tracking-wider">
          <Building2 className="w-3.5 h-3.5" />
          <span>Gönderici (Çıkış Noktası / Satıcı)</span>
        </div>

        {renderInputField('Gönderici Firma Ticari Ünvanı', 'gonderici_unvan', 'Firma tam ticari ünvanı')}

        <div className="grid grid-cols-2 gap-2">
          {renderInputField('Gönderici VKN / TCKN', 'gonderici_vkn', '10 veya 11 hane')}
          {renderInputField('Vergi Dairesi', 'gonderici_vergi_dairesi', 'Vergi Dairesi')}
        </div>

        {renderInputField('Çıkış Deposu / Fabrika Adresi', 'gonderici_adres', 'Açık adres')}
      </div>

      {/* 3. Alıcı */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
        <div className="flex items-center space-x-1.5 text-amber-400 font-semibold uppercase text-[11px] tracking-wider">
          <MapPin className="w-3.5 h-3.5" />
          <span>Alıcı (Varış / Teslimat Cari)</span>
        </div>

        {renderInputField('Alıcı Firma Ticari Ünvanı', 'alici_unvan', 'Teslim alacak müşteri/firma ünvanı')}

        <div className="grid grid-cols-2 gap-2">
          {renderInputField('Alıcı VKN / TCKN', 'alici_vkn', '10 veya 11 hane')}
          {renderInputField('Vergi Dairesi', 'alici_vergi_dairesi', 'Vergi Dairesi')}
        </div>

        {renderInputField('Fiili Teslimat Adresi', 'teslim_adresi', 'İndirme adresi / ambar varış noktası')}
      </div>

      {/* 4. Nakliye ve Lojistik */}
      <div className="bg-slate-950/60 border border-slate-800/80 rounded-lg p-3 space-y-2">
        <div className="flex items-center space-x-1.5 text-purple-400 font-semibold uppercase text-[11px] tracking-wider">
          <Truck className="w-3.5 h-3.5" />
          <span>Taşıyıcı, Plaka ve Şoför</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {renderInputField('Taşıyıcı / Ambar Ünvanı', 'tasiyici_unvan', 'Ambar / Lojistik firması')}
          {renderInputField('Araç Plakası', 'plaka', 'Örn: 34 TRS 882')}
          {renderInputField('Şoför Adı Soyadı', 'sofor_ad_soyad', 'Şoför adı')}
          {renderInputField('Şoför TCKN', 'sofor_tc', '11 haneli TCKN')}
        </div>
      </div>
    </div>
  );
};
