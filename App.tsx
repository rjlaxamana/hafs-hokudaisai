import { useState, useEffect } from 'react';
import { db, syncOrdersToCloud } from './database';
import { supabase } from './supabase';
import POS from './POS';
import KDS from './KDS';
import Stock from './Stock';
import History from './History';
import { ClipboardList, UtensilsCrossed, Package, History as HistoryIcon } from 'lucide-react';

type Tab = 'POS' | 'KDS' | 'STOCK' | 'HISTORY';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('POS');

  useEffect(() => {
    // Seed initial dummy data if menu is empty
    const seedData = async () => {
      // Temporary cleanup: If the old "ADOBO" test item exists, wipe the menu so the new Japanese menu renders automatically
      const oldTestItem = await db.menuItems.get('ADOBO');
      if (oldTestItem) {
        await db.menuItems.clear();
      }

      const count = await db.menuItems.count();
      if (count === 0) {
        await db.menuItems.bulkAdd([
          { id: 'PORK_BBQ', name: 'Pork BBQ', price: 250, current_stock: 100 },
          { id: 'MANGO_SAGO', name: 'Mango Sago', price: 500, current_stock: 100 },
          { id: 'CHICKEN_ADOBO', name: 'Chicken Adobo', price: 800, current_stock: 50 },
          { id: 'MANGO_ORANGE_JUICE', name: 'Mango Orange Juice', price: 200, current_stock: 100 },
          { id: 'FOUR_SEASONS_JUICE', name: 'Four Seasons Juice', price: 200, current_stock: 100 },
          { id: 'SET_A', name: 'Set A (Chicken Adobo + Juice)', price: 900, current_stock: 0, components: { CHICKEN_ADOBO: 1, ANY_JUICE: 1 } },
          { id: 'SET_B', name: 'Set B (2 Pork BBQ + Juice)', price: 500, current_stock: 0, components: { PORK_BBQ: 2, ANY_JUICE: 1 } }
        ]);
      }

      // Fetch from Supabase to sync local state
      const { data: cloudMenuItems, error: menuError } = await supabase.from('menu_items').select('*');
      if (!menuError && cloudMenuItems && cloudMenuItems.length > 0) {
        await db.menuItems.bulkPut(cloudMenuItems);
      }

      // Ensure existing sets are updated to use ANY_JUICE both locally and in cloud
      // Placing this after bulkPut prevents old Supabase records from overriding the new logic
      await db.menuItems.update('SET_A', { components: { CHICKEN_ADOBO: 1, ANY_JUICE: 1 } });
      await db.menuItems.update('SET_B', { components: { PORK_BBQ: 2, ANY_JUICE: 1 } });
      supabase.from('menu_items').update({ components: { CHICKEN_ADOBO: 1, ANY_JUICE: 1 } }).eq('id', 'SET_A').then();
      supabase.from('menu_items').update({ components: { PORK_BBQ: 2, ANY_JUICE: 1 } }).eq('id', 'SET_B').then();

      // Cleanup duplicate menu items by name (keep expected hardcoded IDs)
      const allItems = await db.menuItems.toArray();
      const expectedIds = ['PORK_BBQ', 'MANGO_SAGO', 'CHICKEN_ADOBO', 'MANGO_ORANGE_JUICE', 'FOUR_SEASONS_JUICE', 'SET_A', 'SET_B'];
      const itemsByName = new Map<string, any[]>();
      
      for (const item of allItems) {
        const normalizedName = item.name.trim().toLowerCase();
        if (!itemsByName.has(normalizedName)) {
          itemsByName.set(normalizedName, []);
        }
        itemsByName.get(normalizedName)!.push(item);
      }

      for (const items of itemsByName.values()) {
        if (items.length > 1) {
          items.sort((a, b) => {
            const aExpected = expectedIds.includes(a.id) ? -1 : 1;
            const bExpected = expectedIds.includes(b.id) ? -1 : 1;
            return aExpected - bExpected;
          });
          
          const itemToKeep = items[0];
          let bestStock = itemToKeep.current_stock;

          for (let i = 1; i < items.length; i++) {
            bestStock = Math.max(bestStock, items[i].current_stock);
            await db.menuItems.delete(items[i].id);
            await supabase.from('menu_items').delete().eq('id', items[i].id);
          }
          
          itemToKeep.current_stock = bestStock;
          await db.menuItems.put(itemToKeep);
          await supabase.from('menu_items').upsert(itemToKeep);
        } else if (items.length === 1 && expectedIds.includes(items[0].id)) {
          // Ensure all required base menu items are actively pushed to Supabase if missing
          await supabase.from('menu_items').upsert(items[0]);
        }
      }

      const { data: cloudOrders, error: ordersError } = await supabase.from('orders').select('*');
      if (!ordersError && cloudOrders && cloudOrders.length > 0) {
        const parsedOrders = cloudOrders.map(o => ({ ...o, timestamp: new Date(o.timestamp), sync_status: 'SYNCED' as const }));
        await db.orders.bulkPut(parsedOrders);
      }

      const { data: cloudOrderItems, error: itemsError } = await supabase.from('order_items').select('*');
      if (!itemsError && cloudOrderItems && cloudOrderItems.length > 0) {
        await db.orderItems.bulkPut(cloudOrderItems);
      }
    };
    seedData();

    // Real-time subscription to keep local inventory synced with cloud
    const menuChannel = supabase
      .channel('public:menu_items')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'menu_items' }, (payload) => {
        const updatedItem = payload.new as any;
        if (updatedItem && updatedItem.id) {
          db.menuItems.update(updatedItem.id, { current_stock: updatedItem.current_stock });
        }
      })
      .subscribe();

    // Background sync safety net interval (retries every 15s)
    const syncInterval = setInterval(syncOrdersToCloud, 15000);
    return () => {
      clearInterval(syncInterval);
      supabase.removeChannel(menuChannel);
    };
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Top Navigation */}
      <nav className="bg-ph-blue text-white shadow-md flex items-center px-4 py-3">
        <div className="flex items-center gap-2 mr-8">
          <div className="w-8 h-8 rounded-full bg-ph-yellow flex items-center justify-center border-2 border-ph-red text-ph-blue font-black tracking-tighter">H</div>
          <h1 className="text-2xl font-bold tracking-wide text-white">HAFS <span className="text-ph-yellow font-medium">北大際</span></h1>
        </div>
        <div className="flex space-x-1">
          <button 
            onClick={() => setActiveTab('POS')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${activeTab === 'POS' ? 'bg-ph-yellow text-ph-blue shadow-inner' : 'hover:bg-white/10'}`}
          >
            <ClipboardList size={18} />
            Take Order
          </button>
          <button 
            onClick={() => setActiveTab('KDS')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${activeTab === 'KDS' ? 'bg-ph-yellow text-ph-blue shadow-inner' : 'hover:bg-white/10'}`}
          >
            <UtensilsCrossed size={18} />
            Order Board
          </button>
          <button 
            onClick={() => setActiveTab('STOCK')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${activeTab === 'STOCK' ? 'bg-ph-yellow text-ph-blue shadow-inner' : 'hover:bg-white/10'}`}
          >
            <Package size={18} />
            Stock
          </button>
          <button 
            onClick={() => setActiveTab('HISTORY')}
            className={`px-4 py-2 rounded-lg font-semibold transition-all flex items-center gap-2 ${activeTab === 'HISTORY' ? 'bg-ph-yellow text-ph-blue shadow-inner' : 'hover:bg-white/10'}`}
          >
            <HistoryIcon size={18} />
            History
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden p-4">
        {activeTab === 'POS' && <POS />}
        {activeTab === 'KDS' && <KDS />}
        {activeTab === 'STOCK' && <Stock />}
        {activeTab === 'HISTORY' && <History />}
      </main>
    </div>
  );
}

export default App;