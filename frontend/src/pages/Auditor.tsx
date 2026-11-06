import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Scale, Zap, AlertTriangle, CheckCircle, FileCheck, Server, RefreshCw } from 'lucide-react';
import { api, type ListResponse } from '@/lib/api';
import { toast } from 'sonner';

interface DiscrepancyResult {
  id: string;
  status: string;
  expected: string;
  actual: string;
}

function robustParseMultiline(textData: string): Map<string, Set<string>> {
  const SCANNING_ID_REGEX = /\b\d{4,12}-?\d{4}-?\d?\b/g;
  const dataMap = new Map<string, Set<string>>();
  let currentTn: string | null = null;

  for (const line of textData.trim().split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const tnMatches = trimmed.match(SCANNING_ID_REGEX);
    if (tnMatches && tnMatches.length > 0) {
      currentTn = tnMatches[0];
      const desc = trimmed.replace(currentTn, '').replace(/\|/g, '').trim();
      if (!dataMap.has(currentTn)) dataMap.set(currentTn, new Set());
      if (desc) dataMap.get(currentTn)!.add(desc);
    } else if (currentTn) {
      dataMap.get(currentTn)!.add(trimmed);
    }
  }
  return dataMap;
}

export default function Auditor() {
  const [masterIn, setMasterIn] = useState('');
  const [scanIn, setScanIn] = useState('');
  const [results, setResults] = useState<DiscrepancyResult[]>([]);
  const [summary, setSummary] = useState({ total: 0, matched: 0, errors: 0 });
  // Server audit logs (GET /api/audit-logs) — admin + auditor only
  const [tab, setTab] = useState<'analyzer' | 'server'>('analyzer');
  const [serverLogs, setServerLogs] = useState<Record<string, unknown>[]>([]);
  const [serverLoading, setServerLoading] = useState(false);
  const [filters, setFilters] = useState({ entity: '', action: '', operator: '', from: '', to: '' });

  const loadServerLogs = useCallback(async () => {
    if (!navigator.onLine) {
      toast('Offline — server audit logs unavailable', { description: 'Showing local mode only.' });
      return;
    }
    setServerLoading(true);
    try {
      const query: Record<string, string> = {};
      if (filters.entity) query.entity = filters.entity;
      if (filters.action) query.action = filters.action;
      if (filters.operator) query.operator = filters.operator;
      if (filters.from) query.from = filters.from;
      if (filters.to) query.to = filters.to;
      const res = await api.get<ListResponse<Record<string, unknown>> | Record<string, unknown>[]>('/audit-logs', query, { silent: true });
      const rows = Array.isArray(res) ? res : res?.data ?? [];
      setServerLogs(rows);
    } catch {
      setServerLogs([]);
    } finally {
      setServerLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    if (tab === 'server') void loadServerLogs();
  }, [tab, loadServerLogs]);

  const handleAnalyze = () => {
    if (!masterIn.trim() || !scanIn.trim()) return;

    const mMap = robustParseMultiline(masterIn);
    const sMap = robustParseMultiline(scanIn);

    const allIds = new Set([...mMap.keys(), ...sMap.keys()]);
    const analysis: DiscrepancyResult[] = [];
    let matched = 0;
    let errors = 0;

    for (const tid of Array.from(allIds).sort()) {
      const exp = mMap.get(tid) || new Set();
      const got = sMap.get(tid) || new Set();

      // Compare sets
      const expArr = Array.from(exp).sort();
      const gotArr = Array.from(got).sort();
      const isMatch = JSON.stringify(expArr) === JSON.stringify(gotArr);

      if (isMatch) {
        matched++;
      } else {
        errors++;
      }

      analysis.push({
        id: tid,
        status: isMatch ? 'MATCH' : 'ERROR',
        expected: expArr.join(' | ') || '(not in master)',
        actual: gotArr.join(' | ') || '(not scanned)',
      });
    }

    setResults(analysis);
    setSummary({ total: allIds.size, matched, errors });
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-text-primary">Auditor</h1>
        <p className="text-sm text-text-secondary mt-1">Discrepancy analysis &amp; server audit log review</p>
      </div>
      {/* Tabs */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab('analyzer')}
          className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
            tab === 'analyzer'
              ? 'bg-accent-sky/20 text-accent-sky border border-accent-sky/30'
              : 'bg-white/[0.02] text-text-secondary border border-white/[0.06]'
          }`}
        >
          <Scale className="w-3.5 h-3.5" />
          Discrepancy Analyzer
        </button>
        <button
          onClick={() => setTab('server')}
          className={`px-4 py-2 rounded-md text-xs font-semibold transition-all flex items-center gap-1.5 ${
            tab === 'server'
              ? 'bg-accent-sky/20 text-accent-sky border border-accent-sky/30'
              : 'bg-white/[0.02] text-text-secondary border border-white/[0.06]'
          }`}
        >
          <Server className="w-3.5 h-3.5" />
          Server Audit Logs
        </button>
      </div>

      <div className={tab === 'analyzer' ? '' : 'hidden'}>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        {/* Master Input */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileCheck className="w-4 h-4 text-accent-green" />
            <h3 className="text-sm font-semibold text-text-primary">MASTER (Expected)</h3>
          </div>
          <textarea
            value={masterIn}
            onChange={(e) => setMasterIn(e.target.value)}
            className="w-full h-48 bg-transparent border border-white/[0.08] rounded-md p-3 text-xs text-text-primary font-mono resize-none focus:outline-none focus:border-accent-green transition-colors"
            placeholder="Paste expected tracking numbers and descriptions..."
          />
        </div>

        {/* Scan Input */}
        <div className="glass-panel rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle className="w-4 h-4 text-accent-yellow" />
            <h3 className="text-sm font-semibold text-text-primary">SCAN (Actual)</h3>
          </div>
          <textarea
            value={scanIn}
            onChange={(e) => setScanIn(e.target.value)}
            className="w-full h-48 bg-transparent border border-white/[0.08] rounded-md p-3 text-xs text-text-primary font-mono resize-none focus:outline-none focus:border-accent-yellow transition-colors"
            placeholder="Paste scanned tracking numbers and descriptions..."
          />
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-4 mb-4">
        <motion.button
          onClick={handleAnalyze}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-2 px-5 py-2.5 bg-accent-sky text-void font-semibold text-sm rounded-md hover:bg-accent-sky/90 transition-colors active:translate-y-[1px]"
        >
          <Zap className="w-4 h-4" />
          Run Discrepancy Analysis
        </motion.button>

        {results.length > 0 && (
          <div className="flex items-center gap-4 text-xs">
            <span className="text-text-secondary">
              Total: <strong className="text-text-primary">{summary.total}</strong>
            </span>
            <span className="text-accent-green">
              <CheckCircle className="w-3 h-3 inline mr-1" />
              Matched: <strong>{summary.matched}</strong>
            </span>
            <span className="text-accent-red">
              <AlertTriangle className="w-3 h-3 inline mr-1" />
              Errors: <strong>{summary.errors}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel rounded-lg p-4"
        >
          <div className="flex items-center gap-2 mb-3">
            <Scale className="w-4 h-4 text-accent-sky" />
            <h3 className="text-sm font-semibold text-text-primary">Analysis Results</h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-[10px] text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                  <th className="text-left py-2 px-2 w-12">Status</th>
                  <th className="text-left py-2 px-2">ID</th>
                  <th className="text-left py-2 px-2">Expected</th>
                  <th className="text-left py-2 px-2">Actual</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result, i) => (
                  <motion.tr
                    key={result.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className={`border-b border-white/[0.04] ${
                      result.status === 'ERROR' ? 'bg-accent-red/5' : ''
                    }`}
                  >
                    <td className="py-2 px-2">
                      {result.status === 'MATCH' ? (
                        <CheckCircle className="w-4 h-4 text-accent-green" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-accent-red" />
                      )}
                    </td>
                    <td className="py-2 px-2 text-xs font-mono text-text-primary">{result.id}</td>
                    <td className="py-2 px-2 text-xs text-text-secondary max-w-[200px] truncate">{result.expected}</td>
                    <td className="py-2 px-2 text-xs text-text-secondary max-w-[200px] truncate">{result.actual}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
      </div>

      {/* Server Audit Logs tab — GET /api/audit-logs with filters */}
      {tab === 'server' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="glass-panel rounded-lg p-4 mb-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Entity</label>
                <input
                  value={filters.entity}
                  onChange={(e) => setFilters({ ...filters, entity: e.target.value })}
                  placeholder="e.g. inventory"
                  className="bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky w-32"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Action</label>
                <input
                  value={filters.action}
                  onChange={(e) => setFilters({ ...filters, action: e.target.value })}
                  placeholder="CREATE/UPDATE/DELETE"
                  className="bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky w-36"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">Operator</label>
                <input
                  value={filters.operator}
                  onChange={(e) => setFilters({ ...filters, operator: e.target.value })}
                  placeholder="name or id"
                  className="bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky w-32"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">From</label>
                <input
                  type="date"
                  value={filters.from}
                  onChange={(e) => setFilters({ ...filters, from: e.target.value })}
                  className="bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky"
                />
              </div>
              <div>
                <label className="block text-[10px] text-text-secondary uppercase tracking-widest mb-1">To</label>
                <input
                  type="date"
                  value={filters.to}
                  onChange={(e) => setFilters({ ...filters, to: e.target.value })}
                  className="bg-transparent border border-white/10 rounded px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent-sky"
                />
              </div>
              <button
                onClick={() => void loadServerLogs()}
                disabled={serverLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-accent-sky text-void text-xs font-semibold rounded hover:bg-accent-sky/90 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${serverLoading ? 'animate-spin' : ''}`} />
                {serverLoading ? 'Loading…' : 'Apply Filters'}
              </button>
            </div>
          </div>
          <div className="glass-panel rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Server className="w-4 h-4 text-accent-sky" />
              <h3 className="text-sm font-semibold text-text-primary">Server Audit Log</h3>
              <span className="ml-auto text-[10px] text-text-secondary">{serverLogs.length} records</span>
            </div>
            {serverLogs.length === 0 && !serverLoading && (
              <p className="text-xs text-text-secondary text-center py-6">
                No server audit entries. Ensure the backend is running at <span className="font-mono">:4000</span>.
              </p>
            )}
            {serverLogs.length > 0 && (
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
                <table className="w-full text-[10px]">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="text-text-secondary uppercase tracking-widest border-b border-white/[0.06]">
                      <th className="text-left py-2 px-2">Time</th>
                      <th className="text-left py-2 px-2">Operator</th>
                      <th className="text-left py-2 px-2">Entity</th>
                      <th className="text-left py-2 px-2">Action</th>
                      <th className="text-left py-2 px-2">IP</th>
                      <th className="text-left py-2 px-2">Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {serverLogs.map((log, i) => (
                      <tr key={String(log.id ?? i)} className="border-b border-white/[0.04] hover:bg-white/[0.02]">
                        <td className="py-2 px-2 text-text-secondary whitespace-nowrap font-mono">
                          {log.createdAt ? new Date(String(log.createdAt)).toLocaleString() : '—'}
                        </td>
                        <td className="py-2 px-2 font-mono text-text-primary">{String(log.operatorName ?? log.operatorId ?? '—')}</td>
                        <td className="py-2 px-2 text-text-secondary">{String(log.entity ?? '—')}{log.entityId ? `#${log.entityId}` : ''}</td>
                        <td className="py-2 px-2">
                          <span className="px-1.5 py-0.5 rounded-full font-semibold bg-accent-sky/20 text-accent-sky">
                            {String(log.action ?? '—')}
                          </span>
                        </td>
                        <td className="py-2 px-2 text-text-secondary font-mono">{String(log.ip ?? '—')}</td>
                        <td className="py-2 px-2 text-text-secondary max-w-[260px] truncate">
                          {log.newValues ? JSON.stringify(log.newValues).slice(0, 80) : log.oldValues ? JSON.stringify(log.oldValues).slice(0, 80) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </div>
  );
}
