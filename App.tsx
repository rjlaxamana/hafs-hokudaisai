import { useState, useEffect } from 'react';
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
      const { data: countData } = await supabase.from('menu_items').select('id');
      if (!countData || countData.length === 0) {
        await supabase.from('menu_items').upsert([
          { id: 'PORK_BBQ', name: 'Pork BBQ', price: 250, current_stock: 100 },
          { id: 'MANGO_SAGO', name: 'Mango Sago', price: 500, current_stock: 100 },
          { id: 'CHICKEN_ADOBO', name: 'Chicken Adobo', price: 800, current_stock: 50 },
          { id: 'MANGO_ORANGE_JUICE', name: 'Mango Orange Juice', price: 200, current_stock: 100 },
          { id: 'FOUR_SEASONS_JUICE', name: 'Four Seasons Juice', price: 200, current_stock: 100 },
          { id: 'SET_A', name: 'Set A (Chicken Adobo + Juice)', price: 900, current_stock: 0, components: { CHICKEN_ADOBO: 1, ANY_JUICE: 1 } },
          { id: 'SET_B', name: 'Set B (2 Pork BBQ + Juice)', price: 500, current_stock: 0, components: { PORK_BBQ: 2, ANY_JUICE: 1 } }
        ]);
      } else {
        supabase.from('menu_items').update({ components: { CHICKEN_ADOBO: 1, ANY_JUICE: 1 } }).eq('id', 'SET_A').then();
        supabase.from('menu_items').update({ components: { PORK_BBQ: 2, ANY_JUICE: 1 } }).eq('id', 'SET_B').then();
      }
    };
    seedData();
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