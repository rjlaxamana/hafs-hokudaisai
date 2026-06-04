import { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { formatPrice, generateUUID, MenuItem, INITIAL_MENU, recalculateCompositeStock } from './database';
import { ShoppingCart, Trash2, CheckCircle2 } from 'lucide-react';

export default function POS() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>(() => {
    const saved = localStorage.getItem('pos_menu_items');
    return saved ? JSON.parse(saved) : INITIAL_MENU;
  });
  const [cart, setCart] = useState<Record<string, number>>({});

  useEffect(() => {
    localStorage.setItem('pos_menu_items', JSON.stringify(menuItems));
  }, [menuItems]);

  useEffect(() => {
    const fetchMenu = async () => {
      const { data } = await supabase.from('menu_items').select('*').order('id', { ascending: true });
      if (data) setMenuItems(data as any);
    };
    fetchMenu();

    const channel = supabase
      .channel('pos_menu_items')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_items' }, fetchMenu)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Compute dynamic stock for sets
  const getComputedStock = (item: MenuItem, currentCart: Record<string, number> = cart) => {
    const getRemainingBaseStock = (baseId: string) => {
      let baseStock = menuItems.find(i => i.id === baseId)?.current_stock || 0;
      if (currentCart[baseId]) baseStock -= currentCart[baseId];

      // Deduct from juices if ANY_JUICE is used by composite items in the cart
      if (baseId === 'MANGO_ORANGE_JUICE' || baseId === 'FOUR_SEASONS_JUICE') {
        let anyJuiceRequired = 0;
        for (const [cartId, cartQty] of Object.entries(currentCart)) {
          const cartItem = menuItems.find(i => i.id === cartId);
          if (cartItem && cartItem.components && cartItem.components['ANY_JUICE']) {
            anyJuiceRequired += (cartItem.components['ANY_JUICE'] * cartQty);
          }
        }
        
        if (anyJuiceRequired > 0) {
          if (baseId === 'MANGO_ORANGE_JUICE') {
            baseStock -= anyJuiceRequired;
          } else if (baseId === 'FOUR_SEASONS_JUICE') {
            const mango = menuItems.find(i => i.id === 'MANGO_ORANGE_JUICE')?.current_stock || 0;
            const mangoCart = currentCart['MANGO_ORANGE_JUICE'] || 0;
            const remainingMango = Math.max(0, mango - mangoCart);
            const overflow = Math.max(0, anyJuiceRequired - remainingMango);
            baseStock -= overflow;
          }
        }
      }

      for (const [cartId, cartQty] of Object.entries(currentCart)) {
        const cartItem = menuItems.find(i => i.id === cartId);
        if (cartItem && cartItem.components) {
          for (const [compId, reqQty] of Object.entries(cartItem.components)) {
            if (compId === baseId) {
              baseStock -= (reqQty * cartQty);
            }
          }
        }
      }
      return Math.max(0, baseStock);
    };

    const getRemainingAnyJuiceStock = () => {
      let totalJuice = (menuItems.find(i => i.id === 'MANGO_ORANGE_JUICE')?.current_stock || 0) + 
                       (menuItems.find(i => i.id === 'FOUR_SEASONS_JUICE')?.current_stock || 0);
      if (currentCart['MANGO_ORANGE_JUICE']) totalJuice -= currentCart['MANGO_ORANGE_JUICE'];
      if (currentCart['FOUR_SEASONS_JUICE']) totalJuice -= currentCart['FOUR_SEASONS_JUICE'];
      for (const [cartId, cartQty] of Object.entries(currentCart)) {
        const cartItem = menuItems.find(i => i.id === cartId);
        if (cartItem && cartItem.components) {
          for (const [compId, reqQty] of Object.entries(cartItem.components)) {
            if (compId === 'ANY_JUICE') {
              totalJuice -= (reqQty * cartQty);
            }
          }
        }
      }
      return Math.max(0, totalJuice);
    };

    if (!item.components) {
      return getRemainingBaseStock(item.id);
    }

    let minStock = Infinity;
    for (const [compId, reqQty] of Object.entries(item.components)) {
      if (compId === 'ANY_JUICE') {
        minStock = Math.min(minStock, Math.floor(getRemainingAnyJuiceStock() / reqQty));
      } else {
        minStock = Math.min(minStock, Math.floor(getRemainingBaseStock(compId) / reqQty));
      }
    }
    return minStock === Infinity ? 0 : minStock;
  };

  const handleItemTap = (itemId: string) => {
    const item = menuItems.find(i => i.id === itemId);
    if (!item) return;
    
    setCart(prev => {
      const remaining = getComputedStock(item, prev);
      if (remaining <= 0) return prev; // Prevent adding beyond computed available stock
      return { ...prev, [itemId]: (prev[itemId] || 0) + 1 };
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
    
    const { data: lastOrderData } = await supabase.from('orders').select('collection_number').order('collection_number', { ascending: false }).limit(1);
    const lastOrder = lastOrderData && lastOrderData.length > 0 ? lastOrderData[0] : null;
    const nextNumber = lastOrder ? lastOrder.collection_number + 1 : 1;
    const total = calculateTotal();

    const itemsToInsert: any[] = [];
    const stockUpdates: Record<string, number> = {};

    const addDeduction = (id: string, amount: number) => {
      const current = stockUpdates[id] !== undefined ? stockUpdates[id] : (menuItems.find(i => i.id === id)?.current_stock || 0);
      stockUpdates[id] = Math.max(0, current - amount);
    };

    for (const [menuItemId, qty] of Object.entries(cart)) {
      itemsToInsert.push({
        id: generateUUID(),
        order_id: orderId,
        menu_item_id: menuItemId,
        quantity: qty
      });
      
      const item = menuItems.find(i => i.id === menuItemId);
      if (item && item.components) {
        for (const [compId, reqQty] of Object.entries(item.components)) {
          if (compId === 'ANY_JUICE') {
            const mango = stockUpdates['MANGO_ORANGE_JUICE'] ?? menuItems.find(i => i.id === 'MANGO_ORANGE_JUICE')?.current_stock ?? 0;
            const fourSeasons = stockUpdates['FOUR_SEASONS_JUICE'] ?? menuItems.find(i => i.id === 'FOUR_SEASONS_JUICE')?.current_stock ?? 0;
            let toDeduct = reqQty * qty;
            
            if (mango > 0) {
              const deductMango = Math.min(mango, toDeduct);
              addDeduction('MANGO_ORANGE_JUICE', deductMango);
              toDeduct -= deductMango;
            }
            if (toDeduct > 0 && fourSeasons > 0) {
              const deductFour = Math.min(fourSeasons, toDeduct);
              addDeduction('FOUR_SEASONS_JUICE', deductFour);
            }
          } else {
            addDeduction(compId, reqQty * qty);
          }
        }
      } else if (item) {
        addDeduction(menuItemId, qty);
      }
    }

    recalculateCompositeStock(stockUpdates, menuItems);

    // Optimistically update instantly
    setMenuItems(prev => prev.map(m => stockUpdates[m.id] !== undefined ? { ...m, current_stock: stockUpdates[m.id] } : m));
    setCart({});

    // Background sync
    const menuItemsToUpsert = Object.entries(stockUpdates).map(([id, newStock]) => {
      const mItem = menuItems.find(i => i.id === id);
      return { ...mItem, current_stock: newStock };
    }).filter(i => i.id);

    const submitToCloud = async () => {
      try {
        const { error: orderError } = await supabase.from('orders').insert({
          id: orderId,
          collection_number: nextNumber,
          timestamp: new Date().toISOString(),
          status: 'PENDING',
          total_price: total
        });
        if (orderError) throw orderError;

        await Promise.all([
          supabase.from('order_items').insert(itemsToInsert),
          menuItemsToUpsert.length > 0 ? supabase.from('menu_items').upsert(menuItemsToUpsert) : Promise.resolve()
        ]);
      } catch (err) {
        console.error('Failed to submit order:', err);
      }
    };

    submitToCloud();
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
                  <div className={`text-sm px-2 py-0.5 rounded-md font-bold ${stock < 10 ? 'bg-red-100 text-ph-red' : 'bg-gray-200 text-gray-600'}`}>
                    Stock: {stock}
                  </div>
                  <div className="text-gray-700 font-semibold text-xl">{formatPrice(item.price)}</div>
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
            <Trash2 size={18} /> Clear
          </button>
        </div>
      </div>
    </div>
  );
}