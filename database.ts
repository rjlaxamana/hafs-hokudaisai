import { supabase } from './supabase';

export interface Order {
  id: string; // UUID
  collection_number: number;
  timestamp: Date;
  status: 'PENDING' | 'COMPLETED';
  total_price: number; // Stored in base currency units (JPY)
}

export interface OrderItem {
  id: string; // UUID
  order_id: string;
  menu_item_id: string;
  quantity: number;
}

export interface MenuItem {
  id: string;
  name: string;
  price: number; // Stored in base currency units (JPY)
  current_stock: number;
  components?: Record<string, number>; // Maps base item ID to required quantity
}

export const formatPrice = (price: number) => {
  return `¥${price.toLocaleString()}`;
};

export const generateUUID = () => {
  return crypto.randomUUID();
};

export const updateStockAndSync = async (itemId: string, newStock: number) => {
  await supabase.from('menu_items').update({ current_stock: newStock }).eq('id', itemId);

  // Recalculate and sync composite Sets to ensure Supabase always has the correct Set stock
  const { data: allItems } = await supabase.from('menu_items').select('*');
  if (!allItems) return;
  
  for (const item of allItems) {
    if (item.components) {
      let minStock = Infinity;
      for (const [compId, reqQty] of Object.entries(item.components)) {
        if (compId === 'ANY_JUICE') {
          const mango = allItems.find(i => i.id === 'MANGO_ORANGE_JUICE')?.current_stock || 0;
          const fourSeasons = allItems.find(i => i.id === 'FOUR_SEASONS_JUICE')?.current_stock || 0;
          minStock = Math.min(minStock, Math.floor((mango + fourSeasons) / reqQty));
        } else {
          const compItem = allItems.find(i => i.id === compId);
          if (compItem) {
            minStock = Math.min(minStock, Math.floor(compItem.current_stock / reqQty));
          } else {
            minStock = 0;
          }
        }
      }
      const computed = minStock === Infinity ? 0 : minStock;
      if (computed !== item.current_stock) {
        await supabase.from('menu_items').update({ current_stock: computed }).eq('id', item.id);
      }
    }
  }
};