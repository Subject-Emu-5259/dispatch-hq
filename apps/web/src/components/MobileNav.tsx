// ============================================
// Dispatch HQ — Mobile Bottom Navigation
// ============================================
// Phone-first bottom nav: the four core tabs plus a Dispatch HQ command
// button. Tablets/desktop (md+) keep the TopBar tab strip instead — this
// bar is hidden there. Includes safe-area padding for notched phones.
// The active tab gets a sliding pill (framer-motion layoutId) so the
// selection state reads at a glance and glides between tabs.
//
// v0.29.0: a fifth "More" column opens a bottom sheet with the destinations
// that otherwise lived 2 taps deep (hamburger → sidebar) on phones —
// Leaderboard, Public Chat, Notifications, Pause, Log Out — so every major
// surface is one tap from the primary phone nav.

import { Radio, Building2, Truck, Users, MoreHorizontal, Trophy, MessageSquare, Bell, Pause, LogOut, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useState } from 'react';
import { useGameStore } from '@/stores/gameStore';
import { missionService } from '@/lib/rewards';

type NavTab = 'missions' | 'stations' | 'units' | 'employees' | 'leaderboard' | 'chat';

interface MobileNavProps {
  activeTab: NavTab;
  onTabChange: (tab: NavTab) => void;
  onOpenNotifications?: () => void;
  onPause?: () => void;
  onLogout?: () => void;
}

export function MobileNav({ activeTab, onTabChange, onOpenNotifications, onPause, onLogout }: MobileNavProps) {
  const { missions, selectedService, showDispatchCenter, toggleDispatchCenter } = useGameStore();
  const [moreOpen, setMoreOpen] = useState(false);

  // Department-only badge — cross-service Mutual Aid calls live in their own
  // labeled section and must not inflate your department's call count.
  const activeMissions = missions.filter(
    (m) => (m.status === 'active' || m.status === 'dispatching')
      && (!selectedService || missionService(m) === selectedService)
  ).length;

  const tabs: { id: NavTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'missions', label: 'Calls', icon: <Radio className="w-5 h-5" />, badge: activeMissions },
    { id: 'stations', label: 'Stations', icon: <Building2 className="w-5 h-5" /> },
    { id: 'units', label: 'Units', icon: <Truck className="w-5 h-5" /> },
    { id: 'employees', label: 'Crew', icon: <Users className="w-5 h-5" /> },
  ];

  const renderTab = (tab: (typeof tabs)[number]) => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => {
          setMoreOpen(false);
          onTabChange(tab.id);
        }}
        aria-label={tab.label}
        aria-current={isActive ? 'page' : undefined}
        className={`relative flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-semibold
                    transition-colors active:scale-95 ${isActive ? 'text-dispatch-red' : 'text-gray-500 hover:text-gray-300'}`}
      >
        <span className="relative flex items-center justify-center w-11 h-8 rounded-xl">
          {isActive && (
            <motion.span
              layoutId="mobilenav-active-pill"
              className="absolute inset-0 bg-dispatch-red/15 border border-dispatch-red/25 rounded-xl shadow-inner"
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
            />
          )}
          <span className="relative">
            {tab.icon}
            {tab.badge != null && tab.badge > 0 && (
              <span className="absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 flex items-center justify-center
                               bg-amber-500 text-[9px] font-bold text-gray-900 rounded-full ring-2 ring-gray-950">
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            )}
          </span>
        </span>
        <span className="relative">{tab.label}</span>
      </button>
    );
  };

  const moreItems: { id: string; label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[] = [
    { id: 'leaderboard', label: 'Leaderboard', icon: <Trophy className="w-4 h-4" />, onClick: () => onTabChange('leaderboard') },
    { id: 'chat', label: 'Public Chat', icon: <MessageSquare className="w-4 h-4" />, onClick: () => onTabChange('chat') },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="w-4 h-4" />, onClick: () => onOpenNotifications?.() },
    { id: 'pause', label: 'Pause', icon: <Pause className="w-4 h-4" />, onClick: () => onPause?.() },
    { id: 'logout', label: 'Log Out', icon: <LogOut className="w-4 h-4" />, onClick: () => onLogout?.(), danger: true },
  ];

  const closeMore = () => setMoreOpen(false);

  return (
    <>
      <nav
        className="md:hidden absolute bottom-0 left-0 right-0 z-40 bg-gray-950/95 backdrop-blur-md border-t border-gray-800/60"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-stretch h-16">
          {tabs.slice(0, 2).map(renderTab)}

          {/* Dispatch HQ command button */}
          <div className="flex flex-col items-center justify-center flex-1 px-1">
            <button
              onClick={() => { closeMore(); toggleDispatchCenter(); }}
              aria-label="Dispatch HQ"
              title="Dispatch HQ"
              className={`w-11 h-11 rounded-full flex items-center justify-center shadow-lg transition-all active:scale-95 overflow-hidden ${
                showDispatchCenter
                  ? 'ring-2 ring-red-400/60 shadow-red-500/40'
                  : 'ring-2 ring-transparent'
              }`}
            >
              <img
                src="/logo.png?v=13"
                alt="Dispatch HQ"
                className="w-full h-full object-cover"
              />
            </button>
            <span className={`text-[9px] font-semibold mt-0.5 ${showDispatchCenter ? 'text-dispatch-red' : 'text-gray-500'}`}>
              Dispatch
            </span>
          </div>

          {tabs.slice(2).map(renderTab)}

          {/* More column — opens the bottom sheet (v0.29.0) */}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            aria-label="More options"
            aria-expanded={moreOpen}
            className={`relative flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-semibold
                        transition-colors active:scale-95 ${moreOpen ? 'text-dispatch-red' : 'text-gray-500 hover:text-gray-300'}`}
          >
            <span className="relative flex items-center justify-center w-11 h-8 rounded-xl">
              {moreOpen && (
                <motion.span
                  layoutId="mobilenav-active-pill"
                  className="absolute inset-0 bg-dispatch-red/15 border border-dispatch-red/25 rounded-xl shadow-inner"
                  transition={{ type: 'spring', damping: 28, stiffness: 340 }}
                />
              )}
              <MoreHorizontal className="w-5 h-5" />
            </span>
            <span className="relative">More</span>
          </button>
        </div>
      </nav>

      {/* More bottom sheet */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeMore}
              className="md:hidden fixed inset-0 z-[45] bg-black/50 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 32, stiffness: 320 }}
              className="md:hidden fixed inset-x-0 bottom-0 z-[45] bg-gray-900/95 backdrop-blur-md border-t border-gray-800 rounded-t-2xl shadow-2xl"
              style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
              role="dialog"
              aria-label="More options"
            >
              <div className="flex items-center justify-between px-4 pt-3 pb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">More</span>
                <button onClick={closeMore} aria-label="Close more options" className="p-1.5 rounded-lg hover:bg-gray-800 transition-colors">
                  <X className="w-4 h-4 text-gray-400" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 px-3 pb-1">
                {moreItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => { closeMore(); item.onClick(); }}
                    className={`flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-medium border transition-colors active:scale-95 ${
                      item.danger
                        ? 'text-red-400 border-red-500/25 bg-red-500/10 hover:bg-red-500/20'
                        : 'text-gray-200 border-gray-800 bg-gray-800/40 hover:bg-gray-800/80'
                    }`}
                  >
                    {item.icon}
                    {item.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
