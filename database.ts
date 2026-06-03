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
};