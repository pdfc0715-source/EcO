import React from 'react';
import { Bell, Download, ShieldCheck, Settings, Menu, Coffee, LogOut, Sparkles } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Avatar } from './ui/Avatar';
import { AuthUserProfile } from '../data/firebase';

interface HeaderProps {
  onOpenNotifications: () => void;
  onOpenSettings: () => void;
  onOpenSupport: () => void;
  onOpenExportReport?: () => void;
  onOpenMobileDrawer?: () => void;
  onSignOut?: () => void;
  user?: AuthUserProfile | null;
  unreadCount: number;
  currentTabName?: string;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNotifications,
  onOpenSettings,
  onOpenSupport,
  onOpenExportReport,
  onOpenMobileDrawer,
  onSignOut,
  user,
  unreadCount,
  currentTabName
}) => {
  const { isInstallable, install } = usePWAInstall();

  return (
    <header className="fixed top-0 left-0 lg:left-60 right-0 h-14 bg-[#111317]/95 backdrop-blur-md border-b border-[#3D4943]/30 z-20 px-3 sm:px-4 lg:px-8 flex items-center justify-between">
      {/* Left zone: Drawer trigger on mobile + Brand icon (Mobile only, desktop uses sidebar brand) */}
      <div className="flex items-center gap-2.5">
        {onOpenMobileDrawer && (
          <button
            onClick={onOpenMobileDrawer}
            className="lg:hidden p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded hover:bg-[#1A1C20] text-[#BCCAC1] hover:text-[#E2E2E8] transition-colors cursor-pointer"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        {/* Brand Icon — Mobile only to prevent desktop duplicate with sidebar */}
        <div
          className="lg:hidden w-8 h-8 rounded bg-[#1A1C20] border border-[#73E3B4]/40 flex items-center justify-center text-[#73E3B4] font-bold text-xs select-none shadow-sm"
          title="EcO Smart Ledger"
        >
          Ec
        </div>
      </div>

      {/* Right zone: Export Report button, Support button, PWA Install button, Notification bell, and User Profile / Settings */}
      <div className="flex items-center gap-1.5 sm:gap-2.5">
        {/* Export Report CTA Button */}
        {onOpenExportReport && (
          <button
            type="button"
            onClick={onOpenExportReport}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 min-h-[36px] rounded-lg bg-[#1E2024] hover:bg-[#282A2E] border border-[#73E3B4]/40 active:scale-[0.98] text-xs text-[#73E3B4] font-semibold shadow-xs transition-all cursor-pointer"
            title="Generate branded monthly report & story card (PDF & Image)"
            aria-label="Export Report"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export Report</span>
            <span className="sm:hidden">Report</span>
          </button>
        )}

        {/* Support CTA Button — Warm Golden Yellow */}
        <button
          onClick={onOpenSupport}
          className="flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] rounded-lg bg-[#FFDD00] hover:bg-[#FACC15] active:scale-[0.98] text-xs text-[#1A1C20] font-bold shadow-sm transition-all cursor-pointer"
          title="Buy me a coffee — Support EcO"
          aria-label="Support EcO"
        >
          <Coffee className="w-3.5 h-3.5 stroke-[2.5]" />
          <span className="hidden sm:inline">Support</span>
        </button>

        {/* PWA Install Button if available */}
        {isInstallable && (
          <button
            onClick={install}
            className="flex items-center gap-1.5 px-2.5 py-1 min-h-[36px] rounded-lg bg-[#1E2024] hover:bg-[#282A2E] border border-[#73E3B4]/40 text-xs text-[#73E3B4] font-medium transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Install</span>
          </button>
        )}

        {/* Notification Bell */}
        <button
          onClick={onOpenNotifications}
          className="relative p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg hover:bg-[#1A1C20] text-[#BCCAC1] hover:text-[#E2E2E8] transition-colors cursor-pointer"
          aria-label="Notifications"
          title={`Notification & Requests Inbox ${unreadCount > 0 ? `(${unreadCount} pending)` : ''}`}
        >
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-[#55C79A] text-[#003826] font-mono font-bold text-[10px] flex items-center justify-center shadow-md animate-pulse">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className={`p-2 min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
            currentTabName === 'Settings'
              ? 'bg-[#1E2024] text-[#73E3B4] border border-[#73E3B4]/40'
              : 'hover:bg-[#1A1C20] text-[#BCCAC1] hover:text-[#E2E2E8]'
          }`}
          aria-label="Settings"
          title="Settings & Data Management"
        >
          <Settings className="w-4 h-4" />
        </button>

        {/* User Profile Avatar with trigger to Settings */}
        {user && (
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex items-center gap-2 pl-1.5 pr-2 py-1 rounded-full bg-[#1A1C20] hover:bg-[#282A2E] border border-[#3D4943]/40 transition-colors cursor-pointer ml-1"
            title={`Signed in as ${user.displayName || user.email} · Click to open Profile in Settings`}
          >
            <Avatar photoURL={user.photoURL} name={user.displayName || user.email} size="sm" />
            <span className="hidden md:inline text-xs font-semibold text-[#E2E2E8] max-w-[100px] truncate">
              {user.displayName?.split(' ')[0] || 'User'}
            </span>
          </button>
        )}
      </div>
    </header>
  );
};
