import { motion } from 'framer-motion';
import { useSync } from '@/lib/sync';
import type { SyncState } from '@/lib/store';

interface SyncStatusProps {
  /** @deprecated — component now reads real sync state from the zustand store. */
  isOnline?: boolean;
}

function labelFor(state: SyncState, lastSync: string | null): { text: string; cls: string } {
  switch (state) {
    case 'offline':
      return { text: 'OFFLINE • LOCAL MODE', cls: 'text-accent-red' };
    case 'syncing':
      return { text: 'SYNCING…', cls: 'text-accent-yellow' };
    case 'error':
      return { text: 'SYNC ERROR', cls: 'text-accent-red' };
    case 'idle':
    default: {
      const when = lastSync ? ` • ${new Date(lastSync).toLocaleTimeString('en-US', { hour12: false })}` : ' • SYNCED';
      return { text: `ONLINE${when}`, cls: 'text-accent-green' };
    }
  }
}

export default function SyncStatus({ isOnline }: SyncStatusProps) {
  const { syncState, lastSync, outboxCount } = useSync();
  // If the store hasn't initialized yet, fall back to the navigator prop.
  const effective: SyncState = syncState === 'idle' && isOnline === false ? 'offline' : syncState;
  const animating = effective === 'syncing' || effective === 'idle';
  const waveCount = 5;
  const { text, cls } = labelFor(effective, lastSync);

  return (
    <div className="flex items-center gap-2 text-xs text-text-secondary" title={outboxCount > 0 ? `${outboxCount} change(s) pending sync` : 'All changes synced'}>
      <div className="flex items-center gap-[1px] h-4">
        {Array.from({ length: waveCount }).map((_, i) => (
          <motion.div
            key={i}
            className="w-[2px] bg-accent-green rounded-full"
            style={{ height: '100%' }}
            animate={animating ? { scaleY: [0.2, 1, 0.2] } : { scaleY: 0.2 }}
            transition={
              animating
                ? { duration: 0.8, repeat: Infinity, delay: i * 0.1, ease: 'easeInOut' }
                : {}
            }
          />
        ))}
      </div>
      <span className="uppercase tracking-widest">
        <span className={cls}>{text}</span>
        {outboxCount > 0 && <span className="text-accent-yellow"> • {outboxCount} pending</span>}
      </span>
    </div>
  );
}
