import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, syncOrdersToCloud } from './database';
import { supabase } from './supabase';
import { CheckCircle2 } from 'lucide-react';

export default function KDS() {
  // Fetch pending orders and enrich with item names
  const pendingOrders = useLiveQuery(async () => {
    const orders = await db.orders.where('status').equals('PENDING').sortBy('timestamp');
    
    return Promise.all(orders.map(async order => {
      const items = await db.orderItems.where('order_id').equals(order.id).toArray();
      const enrichedItems = await Promise.all(items.map(async item => {
        const menuItem = await db.menuItems.get(item.menu_item_id);
        return { ...item, name: menuItem?.name || 'Unknown Item' };
      }));
      return { ...order, items: enrichedItems };
    }));
  });

  // Real-time Subscription Guard
  useEffect(() => {
    const channel = supabase
      .channel('public:orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
        const newOrder = payload.new as any;
        // If it's a new pending order from another device, ingest it
        if (newOrder && newOrder.id && newOrder.status === 'PENDING') {
          const { data: items } = await supabase.from('order_items').select('*').eq('order_id', newOrder.id);
          await db.transaction('rw', db.orders, db.orderItems, async () => {
            await db.orders.put({
              id: newOrder.id,
              collection_number: newOrder.collection_number,
              timestamp: new Date(newOrder.timestamp),
              status: newOrder.status,
              total_price: newOrder.total_price,
              sync_status: 'SYNCED'
            });
            if (items) {
              await db.orderItems.bulkPut(items);
            }
          });
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const handleMarkCompleted = async (orderId: string) => {
    await db.orders.update(orderId, { status: 'COMPLETED', sync_status: 'PENDING_SYNC' });
    syncOrdersToCloud();
  };

  if (!pendingOrders) return <div className="p-4">Loading queue...</div>;

  return (
    <div className="h-full overflow-x-auto whitespace-nowrap p-4 flex gap-6 pb-8">
      {pendingOrders.length === 0 ? (
        <div className="text-gray-500 italic mt-10 w-full text-center text-xl">No active orders in queue!</div>
      ) : (
        pendingOrders.map(order => (
          <div 
            key={order.id} 
            className="w-[320px] flex-shrink-0 flex flex-col rounded-b-md shadow-2xl relative bg-[#fdfbf7] border border-gray-200"
            style={{ backgroundImage: 'linear-gradient(transparent 95%, #bae6fd 95%)', backgroundSize: '100% 2.5rem', lineHeight: '2.5rem' }}
          >
            {/* Waiter notepad top binder visual */}
            <div className="h-6 w-full bg-gray-800 rounded-t-md border-b-4 border-gray-900 flex justify-evenly items-center px-4">
              {[...Array(6)].map((_, i) => <div key={i} className="w-2 h-4 bg-gray-300 rounded-full"></div>)}
            </div>
            {/* Left margin red line */}
            <div className="absolute left-10 top-6 bottom-0 w-px bg-red-400 opacity-60 z-0"></div>
            
            <div className="p-6 relative z-10 flex-1 flex flex-col whitespace-normal">
              <div className="flex justify-between items-end mb-4 border-b-2 border-gray-400 border-dashed pb-2">
                <span className="text-3xl font-black text-gray-900 font-mono tracking-tighter">#{order.collection_number}</span>
                <span className="text-sm font-bold text-gray-500 font-mono">{order.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <ul className="space-y-3 mt-2 pl-6">
                  {order.items.map(item => (
                    <li key={item.id} className="text-xl text-gray-800 font-medium leading-tight">
                      <span className="font-black text-ph-red inline-block w-8">{item.quantity}x</span> {item.name}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="p-4 relative z-10">
              <button onClick={() => handleMarkCompleted(order.id)} className="w-full bg-green-600 text-white py-4 rounded-lg font-bold text-xl hover:bg-green-700 transition-colors shadow-md flex items-center justify-center gap-2">
                <CheckCircle2 size={24} /> Mark Done
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}