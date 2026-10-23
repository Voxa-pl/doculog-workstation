import React from 'react';
import { LineItem } from '../../types/irsaliye';
import { Plus, Trash2, Package } from 'lucide-react';

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
    const val = Number(item?.miktar);
    return sum + (Number.isFinite(val) ? val : 0);
  }, 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-blue-400 font-semibold uppercase text-[11px] tracking-wider min-w-0">
          <Package className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">Ürün ve Malzeme Kalemleri ({safeItems.length})</span>
        </div>
        <button
          type="button"
          onClick={handleAddItem}
          className="flex items-center space-x-1 text-xs bg-blue-600/20 hover:bg-blue-600 border border-blue-500/30 text-blue-300 hover:text-white px-3 py-1.5 min-h-[34px] rounded-md transition-all font-medium active:scale-95 shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Kalem Ekle</span>
        </button>
      </div>

      <div className="border border-theme-subtle rounded-lg overflow-hidden bg-theme-card/60 shadow-sm">
        <div className="overflow-x-auto overscroll-x-contain">
          <table className="w-full min-w-[500px] text-left text-xs border-collapse">
            <thead>
              <tr className="bg-theme-surface border-b border-theme-subtle text-[10px] text-theme-muted uppercase tracking-wider font-mono">
                <th className="py-2.5 px-2 text-center w-10">No</th>
                <th className="py-2.5 px-2">Mal / Malzeme Cinsi ve Açıklaması</th>
                <th className="py-2.5 px-2 text-right w-24">Miktar</th>
                <th className="py-2.5 px-2 text-center w-24">Birim</th>
                <th className="py-2.5 px-2 w-28">Notlar</th>
                <th className="py-2.5 px-1 text-center w-8"></th>
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
                    <td className="py-1.5 px-1 text-center text-theme-muted font-mono text-[11px] tabular-nums">
                      {item.sira_no || index + 1}
                    </td>

                    <td className="py-1 px-1.5 min-w-[160px]">
                      <input
                        type="text"
                        value={item.mal_hizmet ?? ''}
                        onChange={(e) => handleItemChange(index, 'mal_hizmet', e.target.value)}
                        placeholder="Ürün / Mal tanımı..."
                        className="w-full bg-transparent hover:bg-theme-surface/80 focus:bg-theme-surface border border-transparent focus:border-blue-500 rounded px-2 py-1 text-theme-primary text-xs sm:text-sm focus:outline-none transition-colors min-h-[32px]"
                      />
                    </td>

                    <td className="py-1 px-1.5 text-right w-24">
                      <input
                        type="number"
                        step="any"
                        value={
                          item.miktar !== null &&
                          item.miktar !== undefined &&
                          Number.isFinite(Number(item.miktar))
                            ? item.miktar
                            : ''
                        }
                        onChange={(e) => {
                          const val = e.target.value.trim();
                          if (val === '') {
                            handleItemChange(index, 'miktar', null);
                          } else {
                            const parsed = parseFloat(val);
                            handleItemChange(
                              index,
                              'miktar',
                              Number.isFinite(parsed) ? parsed : null
                            );
                          }
                        }}
                        placeholder="0"
                        className="w-full text-right bg-transparent hover:bg-theme-surface/80 focus:bg-theme-surface border border-transparent focus:border-blue-500 rounded px-2 py-1 text-theme-primary font-mono tabular-nums text-xs sm:text-sm focus:outline-none transition-colors min-h-[32px]"
                      />
                    </td>

                    <td className="py-1 px-1.5 text-center w-24">
                      <input
                        list={`units-${index}`}
                        type="text"
                        value={item.birim || 'Adet'}
                        onChange={(e) => handleItemChange(index, 'birim', e.target.value)}
                        className="w-full text-center bg-transparent hover:bg-theme-surface/80 focus:bg-theme-surface border border-transparent focus:border-blue-500 rounded px-1.5 py-1 text-theme-primary text-xs sm:text-sm focus:outline-none transition-colors min-h-[32px]"
                      />
                      <datalist id={`units-${index}`}>
                        {COMMON_UNITS.map((u) => (
                          <option key={u} value={u} />
                        ))}
                      </datalist>
                    </td>

                    <td className="py-1 px-1.5 w-28">
                      <input
                        type="text"
                        value={item.notlar || ''}
                        onChange={(e) => handleItemChange(index, 'notlar', e.target.value)}
                        placeholder="Lot / fire notu..."
                        className="w-full bg-transparent hover:bg-theme-surface/80 focus:bg-theme-surface border border-transparent focus:border-blue-500 rounded px-2 py-1 text-theme-secondary text-xs sm:text-sm focus:outline-none transition-colors placeholder-theme-muted min-h-[32px]"
                      />
                    </td>

                    <td className="py-1 px-1 text-center w-8">
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(index)}
                        className="opacity-70 sm:opacity-0 sm:group-hover:opacity-100 text-theme-muted hover:text-rose-400 min-w-[30px] min-h-[30px] flex items-center justify-center p-1 rounded transition-all active:scale-95"
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
                {Number.isFinite(totalQuantity)
                  ? totalQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })
                  : '0'}
              </span>
              <span className="text-theme-muted text-[11px]">Birim Toplam</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
