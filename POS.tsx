import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, formatPrice, generateUUID, syncOrdersToCloud, MenuItem } from './database';
import { ShoppingCart, Trash2, CheckCircle2 } from 'lucide-react';

export default function POS() {
  const menuItems = useLiveQuery(() => db.menuItems.toArray()) || [];
  const [cart, setCart] = useState<Record<string, number>>({});

  // Compute dynamic stock for sets
  const getComputedStock = (item: MenuItem) => {
    if (!item.components) return item.current_stock;
    let minStock = Infinity;
    for (const [compId, reqQty] of Object.entries(item.components)) {
      const compItem = menuItems.find(i => i.id === compId);
      if (compItem) {
        minStock = Math.min(minStock, Math.floor(compItem.current_stock / reqQty));
      } else return 0;
    }
    return minStock === Infinity ? 0 : minStock;
  };

  const handleItemTap = (itemId: string) => {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return;
    
    setCart(prev => {
      const currentQty = prev[itemId] || 0;
      if (currentQty >= getComputedStock(item)) return prev; // Prevent adding beyond computed stock
      return { ...prev, [itemId]: currentQty + 1 };
    });
  };

  const handleClearCart = () => setCart({});

  const calculateTotal = () => {
    let total = 0;
    Object.entries(cart).forEach(([id, qty]) => {
      const item = menuItems.find(i => i.id === id);
      if (item) total += item.price * qty;
    });
    return total;
  };

  const handleSubmitOrder = async () => {
    if (Object.keys(cart).length === 0) return;

    const orderId = generateUUID();
    const lastOrder = await db.orders.orderBy('collection_number').last();
    const nextNumber = lastOrder ? lastOrder.collection_number + 1 : 1;
    const total = calculateTotal();

    const itemsToInsert = [];
    for (const [menuItemId, qty] of Object.entries(cart)) {
      itemsToInsert.push({
        id: generateUUID(),
        order_id: orderId,
        menu_item_id: menuItemId,
        quantity: qty
      });
      
      // Cascade deduct stock instantly for composites
      const item = await db.menuItems.get(menuItemId);
      if (item && item.components) {
        for (const [compId, reqQty] of Object.entries(item.components)) {
          const compItem = await db.menuItems.get(compId);
          if (compItem) {
            await db.menuItems.update(compId, { current_stock: compItem.current_stock - (reqQty * qty) });
          }
        }
      } else if (item) {
        await db.menuItems.update(menuItemId, { current_stock: item.current_stock - qty });
      }
    }

    await db.orderItems.bulkAdd(itemsToInsert);
    await db.orders.add({
      id: orderId,
      collection_number: nextNumber,
      timestamp: new Date(),
      status: 'PENDING',
      total_price: total,
      sync_status: 'PENDING_SYNC'
    });

    setCart({}); // Clear after success
    syncOrdersToCloud(); // Trigger background sync immediately
  };

  return (
    <div className="flex h-full gap-6">
      {/* Menu Grid */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-6 overflow-y-auto">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {menuItems.map(item => {
            const stock = getComputedStock(item);
            return (
              <button
                key={item.id}
                disabled={stock <= 0}
                onClick={() => handleItemTap(item.id)}
                className={`relative p-5 rounded-xl border-2 text-left transition-all active:scale-95 flex flex-col justify-between h-32 ${
                  stock > 0 
                    ? 'border-ph-blue bg-blue-50/50 hover:bg-blue-100/50 hover:border-blue-700 hover:shadow-md' 
                    : 'border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed grayscale'
                }`}
              >
                <div className="font-bold text-lg text-ph-blue leading-tight">{item.name}</div>
                <div className="flex justify-between items-end w-full mt-2">
                  <div className="text-gray-700 font-semibold text-xl">{formatPrice(item.price)}</div>
                  <div className={`text-sm px-2 py-0.5 rounded-md font-bold ${stock < 10 ? 'bg-red-100 text-ph-red' : 'bg-gray-200 text-gray-600'}`}>
                    Stock: {stock}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cart/Summary Side Panel */}
      <div className="w-[350px] bg-white rounded-2xl shadow-sm border border-gray-200 p-6 flex flex-col">
        <div className="flex items-center gap-2 mb-6 text-gray-800">
          <ShoppingCart size={24} className="text-ph-blue" />
          <h2 className="text-2xl font-black">Current Order</h2>
        </div>
        <div className="flex-1 overflow-y-auto pr-2 space-y-3">
          {Object.entries(cart).map(([id, qty]) => {
            const item = menuItems.find(i => i.id === id);
            return item ? (
              <div key={id} className="flex justify-between items-center p-3 bg-gray-50 border border-gray-100 rounded-xl">
                <div className="flex items-center gap-3">
                  <span className="bg-ph-blue text-white w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm">{qty}</span>
                  <span className="font-semibold text-gray-800 truncate w-32">{item.name}</span>
                </div>
                <span className="font-bold text-gray-600">{formatPrice(item.price * qty)}</span>
              </div>
            ) : null;
          })}
        </div>
        <div className="border-t pt-4 mt-4">
          <div className="flex justify-between items-center text-3xl font-black mb-6">
            <span>Total:</span>
            <span className="text-ph-red">{formatPrice(calculateTotal())}</span>
          </div>
          <button onClick={handleSubmitOrder} disabled={Object.keys(cart).length === 0} className="w-full bg-ph-blue text-white py-4 rounded-xl font-bold text-xl hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed mb-3 flex items-center justify-center gap-2 transition-colors">
            <CheckCircle2 size={24} /> Submit Order
          </button>
          <button onClick={handleClearCart} disabled={Object.keys(cart).length === 0} className="w-full bg-gray-100 text-gray-500 py-3 rounded-xl font-bold hover:bg-gray-200 hover:text-gray-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
            <Trash2 size={18} /> Clear Cart
          </button>
        </div>
      </div>
    </div>
  );
}