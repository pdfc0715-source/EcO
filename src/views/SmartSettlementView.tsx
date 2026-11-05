import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Users,
  CheckCircle2,
  Receipt,
  Coins,
  ChevronRight,
  Archive,
  ArrowRight
} from 'lucide-react';
import { SmartSettlement } from '../domain/settlementTypes';
import { calculateSettlementSummary, poishaToTaka } from '../domain/settlementEngine';
import { formatTaka } from '../domain/money';
import { formatDisplayDate } from '../domain/dates';
import { PaymentMethod } from '../domain/types';
import { CreateSettlementModal } from '../components/settlement/CreateSettlementModal';
import { SettlementDetailDashboard } from '../components/settlement/SettlementDetailDashboard';

interface SmartSettlementViewProps {
  settlements: SmartSettlement[];
  wallets: PaymentMethod[];
  currentUserName?: string;
  showToast?: (msg: string) => void;
}

export const SmartSettlementView: React.FC<SmartSettlementViewProps> = ({
  settlements,
  wallets,
  currentUserName = 'You',
  showToast
}) => {
  const [selectedSettlementId, setSelectedSettlementId] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [filterTab, setFilterTab] = useState<'active' | 'settled' | 'archived'>('active');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const activeSettlement = useMemo(() => {
    return settlements.find((s) => s.id === selectedSettlementId);
  }, [settlements, selectedSettlementId]);

  // If a settlement is selected, render its full dashboard
  if (activeSettlement) {
    return (
      <SettlementDetailDashboard
        settlement={activeSettlement}
        onBack={() => setSelectedSettlementId(null)}
        wallets={wallets}
        showToast={showToast}
      />
    );
  }

  // Filter settlements
  const filteredSettlements = settlements.filter((s) => {
    // Search query matching title or member names
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = s.name.toLowerCase().includes(q);
      const matchMember = s.members.some((m) => m.name.toLowerCase().includes(q));
      if (!matchName && !matchMember) return false;
    }

    if (filterTab === 'archived') {
      return s.status === 'archived';
    }

    if (s.status === 'archived') return false;

    const summary = calculateSettlementSummary(s);
    if (filterTab === 'settled') {
      return summary.allSettled;
    }
    // Active tab: has unsettled balances
    return !summary.allSettled;
  });

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0C0E12] text-[#E2E2E8]">
      {/* Top Header */}
      <div className="px-4 sm:px-8 py-6 border-b border-[#3D4943]/40 bg-[#0C0E12]">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-[#55C79A]/20 border border-[#55C79A]/40 flex items-center justify-center text-[#73E3B4]">
                <Users className="w-4 h-4" />
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#E2E2E8]">Smart Settlement</h1>
            </div>
            <p className="text-xs text-[#87948C]">
              Fair, transparent group expense splitting & debt settling. Zero mental math.
            </p>
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="self-start sm:self-auto px-4 py-2.5 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-bold text-xs flex items-center gap-2 shadow-sm cursor-pointer transition-all active:scale-95"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>New Settlement</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#14161A] border border-[#3D4943]/40 self-start">
            {[
              { id: 'active', label: 'Active' },
              { id: 'settled', label: 'All Settled' },
              { id: 'archived', label: 'Archived' }
            ].map((tab) => {
              const isActive = filterTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-[#55C79A] text-[#003826]'
                      : 'text-[#87948C] hover:text-[#E2E2E8]'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-[#87948C]" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search settlements or people..."
              className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#14161A] border border-[#3D4943]/60 text-xs text-[#E2E2E8] placeholder-[#5A645E] focus:outline-none focus:border-[#73E3B4]"
            />
          </div>
        </div>

        {/* Settlement Cards Grid */}
        {filteredSettlements.length === 0 ? (
          <div className="p-12 rounded-2xl bg-[#14161A] border border-[#3D4943]/40 text-center space-y-3">
            <Users className="w-12 h-12 text-[#5A645E] mx-auto" />
            <h3 className="text-base font-bold text-[#E2E2E8]">
              {searchQuery ? 'No matching settlements found' : 'No settlements in this tab'}
            </h3>
            <p className="text-xs text-[#87948C] max-w-sm mx-auto">
              {filterTab === 'active'
                ? 'Create a new settlement to split hotel stays, meals, or group trips with friends.'
                : 'No settlements match this filter.'}
            </p>
            {filterTab === 'active' && !searchQuery && (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="mt-2 px-4 py-2 rounded-xl bg-[#55C79A] text-[#003826] font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Create Settlement</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredSettlements.map((settlement) => {
              const summary = calculateSettlementSummary(settlement);
              const meMember = settlement.members.find((m) => m.isMe);
              const meSummary = meMember ? summary.memberSummaries[meMember.id] : undefined;

              return (
                <div
                  key={settlement.id}
                  onClick={() => setSelectedSettlementId(settlement.id)}
                  className="p-5 rounded-2xl bg-[#14161A] hover:bg-[#1A1C20] border border-[#3D4943]/40 hover:border-[#73E3B4]/60 transition-all cursor-pointer space-y-4 shadow-sm group"
                >
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <h3 className="text-base font-bold text-[#E2E2E8] group-hover:text-[#73E3B4] transition-colors truncate">
                        {settlement.name}
                      </h3>
                      <div className="text-[11px] text-[#87948C]">
                        {formatDisplayDate(new Date(settlement.createdAt).toISOString().split('T')[0])}
                      </div>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider shrink-0 ${
                        settlement.status === 'archived'
                          ? 'bg-zinc-800 text-zinc-400'
                          : summary.allSettled
                          ? 'bg-[#55C79A]/20 text-[#73E3B4] border border-[#55C79A]/30'
                          : 'bg-amber-900/30 text-amber-300 border border-amber-500/30'
                      }`}
                    >
                      {settlement.status === 'archived'
                        ? 'Archived'
                        : summary.allSettled
                        ? 'Settled'
                        : `${summary.suggestedTransfers.length} Due`}
                    </span>
                  </div>

                  {/* Member avatars / chips */}
                  <div className="space-y-1">
                    <div className="text-[11px] text-[#87948C]">
                      {settlement.members.length} Members:
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {settlement.members.slice(0, 4).map((m) => (
                        <span
                          key={m.id}
                          className={`px-2 py-0.5 rounded-md text-[11px] font-medium ${
                            m.isMe
                              ? 'bg-[#55C79A]/20 text-[#73E3B4] border border-[#55C79A]/30'
                              : 'bg-[#1E2024] text-[#BCCAC1]'
                          }`}
                        >
                          {m.name} {m.isMe ? '(You)' : ''}
                        </span>
                      ))}
                      {settlement.members.length > 4 && (
                        <span className="px-1.5 py-0.5 rounded-md bg-[#1E2024] text-[#87948C] text-[10px]">
                          +{settlement.members.length - 4} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Financial Metrics */}
                  <div className="pt-3 border-t border-[#3D4943]/20 flex items-center justify-between text-xs">
                    <div>
                      <div className="text-[10px] text-[#87948C]">Total Spend</div>
                      <div className="font-mono font-bold text-[#E2E2E8]">
                        {formatTaka(poishaToTaka(summary.totalSpentPoisha))}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-[10px] text-[#87948C]">Your Balance</div>
                      {meSummary ? (
                        meSummary.netBalancePoisha > 0 ? (
                          <div className="font-mono font-bold text-[#73E3B4]">
                            +{formatTaka(poishaToTaka(meSummary.netBalancePoisha))}
                          </div>
                        ) : meSummary.netBalancePoisha < 0 ? (
                          <div className="font-mono font-bold text-[#FFB4AB]">
                            -{formatTaka(poishaToTaka(Math.abs(meSummary.netBalancePoisha)))}
                          </div>
                        ) : (
                          <div className="font-mono font-bold text-[#55C79A]">
                            ৳0.00
                          </div>
                        )
                      ) : (
                        <div className="text-zinc-500 font-mono">-</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Creation Modal */}
      <CreateSettlementModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        currentUserName={currentUserName}
        onCreated={(created) => {
          setIsCreateModalOpen(false);
          setSelectedSettlementId(created.id);
          showToast?.(`Settlement "${created.name}" created!`);
        }}
      />
    </div>
  );
};
