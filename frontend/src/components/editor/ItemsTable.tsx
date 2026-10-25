import React from 'react';
import { LineItem } from '../../types/irsaliye';
import { Plus, Minus, Trash2, Package } from 'lucide-react';
import { parseTurkishNumber, formatTurkishNumber } from '../../utils/number';

interface ItemsTableProps {
  items?: LineItem[] | null;
  onChange: (updatedItems: LineItem[]) => void;
}

const COMMON_UNITS = [
  'Adet',
  'Koli',
  'Palet',
  'Kg',
  'Ton',
  'Kutu',
  'Paket',
  'Çuval',
  'Bağ',
  'Rulo',
  'Metre',
  'Teneke',
];

export const ItemsTable: React.FC<ItemsTableProps> = ({ items, onChange }) => {
  const safeItems = Array.isArray(items) ? items : [];

  const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...safeItems];
    if (!updated[index]) return;
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    onChange(updated);
  };

  const handleStepQuantity = (index: number, delta: number) => {
    const item = safeItems[index];
    if (!item) return;
    const current = parseTurkishNumber(item.miktar);
    const validCurrent = current !== null ? current : 0;
    const nextVal = Math.max(0, Math.round((validCurrent + delta) * 100) / 100);
    handleItemChange(index, 'miktar', nextVal);
  };

  const handleAddItem = () => {
    const newItem: LineItem = {
      sira_no: safeItems.length + 1,
      mal_hizmet: '',
      miktar: 1,
      birim: 'Adet',
      notlar: '',
    };
    onChange([...safeItems, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    const updated = safeItems.filter((_, idx) => idx !== index).map((item, idx) => ({
      ...item,
      sira_no: idx + 1,
    }));
    onChange(updated);
  };

  const totalQuantity = safeItems.reduce((sum, item) => {
    const val = parseTurkishNumber(item?.miktar);
    return sum + (val !== null ? val : 0);
  }, 0);

  return (
    <div className="space-y-3">
      {/* Üst Başlık & Hızlı Kalem Ekleme Butonu */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-blue-400 font-semibold uppercase text-[11px] tracking-wider min-w-0">
          <Package className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Mal ve Hizmet Kalemleri ({safeItems.length})</span>
        </div>
        <button
          type="button"
          onClick={handleAddItem}
          className="flex items-center space-x-1 text-xs bg-blue-600/20 hover:bg-blue-600 border border-blue-500/30 text-blue-300 hover:text-white px-2.5 sm:px-3 py-1.5 min-h-[34px] rounded-lg transition-all font-medium active:scale-95 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Kalem Ekle</span>
        </button>
      </div>

      {/* 1. MOBİL GÖRÜNÜM: Dokunmatik Kalem Kartları (Touch Cards) */}
      <div className="block md:hidden space-y-2.5">
        {safeItems.length === 0 ? (
          <div className="p-6 text-center rounded-xl bg-theme-card/40 border border-dashed border-theme-subtle space-y-2">
            <Package className="w-8 h-8 text-theme-muted mx-auto stroke-[1.5]" />
            <p className="text-xs text-theme-muted">Kayıtlı ürün veya malzeme kalemi bulunamadı.</p>
            <button
              type="button"
              onClick={handleAddItem}
              className="mt-2 inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>İlk Kalemi Ekle</span>
            </button>
          </div>
        ) : (
          safeItems.map((item, index) => {
            const qtyNum = parseTurkishNumber(item.miktar);
            const isSuspicious = !item.mal_hizmet || qtyNum === null || qtyNum <= 0;

            return (
              <div
                key={index}
                className={`p-3 bg-theme-card/90 border rounded-xl space-y-2.5 touch-card-spring transition-all shadow-xs ${
                  isSuspicious 
                    ? 'border-amber-500/40 bg-amber-500/5' 
                    : 'border-theme-subtle'
                }`}
              >
                {/* Kart Üst Başlık & Silme */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span className="font-mono text-[10px] text-theme-muted bg-theme-surface border border-theme-subtle px-1.5 py-0.5 rounded shrink-0">
                      #{item.sira_no || index + 1}
                    </span>
                    <input
                      type="text"
                      value={item.mal_hizmet ?? ''}
                      onChange={(e) => handleItemChange(index, 'mal_hizmet', e.target.value)}
                      placeholder="Mal / Ürün tanımı..."
                      className="w-full bg-theme-surface/70 border border-theme-subtle/80 focus:border-blue-500 rounded-md px-2 py-1.5 text-xs text-theme-primary placeholder-theme-muted outline-none transition-colors truncate"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(index)}
                    className="p-1.5 min-w-[32px] min-h-[32px] rounded-lg text-theme-muted hover:text-rose-400 hover:bg-rose-500/10 flex items-center justify-center transition-all shrink-0 active:scale-95"
                    title="Kalemi Sil"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Miktar Stepper & Birim Seçici Satırı */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-theme-subtle/50">
                  <span className="text-[10px] text-theme-muted uppercase tracking-wider font-semibold">
                    Miktar & Birim:
                  </span>
                  <div className="flex items-center gap-1.5">
                    {/* Hızlı Azalt (-) */}
                    <button
                      type="button"
                      onClick={() => handleStepQuantity(index, -1)}
                      className="w-7 h-7 flex items-center justify-center rounded bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary active:scale-90 transition-all"
                      title="1 Azalt"
                    >
                      <Minus className="w-3 h-3" />
                    </button>

                    {/* Miktar Girişi (Virgül ve Nokta Uyumlu) */}
                    <input
                      type="text"
                      inputMode="decimal"
                      value={item.miktar !== null && item.miktar !== undefined ? String(item.miktar) : ''}
                      onChange={(e) => {
                        const val = e.target.value.trim();
                        if (val === '') {
                          handleItemChange(index, 'miktar', null);
                        } else {
                          const parsed = parseTurkishNumber(val);
                          handleItemChange(index, 'miktar', parsed !== null ? parsed : val);
                        }
                      }}
                      placeholder="0"
                      className="w-16 sm:w-20 text-center font-mono font-bold text-xs bg-theme-surface border border-theme-subtle focus:border-blue-500 rounded px-1.5 py-1 text-blue-400 outline-none tabular-nums"
                    />

                    {/* Hızlı Arttır (+) */}
                    <button
                      type="button"
                      onClick={() => handleStepQuantity(index, 1)}
                      className="w-7 h-7 flex items-center justify-center rounded bg-theme-surface border border-theme-subtle text-theme-secondary hover:text-theme-primary active:scale-90 transition-all"
                      title="1 Arttır"
                    >
                      <Plus className="w-3 h-3" />
                    </button>

                    {/* Birim Seçici */}
                    <select
                      value={item.birim || 'Adet'}
                      onChange={(e) => handleItemChange(index, 'birim', e.target.value)}
                      className="bg-theme-surface border border-theme-subtle rounded px-2 py-1 text-xs text-theme-primary font-medium outline-none focus:border-blue-500"
                    >
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Notlar / Lot Girişi */}
                <div className="pt-0.5">
                  <input
                    type="text"
                    value={item.notlar || ''}
                    onChange={(e) => handleItemChange(index, 'notlar', e.target.value)}
                    placeholder="Lot / seri / parti veya fire notu (isteğe bağlı)..."
                    className="w-full bg-theme-surface/50 border border-transparent focus:border-theme-subtle rounded px-2 py-1 text-[11px] text-theme-secondary placeholder-theme-muted outline-none transition-colors"
                  />
                </div>
              </div>
            );
          })
        )}

        {/* Mobil Kalem Toplam Özeti */}
        {safeItems.length > 0 && (
          <div className="p-2.5 rounded-xl bg-theme-surface border border-theme-subtle flex items-center justify-between text-xs">
            <span className="text-theme-muted font-medium">Toplam Kalem Miktarı:</span>
            <div className="flex items-center space-x-1.5">
              <span className="font-mono text-sm text-blue-400 font-bold tabular-nums">
                {formatTurkishNumber(totalQuantity)}
              </span>
              <span className="text-theme-muted text-[11px]">Birim Toplam</span>
            </div>
          </div>
        )}
      </div>

      {/* 2. MASAÜSTÜ GÖRÜNÜM: Tam Tablo (Desktop Spreadsheet) */}
      <div className="hidden md:block border border-theme-subtle rounded-lg overflow-hidden bg-theme-card/60 shadow-sm">
        <div className="w-full">
          <table className="w-full text-left text-xs border-collapse table-fixed">
            <thead>
              <tr className="bg-theme-surface border-b border-theme-subtle text-[10px] text-theme-muted uppercase tracking-wider font-mono">
                <th className="py-2 px-1 text-center w-8">No</th>
                <th className="py-2 px-2">Mal / Malzeme Cinsi</th>
                <th className="py-2 px-1.5 text-right w-20">Miktar</th>
                <th className="py-2 px-1 text-center w-16">Birim</th>
                <th className="py-2 px-1.5 w-20">Notlar</th>
                <th className="py-2 px-1 text-center w-7"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-theme-subtle">
              {safeItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-theme-muted text-xs">
                    Kayıt Bulunamadı
                  </td>
                </tr>
              ) : (
                safeItems.map((item, index) => (
                  <tr
                    key={index}
                    className="hover:bg-theme-surface/70 transition-colors group"
                  >
                    <td className="py-1 px-1 text-center text-theme-muted font-mono text-[11px] tabular-nums w-8">
                      {item.sira_no || index + 1}
                    </td>

                    <td className="py-1 px-1.5 min-w-0">
                      <input
                        type="text"
                        value={item.mal_hizmet ?? ''}
                        onChange={(e) => handleItemChange(index, 'mal_hizmet', e.target.value)}
                        placeholder="Ürün / Mal tanımı..."
                        className="w-full bg-transparent hover:bg-theme-surface/80 focus:bg-theme-surface border border-transparent focus:border-blue-500 rounded px-1.5 py-1 text-theme-primary text-xs focus:outline-none transition-colors min-h-[30px] truncate"
                      />
                    </td>

                    <td className="py-1 px-1 text-right w-20">
                      <input
                        type="text"
                        inputMode="decimal"
                        value={
                          item.miktar !== null && item.miktar !== undefined
                            ? String(item.miktar)
                            : ''
                        }
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (val === '') {
                            handleItemChange(index, 'miktar', null);
                          } else {
                            const parsed = parseTurkishNumber(val);
                            handleItemChange(index, 'miktar', parsed !== null ? parsed : val);
                          }
                        }}
                        placeholder="0"
                        className="w-full text-right bg-transparent hover:bg-theme-surface/80 focus:bg-theme-surface border border-transparent focus:border-blue-500 rounded px-1.5 py-1 text-theme-primary font-mono tabular-nums text-xs font-semibold focus:outline-none transition-colors min-h-[30px]"
                      />
                    </td>

                    <td className="py-1 px-1 text-center w-16">
                      <input
                        list={`units-desktop-${index}`}
                        type="text"
                        value={item.birim || 'Adet'}
                        onChange={(e) => handleItemChange(index, 'birim', e.target.value)}
                        className="w-full text-center bg-transparent hover:bg-theme-surface/80 focus:bg-theme-surface border border-transparent focus:border-blue-500 rounded px-1 py-1 text-theme-primary text-xs focus:outline-none transition-colors min-h-[30px]"
                      />
                      <datalist id={`units-desktop-${index}`}>
                        {COMMON_UNITS.map((u) => (
                          <option key={u} value={u} />
                        ))}
                      </datalist>
                    </td>

                    <td className="py-1 px-1.5 w-20">
                      <input
                        type="text"
                        value={item.notlar || ''}
                        onChange={(e) => handleItemChange(index, 'notlar', e.target.value)}
                        placeholder="Not..."
                        className="w-full bg-transparent hover:bg-theme-surface/80 focus:bg-theme-surface border border-transparent focus:border-blue-500 rounded px-1.5 py-1 text-theme-secondary text-xs focus:outline-none transition-colors placeholder-theme-muted min-h-[30px] truncate"
                      />
                    </td>

                    <td className="py-1 px-0.5 text-center w-7">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="opacity-20 group-hover:opacity-100 text-theme-muted hover:text-rose-400 w-6 h-6 flex items-center justify-center p-0.5 rounded transition-all active:scale-95 mx-auto"
                        title="Satırı Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {safeItems.length > 0 && (
          <div className="bg-theme-surface border-t border-theme-subtle px-3 py-2 flex items-center justify-between text-xs font-medium min-w-0">
            <span className="text-theme-muted truncate mr-2">Kalem Toplam Miktarı:</span>
            <div className="flex items-center space-x-1.5 shrink-0">
              <span className="font-mono text-sm text-blue-400 font-bold tabular-nums">
                {formatTurkishNumber(totalQuantity)}
              </span>
              <span className="text-theme-muted text-[11px]">Birim Toplam</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
