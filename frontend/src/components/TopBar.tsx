import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import SyncStatus from './SyncStatus';
import { User, Shield, Menu } from 'lucide-react';

interface TopBarProps {
  onMenuToggle?: () => void;
}

export default function TopBar({ onMenuToggle }: TopBarProps) {
  const { user, isAdmin } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const timer = setInterval(() => setCurrentTime(new Date()), 1000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(timer);
    };
  }, []);

  return (
    <header className="fixed top-0 left-0 lg:left-[240px] right-0 h-14 glass-panel border-b border-white/[0.06] flex items-center justify-between px-4 lg:px-5 z-40">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 -ml-2 text-text-secondary hover:text-text-primary rounded-md hover:bg-white/5 transition-colors"
          aria-label="Toggle menu"
        >
          <Menu className="w-5 h-5" />
        </button>
        <SyncStatus isOnline={isOnline} />
      </div>

      <div className="flex items-center gap-3 lg:gap-5">
        <div className="text-xs text-text-secondary font-mono hidden sm:block">
          {currentTime.toLocaleTimeString('en-US', { hour12: false })}
          {' \u2022 '}
          {currentTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>

        <div className="h-5 w-px bg-white/10 hidden sm:block" />

        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-accent-sky/20 flex items-center justify-center">
            {isAdmin ? (
              <Shield className="w-3.5 h-3.5 text-accent-sky" />
            ) : (
              <User className="w-3.5 h-3.5 text-accent-sky" />
            )}
          </div>
          <div className="hidden sm:flex flex-col">
            <span className="text-xs font-semibold text-text-primary leading-tight">
              {user?.displayName || 'Unknown'}
            </span>
            <span className="text-[10px] text-text-secondary uppercase tracking-wider">
              {isAdmin ? 'Admin' : 'Operator'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
