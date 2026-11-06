import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { db } from '@/lib/db';
import { Shield, AlertTriangle, CheckCircle, Activity, Zap, RefreshCw, Wrench, TrendingUp } from 'lucide-react';

interface HealthMetric {
  name: string;
  value: number;
  max: number;
  status: 'good' | 'warning' | 'critical';
}

interface AlertItem {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  message: string;
  timestamp: string;
}

interface Suggestion {
  id: string;
  category: 'inventory' | 'orders' | 'sync' | 'security';
  text: string;
  action: string;
}

export default function GuardianDashboard() {
  const [health, setHealth] = useState<HealthMetric[]>([]);
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [lastScan, setLastScan] = useState<string>('');
  const [scanning, setScanning] = useState(false);

  const runAnalysis = useCallback(async () => {
    setScanning(true);
    const inventory = await db.inventory.toArray();
    const orders = await db.orders.toArray();
    const auditLogs = await db.auditLogs.reverse().limit(100).toArray();
    const movements = await db.inventoryMovements.reverse().limit(30).toArray();

    const lowStock = inventory.filter(i => (i.stock || 0) < (i.reorderPoint || 10));
    const pendingOrders = orders.filter(o => o.status === 'Pending');
    const shippedOrders = orders.filter(o => o.status === 'Shipped');
    const returnedOrders = orders.filter(o => o.status === 'Returned');
    const failedLogins = auditLogs.filter(l => l.action === 'LOGIN' && l.details.includes('Failed')).length;

    // Health metrics
    const metrics: HealthMetric[] = [
      { name: 'Stock Health', value: Math.max(0, 100 - (lowStock.length / Math.max(inventory.length, 1)) * 100), max: 100, status: lowStock.length > 5 ? 'warning' : 'good' },
      { name: 'Order Flow', value: Math.max(0, (shippedOrders.length / Math.max(orders.length, 1)) * 100), max: 100, status: pendingOrders.length > 10 ? 'warning' : 'good' },
      { name: 'Sync Queue', value: 100, max: 100, status: 'good' },
      { name: 'Security', value: Math.max(0, 100 - failedLogins * 10), max: 100, status: failedLogins > 3 ? 'critical' : 'good' },
    ];
    setHealth(metrics);

    // Generate alerts
    const newAlerts: AlertItem[] = [];
    if (lowStock.length > 0) {
      newAlerts.push({ id: 'inv-1', severity: 'warning', message: `${lowStock.length} SKU(s) below reorder point`, timestamp: new Date().toISOString() });
    }
    if (pendingOrders.length > 10) {
      newAlerts.push({ id: 'ord-1', severity: 'warning', message: `${pendingOrders.length} orders pending fulfillment`, timestamp: new Date().toISOString() });
    }
    if (failedLogins > 3) {
      newAlerts.push({ id: 'sec-1', severity: 'critical', message: `${failedLogins} failed login attempts detected`, timestamp: new Date().toISOString() });
    }
    if (returnedOrders.length > 5) {
      newAlerts.push({ id: 'ret-1', severity: 'info', message: `${returnedOrders.length} returns processed — review QC trends`, timestamp: new Date().toISOString() });
    }
    // Check for stale pending orders (older than 1 day)
    const oneDayAgo = new Date();
    oneDayAgo.setDate(oneDayAgo.getDate() - 1);
    const staleOrders = pendingOrders.filter(o => new Date(o.createdAt) < oneDayAgo);
    if (staleOrders.length > 0) {
      newAlerts.push({ id: 'ord-2', severity: 'critical', message: `${staleOrders.length} pending orders are stale (>24h)`, timestamp: new Date().toISOString() });
    }
    setAlerts(newAlerts);

    // Generate suggestions
    const newSuggestions: Suggestion[] = [];
    if (lowStock.length > 0) {
      newSuggestions.push({ id: 'sug-1', category: 'inventory', text: `Run replenishment for ${lowStock.length} low-stock items`, action: 'Go to Replenishment' });
    }
    if (pendingOrders.length > 0) {
      newSuggestions.push({ id: 'sug-2', category: 'orders', text: `Create wave batch for ${Math.min(pendingOrders.length, 10)} pending orders`, action: 'Go to Pick & Pack' });
    }
    if (movements.length < 5) {
      newSuggestions.push({ id: 'sug-3', category: 'sync', text: 'Low activity detected. Consider running cycle count.', action: 'Go to Cycle Count' });
    }
    if (failedLogins > 0) {
      newSuggestions.push({ id: 'sug-4', category: 'security', text: 'Review user access and consider password policy update', action: 'Go to User Management' });
    }
    setSuggestions(newSuggestions);
    setLastScan(new Date().toLocaleTimeString());
    setScanning(false);
  }, []);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  const getStatusColor = (status: string) => {
    if (status === 'good') return 'text-accent-green';
    if (status === 'warning') return 'text-accent-yellow';
    return 'text-accent-red';
  };

  const getSeverityColor = (severity: string) => {
    if (severity === 'critical') return 'bg-accent-red/20 text-accent-red border-accent-red/30';
    if (severity === 'warning') return 'bg-accent-yellow/20 text-accent-yellow border-accent-yellow/30';
    return 'bg-accent-green/20 text-accent-green border-accent-green/30';
  };

  const getCategoryIcon = (category: string) => {
    if (category === 'inventory') return <TrendingUp className="w-3.5 h-3.5" />;
    if (category === 'orders') return <Zap className="w-3.5 h-3.5" />;
    if (category === 'security') return <Shield className="w-3.5 h-3.5" />;
    return <RefreshCw className="w-3.5 h-3.5" />;
  };

  const overallHealth = health.length > 0
    ? Math.round(health.reduce((s, h) => s + h.value, 0) / health.length)
    : 0;

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Ozone Guardian Ops Center</h1>
            <p className="text-sm text-text-secondary mt-1">Health monitoring, alerts, and automated suggestions</p>
          </div>
          <motion.button
            onClick={runAnalysis}
            whileTap={{ scale: 0.98 }}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 bg-white/[0.05] border border-white/[0.08] text-text-primary text-xs rounded-md hover:bg-white/[0.08] transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Rescan'}
          </motion.button>
        </div>
        {lastScan && (
          <p className="text-[10px] text-text-secondary mt-1">Last scan: {lastScan}</p>
        )}
      </div>

      {/* Overall Health */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        <div className="lg:col-span-1 glass-panel rounded-lg p-4 text-center">
          <Shield className={`w-8 h-8 mx-auto mb-2 ${overallHealth >= 80 ? 'text-accent-green' : overallHealth >= 50 ? 'text-accent-yellow' : 'text-accent-red'}`} />
          <div className="text-3xl font-bold text-text-primary">{overallHealth}%</div>
          <div className="text-[10px] text-text-secondary uppercase tracking-widest mt-1">Overall Health</div>
        </div>

        {health.map((metric) => (
          <div key={metric.name} className="glass-panel rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] text-text-secondary uppercase tracking-widest">{metric.name}</span>
              <Activity className={`w-3.5 h-3.5 ${getStatusColor(metric.status)}`} />
            </div>
            <div className="text-2xl font-bold text-text-primary">{Math.round(metric.value)}%</div>
            <div className="w-full h-1.5 bg-white/[0.05] rounded-full mt-2 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(metric.value / metric.max) * 100}%` }}
                className={`h-full rounded-full ${metric.status === 'good' ? 'bg-accent-green' : metric.status === 'warning' ? 'bg-accent-yellow' : 'bg-accent-red'}`}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Active Alerts */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-4 h-4 text-accent-red" />
            <h3 className="text-sm font-semibold text-text-primary">Active Alerts</h3>
            <span className="ml-auto text-[10px] text-text-secondary">{alerts.length} alerts</span>
          </div>

          {alerts.length === 0 ? (
            <div className="flex items-center gap-2 p-3 bg-accent-green/5 border border-accent-green/20 rounded-md">
              <CheckCircle className="w-4 h-4 text-accent-green" />
              <p className="text-xs text-accent-green">All systems operational. No alerts.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div key={alert.id} className={`p-3 rounded-md border ${getSeverityColor(alert.severity)}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold">{alert.message}</span>
                    <span className="text-[9px] opacity-70">{new Date(alert.timestamp).toLocaleTimeString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Suggestions */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-4">
            <Wrench className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Automated Suggestions</h3>
            <span className="ml-auto text-[10px] text-text-secondary">{suggestions.length} suggestions</span>
          </div>

          {suggestions.length === 0 ? (
            <p className="text-xs text-text-secondary text-center py-4">No suggestions at this time</p>
          ) : (
            <div className="space-y-2">
              {suggestions.map((sug) => (
                <div key={sug.id} className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-md">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-accent-sky">{getCategoryIcon(sug.category)}</span>
                    <span className="text-[10px] text-accent-sky uppercase tracking-wider font-semibold">{sug.category}</span>
                  </div>
                  <p className="text-xs text-text-primary">{sug.text}</p>
                  <p className="text-[10px] text-text-secondary mt-1">Suggested action: {sug.action}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
