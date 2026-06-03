import Dexie, { Table } from 'dexie';
import { supabase } from './supabase';

export interface Order {
  id: string; // UUID
  collection_number: number;
  timestamp: Date;
  status: 'PENDING' | 'COMPLETED';
  total_price: number; // Stored in base currency units (JPY)
  sync_status: 'SYNCED' | 'PENDING_SYNC';
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

export class FestiSyncDB extends Dexie {
  orders!: Table<Order>;
  orderItems!: Table<OrderItem>;
  menuItems!: Table<MenuItem>;

  constructor() {
    super('FestiSyncDB');
    this.version(1).stores({
      orders: 'id, collection_number, status, timestamp',
      orderItems: 'id, order_id, menu_item_id',
      menuItems: 'id'
    });
    this.version(2).stores({
      orders: 'id, collection_number, status, timestamp, sync_status'
    });
  }
}

export const db = new FestiSyncDB();

export const formatPrice = (price: number) => {
  return `¥${price.toLocaleString()}`;
};

export const generateUUID = () => {
  return crypto.randomUUID();
};

export const syncOrdersToCloud = async () => {
  // Background function to push offline orders to Supabase
  const pendingOrders = await db.orders.where('sync_status').equals('PENDING_SYNC').toArray();
  if (pendingOrders.length === 0) return;

  for (const order of pendingOrders) {
    const items = await db.orderItems.where('order_id').equals(order.id).toArray();
    
    const { error: orderError } = await supabase.from('orders').upsert({
      id: order.id,
      collection_number: order.collection_number,
      timestamp: order.timestamp.toISOString(),
      status: order.status,
      total_price: order.total_price
    });

    if (!orderError) {
      const itemsToPush = items.map(i => ({ ...i }));
      const { error: itemsError } = await supabase.from('order_items').upsert(itemsToPush);
      
      if (!itemsError) {
        // Mark local cache as synced once cloud confirms receipt
        await db.orders.update(order.id, { sync_status: 'SYNCED' });
      }
    }
  }
};