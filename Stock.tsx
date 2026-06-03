import { useLiveQuery } from 'dexie-react-hooks';
import { db, formatPrice, MenuItem } from './database';
import { Package } from 'lucide-react';

export default function Stock() {
  const menuItems = useLiveQuery(() => db.menuItems.toArray());

  // Compute dynamic stock for composite items
  const getComputedStock = (item: MenuItem) => {
    if (!item.components || !menuItems) return item.current_stock;
    let minStock = Infinity;
    for (const [compId, reqQty] of Object.entries(item.components)) {
      const compItem = menuItems.find(i => i.id === compId);
      if (compItem) {
        minStock = Math.min(minStock, Math.floor(compItem.current_stock / reqQty));
      } else return 0;
    }
    return minStock === Infinity ? 0 : minStock;
  };

  const handleStockUpdate = async (id: string, newStock: number) => {
    const safeStock = Math.max(0, newStock);
    await db.menuItems.update(id, { current_stock: safeStock });
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
                      {isComposite ? (
                        <span className={`text-2xl font-black w-24 text-center ${stock < 10 ? 'text-ph-red' : 'text-gray-400'}`}>
                          {stock}
                        </span>
                      ) : (
                        <>
                          <button onClick={() => handleStockUpdate(item.id, item.current_stock - 1)} className="w-12 h-12 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center font-bold hover:bg-red-100 hover:text-ph-red transition-colors focus:ring-2 focus:ring-gray-300">
                            -
                          </button>
                          <input type="number" value={item.current_stock} onChange={(e) => handleStockUpdate(item.id, parseInt(e.target.value) || 0)} className={`text-2xl font-black w-20 text-center bg-transparent border-b-2 focus:outline-none focus:border-ph-blue ${item.current_stock < 10 ? 'text-ph-red border-red-200' : 'text-gray-900 border-gray-200'}`} />
                          <button onClick={() => handleStockUpdate(item.id, item.current_stock + 1)} className="w-12 h-12 rounded-xl bg-gray-100 text-gray-600 flex items-center justify-center font-bold hover:bg-blue-100 hover:text-ph-blue transition-colors focus:ring-2 focus:ring-gray-300">
                            +
                          </button>
                        </>
                      )}
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