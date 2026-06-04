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

export const INITIAL_MENU: MenuItem[] = [
  { id: 'PORK_BBQ', name: 'Pork BBQ', price: 250, current_stock: 100 },
  { id: 'MANGO_SAGO', name: 'Mango Sago', price: 500, current_stock: 100 },
  { id: 'CHICKEN_ADOBO', name: 'Chicken Adobo', price: 800, current_stock: 50 },
  { id: 'MANGO_ORANGE_JUICE', name: 'Mango Orange Juice', price: 200, current_stock: 100 },
  { id: 'FOUR_SEASONS_JUICE', name: 'Four Seasons Juice', price: 200, current_stock: 100 },
  { id: 'SET_A', name: 'Set A (Chicken Adobo + Juice)', price: 900, current_stock: 0, components: { CHICKEN_ADOBO: 1, ANY_JUICE: 1 } },
  { id: 'SET_B', name: 'Set B (2 Pork BBQ + Juice)', price: 500, current_stock: 0, components: { PORK_BBQ: 2, ANY_JUICE: 1 } }
];

export const formatPrice = (price: number) => {
  return `¥${price.toLocaleString()}`;
};

export const generateUUID = () => {
  return crypto.randomUUID();
};

export const updateStockAndSync = async (itemId: string, newStock: number) => {
  await supabase.from('menu_items').update({ current_stock: newStock }).eq('id', itemId);
};

export const recalculateCompositeStock = (
  stockUpdates: Record<string, number>,
  menuItems: MenuItem[]
) => {
  menuItems.forEach(m => {
    if (m.components) {
      let minStock = Infinity;
      for (const [compId, reqQty] of Object.entries(m.components)) {
        if (compId === 'ANY_JUICE') {
          const mango = stockUpdates['MANGO_ORANGE_JUICE'] ?? menuItems.find(i => i.id === 'MANGO_ORANGE_JUICE')?.current_stock ?? 0;
          const fourSeasons = stockUpdates['FOUR_SEASONS_JUICE'] ?? menuItems.find(i => i.id === 'FOUR_SEASONS_JUICE')?.current_stock ?? 0;
          minStock = Math.min(minStock, Math.floor((mango + fourSeasons) / reqQty));
        } else {
          const compStock = stockUpdates[compId] ?? menuItems.find(i => i.id === compId)?.current_stock ?? 0;
          minStock = Math.min(minStock, Math.floor(compStock / reqQty));
        }
      }
      stockUpdates[m.id] = minStock === Infinity ? 0 : minStock;
    }
  });
  return stockUpdates;
};