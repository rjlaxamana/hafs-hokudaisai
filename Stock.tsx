import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { formatPrice, MenuItem } from './database';
import { Package } from 'lucide-react';

export default function Stock() {
  const [menuItems, setMenuItems] = useState<MenuItem[] | undefined>();

  const fetchMenu = async () => {
    const { data } = await supabase.from('menu_items').select('*').order('id', { ascending: true });
    if (data) setMenuItems(data as any);
  };

  useEffect(() => {
    fetchMenu();

    const channel = supabase.channel('stock_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, fetchMenu)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Compute dynamic stock for composite items
  const getComputedStock = (item: MenuItem) => {
    if (!item.components || !menuItems) return item.current_stock;
    let minStock = Infinity;
    for (const [compId, reqQty] of Object.entries(item.components)) {
      if (compId === 'ANY_JUICE') {
        const mango = menuItems.find(i => i.id === 'MANGO_ORANGE_JUICE')?.current_stock || 0;
        const fourSeasons = menuItems.find(i => i.id === 'FOUR_SEASONS_JUICE')?.current_stock || 0;
        minStock = Math.min(minStock, Math.floor((mango + fourSeasons) / reqQty));
      } else {
        const compItem = menuItems.find(i => i.id === compId);
        if (compItem) {
          minStock = Math.min(minStock, Math.floor(compItem.current_stock / reqQty));
        } else return 0;
      }
    }
    return minStock === Infinity ? 0 : minStock;
  };

  const handleStockUpdate = (item: MenuItem, newStock: number) => {
    const safeStock = Math.max(0, newStock);
    const stockUpdates: Record<string, number> = {};
    
    if (item.components) {
      const currentComputed = getComputedStock(item);
      const diff = safeStock - currentComputed;
      if (diff === 0) return;
      
      for (const [compId, reqQty] of Object.entries(item.components)) {
        if (compId === 'ANY_JUICE') {
          const mango = menuItems?.find(i => i.id === 'MANGO_ORANGE_JUICE');
          const fourSeasons = menuItems?.find(i => i.id === 'FOUR_SEASONS_JUICE');
          let toApply = diff * reqQty;
          
          if (toApply > 0) {
            if (mango) stockUpdates['MANGO_ORANGE_JUICE'] = mango.current_stock + toApply;
          } else {
            let toDeduct = Math.abs(toApply);
            if (mango && mango.current_stock > 0) {
              const deductMango = Math.min(mango.current_stock, toDeduct);
              stockUpdates['MANGO_ORANGE_JUICE'] = mango.current_stock - deductMango;
              toDeduct -= deductMango;
            }
            if (toDeduct > 0 && fourSeasons) {
              stockUpdates['FOUR_SEASONS_JUICE'] = Math.max(0, fourSeasons.current_stock - toDeduct);
            }
          }
        } else {
          const compItem = menuItems?.find(i => i.id === compId);
          if (compItem) {
            stockUpdates[compId] = Math.max(0, compItem.current_stock + (diff * reqQty));
          }
        }
      }
    } else {
      stockUpdates[item.id] = safeStock;
    }

    // Optimistically update UI instantly
    setMenuItems(prev => prev?.map(m => stockUpdates[m.id] !== undefined ? { ...m, current_stock: stockUpdates[m.id] } : m));

    // Send bulk background update
    const menuItemsToUpsert = Object.entries(stockUpdates).map(([id, s]) => {
      const mItem = menuItems?.find(i => i.id === id);
      return { ...mItem, current_stock: s };
    }).filter(i => i.id);

    if (menuItemsToUpsert.length > 0) {
      supabase.from('menu_items').upsert(menuItemsToUpsert).then();
    }
  };

  if (!menuItems) return <div className="p-4">Loading stock...</div>;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden h-full flex flex-col">
      <div className="px-6 py-5 border-b flex items-center gap-3 bg-gray-50">
        <div className="w-10 h-10 rounded-lg bg-ph-blue/10 flex items-center justify-center text-ph-blue">
          <Package size={24} />
        </div>
        <h2 className="text-2xl font-black text-gray-800">Inventory Management</h2>
      </div>
      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-gray-200 bg-gray-50/50">
              <th className="py-4 px-6 font-bold text-gray-600 uppercase text-sm tracking-wider">Item Name</th>
              <th className="py-4 px-6 font-bold text-gray-600 uppercase text-sm tracking-wider w-32">Price</th>
              <th className="py-4 px-6 font-bold text-gray-600 uppercase text-sm tracking-wider w-80 text-center">Current Stock</th>
            </tr>
          </thead>
          <tbody>
            {menuItems.map(item => {
              const isComposite = !!item.components;
              const stock = getComputedStock(item);
              return (
                <tr key={item.id} className="border-b hover:bg-gray-50 transition-colors">
                  <td className="py-5 px-6 font-bold text-lg text-gray-800">
                    {item.name}
                    {isComposite && <div className="text-xs text-gray-400 font-medium mt-1 uppercase">Computed Set</div>}
                  </td>
                  <td className="py-5 px-6 text-gray-600 font-medium">{formatPrice(item.price)}</td>
                  <td className="py-5 px-6">
                    <div className="flex items-center justify-center space-x-4">
                      <button onClick={() => handleStockUpdate(item, stock - 1)} className="w-12 h-12 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center font-bold hover:bg-red-100 hover:text-ph-red transition-colors focus:ring-2 focus:ring-gray-300">
                        -
                      </button>
                      <input type="number" value={stock} onChange={(e) => handleStockUpdate(item, parseInt(e.target.value) || 0)} className={`text-2xl font-black w-20 text-center bg-transparent border-b-2 focus:outline-none focus:border-ph-blue ${stock < 10 ? 'text-ph-red border-red-200' : 'text-gray-900 border-gray-200'}`} />
                      <button onClick={() => handleStockUpdate(item, stock + 1)} className="w-12 h-12 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center font-bold hover:bg-blue-100 hover:text-ph-blue transition-colors focus:ring-2 focus:ring-gray-300">
                        +
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}