import React, { useState, useMemo } from 'react';
import {
  Info,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft,
  Users2,
  Wallet,
  Calendar,
  X,
  MessageCircle,
  Clock,
  CheckCircle2,
  ChevronRight,
  Copy,
  Check,
  PlusCircle,
  ArrowDownLeft,
  ArrowUpRight,
  Layers,
  Sliders,
  Sparkles,
  AlertTriangle,
  Pencil,
  Trash2,
  FileText
} from 'lucide-react';
import {
  FinancialSummary,
  calculateBudgetMetrics,
  BudgetMetrics
} from '../domain/calculations';
import {
  UserSettings,
  PaymentMethod,
  UnifiedActivityItem,
  PersonRecord,
  PeerTransactionRecord,
  ExpenseRecord,
  RecurringExpenseRecord,
  EarningRecord,
  TransferRecord,
  IncomeSource
} from '../domain/types';
import { FixedEmergencyDetailsModal } from '../components/FixedEmergencyDetailsModal';
import { EditActivityModal } from '../components/EditActivityModal';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { formatTaka } from '../domain/money';
import { formatDisplayDate, formatExactDateTime, getTodayDateString } from '../domain/dates';
import {
  computeDashboardLoanReminders,
  LoanMilestoneReminderItem,
  normalizeWhatsAppPhone
} from '../domain/milestones';

interface DashboardViewProps {
  summary: FinancialSummary;
  settings: UserSettings;
  todayExpenses: number;
  expenses?: ExpenseRecord[];
  recurringExpenses?: RecurringExpenseRecord[];
  recentActivities: UnifiedActivityItem[];
  paymentMethods: PaymentMethod[];
  people: PersonRecord[];
  transactions: PeerTransactionRecord[];
  sources?: IncomeSource[];
  categories?: string[];
  tags?: string[];
  dismissedMilestones?: Record<string, string[]>;
  onDismissMilestone?: (personId: string, milestoneKey: string) => void;
  onNavigateToList: () => void;
  onNavigateToWallets: () => void;
  onNavigateToPeople: () => void;
  onNavigateToSettlements?: () => void;
  onNavigateToSettings?: () => void;
  onOpenAddModal: () => void;
  onOpenAddWithKind?: (kind: 'expense' | 'earning' | 'transfer' | 'give' | 'take') => void;
  onUpdateExpense?: (expense: ExpenseRecord) => void;
  onUpdateRecurringExpense?: (rec: RecurringExpenseRecord) => void;
  onUpdateEarning?: (earning: EarningRecord) => void;
  onUpdateTransfer?: (transfer: TransferRecord) => void;
  onUpdateTransaction?: (tx: PeerTransactionRecord) => void;
  onDeleteActivity?: (item: UnifiedActivityItem) => void;
  onOpenBrandedVoucher?: (item: UnifiedActivityItem) => void;
  onOpenBrandedMonthlyReport?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  summary,
  settings,
  todayExpenses,
  expenses = [],
  recurringExpenses = [],
  recentActivities,
  paymentMethods,
  people = [],
  transactions = [],
  sources = [],
  categories = [],
  tags = [],
  dismissedMilestones = {},
  onDismissMilestone,
  onNavigateToList,
  onNavigateToWallets,
  onNavigateToPeople,
  onNavigateToSettlements,
  onNavigateToSettings,
  onOpenAddModal,
  onOpenAddWithKind,
  onUpdateExpense,
  onUpdateRecurringExpense,
  onUpdateEarning,
  onUpdateTransfer,
  onUpdateTransaction,
  onDeleteActivity,
  onOpenBrandedVoucher,
  onOpenBrandedMonthlyReport
}) => {
  const [showFormulaModal, setShowFormulaModal] = useState(false);
  const [showBudgetDetailsModal, setShowBudgetDetailsModal] = useState(false);
  const [selectedReminderDetails, setSelectedReminderDetails] = useState<LoanMilestoneReminderItem | null>(null);

  // Recent activity filtration, edit & detail states
  const [selectedActivityTab, setSelectedActivityTab] = useState<'all' | 'expense' | 'earning' | 'transfer' | 'transaction'>('all');
  const [editingItem, setEditingItem] = useState<UnifiedActivityItem | null>(null);
  const [detailItem, setDetailItem] = useState<UnifiedActivityItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<UnifiedActivityItem | null>(null);

  // WhatsApp quick-send modal for missing phone numbers
  const [whatsAppModalItem, setWhatsAppModalItem] = useState<LoanMilestoneReminderItem | null>(null);
  const [tempPhone, setTempPhone] = useState<string>('');
  const [copiedText, setCopiedText] = useState<boolean>(false);

  const todayDateStr = getTodayDateString();
  const budgetMetrics = useMemo(() => {
    return calculateBudgetMetrics(settings, expenses.length > 0 ? expenses : todayExpenses, recurringExpenses, todayDateStr);
  }, [settings, expenses, todayExpenses, recurringExpenses, todayDateStr]);

  // Filtered recent activities for dashboard
  const filteredRecentActivities = useMemo(() => {
    if (selectedActivityTab === 'all') return recentActivities;
    if (selectedActivityTab === 'expense') {
      return recentActivities.filter((a) => a.activityType === 'expense' || a.activityType === 'recurring');
    }
    return recentActivities.filter((a) => a.activityType === selectedActivityTab);
  }, [recentActivities, selectedActivityTab]);

  const recentSummary = useMemo(() => {
    let spent = 0;
    let earned = 0;
    let transfers = 0;
    let lent = 0;
    let borrowed = 0;

    filteredRecentActivities.forEach((a) => {
      if (a.activityType === 'expense' || a.activityType === 'recurring') spent += a.amount;
      else if (a.activityType === 'earning') earned += a.amount;
      else if (a.activityType === 'transfer') transfers += a.amount;
      else if (a.activityType === 'transaction') {
        if (a.direction === 'give') lent += a.amount;
        else if (a.direction === 'take') borrowed += a.amount;
      }
    });

    return {
      spent,
      earned,
      net: earned - spent,
      transfers,
      lent,
      borrowed,
      count: filteredRecentActivities.length
    };
  }, [filteredRecentActivities]);

  // Mature Lending & Debt Milestones
  const reminderData = useMemo(() => {
    return computeDashboardLoanReminders(
      people,
      transactions,
      summary.personBalances,
      todayDateStr,
      dismissedMilestones
    );
  }, [people, transactions, summary.personBalances, todayDateStr, dismissedMilestones]);

  const handleLaunchWhatsApp = (item: LoanMilestoneReminderItem) => {
    if (!item.whatsAppReminderText) return;

    const normalized = normalizeWhatsAppPhone(item.phone || '');
    if (normalized && normalized.length >= 8) {
      const waUrl = `https://wa.me/${normalized}?text=${encodeURIComponent(item.whatsAppReminderText)}`;
      const a = document.createElement('a');
      a.href = waUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      setWhatsAppModalItem(item);
      setTempPhone(normalized);
      setCopiedText(false);
    }
  };

  const handleSendCustomPhoneWhatsApp = () => {
    if (!whatsAppModalItem || !whatsAppModalItem.whatsAppReminderText) return;
    const normalized = normalizeWhatsAppPhone(tempPhone);
    const waUrl = normalized
      ? `https://wa.me/${normalized}?text=${encodeURIComponent(whatsAppModalItem.whatsAppReminderText)}`
      : `https://wa.me/?text=${encodeURIComponent(whatsAppModalItem.whatsAppReminderText)}`;

    const a = document.createElement('a');
    a.href = waUrl;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setWhatsAppModalItem(null);
  };

  const activeWallets = paymentMethods.filter((m) => m.isActive);

  return (
    <div className="space-y-6 pb-28 lg:pb-12 animate-in fade-in duration-150">
      {/* =========================================================================
          HERO FINANCIAL SUMMARY CARD
         ========================================================================= */}
      <section className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 sm:p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[#BCCAC1]">
                Net Financial Position
              </span>
              <button
                type="button"
                onClick={() => setShowFormulaModal(true)}
                className="p-1 rounded text-[#87948C] hover:text-[#73E3B4] transition-colors cursor-pointer"
                title="View Net Total vs. Liquid Wallets formula"
                aria-label="View Net calculation details"
              >
                <Info className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Primary Hero Net Total */}
            <div className="text-3xl sm:text-4xl font-mono tabular-nums font-bold text-[#E2E2E8] mt-1 tracking-tight">
              {formatTaka(summary.netTotal)}
            </div>

            {/* Liquid Wallets Secondary Row */}
            <div className="flex flex-wrap items-center gap-2 mt-2 text-xs text-[#BCCAC1]">
              <span>Liquid Wallets:</span>
              <span className="font-mono tabular-nums text-[#73E3B4] font-semibold">
                {formatTaka(summary.liquidWalletTotal)}
              </span>
              <span className="text-[#87948C]">·</span>
              <button
                type="button"
                onClick={onNavigateToWallets}
                className="btn-sm bg-[#0C0E12] hover:bg-[#1E2024] text-[#73E3B4] border border-[#3D4943]/40 cursor-pointer gap-1.5"
                title="View active accounts"
              >
                <Wallet className="w-3 h-3" />
                <span>{activeWallets.length} Accounts</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Quick Action Buttons (Optimized for mobile grid and desktop flex) */}
          <div className="w-full sm:w-auto grid grid-cols-2 sm:flex sm:items-center gap-2.5 pt-2 sm:pt-0">
            <button
              type="button"
              onClick={() => onOpenBrandedMonthlyReport?.()}
              className="min-h-[42px] px-3.5 py-2 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] active:scale-[0.98] text-[#73E3B4] border border-[#73E3B4]/50 shadow-xs flex items-center justify-center gap-2 text-xs font-semibold whitespace-nowrap cursor-pointer transition-all"
              title="Generate branded monthly report & story card (PDF & Image)"
            >
              <Sparkles className="w-4 h-4 text-[#73E3B4] shrink-0" />
              <span>Export Report</span>
            </button>
            <button
              type="button"
              onClick={onOpenAddModal}
              className="min-h-[42px] px-3.5 py-2 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] active:scale-[0.98] text-[#003826] shadow-sm flex items-center justify-center gap-2 text-xs font-bold whitespace-nowrap cursor-pointer transition-all"
            >
              <PlusCircle className="w-4 h-4 stroke-[2.2] shrink-0" />
              <span>Record Entry</span>
            </button>
          </div>
        </div>
      </section>

      {/* =========================================================================
          GRID: TODAY'S BUDGET & ACTIVE ACCOUNTS OVERVIEW
         ========================================================================= */}
      <div className={`grid gap-4 ${budgetMetrics.isActive ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
        {/* Card 1: Today's Budget Hero Card (Hidden when budget mode is Off) */}
        {budgetMetrics.isActive && (
          <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 flex flex-col justify-between shadow-sm relative overflow-hidden">
            <div>
              {/* Header: Title + Day X of Y + Mode */}
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-[#BCCAC1]">
                    Today's Budget
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#0C0E12] border border-[#3D4943]/40 text-[#73E3B4] font-mono">
                    Day {budgetMetrics.dayOfMonth} of {budgetMetrics.daysInMonth}
                  </span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#0C0E12] border border-[#3D4943]/30 text-[#87948C] font-mono capitalize">
                  {budgetMetrics.mode}
                </span>
              </div>

              {budgetMetrics.todayLimit <= 0 && budgetMetrics.spentToday <= 0 ? (
                /* Fallback state when budget target is not configured */
                <div className="py-7 text-center space-y-3">
                  <p className="text-xs text-[#87948C]">
                    Set up your monthly income and bills to enable your adaptive daily limit.
                  </p>
                  {onNavigateToSettings && (
                    <button
                      type="button"
                      onClick={onNavigateToSettings}
                      className="btn-sm bg-[#0C0E12] hover:bg-[#1E2024] text-[#73E3B4] border border-[#73E3B4]/40 mx-auto gap-1.5 cursor-pointer"
                    >
                      <Sliders className="w-3.5 h-3.5" />
                      <span>Configure in Settings</span>
                    </button>
                  )}
                </div>
              ) : (
                /* Active Budget Hero Display */
                <div className="mt-4 space-y-3.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* SVG Circular Progress Ring */}
                    <div className="relative w-28 h-28 shrink-0 mx-auto sm:mx-0 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                        {/* Background track */}
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          className="stroke-[#0C0E12]"
                          strokeWidth="8"
                          fill="transparent"
                        />
                        {/* Progress ring */}
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          stroke={
                            budgetMetrics.percentageUsed >= 100
                              ? '#FFB4AB'
                              : budgetMetrics.percentageUsed >= 75
                              ? '#F59E0B'
                              : '#55C79A'
                          }
                          strokeWidth="8"
                          strokeDasharray={251.33}
                          strokeDashoffset={251.33 - (Math.min(100, budgetMetrics.percentageUsed) / 100) * 251.33}
                          strokeLinecap="round"
                          fill="transparent"
                          className="transition-all duration-500 ease-out"
                        />
                      </svg>
                      {/* Inside Ring Text */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2">
                        <span className="text-[9px] font-semibold uppercase tracking-wider text-[#87948C] leading-none mb-0.5">
                          Left Today
                        </span>
                        <span
                          className={`text-sm sm:text-base font-mono font-bold tracking-tight leading-tight ${
                            budgetMetrics.isOverBudget ? 'text-[#FFB4AB]' : 'text-[#73E3B4]'
                          }`}
                        >
                          {formatTaka(budgetMetrics.leftToday)}
                        </span>
                      </div>
                    </div>

                    {/* Side Stats */}
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#87948C]">Spent today:</span>
                        <span className="font-mono font-semibold text-[#E2E2E8]">
                          {formatTaka(budgetMetrics.spentToday)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#87948C]">Daily limit:</span>
                        <span className="font-mono font-semibold text-[#73E3B4]">
                          {formatTaka(budgetMetrics.todayLimit)}
                        </span>
                      </div>

                      {/* Horizontal progress bar */}
                      <div className="w-full h-2 rounded-full bg-[#0C0E12] border border-[#3D4943]/30 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${
                            budgetMetrics.percentageUsed >= 100
                              ? 'bg-[#FFB4AB]'
                              : budgetMetrics.percentageUsed >= 75
                              ? 'bg-[#F59E0B]'
                              : 'bg-[#55C79A]'
                          }`}
                          style={{ width: `${Math.min(100, budgetMetrics.percentageUsed)}%` }}
                        />
                      </div>

                      {/* Footer remaining / over alert */}
                      <div className="pt-0.5">
                        {budgetMetrics.isOverBudget ? (
                          <div className="text-xs font-semibold text-[#FFB4AB] flex items-center gap-1.5 animate-pulse">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            <span>{formatTaka(budgetMetrics.overAmount)} over budget!</span>
                          </div>
                        ) : (
                          <div className="text-xs text-[#73E3B4] font-medium">
                            {formatTaka(budgetMetrics.leftToday)} remaining today
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Fixed & Emergency Quick Progress Strip */}
                  {budgetMetrics.mode === 'calculated' && (
                    <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40 text-[11px]">
                      <div className="flex flex-col">
                        <div className="flex items-center justify-between text-[#87948C] text-[10px]">
                          <span>Fixed Cost Completed:</span>
                          <span className={`font-mono font-semibold ${budgetMetrics.isFixedOver ? 'text-[#FFB4AB]' : 'text-[#73E3B4]'}`}>
                            {budgetMetrics.plannedFixed > 0 ? Math.min(100, Math.round((budgetMetrics.actualFixed / budgetMetrics.plannedFixed) * 100)) : 0}%
                          </span>
                        </div>
                        <div className="font-mono text-xs text-[#E2E2E8] font-medium mt-0.5">
                          {formatTaka(budgetMetrics.actualFixed)} <span className="text-[#87948C] text-[10px]">/ {formatTaka(budgetMetrics.plannedFixed)}</span>
                        </div>
                      </div>

                      <div className="flex flex-col border-l border-[#3D4943]/30 pl-2.5">
                        <div className="flex items-center justify-between text-[#87948C] text-[10px]">
                          <span>Emergency Fund Used:</span>
                          <span className={`font-mono font-semibold ${budgetMetrics.isEmergencyOver ? 'text-[#FFB4AB]' : 'text-[#73E3B4]'}`}>
                            {budgetMetrics.plannedEmergency > 0 ? Math.min(100, Math.round((budgetMetrics.actualEmergency / budgetMetrics.plannedEmergency) * 100)) : 0}%
                          </span>
                        </div>
                        <div className="font-mono text-xs text-[#E2E2E8] font-medium mt-0.5">
                          {formatTaka(budgetMetrics.actualEmergency)} <span className="text-[#87948C] text-[10px]">/ {formatTaka(budgetMetrics.plannedEmergency)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Action buttons: Customize DB & Details */}
            <div className="mt-4 pt-3 border-t border-[#3D4943]/20 flex flex-wrap items-center justify-between gap-2">
              {onNavigateToSettings ? (
                <button
                  type="button"
                  onClick={onNavigateToSettings}
                  className="btn-sm bg-[#0C0E12] hover:bg-[#1E2024] text-[#BCCAC1] hover:text-[#E2E2E8] border border-[#3D4943]/40 gap-1.5 cursor-pointer text-xs"
                  title="Configure Daily Budget and buffer settings"
                >
                  <Sliders className="w-3 h-3 text-[#73E3B4]" />
                  <span>Customize DB</span>
                </button>
              ) : (
                <div />
              )}

              {budgetMetrics.mode === 'calculated' && (
                <button
                  type="button"
                  onClick={() => setShowBudgetDetailsModal(true)}
                  className="btn-sm px-3 py-1.5 bg-[#1E2024] hover:bg-[#282A2E] text-[#73E3B4] border border-[#73E3B4]/40 gap-2 cursor-pointer text-xs font-medium flex items-center transition-colors shadow-sm"
                  title="View Fixed & Emergency spending progress and today's formula calculation"
                >
                  <Sparkles className="w-3.5 h-3.5 text-[#73E3B4]" />
                  <span>Details</span>
                  <span className="flex items-center gap-1.5 text-[10px] text-[#BCCAC1] font-mono border-l border-[#3D4943]/50 pl-2">
                    <span>Fixed: <strong className={budgetMetrics.isFixedOver ? 'text-[#FFB4AB]' : 'text-[#73E3B4]'}>{budgetMetrics.plannedFixed > 0 ? Math.min(100, Math.round((budgetMetrics.actualFixed / budgetMetrics.plannedFixed) * 100)) : 0}%</strong></span>
                    <span className="text-[#87948C]">•</span>
                    <span>Emer: <strong className={budgetMetrics.isEmergencyOver ? 'text-[#FFB4AB]' : 'text-[#73E3B4]'}>{budgetMetrics.plannedEmergency > 0 ? Math.min(100, Math.round((budgetMetrics.actualEmergency / budgetMetrics.plannedEmergency) * 100)) : 0}%</strong></span>
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Card 2: Active Accounts & Liquidity Overview */}
        <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#BCCAC1]">
                Active Accounts & Liquidity
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded bg-[#0C0E12] border border-[#3D4943]/30 text-[#73E3B4] font-mono">
                {activeWallets.length} Accounts Active
              </span>
            </div>

            <div className="mt-4 space-y-3">
              {/* Total Liquid Funds in Wallets */}
              <div className="p-3.5 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-medium text-[#BCCAC1]">
                    Total Liquid Funds in Wallets
                  </div>
                  <div className="text-xl sm:text-2xl font-mono tabular-nums font-bold text-[#73E3B4] mt-0.5">
                    {formatTaka(summary.liquidWalletTotal)}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#1A1C20] border border-[#3D4943]/40 flex items-center justify-center text-[#73E3B4] shrink-0">
                  <Wallet className="w-5 h-5" />
                </div>
              </div>

              {/* Overall Net Position */}
              <div className="p-3.5 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-medium text-[#BCCAC1]">
                    Overall Net Position:
                  </div>
                  <div className="text-xl sm:text-2xl font-mono tabular-nums font-bold text-[#E2E2E8] mt-0.5">
                    {formatTaka(summary.netTotal)}
                  </div>
                </div>
                <div className="w-10 h-10 rounded-lg bg-[#1A1C20] border border-[#3D4943]/40 flex items-center justify-center text-[#BCCAC1] shrink-0">
                  <TrendingUp className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#3D4943]/20 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={onNavigateToWallets}
              className="btn-sm bg-[#1E2024] hover:bg-[#282A2E] text-[#73E3B4] border border-[#3D4943]/40 gap-1.5 cursor-pointer text-xs"
            >
              <span>Manage Wallets</span>
              <ArrowRight className="w-3 h-3" />
            </button>
            <div className="flex items-center gap-3">
              {onNavigateToSettlements && (
                <button
                  type="button"
                  onClick={onNavigateToSettlements}
                  className="text-xs text-[#73E3B4] hover:underline flex items-center gap-1 cursor-pointer font-medium"
                >
                  <span>Smart Settlement</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              )}
              <button
                type="button"
                onClick={onNavigateToPeople}
                className="text-xs text-[#87948C] hover:text-[#E2E2E8] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Loans</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          LENDING & DEBT REMINDERS SECTION
         ========================================================================= */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-[#73E3B4]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#BCCAC1]">
              Lending & Debt Milestones
            </h3>
          </div>
          <button
            type="button"
            onClick={onNavigateToPeople}
            className="text-xs text-[#73E3B4] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>Ledger History</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* State A: All Settled */}
        {reminderData.allSettled && (
          <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-6 text-center shadow-sm">
            <div className="text-2xl mb-1.5 select-none">🎉</div>
            <div className="text-sm font-semibold text-[#E2E2E8]">All Personal Debts Settled</div>
            <p className="text-xs text-[#BCCAC1] mt-1">
              There are no outstanding lending or debt balances at this time.
            </p>
          </div>
        )}

        {/* State B: Outstanding loans exist, but none reached milestone yet */}
        {!reminderData.allSettled && reminderData.hasOutstandingWithoutReminder && (
          <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-4 text-center text-xs text-[#87948C]">
            <div className="text-[#BCCAC1] font-medium mb-0.5">No Milestone Reminders Due</div>
            <span>All outstanding loans are within their grace period (less than 7 days old).</span>
          </div>
        )}

        {/* State C: Active Milestones Due */}
        {reminderData.activeReminders.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {reminderData.activeReminders.map((item) => {
              const isReceivable = item.direction === 'receivable';
              const milestoneLabel = item.currentMilestone?.labelEn || `${item.daysElapsed} days`;

              return (
                <div
                  key={`${item.personId}_${item.currentMilestone?.key}`}
                  className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-4 flex flex-col justify-between hover:border-[#3D4943]/70 transition-all shadow-sm"
                >
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-sm font-semibold text-[#E2E2E8] flex items-center gap-2">
                          <span>{item.personName}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1E2024] border border-[#3D4943]/40 text-[#73E3B4] font-medium">
                            {milestoneLabel}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#87948C] mt-0.5">
                          Recorded: {item.formattedRecordedDate}
                        </div>
                      </div>

                      {onDismissMilestone && item.currentMilestone && (
                        <button
                          type="button"
                          onClick={() => onDismissMilestone(item.personId, item.currentMilestone!.key)}
                          className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] text-[11px] cursor-pointer"
                          title="Dismiss this milestone reminder"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    <div className="pt-1">
                      <div className="text-[11px] text-[#BCCAC1]">
                        {isReceivable ? 'They owe you:' : 'You owe:'}
                      </div>
                      <div
                        className={`text-xl font-mono tabular-nums font-bold ${
                          isReceivable ? 'text-[#73E3B4]' : 'text-[#FFB4AB]'
                        }`}
                      >
                        {formatTaka(item.outstandingAmount)}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-[#3D4943]/30 mt-3 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedReminderDetails(item)}
                      className="text-[11px] text-[#87948C] hover:text-[#E2E2E8] hover:underline cursor-pointer"
                    >
                      Milestone Details
                    </button>

                    {isReceivable ? (
                      <button
                        type="button"
                        onClick={() => handleLaunchWhatsApp(item)}
                        className="px-3 py-1.5 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] text-[#73E3B4] border border-[#73E3B4]/40 hover:border-[#73E3B4] text-xs font-medium flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Remind on WhatsApp</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onNavigateToPeople}
                        className="px-3 py-1.5 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] text-[#BEC7D5] border border-[#3D4943]/40 text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>View Ledger</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =========================================================================
          ACTIVE WALLETS SNAPSHOT
         ========================================================================= */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[#BCCAC1]">
            Active Wallets & Accounts
          </h3>
          <button
            type="button"
            onClick={onNavigateToWallets}
            className="text-xs text-[#73E3B4] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>All Wallets ({activeWallets.length})</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {summary.walletBalances.slice(0, 4).map((wallet) => (
            <div
              key={wallet.methodId}
              onClick={onNavigateToWallets}
              className="p-3.5 rounded-xl bg-[#1A1C20] border border-[#3D4943]/40 hover:border-[#73E3B4]/40 cursor-pointer transition-colors shadow-sm"
            >
              <div className="flex items-center gap-1.5">
                <Wallet className="w-3.5 h-3.5 text-[#87948C]" />
                <span className="text-xs font-medium text-[#BCCAC1] truncate">
                  {wallet.name}
                </span>
              </div>
              <div className="text-base font-mono tabular-nums font-bold text-[#E2E2E8] mt-1.5">
                {formatTaka(wallet.currentBalance)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* =========================================================================
          RECENT ACTIVITY & LEDGER PREVIEW (With filtration summary & direct editing)
         ========================================================================= */}
      <section className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#BCCAC1]">
              Recent Financial Activity & Ledger
            </h3>
            <p className="text-[11px] text-[#87948C]">
              Review recent entries, filter by category or type, and edit any record anytime
            </p>
          </div>
          <button
            type="button"
            onClick={onNavigateToList}
            className="self-start sm:self-auto text-xs text-[#73E3B4] hover:underline flex items-center gap-1 cursor-pointer font-medium"
          >
            <span>Open Complete Ledger</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick Filter Tabs for Recent Activity */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {[
            { id: 'all' as const, label: 'All Activities' },
            { id: 'expense' as const, label: 'Expenses' },
            { id: 'earning' as const, label: 'Income / Earnings' },
            { id: 'transfer' as const, label: 'Transfers' },
            { id: 'transaction' as const, label: 'Loans & Debts' }
          ].map((tab) => {
            const isActive = selectedActivityTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedActivityTab(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1E2024] text-[#73E3B4] border border-[#73E3B4]/40 font-semibold'
                    : 'text-[#BCCAC1] hover:text-[#E2E2E8] hover:bg-[#1A1C20] border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Filtered Summary Card on Dashboard */}
        <div className="p-3.5 rounded-xl bg-[#1A1C20] border border-[#73E3B4]/30 shadow-sm space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#E2E2E8] flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5 text-[#73E3B4]" />
              <span>
                {selectedActivityTab === 'expense'
                  ? 'Recent Expenses Summary'
                  : selectedActivityTab === 'earning'
                  ? 'Recent Earnings Summary'
                  : selectedActivityTab === 'transfer'
                  ? 'Recent Transfers Summary'
                  : selectedActivityTab === 'transaction'
                  ? 'Recent Loans Summary'
                  : 'Recent Ledger Summary'}
              </span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#0C0E12] text-[#73E3B4] border border-[#73E3B4]/30">
              {recentSummary.count} entries
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
            <div className="p-2 rounded-lg bg-[#0C0E12] border border-[#FFB4AB]/20">
              <div className="text-[10px] text-[#87948C]">Recent Outflow</div>
              <div className="text-sm font-mono font-bold text-[#FFB4AB]">
                {formatTaka(recentSummary.spent)}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-[#0C0E12] border border-[#73E3B4]/20">
              <div className="text-[10px] text-[#87948C]">Recent Inflow</div>
              <div className="text-sm font-mono font-bold text-[#73E3B4]">
                {formatTaka(recentSummary.earned)}
              </div>
            </div>
            <div className="p-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30 col-span-2 sm:col-span-1">
              <div className="text-[10px] text-[#87948C]">Net Balance</div>
              <div
                className={`text-sm font-mono font-bold ${
                  recentSummary.net >= 0 ? 'text-[#73E3B4]' : 'text-[#FFB4AB]'
                }`}
              >
                {recentSummary.net >= 0 ? '+' : ''}
                {formatTaka(recentSummary.net)}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activities List with Edit buttons */}
        <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl divide-y divide-[#3D4943]/20 overflow-hidden shadow-sm">
          {filteredRecentActivities.length === 0 ? (
            <div className="p-8 text-center text-xs text-[#87948C]">
              No transactions match this category. Tap "+ Record Entry" to log a transaction.
            </div>
          ) : (
            filteredRecentActivities.slice(0, 8).map((item) => (
              <div
                key={item.id}
                onClick={() => setDetailItem(item)}
                className="p-3.5 flex items-center justify-between hover:bg-[#1E2024]/60 transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-lg bg-[#0C0E12] text-[#87948C] shrink-0 border border-[#3D4943]/20">
                    {item.activityType === 'expense' && <TrendingDown className="w-4 h-4 text-[#FFB4AB]" />}
                    {item.activityType === 'earning' && <TrendingUp className="w-4 h-4 text-[#73E3B4]" />}
                    {item.activityType === 'transfer' && <ArrowRightLeft className="w-4 h-4 text-[#BEC7D5]" />}
                    {item.activityType === 'transaction' && <Users2 className="w-4 h-4 text-[#73E3B4]" />}
                    {item.activityType === 'recurring' && <Layers className="w-4 h-4 text-[#BEC7D5]" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#E2E2E8] group-hover:text-[#73E3B4] transition-colors truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-[#87948C] mt-0.5 truncate flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-[#BCCAC1]">
                        {formatDisplayDate(item.date)}
                      </span>
                      {item.categoryOrSourceOrPerson && (
                        <>
                          <span>·</span>
                          <span className="capitalize">{item.categoryOrSourceOrPerson}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 ml-3">
                  <div className="text-right">
                    <div
                      className={`text-xs font-mono tabular-nums font-bold ${
                        item.activityType === 'expense'
                          ? 'text-[#FFB4AB]'
                          : item.activityType === 'earning'
                          ? 'text-[#73E3B4]'
                          : 'text-[#E2E2E8]'
                      }`}
                    >
                      {item.activityType === 'expense' ? '-' : item.activityType === 'earning' ? '+' : ''}
                      {formatTaka(item.amount)}
                    </div>
                    {item.netEffectText && (
                      <div className="text-[10px] text-[#87948C]">{item.netEffectText}</div>
                    )}
                  </div>

                  {/* Direct Edit Button */}
                  <button
                    type="button"
                    title="Edit Record"
                    onClick={(e) => {
                      e.stopPropagation();
                      setEditingItem(item);
                    }}
                    className="p-1.5 rounded-lg bg-[#282A2E]/60 hover:bg-[#73E3B4]/20 text-[#87948C] hover:text-[#73E3B4] transition-colors cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>

                  <ChevronRight className="w-4 h-4 text-[#87948C] group-hover:text-[#E2E2E8] transition-colors" />
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* =========================================================================
          MODALS: MILESTONE DETAILS, WHATSAPP QUICK-SEND, FORMULA EXPLAINER
         ========================================================================= */}
      {selectedReminderDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedReminderDetails(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#1A1C20] border border-[#3D4943]/60 rounded-xl p-5 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-[#E2E2E8]">
                  {selectedReminderDetails.personName}'s Loan Milestones
                </h3>
                <div className="text-[11px] text-[#BCCAC1]">
                  Outstanding: <span className="font-mono tabular-nums text-[#73E3B4] font-medium">{formatTaka(selectedReminderDetails.outstandingAmount)}</span> · {selectedReminderDetails.daysElapsed} days elapsed
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReminderDetails(null)}
                className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="text-[11px] font-medium uppercase tracking-wider text-[#BCCAC1]">
                Calendar Milestone Schedule
              </div>
              <div className="divide-y divide-[#3D4943]/20 bg-[#0C0E12] border border-[#3D4943]/40 rounded-lg overflow-hidden">
                {selectedReminderDetails.allMilestones.map((m) => (
                  <div key={m.key} className="px-3 py-2 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      {m.isReached ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-[#73E3B4]" />
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full border border-[#3D4943]" />
                      )}
                      <span className={m.isReached ? 'text-[#E2E2E8] font-medium' : 'text-[#87948C]'}>
                        {m.labelEn}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[11px] text-[#87948C]">{m.targetDate}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedReminderDetails(null)}
                className="btn-sm bg-[#282A2E] text-xs text-[#E2E2E8] cursor-pointer hover:bg-[#333539]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Quick-Send Prompt Modal */}
      {whatsAppModalItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setWhatsAppModalItem(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#1A1C20] border border-[#3D4943]/60 rounded-xl p-5 shadow-2xl flex flex-col space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-3">
              <h3 className="text-sm font-semibold text-[#E2E2E8]">
                Send WhatsApp Reminder to {whatsAppModalItem.personName}
              </h3>
              <button
                type="button"
                onClick={() => setWhatsAppModalItem(null)}
                className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] text-[#BCCAC1] uppercase tracking-wider mb-1">
                WhatsApp Phone Number
              </label>
              <input
                type="tel"
                value={tempPhone}
                onChange={(e) => setTempPhone(e.target.value)}
                placeholder="+88017XXXXXXXX"
                className="w-full bg-[#0C0E12] border border-[#3D4943]/50 rounded-lg px-3 py-2 text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4] font-mono tabular-nums"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-[#BCCAC1] uppercase tracking-wider">
                  Reminder Message Preview
                </span>
                <button
                  type="button"
                  onClick={() => {
                    if (whatsAppModalItem.whatsAppReminderText) {
                      navigator.clipboard.writeText(whatsAppModalItem.whatsAppReminderText);
                      setCopiedText(true);
                      setTimeout(() => setCopiedText(false), 2000);
                    }
                  }}
                  className="text-[10px] text-[#73E3B4] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  {copiedText ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedText ? 'Copied' : 'Copy Text'}</span>
                </button>
              </div>
              <div className="p-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40 text-[#BCCAC1] text-[11px] whitespace-pre-line leading-relaxed max-h-40 overflow-y-auto font-sans">
                {whatsAppModalItem.whatsAppReminderText}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setWhatsAppModalItem(null)}
                className="btn-sm bg-[#282A2E] text-xs text-[#BCCAC1] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendCustomPhoneWhatsApp}
                className="btn-md bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-semibold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Open WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formula Explainer Modal */}
      {showFormulaModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowFormulaModal(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#1A1C20] border border-[#3D4943]/60 rounded-xl p-5 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-3">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-[#73E3B4]" />
                <h3 className="text-sm font-semibold text-[#E2E2E8]">
                  Understanding Net vs. Liquid Total
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#BCCAC1] leading-relaxed">
              <p>
                EcO maintains strict financial distinction between funds physically in your wallets and peer lending debts:
              </p>

              <div className="p-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30 space-y-1.5 font-mono tabular-nums text-[11px]">
                <div className="flex justify-between">
                  <span className="text-[#87948C]">Liquid Wallet Total:</span>
                  <span className="text-[#E2E2E8]">{formatTaka(summary.liquidWalletTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#87948C]">(+) Total Receivables (Owed to you):</span>
                  <span className="text-[#73E3B4]">+{formatTaka(summary.totalReceivables)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#87948C]">(-) Total Payables (You owe others):</span>
                  <span className="text-[#FFB4AB]">-{formatTaka(summary.totalPayables)}</span>
                </div>
                <div className="pt-2 border-t border-[#3D4943]/40 flex justify-between font-semibold">
                  <span className="text-[#E2E2E8]">(=) Net Financial Position:</span>
                  <span className="text-[#73E3B4]">{formatTaka(summary.netTotal)}</span>
                </div>
              </div>

              <p className="text-[11px] text-[#87948C]">
                When you lend money to someone from bKash, your liquid bKash balance decreases by that amount, but your overall net worth remains protected as an outstanding receivable until repaid.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowFormulaModal(false)}
                className="px-4 py-1.5 rounded-lg bg-[#282A2E] text-xs text-[#E2E2E8] hover:bg-[#333539] cursor-pointer"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed & Emergency Adaptive Plan Details Modal */}
      <FixedEmergencyDetailsModal
        isOpen={showBudgetDetailsModal}
        onClose={() => setShowBudgetDetailsModal(false)}
        metrics={budgetMetrics}
        onNavigateToSettings={onNavigateToSettings}
      />

      {/* Activity Details Audit Modal */}
      {detailItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDetailItem(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#1A1C20] border border-[#3D4943]/60 rounded-xl p-5 shadow-2xl flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-[#73E3B4]" />
                <h3 className="text-sm font-semibold text-[#E2E2E8]">Transaction Audit Details</h3>
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30 text-center">
              <div className="text-[11px] text-[#87948C] uppercase tracking-wider">
                {detailItem.activityType.toUpperCase()}
              </div>
              <div className="text-2xl font-mono tabular-nums font-bold text-[#E2E2E8] mt-1">
                {formatTaka(detailItem.amount)}
              </div>
              <div className="text-xs text-[#BCCAC1] mt-0.5">{detailItem.title}</div>
            </div>

            {/* Dedicated Branded Voucher Action Button (Balanced for mobile & desktop) */}
            {onOpenBrandedVoucher && (
              <button
                type="button"
                onClick={() => {
                  const toVoucher = detailItem;
                  onOpenBrandedVoucher(toVoucher);
                }}
                className="w-full py-2.5 px-3 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] active:scale-[0.98] border border-[#73E3B4]/40 text-[#73E3B4] text-xs font-semibold flex items-center justify-center gap-2 shadow-xs cursor-pointer transition-all group"
                title="Generate official EcO voucher / receipt (PDF & Image)"
              >
                <FileText className="w-4 h-4 text-[#73E3B4] group-hover:scale-110 transition-transform" />
                <span>Generate EcO Voucher / Receipt</span>
              </button>
            )}

            <div className="divide-y divide-[#3D4943]/20 text-xs">
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#87948C]">Date & Time</span>
                <span className="font-mono text-[#E2E2E8]">{formatExactDateTime(detailItem.date, detailItem.timestamp)}</span>
              </div>
              <div className="py-2 flex items-center justify-between">
                <span className="text-[#87948C]">Category / Party</span>
                <span className="font-medium text-[#E2E2E8]">{detailItem.categoryOrSourceOrPerson}</span>
              </div>
              {detailItem.payMethodId && (
                <div className="py-2 flex items-center justify-between">
                  <span className="text-[#87948C]">Wallet</span>
                  <span className="text-[#73E3B4] font-medium">
                    {paymentMethods.find((m) => m.id === detailItem.payMethodId)?.name || 'Account'}
                  </span>
                </div>
              )}
              {detailItem.description && (
                <div className="py-2 space-y-1">
                  <span className="text-[#87948C] block">Notes & Description</span>
                  <p className="text-xs text-[#E2E2E8] bg-[#0C0E12] p-2 rounded border border-[#3D4943]/20">
                    {detailItem.description}
                  </p>
                </div>
              )}
            </div>

            {/* Modal Actions (Balanced for mobile screens) */}
            <div className="pt-3 border-t border-[#3D4943]/30 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const toEdit = detailItem;
                    setDetailItem(null);
                    setEditingItem(toEdit);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[#73E3B4]/15 hover:bg-[#73E3B4]/25 active:scale-[0.98] text-[#73E3B4] text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  <span>Edit</span>
                </button>
                {onDeleteActivity && (
                  <button
                    type="button"
                    onClick={() => {
                      setItemToDelete(detailItem);
                      setDetailItem(null);
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-[#FFB4AB]/10 hover:bg-[#FFB4AB]/20 active:scale-[0.98] text-[#FFB4AB] text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetailItem(null)}
                className="px-4 py-1.5 rounded-lg bg-[#282A2E] hover:bg-[#333539] active:scale-[0.98] text-xs text-[#E2E2E8] font-medium cursor-pointer transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Activity Modal */}
      {editingItem && (
        <EditActivityModal
          isOpen={true}
          item={editingItem}
          paymentMethods={paymentMethods}
          people={people}
          categories={categories && categories.length > 0 ? categories : settings.categories}
          sources={sources}
          tags={tags && tags.length > 0 ? tags : settings.tags}
          onClose={() => setEditingItem(null)}
          onSaveExpense={(exp) => {
            onUpdateExpense?.(exp);
            setEditingItem(null);
          }}
          onSaveRecurringExpense={(rec) => {
            onUpdateRecurringExpense?.(rec);
            setEditingItem(null);
          }}
          onSaveEarning={(earn) => {
            onUpdateEarning?.(earn);
            setEditingItem(null);
          }}
          onSaveTransfer={(tr) => {
            onUpdateTransfer?.(tr);
            setEditingItem(null);
          }}
          onSaveTransaction={(tx) => {
            onUpdateTransaction?.(tx);
            setEditingItem(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {itemToDelete && onDeleteActivity && (
        <ConfirmModal
          isOpen={true}
          title="Delete Transaction Record"
          message={`Are you sure you want to delete "${itemToDelete.title}" (${formatTaka(itemToDelete.amount)})? This will reverse all financial ledger and wallet balance effects.`}
          confirmLabel="Delete Record"
          cancelLabel="Keep Record"
          isDestructive={true}
          onConfirm={() => {
            onDeleteActivity(itemToDelete);
            setItemToDelete(null);
          }}
          onCancel={() => setItemToDelete(null)}
        />
      )}
    </div>
  );
};
