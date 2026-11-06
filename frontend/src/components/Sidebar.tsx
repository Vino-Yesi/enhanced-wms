import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth, type UserRole } from '@/lib/auth';
import {
  LayoutDashboard,
  Package,
  PackageOpen,
  ClipboardList,
  RotateCcw,
  ScanBarcode,
  Scale,
  RefreshCw,
  Settings,
  Users,
  LogOut,
  Hexagon,
  BarChart3,
  ClipboardCheck,
  Zap,
  ShieldCheck,
  FileText,
  Brain,
  Smartphone,
  Shield,
  X,
  Camera,
  QrCode,
  Barcode,
  Truck,
  UsersRound,
  Plug,
} from 'lucide-react';

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  path: string;
  /** Roles allowed to see this item. Omit = all authenticated roles. */
  roles?: UserRole[];
}

// Role visibility per contract §2 / §9:
//  - operator: operational pages only
//  - supervisor + analytics/labor/posting view
//  - admin + users/settings(integrations)/sim/guardian
//  - auditor: read-only + audit (sees ops + analytics/labor + Auditor page)
const SUPERVISOR_PLUS: UserRole[] = ['admin', 'supervisor', 'auditor'];
const ADMIN_ONLY: UserRole[] = ['admin'];
const AUDIT_VIEW: UserRole[] = ['admin', 'auditor'];

const navItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', path: '/' },
  { icon: Package, label: 'Inbound Receiving', path: '/inbound' },
  { icon: ClipboardList, label: 'Inventory Hub', path: '/inventory' },
  { icon: PackageOpen, label: 'Pick & Pack', path: '/pick-pack' },
  { icon: RotateCcw, label: 'Returns', path: '/returns' },
  { icon: ScanBarcode, label: 'PDF Sequencer', path: '/pdf-sequencer' },
  { icon: Scale, label: 'Auditor', path: '/auditor', roles: AUDIT_VIEW },
  { icon: RefreshCw, label: 'Bulk Converter', path: '/bulk-convert' },
  { icon: FileText, label: 'Templates', path: '/templates' },
  { icon: Brain, label: 'Memory', path: '/memory' },
];

const advancedItems: NavItem[] = [
  { icon: ClipboardCheck, label: 'Cycle Count', path: '/cycle-count' },
  { icon: BarChart3, label: 'Analytics', path: '/analytics', roles: SUPERVISOR_PLUS },
  { icon: Zap, label: 'Replenishment', path: '/replenishment' },
  { icon: ShieldCheck, label: 'QC Management', path: '/qc' },
  { icon: Camera, label: 'Posting Tracker', path: '/posting-tracker', roles: SUPERVISOR_PLUS },
  { icon: QrCode, label: 'Barcode Scanner', path: '/barcode-scanner' },
  { icon: Barcode, label: 'Barcode Generator', path: '/barcode-generator' },
  { icon: Truck, label: 'Shipping', path: '/shipping' },
  { icon: UsersRound, label: 'Labor', path: '/labor', roles: SUPERVISOR_PLUS },
  { icon: Plug, label: 'Integrations', path: '/integrations', roles: ADMIN_ONLY },
];

const adminItems: NavItem[] = [
  { icon: Users, label: 'User Management', path: '/users', roles: ADMIN_ONLY },
  { icon: Smartphone, label: 'SIM Manager', path: '/sim-manager', roles: ADMIN_ONLY },
  { icon: Shield, label: 'Guardian Ops', path: '/guardian', roles: ADMIN_ONLY },
];

export default function Sidebar({ mobileOpen, onClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAdmin, logout, user } = useAuth();
  const role: UserRole = user?.role ?? 'operator';

  const visible = (item: NavItem) => !item.roles || item.roles.includes(role);
  const showAdminSection = adminItems.some(visible);

  const handleNav = (path: string) => {
    navigate(path);
    if (onClose) onClose();
  };

  const renderNavItems = (items: NavItem[]) =>
    items.filter(visible).map((item) => {
      const isActive = location.pathname === item.path;
      return (
        <button
          key={item.path}
          onClick={() => handleNav(item.path)}
          className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 group ${
            isActive
              ? 'bg-surface-hover text-text-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover/50'
          }`}
        >
          {isActive && (
            <motion.div
              layoutId="activeNav"
              className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-5 bg-accent-sky rounded-r-full"
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <item.icon className={`w-4 h-4 ${isActive ? 'text-accent-sky' : ''}`} />
          <span className="font-medium">{item.label}</span>
        </button>
      );
    });

  const renderAdminSection = () =>
    showAdminSection && (
      <>
        <div className="text-[10px] text-text-secondary uppercase tracking-widest px-3 mb-2 mt-4">Administration</div>
        {renderNavItems(adminItems)}
      </>
    );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-full w-[240px] bg-surface border-r border-white/[0.06] flex-col z-50">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/[0.06]">
          <div className="w-9 h-9 bg-accent-sky rounded-lg flex items-center justify-center">
            <Hexagon className="w-5 h-5 text-void" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-text-primary tracking-tight">YESI-FULFILLMENT</h1>
            <p className="text-[10px] text-text-secondary uppercase tracking-widest">Warehouse Ops</p>
          </div>
        </div>
        {/* Navigation */}
        <nav className="flex-1 py-3 px-3 overflow-y-auto">
          <div className="text-[10px] text-text-secondary uppercase tracking-widest px-3 mb-2 mt-2">Operations</div>
          {renderNavItems(navItems)}
          <div className="text-[10px] text-text-secondary uppercase tracking-widest px-3 mb-2 mt-4">Advanced</div>
          {renderNavItems(advancedItems)}
          {renderAdminSection()}
        </nav>
        {/* Bottom */}
        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={() => handleNav('/settings')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 mb-1 ${
              location.pathname === '/settings'
                ? 'bg-surface-hover text-text-primary'
                : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover/50'
            }`}
          >
            <Settings className="w-4 h-4" />
            <span className="font-medium">Settings</span>
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-text-secondary hover:text-accent-red hover:bg-accent-red/10 transition-all duration-150"
          >
            <LogOut className="w-4 h-4" />
            <span className="font-medium">Sign Out</span>
          </button>
        </div>
      </aside>
      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
            />
            {/* Drawer */}
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              className="lg:hidden fixed left-0 top-0 h-full w-[260px] bg-surface border-r border-white/[0.06] flex-col z-50 flex"
            >
              {/* Logo + Close */}
              <div className="flex items-center justify-between px-4 py-4 border-b border-white/[0.06]">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-accent-sky rounded-lg flex items-center justify-center">
                    <Hexagon className="w-4 h-4 text-void" />
                  </div>
                  <div>
                    <h1 className="text-sm font-bold text-text-primary tracking-tight">YESI-FULFILLMENT</h1>
                    <p className="text-[10px] text-text-secondary uppercase tracking-widest">Warehouse Ops</p>
                  </div>
                </div>
                <button onClick={onClose} className="p-1 text-text-secondary hover:text-text-primary">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Navigation */}
              <nav className="flex-1 py-3 px-3 overflow-y-auto">
                <div className="text-[10px] text-text-secondary uppercase tracking-widest px-3 mb-2 mt-2">Operations</div>
                {renderNavItems(navItems)}
                <div className="text-[10px] text-text-secondary uppercase tracking-widest px-3 mb-2 mt-4">Advanced</div>
                {renderNavItems(advancedItems)}
                {renderAdminSection()}
              </nav>
              {/* Bottom */}
              <div className="p-3 border-t border-white/[0.06]">
                <button
                  onClick={() => handleNav('/settings')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-all duration-150 mb-1 ${
                    location.pathname === '/settings'
                      ? 'bg-surface-hover text-text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-surface-hover/50'
                  }`}
                >
                  <Settings className="w-4 h-4" />
                  <span className="font-medium">Settings</span>
                </button>
                <button
                  onClick={() => { logout(); if (onClose) onClose(); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-text-secondary hover:text-accent-red hover:bg-accent-red/10 transition-all duration-150"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
