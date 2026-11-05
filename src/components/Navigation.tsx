import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  WalletCards,
  Users2,
  BarChart3,
  Settings,
  Plus,
  X,
  MessageSquareHeart,
  Download,
  Smartphone,
  LogOut,
  Bell,
  Scale
} from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Avatar } from './ui/Avatar';
import { AuthUserProfile } from '../data/firebase';

export type NavTab = 'dashboard' | 'list' | 'settlements' | 'wallets' | 'people' | 'stats' | 'settings';

interface NavigationProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onOpenAddModal: () => void;
  onOpenNotifications?: () => void;
  onOpenFeedback: () => void;
  onOpenSupport: () => void;
  onSignOut?: () => void;
  user?: AuthUserProfile | null;
  unreadNotificationCount: number;
  isMobileDrawerOpen?: boolean;
  onCloseMobileDrawer?: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({
  currentTab,
  onSelectTab,
  onOpenAddModal,
  onOpenNotifications,
  onOpenFeedback,
  onOpenSupport,
  onSignOut,
  user,
  unreadNotificationCount = 0,
  isMobileDrawerOpen = false,
  onCloseMobileDrawer
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstallGuide, setShowInstallGuide] = useState(false);
  const navItems = [
    { id: 'dashboard' as NavTab, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'list' as NavTab, label: 'Ledger History', icon: ReceiptText },
    { id: 'settlements' as NavTab, label: 'Smart Settlement', icon: Scale },
    { id: 'wallets' as NavTab, label: 'Wallets', icon: WalletCards },
    { id: 'people' as NavTab, label: 'People & Debts', icon: Users2 },
    { id: 'stats' as NavTab, label: 'Statistics', icon: BarChart3 },
    { id: 'settings' as NavTab, label: 'Settings', icon: Settings }
  ];

  // Prevent scroll when mobile drawer is open
  useEffect(() => {
    if (isMobileDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileDrawerOpen]);

  return (
    <>
      {/* --- Desktop Left Sidebar (240px / w-60) --- */}
      <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-60 flex-col bg-[#0C0E12] border-r border-[#3D4943]/40 z-30 select-none">
        {/* Brand header */}
        <div className="h-14 flex items-center px-5 border-b border-[#3D4943]/30">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded bg-[#1A1C20] border border-[#73E3B4]/40 flex items-center justify-center text-[#73E3B4] font-bold text-sm tracking-wider shadow-sm">
              Ec
            </div>
            <div>
              <div className="text-base font-bold text-[#E2E2E8] tracking-tight leading-none">
                EcO
              </div>
              <div className="text-[10px] text-[#BCCAC1] font-medium tracking-wider uppercase mt-0.5">
                Smart Ledger
              </div>
            </div>
          </div>
        </div>

        {/* Primary Add Entry CTA */}
        <div className="p-3">
          <button
            onClick={onOpenAddModal}
            className="w-full h-10 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] active:scale-[0.98] transition-all text-[#003826] font-semibold text-xs tracking-wide flex items-center justify-center gap-2 shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Add Entry</span>
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                  isActive
                    ? 'bg-[#1E2024] text-[#73E3B4] border-l-2 border-[#73E3B4]'
                    : 'text-[#BCCAC1] hover:text-[#E2E2E8] hover:bg-[#1A1C20]'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#73E3B4]' : 'text-[#87948C]'}`} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        {/* User Profile Card in Sidebar Footer */}
        {user && (
          <div className="px-3 py-2 border-t border-[#3D4943]/30">
            <div className="p-2.5 rounded-xl bg-[#1A1C20] border border-[#3D4943]/40 flex items-center justify-between gap-2">
              <div
                onClick={() => onSelectTab('settings')}
                className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1 group"
                title="View Account Profile in Settings"
              >
                <Avatar photoURL={user.photoURL} name={user.displayName || user.email} size="sm" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#E2E2E8] truncate group-hover:text-[#73E3B4] transition-colors">
                    {user.displayName || 'EcO User'}
                  </div>
                  <div className="text-[10px] text-[#87948C] truncate font-mono">
                    {user.email || 'Online Account'}
                  </div>
                </div>
              </div>
              {onSignOut && (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="p-1.5 rounded-lg text-[#87948C] hover:text-[#FFB4AB] hover:bg-[#282A2E] transition-colors cursor-pointer"
                  title="Sign Out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Secondary Actions: Notifications, Install Web App & Feedback ("অ্যাপ রে গালাবো") */}
        <div className="px-3 py-2 border-t border-[#3D4943]/30 space-y-1">
          {onOpenNotifications && (
            <button
              type="button"
              onClick={onOpenNotifications}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left text-[#BCCAC1] hover:text-[#73E3B4] hover:bg-[#1A1C20] group cursor-pointer"
              title="Open notifications and pending proposals"
            >
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-[#73E3B4] group-hover:scale-105 transition-transform" />
                <span>Inbox & Requests</span>
              </div>
              {unreadNotificationCount > 0 && (
                <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#55C79A] text-[#003826] font-mono font-bold text-[10px] flex items-center justify-center">
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </span>
              )}
            </button>
          )}
          {!isInstalled && (
            <button
              type="button"
              onClick={async () => {
                if (isInstallable) {
                  await install();
                } else {
                  setShowInstallGuide(true);
                }
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left text-[#BCCAC1] hover:text-[#73E3B4] hover:bg-[#1A1C20] group cursor-pointer"
              title="Install as Web App"
            >
              <Download className="w-4 h-4 text-[#73E3B4] group-hover:scale-105 transition-transform" />
              <span>Install Web App</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenFeedback}
            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors text-left text-[#BCCAC1] hover:text-[#73E3B4] hover:bg-[#1A1C20] group cursor-pointer"
            title="অভিযোগ, পরামর্শ বা বাগ রিপোর্ট জানান"
          >
            <MessageSquareHeart className="w-4 h-4 text-[#73E3B4] group-hover:scale-105 transition-transform" />
            <span>অ্যাপ রে গালাবো</span>
          </button>
        </div>

      </aside>

      {/* --- Mobile Navigation Drawer (Slide-out from left) --- */}
      {isMobileDrawerOpen && (
        <div
          className="lg:hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={onCloseMobileDrawer}
        >
          <div
            className="w-64 max-w-[80vw] h-full bg-[#0C0E12] border-r border-[#3D4943]/50 flex flex-col shadow-2xl animate-in slide-in-from-left duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div className="h-14 flex items-center justify-between px-4 border-b border-[#3D4943]/30">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-[#1A1C20] border border-[#73E3B4]/40 flex items-center justify-center text-[#73E3B4] font-bold text-xs">
                  Ec
                </div>
                <span className="font-bold text-sm text-[#E2E2E8]">EcO Smart Ledger</span>
              </div>
              <button
                onClick={onCloseMobileDrawer}
                className="p-1.5 rounded text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Profile in Mobile Drawer */}
            {user && (
              <div className="p-3 border-b border-[#3D4943]/30 bg-[#1A1C20]/40">
                <div className="flex items-center justify-between gap-2">
                  <div
                    onClick={() => {
                      onCloseMobileDrawer?.();
                      onSelectTab('settings');
                    }}
                    className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1"
                  >
                    <Avatar photoURL={user.photoURL} name={user.displayName || user.email} size="sm" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[#E2E2E8] truncate">
                        {user.displayName || 'EcO User'}
                      </div>
                      <div className="text-[10px] text-[#87948C] truncate font-mono">
                        {user.email || 'Online'}
                      </div>
                    </div>
                  </div>
                  {onSignOut && (
                    <button
                      type="button"
                      onClick={() => {
                        onCloseMobileDrawer?.();
                        onSignOut();
                      }}
                      className="p-1.5 rounded-lg text-[#87948C] hover:text-[#FFB4AB] hover:bg-[#282A2E] cursor-pointer"
                      title="Sign Out"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Quick Add CTA */}
            <div className="p-3">
              <button
                onClick={() => {
                  onCloseMobileDrawer?.();
                  onOpenAddModal();
                }}
                className="w-full h-10 rounded-lg bg-[#55C79A] text-[#003826] font-semibold text-xs flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Entry</span>
              </button>
            </div>

            {/* Nav list */}
            <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentTab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectTab(item.id);
                      onCloseMobileDrawer?.();
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-lg text-xs font-medium transition-colors text-left cursor-pointer ${
                      isActive
                        ? 'bg-[#1E2024] text-[#73E3B4] border-l-2 border-[#73E3B4]'
                        : 'text-[#BCCAC1] hover:text-[#E2E2E8] hover:bg-[#1A1C20]'
                    }`}
                  >
                    <Icon className={`w-4 h-4 ${isActive ? 'text-[#73E3B4]' : 'text-[#87948C]'}`} />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Mobile Drawer Bottom Actions */}
            <div className="px-3 py-2 border-t border-[#3D4943]/30 space-y-1">
              {!isInstalled && (
                <button
                  type="button"
                  onClick={async () => {
                    onCloseMobileDrawer?.();
                    if (isInstallable) {
                      await install();
                    } else {
                      setShowInstallGuide(true);
                    }
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left text-[#BCCAC1] hover:text-[#73E3B4] hover:bg-[#1A1C20] group cursor-pointer"
                >
                  <Download className="w-4 h-4 text-[#73E3B4] group-hover:scale-105 transition-transform" />
                  <span>Install Web App</span>
                </button>
              )}

              {onOpenNotifications && (
                <button
                  type="button"
                  onClick={() => {
                    onCloseMobileDrawer?.();
                    onOpenNotifications();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left text-[#BCCAC1] hover:text-[#73E3B4] hover:bg-[#1A1C20] group cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <Bell className="w-4 h-4 text-[#73E3B4] group-hover:scale-105 transition-transform" />
                    <span>Inbox & Requests</span>
                  </div>
                  {unreadNotificationCount > 0 && (
                    <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-[#55C79A] text-[#003826] font-mono font-bold text-[10px] flex items-center justify-center">
                      {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                    </span>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  onCloseMobileDrawer?.();
                  onOpenFeedback();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left text-[#BCCAC1] hover:text-[#73E3B4] hover:bg-[#1A1C20] group cursor-pointer"
              >
                <MessageSquareHeart className="w-4 h-4 text-[#73E3B4] group-hover:scale-105 transition-transform" />
                <span>অ্যাপ রে গালাবো</span>
              </button>

              {onSignOut && (
                <button
                  type="button"
                  onClick={() => {
                    onCloseMobileDrawer?.();
                    onSignOut();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-colors text-left text-[#FFB4AB] hover:bg-[#FFB4AB]/10 cursor-pointer"
                >
                  <LogOut className="w-4 h-4 text-[#FFB4AB]" />
                  <span>Sign Out</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Mobile Bottom Tab Bar (Fixed) --- */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0C0E12]/95 backdrop-blur-md border-t border-[#3D4943]/40 z-30 flex items-center justify-around px-2">
        <button
          type="button"
          onClick={() => onSelectTab('dashboard')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] cursor-pointer ${
            currentTab === 'dashboard' ? 'text-[#73E3B4]' : 'text-[#87948C]'
          }`}
        >
          <LayoutDashboard className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] font-medium truncate">Home</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('list')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] cursor-pointer ${
            currentTab === 'list' ? 'text-[#73E3B4]' : 'text-[#87948C]'
          }`}
        >
          <ReceiptText className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] font-medium truncate">History</span>
        </button>

        {/* Central Prominent Quick '+' Add Entry Button */}
        <button
          type="button"
          onClick={onOpenAddModal}
          className="flex flex-col items-center justify-center flex-1 py-1 -mt-4 transition-transform active:scale-95 cursor-pointer group"
          aria-label="Add Entry"
          title="Add Expense, Inflow, Transfer, or Debt"
        >
          <div className="w-11 h-11 rounded-full bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] shadow-lg shadow-[#55C79A]/20 flex items-center justify-center transition-all group-hover:scale-105 border-2 border-[#0C0E12]">
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </div>
          <span className="text-[9px] font-semibold text-[#73E3B4] mt-0.5">Add</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('wallets')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] cursor-pointer ${
            currentTab === 'wallets' ? 'text-[#73E3B4]' : 'text-[#87948C]'
          }`}
        >
          <WalletCards className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] font-medium truncate">Wallets</span>
        </button>

        <button
          type="button"
          onClick={() => onSelectTab('people')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors min-h-[44px] cursor-pointer ${
            currentTab === 'people' ? 'text-[#73E3B4]' : 'text-[#87948C]'
          }`}
        >
          <Users2 className="w-4 h-4 mb-0.5" />
          <span className="text-[10px] font-medium truncate">People</span>
        </button>
      </nav>

      {/* iOS Safari Install Guide Modal */}
      {showInstallGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setShowInstallGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-xl bg-[#1A1C20] border border-[#3D4943]/60 p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-2">
              <h3 className="text-sm font-semibold text-[#E2E2E8]">Install EcO on Device</h3>
              <button
                onClick={() => setShowInstallGuide(false)}
                className="text-[#87948C] hover:text-[#E2E2E8]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-[#BCCAC1] leading-relaxed">
              Tap the browser share or menu button and select <strong>"Add to Home Screen"</strong> to run EcO as a fast standalone app with offline caching.
            </p>
            <button
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-2 rounded-lg bg-[#55C79A] text-[#003826] font-semibold text-xs"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
};
