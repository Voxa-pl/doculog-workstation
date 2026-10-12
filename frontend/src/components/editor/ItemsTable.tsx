import React from 'react';
import { LineItem } from '../../types/irsaliye';
import { Plus, Trash2, Package } from 'lucide-react';

interface ItemsTableProps {
  items: LineItem[];
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
  const handleItemChange = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...items];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    onChange(updated);
  };

  const handleAddItem = () => {
    const newItem: LineItem = {
      sira_no: items.length + 1,
      mal_hizmet: '',
      miktar: 1,
      birim: 'Adet',
      notlar: '',
    };
    onChange([...items, newItem]);
  };

  const handleRemoveItem = (index: number) => {
    const updated = items.filter((_, idx) => idx !== index).map((item, idx) => ({
      ...item,
      sira_no: idx + 1,
    }));
    onChange(updated);
  };

  const totalQuantity = items.reduce((sum, item) => sum + (Number(item.miktar) || 0), 0);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-1.5 text-blue-400 font-semibold uppercase text-[11px] tracking-wider">
          <Package className="w-3.5 h-3.5" />
          <span>Ürün ve Malzeme Kalemleri ({items.length})</span>
        </div>
        <button
          onClick={handleAddItem}
          className="flex items-center space-x-1 text-[11px] bg-blue-600/20 hover:bg-blue-600 border border-blue-500/30 text-blue-300 hover:text-white px-2 py-1 rounded transition-all font-medium"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Kalem Ekle</span>
        </button>
      </div>

      <div className="border border-slate-800 rounded-lg overflow-hidden bg-slate-950/60 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-800 text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="py-2 px-1.5 text-center w-10">No</th>
                <th className="py-2 px-2">Mal / Malzeme Cinsi ve Açıklaması</th>
                <th className="py-2 px-2 text-right w-20">Miktar</th>
                <th className="py-2 px-2 text-center w-20">Birim</th>
                <th className="py-2 px-2 w-28">Notlar</th>
                <th className="py-2 px-1 text-center w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-500 text-xs">
                    Kayıt Bulunamadı
                  </td>
                </tr>
              ) : (
                items.map((item, index) => (
                  <tr
                    key={index}
                    className="hover:bg-slate-900/60 transition-colors group"
                  >
                    <td className="py-1 px-1 text-center text-slate-500 font-mono text-[11px]">
                      {item.sira_no || index + 1}
                    </td>

                    <td className="py-1 px-1.5">
                      <input
                        type="text"
                        value={item.mal_hizmet}
                        onChange={(e) => handleItemChange(index, 'mal_hizmet', e.target.value)}
                        placeholder="Ürün / Mal tanımı..."
                        className="w-full bg-transparent hover:bg-slate-900/80 focus:bg-slate-900 border border-transparent focus:border-blue-500 rounded px-1.5 py-1 text-white text-xs focus:outline-none transition-colors"
                      />
                    </td>

                    <td className="py-1 px-1.5 text-right">
                      <input
                        type="number"
                        step="any"
                        value={item.miktar !== null && item.miktar !== undefined ? item.miktar : ''}
                        onChange={(e) =>
                          handleItemChange(
                            index,
                            'miktar',
                            e.target.value === '' ? null : parseFloat(e.target.value)
                          )
                        }
                        placeholder="0"
                        className="w-full text-right bg-transparent hover:bg-slate-900/80 focus:bg-slate-900 border border-transparent focus:border-blue-500 rounded px-1.5 py-1 text-white font-mono text-xs focus:outline-none transition-colors"
                      />
                    </td>

                    <td className="py-1 px-1.5 text-center">
                      <input
                        list={`units-${index}`}
                        type="text"
                        value={item.birim || 'Adet'}
                        onChange={(e) => handleItemChange(index, 'birim', e.target.value)}
                        className="w-full text-center bg-transparent hover:bg-slate-900/80 focus:bg-slate-900 border border-transparent focus:border-blue-500 rounded px-1 py-1 text-white text-xs focus:outline-none transition-colors"
                      />
                      <datalist id={`units-${index}`}>
                        {COMMON_UNITS.map((u) => (
                          <option key={u} value={u} />
                        ))}
                      </datalist>
                    </td>

                    <td className="py-1 px-1.5">
                      <input
                        type="text"
                        value={item.notlar || ''}
                        onChange={(e) => handleItemChange(index, 'notlar', e.target.value)}
                        placeholder="Lot / fire notu..."
                        className="w-full bg-transparent hover:bg-slate-900/80 focus:bg-slate-900 border border-transparent focus:border-blue-500 rounded px-1.5 py-1 text-slate-300 text-xs focus:outline-none transition-colors placeholder-slate-600"
                      />
                    </td>

                    <td className="py-1 px-1 text-center">
                      <button
                        onClick={() => handleRemoveItem(index)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-rose-400 p-1 transition-opacity"
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

        {items.length > 0 && (
          <div className="bg-slate-900/90 border-t border-slate-800 px-3 py-2 flex items-center justify-between text-xs font-medium">
            <span className="text-slate-400">Kalem Toplam Miktarı:</span>
            <div className="flex items-center space-x-1.5">
              <span className="font-mono text-sm text-blue-400 font-bold">
                {totalQuantity.toLocaleString('tr-TR', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-slate-400 text-[11px]">Birim Toplam</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
