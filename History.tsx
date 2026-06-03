import { useLiveQuery } from 'dexie-react-hooks';
import { db, formatPrice } from './database';
import { Download, TrendingUp, Award, Clock } from 'lucide-react';

export default function History() {
  const orders = useLiveQuery(() => db.orders.orderBy('timestamp').reverse().toArray());
  const items = useLiveQuery(() => db.orderItems.toArray());
  const menuItems = useLiveQuery(() => db.menuItems.toArray());

  // Compute Statistics
  let bestSeller = { name: '-', amount: 0 };
  let highestEarner = { name: '-', revenue: 0, amount: 0 };

  if (orders && items && menuItems) {
    const itemStats: Record<string, { amount: number, revenue: number }> = {};
    
    items.forEach(orderItem => {
      const menuRef = menuItems.find(m => m.id === orderItem.menu_item_id);
      if (menuRef) {
        if (!itemStats[menuRef.id]) itemStats[menuRef.id] = { amount: 0, revenue: 0 };
        itemStats[menuRef.id].amount += orderItem.quantity;
        itemStats[menuRef.id].revenue += (orderItem.quantity * menuRef.price);
      }
    });

    Object.entries(itemStats).forEach(([id, stats]) => {
      const name = menuItems.find(m => m.id === id)?.name || id;
      if (stats.amount > bestSeller.amount) {
        bestSeller = { name, amount: stats.amount };
      }
      if (stats.revenue > highestEarner.revenue) {
        highestEarner = { name, revenue: stats.revenue, amount: stats.amount };
      }
    });
  }

  const handleExport = async () => {
    if (!orders || !items || !menuItems) return;
    
    let csv = 'Order ID,Collection Number,Status,Total Price (JPY),Timestamp,Items\n';
    orders.forEach(order => {
      const orderItems = items.filter(i => i.order_id === order.id).map(i => {
        const m = menuItems.find(m => m.id === i.menu_item_id);
        return `${i.quantity}x ${m?.name || 'Unknown'}`;
      }).join('; ');
      csv += `${order.id},${order.collection_number},${order.status},${order.total_price},${order.timestamp.toISOString()},"${orderItems}"\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `hafs_history_${new Date().toISOString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!orders) return <div className="p-4">Loading history...</div>;

  return (
    <div className="h-full flex flex-col gap-6">
      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-yellow-100 text-ph-yellow flex items-center justify-center"><Award size={28} /></div>
          <div>
            <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">Best Seller</p>
            <p className="text-xl font-black text-gray-900">{bestSeller.name}</p>
            <p className="text-sm text-gray-500">{bestSeller.amount} Sold</p>
          </div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-200 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-green-100 text-green-600 flex items-center justify-center"><TrendingUp size={28} /></div>
          <div>
            <p className="text-sm text-gray-500 font-bold uppercase tracking-wider">Highest Earner</p>
            <p className="text-xl font-black text-gray-900">{highestEarner.name}</p>
            <p className="text-sm text-gray-500">{formatPrice(highestEarner.revenue)} ({highestEarner.amount} Sold)</p>
          </div>
        </div>
        <div className="bg-ph-blue rounded-2xl p-6 shadow-md flex items-center justify-center">
          <button onClick={handleExport} className="w-full h-full bg-white text-ph-blue font-black text-lg rounded-xl hover:bg-gray-100 transition-colors flex items-center justify-center gap-3 shadow-sm">
            <Download size={24} /> Export Entire History
          </button>
        </div>
      </div>

      {/* Recent Orders Table */}
      <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
        <div className="px-6 py-5 border-b bg-gray-50 flex items-center gap-2">
          <Clock size={20} className="text-gray-500" />
          <h2 className="text-xl font-bold text-gray-800">Recent Orders (Last 20)</h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-gray-50 border-b-2 border-gray-200 z-10">
              <tr>
                <th className="py-3 px-6 text-sm font-bold text-gray-500 uppercase">Col #</th>
                <th className="py-3 px-6 text-sm font-bold text-gray-500 uppercase">Time</th>
                <th className="py-3 px-6 text-sm font-bold text-gray-500 uppercase">Status</th>
                <th className="py-3 px-6 text-sm font-bold text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.slice(0, 20).map(order => (
                <tr key={order.id} className="border-b hover:bg-gray-50/50">
                  <td className="py-4 px-6 font-mono font-black text-lg">#{order.collection_number}</td>
                  <td className="py-4 px-6 font-mono text-gray-600">{order.timestamp.toLocaleTimeString()}</td>
                  <td className="py-4 px-6"><span className={`px-3 py-1 rounded-md text-xs font-black ${order.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{order.status}</span></td>
                  <td className="py-4 px-6 font-bold text-gray-800">{formatPrice(order.total_price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}