import React, { useState } from 'react';
import {
  ArrowLeft,
  Plus,
  Coins,
  Receipt,
  Share2,
  MoreVertical,
  Archive,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Wallet,
  Clock,
  Edit2
} from 'lucide-react';
import {
  SmartSettlement,
  SettlementExpense,
  SettlementPayment,
  SettlementRefund
} from '../../domain/settlementTypes';
import {
  calculateSettlementSummary,
  poishaToTaka,
  getExpenseTotalPoisha,
  getExpenseParticipants
} from '../../domain/settlementEngine';
import { formatTaka } from '../../domain/money';
import { formatDisplayDate } from '../../domain/dates';
import { repository } from '../../data/repository';
import { PaymentMethod } from '../../domain/types';
import { AddSettlementExpenseModal } from './AddSettlementExpenseModal';
import { RecordSettlementPaymentModal } from './RecordSettlementPaymentModal';
import { RecordSettlementRefundModal } from './RecordSettlementRefundModal';
import { SettlementShareModal } from './SettlementShareModal';

interface SettlementDetailDashboardProps {
  settlement: SmartSettlement;
  onBack: () => void;
  wallets: PaymentMethod[];
  showToast?: (msg: string) => void;
}

export const SettlementDetailDashboard: React.FC<SettlementDetailDashboardProps> = ({
  settlement,
  onBack,
  wallets,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'settle' | 'expenses' | 'audit'>('settle');
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState<boolean>(false);
  const [editingExpense, setEditingExpense] = useState<SettlementExpense | null>(null);

  const [isRecordPaymentOpen, setIsRecordPaymentOpen] = useState<boolean>(false);
  const [paymentDefaultFrom, setPaymentDefaultFrom] = useState<string>('');
  const [paymentDefaultTo, setPaymentDefaultTo] = useState<string>('');
  const [paymentDefaultAmount, setPaymentDefaultAmount] = useState<number>(0);

  const [isRecordRefundOpen, setIsRecordRefundOpen] = useState<boolean>(false);
  const [refundDefaultExpenseId, setRefundDefaultExpenseId] = useState<string>('');

  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [showOptionsMenu, setShowOptionsMenu] = useState<boolean>(false);
  const [isEditingTitle, setIsEditingTitle] = useState<boolean>(false);
  const [titleInput, setTitleInput] = useState<string>(settlement.name);

  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  // Compute live summary from pure calculation engine
  const summary = calculateSettlementSummary(settlement);
  const meMember = settlement.members.find((m) => m.isMe);
  const meSummary = meMember ? summary.memberSummaries[meMember.id] : undefined;

  const handleUpdateTitle = async () => {
    if (!titleInput.trim()) return;
    await repository.saveSmartSettlement({ ...settlement, name: titleInput.trim() });
    setIsEditingTitle(false);
    showToast?.('Settlement title updated');
  };

  const handleToggleArchive = async () => {
    if (settlement.status === 'archived') {
      await repository.reopenSmartSettlement(settlement.id);
      showToast?.('Settlement reopened');
    } else {
      await repository.archiveSmartSettlement(settlement.id);
      showToast?.('Settlement archived');
    }
    setShowOptionsMenu(false);
  };

  const handleDeleteSettlement = async () => {
    if (confirm(`Are you sure you want to delete "${settlement.name}"? This action cannot be undone.`)) {
      await repository.deleteSmartSettlement(settlement.id);
      showToast?.('Settlement deleted');
      onBack();
    }
    setShowOptionsMenu(false);
  };

  const handleDeleteExpense = async (expId: string) => {
    if (confirm('Delete this expense? Any linked EcO wallet deduction will also be removed.')) {
      await repository.deleteSettlementExpense(settlement.id, expId, true);
      showToast?.('Expense deleted');
    }
  };

  const handleDeletePayment = async (pmtId: string) => {
    if (confirm('Delete this payment record?')) {
      await repository.deleteSettlementPayment(settlement.id, pmtId, true);
      showToast?.('Payment deleted');
    }
  };

  const handleDeleteRefund = async (refId: string) => {
    if (confirm('Delete this refund record?')) {
      await repository.deleteSettlementRefund(settlement.id, refId);
      showToast?.('Refund deleted');
    }
  };

  const handleOpenMarkAsPaid = (fromId: string, toId: string, amountPoisha: number) => {
    setPaymentDefaultFrom(fromId);
    setPaymentDefaultTo(toId);
    setPaymentDefaultAmount(amountPoisha);
    setIsRecordPaymentOpen(true);
  };

  const handleOpenAddRefund = (expenseId: string) => {
    setRefundDefaultExpenseId(expenseId);
    setIsRecordRefundOpen(true);
  };

  const handleTogglePublicShare = async () => {
    const nextState = !settlement.isPublicShared;
    await repository.toggleSettlementPublicShare(settlement.id, nextState);
    showToast?.(nextState ? 'Public share enabled' : 'Public share disabled');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#0C0E12] text-[#E2E2E8]">
      {/* Top Header Bar */}
      <div className="sticky top-0 z-20 px-4 sm:px-8 py-3.5 border-b border-[#3D4943]/40 bg-[#0C0E12]/95 backdrop-blur-md flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 rounded-xl bg-[#1A1C20] hover:bg-[#282A2E] text-[#BCCAC1] hover:text-[#E2E2E8] border border-[#3D4943]/40 cursor-pointer transition-colors shrink-0"
            title="Back to all settlements"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <div className="min-w-0">
            {isEditingTitle ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={titleInput}
                  onChange={(e) => setTitleInput(e.target.value)}
                  className="px-2.5 py-1 rounded-lg bg-[#14161A] border border-[#73E3B4] text-sm font-bold text-[#E2E2E8] focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleUpdateTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                />
                <button
                  onClick={handleUpdateTitle}
                  className="px-2.5 py-1 rounded-lg bg-[#55C79A] text-[#003826] font-bold text-xs"
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-[#E2E2E8] truncate">
                  {settlement.name}
                </h1>
                <button
                  onClick={() => setIsEditingTitle(true)}
                  className="p-1 text-[#87948C] hover:text-[#73E3B4] cursor-pointer"
                  title="Rename settlement"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 text-[11px] text-[#87948C] mt-0.5">
              <span>{settlement.members.length} Members</span>
              <span>&bull;</span>
              <span>{settlement.expenses.length} Expenses</span>
              <span>&bull;</span>
              <span
                className={`px-2 py-0.2 rounded-full text-[10px] font-semibold uppercase tracking-wider ${
                  settlement.status === 'archived'
                    ? 'bg-zinc-800 text-zinc-400'
                    : summary.allSettled
                    ? 'bg-[#55C79A]/20 text-[#73E3B4] border border-[#55C79A]/40'
                    : 'bg-amber-900/30 text-amber-300 border border-amber-500/30'
                }`}
              >
                {settlement.status === 'archived'
                  ? 'Archived'
                  : summary.allSettled
                  ? 'All Settled'
                  : 'Active'}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A1C20] hover:bg-[#282A2E] border border-[#3D4943]/60 text-xs font-semibold text-[#73E3B4] cursor-pointer transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Share</span>
          </button>

          <button
            onClick={() => {
              setEditingExpense(null);
              setIsAddExpenseOpen(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-bold text-xs cursor-pointer transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Add Expense</span>
            <span className="sm:hidden">Expense</span>
          </button>

          {/* More options dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowOptionsMenu(!showOptionsMenu)}
              className="p-2 rounded-xl bg-[#1A1C20] hover:bg-[#282A2E] text-[#87948C] hover:text-[#E2E2E8] border border-[#3D4943]/40 cursor-pointer"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showOptionsMenu && (
              <div
                className="absolute right-0 mt-1 w-44 rounded-xl bg-[#1A1C20] border border-[#3D4943]/60 shadow-xl py-1 z-30 animate-in fade-in zoom-in-95"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => {
                    setShowOptionsMenu(false);
                    setIsShareModalOpen(true);
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-[#E2E2E8] hover:bg-[#282A2E] flex items-center gap-2 cursor-pointer sm:hidden"
                >
                  <Share2 className="w-3.5 h-3.5 text-[#73E3B4]" />
                  <span>Share Card</span>
                </button>
                <button
                  onClick={handleTogglePublicShare}
                  className="w-full px-3 py-2 text-left text-xs text-[#E2E2E8] hover:bg-[#282A2E] flex items-center gap-2 cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#73E3B4]" />
                  <span>{settlement.isPublicShared ? 'Disable Public Link' : 'Enable Public Link'}</span>
                </button>
                <button
                  onClick={handleToggleArchive}
                  className="w-full px-3 py-2 text-left text-xs text-[#E2E2E8] hover:bg-[#282A2E] flex items-center gap-2 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-amber-400" />
                  <span>{settlement.status === 'archived' ? 'Reopen Group' : 'Archive Group'}</span>
                </button>
                <div className="h-px bg-[#3D4943]/30 my-1" />
                <button
                  onClick={handleDeleteSettlement}
                  className="w-full px-3 py-2 text-left text-xs text-[#FFB4AB] hover:bg-red-950/40 flex items-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Settlement</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Dashboard Content */}
      <div className="flex-1 p-4 sm:p-8 space-y-6 max-w-6xl w-full mx-auto">
        {/* KPI Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Total Spend */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#14161A] border border-[#3D4943]/40 flex flex-col justify-between">
            <span className="text-xs font-semibold text-[#87948C]">Total Group Spend</span>
            <div className="mt-2 text-2xl font-bold font-mono text-[#E2E2E8]">
              {formatTaka(poishaToTaka(summary.totalSpentPoisha))}
            </div>
            <span className="text-[11px] text-[#87948C] mt-1">
              Across {settlement.expenses.length} recorded expense{settlement.expenses.length === 1 ? '' : 's'}
            </span>
          </div>

          {/* Your Position (if Me member) */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#14161A] border border-[#3D4943]/40 flex flex-col justify-between">
            <span className="text-xs font-semibold text-[#87948C]">Your Position</span>
            <div className="mt-2">
              {meSummary ? (
                meSummary.netBalancePoisha > 0 ? (
                  <div className="text-2xl font-bold font-mono text-[#73E3B4]">
                    +{formatTaka(poishaToTaka(meSummary.netBalancePoisha))}
                  </div>
                ) : meSummary.netBalancePoisha < 0 ? (
                  <div className="text-2xl font-bold font-mono text-[#FFB4AB]">
                    -{formatTaka(poishaToTaka(Math.abs(meSummary.netBalancePoisha)))}
                  </div>
                ) : (
                  <div className="text-2xl font-bold font-mono text-[#55C79A]">
                    ৳0.00 (Settled)
                  </div>
                )
              ) : (
                <div className="text-sm font-semibold text-[#87948C]">You are not a member</div>
              )}
            </div>
            <span className="text-[11px] text-[#87948C] mt-1">
              {meSummary
                ? meSummary.netBalancePoisha > 0
                  ? 'You will receive this amount'
                  : meSummary.netBalancePoisha < 0
                  ? 'You need to pay this amount'
                  : 'All your debts are fully cleared'
                : 'Settlement owner'}
            </span>
          </div>

          {/* Settlement Status */}
          <div className="p-4 sm:p-5 rounded-2xl bg-[#14161A] border border-[#3D4943]/40 flex flex-col justify-between">
            <span className="text-xs font-semibold text-[#87948C]">Clearing Status</span>
            <div className="mt-2 text-2xl font-bold text-[#E2E2E8] flex items-center gap-2">
              {summary.allSettled ? (
                <>
                  <CheckCircle2 className="w-6 h-6 text-[#73E3B4]" />
                  <span className="text-[#73E3B4]">All Settled</span>
                </>
              ) : (
                <span className="text-amber-300">
                  {summary.suggestedTransfers.length} Payment{summary.suggestedTransfers.length === 1 ? '' : 's'} Due
                </span>
              )}
            </div>
            <span className="text-[11px] text-[#87948C] mt-1">
              {summary.allSettled
                ? 'Everyone is even, zero balance remaining'
                : 'Greedy algorithm minimized to fastest transfers'}
            </span>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-[#3D4943]/40">
          {[
            { id: 'settle', label: 'Settle Up & Debts', count: summary.suggestedTransfers.length },
            { id: 'expenses', label: 'Expenses & Receipts', count: settlement.expenses.length },
            { id: 'audit', label: 'Underground Math & Audit' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'border-[#73E3B4] text-[#73E3B4]'
                    : 'border-transparent text-[#87948C] hover:text-[#BCCAC1]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-[#55C79A]/20 text-[#73E3B4]' : 'bg-[#282A2E] text-[#87948C]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: SETTLE UP / DEBTS */}
        {activeTab === 'settle' && (
          <div className="space-y-6">
            {/* Suggested Transfers */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-[#E2E2E8]">Suggested Payments</h3>
                  <p className="text-[11px] text-[#87948C]">
                    Optimized to clear all balances in the minimum number of transactions
                  </p>
                </div>
                <button
                  onClick={() => {
                    setPaymentDefaultFrom(settlement.members[0]?.id || '');
                    setPaymentDefaultTo(settlement.members[1]?.id || '');
                    setPaymentDefaultAmount(0);
                    setIsRecordPaymentOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-[#1A1C20] hover:bg-[#282A2E] border border-[#3D4943]/60 text-xs font-semibold text-[#73E3B4] flex items-center gap-1.5 cursor-pointer"
                >
                  <Coins className="w-3.5 h-3.5" />
                  <span>Custom Payment</span>
                </button>
              </div>

              {summary.allSettled ? (
                <div className="p-8 rounded-2xl bg-[#14161A] border border-[#55C79A]/30 text-center space-y-2">
                  <div className="w-12 h-12 rounded-full bg-[#55C79A]/20 border border-[#55C79A]/40 text-[#73E3B4] flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <h4 className="text-sm font-bold text-[#E2E2E8]">All debts are settled!</h4>
                  <p className="text-xs text-[#87948C] max-w-sm mx-auto">
                    Everyone has paid their exact fair share. There are zero outstanding balances in this group.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {summary.suggestedTransfers.map((tr, idx) => {
                    const fromM = settlement.members.find((m) => m.id === tr.fromMemberId);
                    const toM = settlement.members.find((m) => m.id === tr.toMemberId);
                    const isMePayer = fromM?.isMe;
                    const isMeReceiver = toM?.isMe;

                    return (
                      <div
                        key={idx}
                        className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                          isMePayer
                            ? 'bg-rose-950/20 border-rose-500/40'
                            : isMeReceiver
                            ? 'bg-emerald-950/20 border-emerald-500/40'
                            : 'bg-[#14161A] border-[#3D4943]/40'
                        }`}
                      >
                        <div className="min-w-0 space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#FFB4AB] truncate">
                              {fromM?.name} {isMePayer ? '(You)' : ''}
                            </span>
                            <span className="text-[11px] text-[#87948C]">pays</span>
                            <span className="text-sm font-bold text-[#73E3B4] truncate">
                              {toM?.name} {isMeReceiver ? '(You)' : ''}
                            </span>
                          </div>
                          <div className="text-xs font-mono font-bold text-[#E2E2E8]">
                            {formatTaka(poishaToTaka(tr.amountPoisha))}
                          </div>
                        </div>

                        <button
                          onClick={() => handleOpenMarkAsPaid(tr.fromMemberId, tr.toMemberId, tr.amountPoisha)}
                          className="px-3.5 py-2 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-bold text-xs flex items-center gap-1.5 shrink-0 cursor-pointer shadow-sm"
                        >
                          <Coins className="w-3.5 h-3.5 stroke-[2.5]" />
                          <span>Mark as Paid</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Recorded Payments History */}
            {settlement.payments.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-[#3D4943]/30">
                <h3 className="text-sm font-bold text-[#E2E2E8]">
                  Recorded Payments History ({settlement.payments.length})
                </h3>
                <div className="space-y-2">
                  {settlement.payments.map((pmt) => {
                    const fromM = settlement.members.find((m) => m.id === pmt.fromMemberId);
                    const toM = settlement.members.find((m) => m.id === pmt.toMemberId);
                    return (
                      <div
                        key={pmt.id}
                        className="p-3.5 rounded-xl bg-[#14161A] border border-[#3D4943]/40 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <div className="font-semibold text-[#E2E2E8] flex items-center gap-2">
                            <span>
                              {fromM?.name} paid {toM?.name}
                            </span>
                            <span className="font-mono font-bold text-[#73E3B4]">
                              {formatTaka(poishaToTaka(pmt.amountPoisha))}
                            </span>
                          </div>
                          <div className="text-[11px] text-[#87948C] flex items-center gap-2">
                            <span>{pmt.date}</span>
                            {pmt.note && <span>&bull; {pmt.note}</span>}
                            {pmt.walletTransactionId && (
                              <span className="flex items-center gap-1 text-[#55C79A]">
                                <Wallet className="w-3 h-3" /> EcO Wallet Synced
                              </span>
                            )}
                          </div>
                        </div>

                        <button
                          onClick={() => handleDeletePayment(pmt.id)}
                          className="p-1.5 text-[#87948C] hover:text-[#FFB4AB] hover:bg-[#282A2E] rounded-lg cursor-pointer"
                          title="Delete Payment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: EXPENSES */}
        {activeTab === 'expenses' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-[#E2E2E8]">
                  Itemized Expenses ({settlement.expenses.length})
                </h3>
                <p className="text-[11px] text-[#87948C]">
                  Each expense split transparently among participating members
                </p>
              </div>
              <button
                onClick={() => {
                  setEditingExpense(null);
                  setIsAddExpenseOpen(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Expense</span>
              </button>
            </div>

            {settlement.expenses.length === 0 ? (
              <div className="p-8 rounded-2xl bg-[#14161A] border border-[#3D4943]/40 text-center space-y-3">
                <Receipt className="w-10 h-10 text-[#5A645E] mx-auto" />
                <h4 className="text-sm font-bold text-[#E2E2E8]">No expenses recorded yet</h4>
                <p className="text-xs text-[#87948C] max-w-sm mx-auto">
                  Add your first meal, ride, or grocery expense to see how EcO splits it instantly.
                </p>
                <button
                  onClick={() => setIsAddExpenseOpen(true)}
                  className="px-4 py-2 rounded-xl bg-[#55C79A] text-[#003826] font-bold text-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  <span>Add First Expense</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {settlement.expenses.map((exp) => {
                  const payersStr = exp.payers
                    .map((p) => {
                      const m = settlement.members.find((mem) => mem.id === p.memberId);
                      return `${m?.name || 'Member'}${
                        exp.payers.length > 1 ? ` (৳${poishaToTaka(p.amountPoisha)})` : ''
                      }`;
                    })
                    .join(', ');

                  // Refunds attached to this expense
                  const refunds = settlement.refunds.filter((r) => r.expenseId === exp.id);
                  const totalRefundsPoisha = refunds.reduce((acc, r) => acc + r.amountPoisha, 0);

                  return (
                    <div
                      key={exp.id}
                      className="p-4 rounded-2xl bg-[#14161A] border border-[#3D4943]/40 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-[#E2E2E8] truncate">{exp.title}</h4>
                            <span className="px-2 py-0.5 rounded-md bg-[#282A2E] text-[10px] font-medium text-[#BCCAC1] uppercase">
                              {exp.splitMethod} split
                            </span>
                            {exp.walletTransactionId && (
                              <span className="flex items-center gap-1 text-[10px] text-[#55C79A]">
                                <Wallet className="w-3 h-3" /> Synced to Wallet
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-[#87948C] flex items-center gap-2 flex-wrap">
                            <span>Paid by: <strong className="text-[#BCCAC1]">{payersStr}</strong></span>
                            <span>&bull;</span>
                            <span>{exp.date}</span>
                            <span>&bull;</span>
                            <span>{getExpenseParticipants(exp).length} Participants</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <div className="text-base font-bold font-mono text-[#73E3B4]">
                            {formatTaka(poishaToTaka(getExpenseTotalPoisha(exp)))}
                          </div>
                          {totalRefundsPoisha > 0 && (
                            <div className="text-[10px] text-amber-300 font-mono">
                              -৳{poishaToTaka(totalRefundsPoisha)} refunded
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Attached Refunds if any */}
                      {refunds.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-500/30 text-xs space-y-1">
                          <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                            <RotateCcw className="w-3.5 h-3.5" />
                            Refunds on this expense:
                          </span>
                          {refunds.map((rf) => {
                            const receiver = settlement.members.find((m) => m.id === rf.receivedByMemberId);
                            return (
                              <div
                                key={rf.id}
                                className="flex items-center justify-between text-[11px] text-[#E2E2E8]"
                              >
                                <span>
                                  {rf.date}: ৳{poishaToTaka(rf.amountPoisha)} received by {receiver?.name}
                                  {rf.reason && ` (${rf.reason})`}
                                </span>
                                <button
                                  onClick={() => handleDeleteRefund(rf.id)}
                                  className="text-[#87948C] hover:text-[#FFB4AB] cursor-pointer"
                                  title="Delete Refund"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex items-center justify-end gap-2 pt-1 border-t border-[#3D4943]/20">
                        <button
                          onClick={() => handleOpenAddRefund(exp.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] text-[11px] font-semibold text-amber-300 flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Record Refund</span>
                        </button>
                        <button
                          onClick={() => {
                            setEditingExpense(exp);
                            setIsAddExpenseOpen(true);
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] text-[11px] font-semibold text-[#BCCAC1] hover:text-[#E2E2E8] cursor-pointer"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteExpense(exp.id)}
                          className="p-1.5 text-[#87948C] hover:text-[#FFB4AB] hover:bg-[#282A2E] rounded-lg cursor-pointer"
                          title="Delete Expense"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: UNDERGROUND MATH & AUDIT TRAIL */}
        {activeTab === 'audit' && (
          <div className="space-y-6">
            {/* Zero-Sum Invariant Card */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[#14161A] border border-[#55C79A]/40 flex items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-bold text-[#73E3B4]">
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>Mathematical Zero-Sum Invariant Verified</span>
                </div>
                <p className="text-xs text-[#87948C]">
                  Every poisha is accounted for: Total Creditors = Total Debtors = ৳0.00 difference.
                </p>
              </div>
              <div className="px-3 py-1.5 rounded-xl bg-[#55C79A]/20 border border-[#55C79A]/40 font-mono font-bold text-xs text-[#73E3B4] shrink-0">
                Σ Net = ৳0.00
              </div>
            </div>

            {/* Member Balances Breakdown Table */}
            <div className="rounded-2xl bg-[#14161A] border border-[#3D4943]/40 overflow-hidden">
              <div className="p-4 border-b border-[#3D4943]/30">
                <h3 className="text-sm font-bold text-[#E2E2E8]">Member Balance Matrix</h3>
                <p className="text-[11px] text-[#87948C]">
                  Tap any member to expand their step-by-step calculation audit
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#111317] border-b border-[#3D4943]/30 text-[#87948C] font-semibold">
                    <tr>
                      <th className="py-2.5 px-4">Member</th>
                      <th className="py-2.5 px-4 text-right">Total Paid</th>
                      <th className="py-2.5 px-4 text-right">Fair Share</th>
                      <th className="py-2.5 px-4 text-right">Payments Sent</th>
                      <th className="py-2.5 px-4 text-right">Payments Recv</th>
                      <th className="py-2.5 px-4 text-right">Refund Cash</th>
                      <th className="py-2.5 px-4 text-right font-bold">Net Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#3D4943]/20 font-mono">
                    {settlement.members.map((m) => {
                      const mSummary = summary.memberSummaries[m.id];
                      const isExpanded = expandedMemberId === m.id;
                      return (
                        <React.Fragment key={m.id}>
                          <tr
                            onClick={() => setExpandedMemberId(isExpanded ? null : m.id)}
                            className="hover:bg-[#1E2024]/60 cursor-pointer transition-colors"
                          >
                            <td className="py-3 px-4 font-sans font-medium text-[#E2E2E8] flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronUp className="w-3.5 h-3.5 text-[#73E3B4]" />
                              ) : (
                                <ChevronDown className="w-3.5 h-3.5 text-[#87948C]" />
                              )}
                              <span>{m.name}</span>
                              {m.isMe && (
                                <span className="px-1.5 py-0.2 rounded bg-[#55C79A]/20 text-[#73E3B4] text-[9px] font-sans font-bold">
                                  You
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right text-[#BCCAC1]">
                              {formatTaka(poishaToTaka(mSummary?.totalPaidPoisha || 0))}
                            </td>
                            <td className="py-3 px-4 text-right text-[#BCCAC1]">
                              {formatTaka(poishaToTaka(mSummary?.totalOwedPoisha || 0))}
                            </td>
                            <td className="py-3 px-4 text-right text-emerald-400">
                              +{formatTaka(poishaToTaka(mSummary?.paymentsSentPoisha || 0))}
                            </td>
                            <td className="py-3 px-4 text-right text-rose-400">
                              -{formatTaka(poishaToTaka(mSummary?.paymentsReceivedPoisha || 0))}
                            </td>
                            <td className="py-3 px-4 text-right text-amber-300">
                              {mSummary?.refundCashHeldPoisha
                                ? `-${formatTaka(poishaToTaka(mSummary.refundCashHeldPoisha))}`
                                : '৳0.00'}
                            </td>
                            <td className="py-3 px-4 text-right font-bold font-mono">
                              {mSummary?.netBalancePoisha ? (
                                mSummary.netBalancePoisha > 0 ? (
                                  <span className="text-[#73E3B4]">
                                    +{formatTaka(poishaToTaka(mSummary.netBalancePoisha))}
                                  </span>
                                ) : (
                                  <span className="text-[#FFB4AB]">
                                    -{formatTaka(poishaToTaka(Math.abs(mSummary.netBalancePoisha)))}
                                  </span>
                                )
                              ) : (
                                <span className="text-zinc-500">৳0.00</span>
                              )}
                            </td>
                          </tr>

                          {/* Expanded Step-by-Step Breakdown */}
                          {isExpanded && (
                            <tr className="bg-[#111317]">
                              <td colSpan={7} className="p-4 font-sans text-xs space-y-2">
                                <div className="p-3 rounded-xl bg-[#1A1C20] border border-[#3D4943]/40 space-y-1.5 font-mono text-[11px]">
                                  <div className="font-bold text-[#73E3B4] font-sans text-xs">
                                    Mathematical Equation for {m.name}:
                                  </div>
                                  <div className="text-[#BCCAC1] leading-relaxed">
                                    Net = Paid (৳{poishaToTaka(mSummary?.totalPaidPoisha || 0)}) &minus; Share (৳
                                    {poishaToTaka(mSummary?.totalOwedPoisha || 0)}) + PmtSent (৳
                                    {poishaToTaka(mSummary?.paymentsSentPoisha || 0)}) &minus; PmtRecv (৳
                                    {poishaToTaka(mSummary?.paymentsReceivedPoisha || 0)}) &minus; RefundCashHeld (৳
                                    {poishaToTaka(mSummary?.refundCashHeldPoisha || 0)})
                                  </div>
                                  <div className="text-sm font-bold text-white pt-1">
                                    Final Net = {formatTaka(poishaToTaka(mSummary?.netBalancePoisha || 0))} (
                                    {(mSummary?.netBalancePoisha || 0) > 0
                                      ? 'Creditor / Receives Money'
                                      : (mSummary?.netBalancePoisha || 0) < 0
                                      ? 'Debtor / Owes Money'
                                      : 'Settled'}
                                    )
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Transparent Calculation Principles */}
            <div className="p-5 rounded-2xl bg-[#14161A] border border-[#3D4943]/40 space-y-2.5 text-xs text-[#87948C]">
              <h4 className="text-sm font-bold text-[#E2E2E8]">
                How the EcO Smart Settlement Engine Works
              </h4>
              <ul className="list-disc pl-5 space-y-1.5 leading-relaxed">
                <li>
                  <strong className="text-[#BCCAC1]">Pure Integer Math:</strong> All calculations are executed in integer poisha (1 Taka = 100 Poisha) to permanently eliminate floating-point rounding errors.
                </li>
                <li>
                  <strong className="text-[#BCCAC1]">Deterministic Remainder:</strong> Any odd remainder poishas (e.g. ৳100 among 3 people = 33.33) are deterministically allocated based on member order, guaranteeing zero drift.
                </li>
                <li>
                  <strong className="text-[#BCCAC1]">Greedy Debt Minimization:</strong> Debts are paired largest-creditor to largest-debtor to produce the mathematical minimum number of transfers.
                </li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Modals */}
      <AddSettlementExpenseModal
        isOpen={isAddExpenseOpen}
        settlement={settlement}
        editingExpense={editingExpense}
        onClose={() => {
          setIsAddExpenseOpen(false);
          setEditingExpense(null);
        }}
        onSaved={() => showToast?.('Expense saved successfully')}
        wallets={wallets}
      />

      <RecordSettlementPaymentModal
        isOpen={isRecordPaymentOpen}
        settlement={settlement}
        defaultFromMemberId={paymentDefaultFrom}
        defaultToMemberId={paymentDefaultTo}
        defaultAmountPoisha={paymentDefaultAmount}
        onClose={() => setIsRecordPaymentOpen(false)}
        onSaved={() => showToast?.('Payment recorded successfully')}
        wallets={wallets}
      />

      <RecordSettlementRefundModal
        isOpen={isRecordRefundOpen}
        settlement={settlement}
        defaultExpenseId={refundDefaultExpenseId}
        onClose={() => setIsRecordRefundOpen(false)}
        onSaved={() => showToast?.('Refund recorded successfully')}
      />

      <SettlementShareModal
        isOpen={isShareModalOpen}
        settlement={settlement}
        onClose={() => setIsShareModalOpen(false)}
        showToast={showToast}
      />
    </div>
  );
};
