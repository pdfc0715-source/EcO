import React, { useState, useMemo } from 'react';
import {
  Search,
  X,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  Users2,
  Trash2,
  Pencil,
  ChevronRight,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Wallet,
  Clock,
  Layers,
  FileText,
  Filter,
  Check,
  CheckSquare
} from 'lucide-react';
import {
  UnifiedActivityItem,
  PaymentMethod,
  PersonRecord,
  ExpenseRecord,
  RecurringExpenseRecord,
  EarningRecord,
  TransferRecord,
  PeerTransactionRecord
} from '../domain/types';
import { formatTaka } from '../domain/money';
import { formatDisplayDate, formatExactDateTime } from '../domain/dates';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { EditActivityModal } from '../components/EditActivityModal';

interface UnifiedListViewProps {
  activities: UnifiedActivityItem[];
  paymentMethods: PaymentMethod[];
  people: PersonRecord[];
  categories: string[];
  sources?: { id: string; name: string }[];
  tags?: string[];
  onDeleteActivity: (activity: UnifiedActivityItem) => void;
  onUpdateExpense?: (expense: ExpenseRecord) => void;
  onUpdateRecurringExpense?: (rec: RecurringExpenseRecord) => void;
  onUpdateEarning?: (earning: EarningRecord) => void;
  onUpdateTransfer?: (transfer: TransferRecord) => void;
  onUpdateTransaction?: (tx: PeerTransactionRecord) => void;
  onOpenBrandedVoucher?: (item: UnifiedActivityItem) => void;
  onOpenBrandedMultiVoucher?: (items: UnifiedActivityItem[]) => void;
  onOpenAddModal: () => void;
}

export const UnifiedListView: React.FC<UnifiedListViewProps> = ({
  activities,
  paymentMethods,
  people,
  categories,
  sources = [],
  tags = [],
  onDeleteActivity,
  onUpdateExpense,
  onUpdateRecurringExpense,
  onUpdateEarning,
  onUpdateTransfer,
  onUpdateTransaction,
  onOpenBrandedVoucher,
  onOpenBrandedMultiVoucher,
  onOpenAddModal
}) => {
  // Filter states
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedMethodId, setSelectedMethodId] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPersonId, setSelectedPersonId] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'month' | 'week' | 'today'>('all');

  // Multi-selection for consolidated voucher
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState<boolean>(false);

  // Selected item for details drawer, editing & non-blocking delete
  const [detailItem, setDetailItem] = useState<UnifiedActivityItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<UnifiedActivityItem | null>(null);
  const [editingItem, setEditingItem] = useState<UnifiedActivityItem | null>(null);

  // Pagination
  const [visibleCount, setVisibleCount] = useState<number>(30);

  // Filter pipeline
  const filteredActivities = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const d7 = new Date(today);
    d7.setDate(d7.getDate() - 7);
    const sevenDaysAgoStr = d7.toISOString().split('T')[0];
    const currentMonthStr = todayStr.substring(0, 7);

    return activities.filter((item) => {
      // 1. Type filter
      if (selectedType !== 'all') {
        if (selectedType === 'expense' && item.activityType !== 'expense' && item.activityType !== 'recurring') {
          return false;
        }
        if (selectedType !== 'expense' && item.activityType !== selectedType) {
          return false;
        }
      }

      // 2. Method filter
      if (selectedMethodId !== 'all') {
        const selMethod = paymentMethods.find((m) => m.id === selectedMethodId);
        const selKeys = new Set<string>([selectedMethodId.toLowerCase()]);
        if (selMethod) {
          selKeys.add(selMethod.name.trim().toLowerCase());
          if (selMethod.legacyNames) {
            selMethod.legacyNames.forEach((ln) => selKeys.add(ln.trim().toLowerCase()));
          }
        }
        const matchesField = (f?: string) => {
          if (!f) return false;
          return selKeys.has(f.trim().toLowerCase());
        };
        const matchesMethod =
          matchesField(item.payMethodId) ||
          matchesField(item.fromMethodId) ||
          matchesField(item.toMethodId);
        if (!matchesMethod) return false;
      }

      // 3. Category filter (matches Expense & Recurring Expense)
      if (selectedCategory !== 'all') {
        const isExpOrRec = item.activityType === 'expense' || item.activityType === 'recurring';
        if (!isExpOrRec) return false;
        if (item.categoryOrSourceOrPerson !== selectedCategory) return false;
      }

      // 4. Person filter
      if (selectedPersonId !== 'all' && item.activityType === 'transaction') {
        const raw: any = item.rawRecord;
        if (raw.personId !== selectedPersonId) return false;
      }

      // 5. Date filter
      if (dateFilter === 'today') {
        if (item.date !== todayStr) return false;
      } else if (dateFilter === 'week') {
        if (item.date < sevenDaysAgoStr || item.date > todayStr) return false;
      } else if (dateFilter === 'month') {
        if (!item.date.startsWith(currentMonthStr)) return false;
      }

      // 6. Search text
      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(term);
        const matchDesc = item.description ? item.description.toLowerCase().includes(term) : false;
        const matchCat = item.categoryOrSourceOrPerson.toLowerCase().includes(term);
        if (!matchTitle && !matchDesc && !matchCat) return false;
      }

      return true;
    });
  }, [
    activities,
    selectedType,
    selectedMethodId,
    selectedCategory,
    selectedPersonId,
    dateFilter,
    searchTerm
  ]);

  // Dynamic Filtration Summary Calculations
  const filterSummary = useMemo(() => {
    let totalExpenses = 0;
    let totalEarnings = 0;
    let totalTransfers = 0;
    let totalLent = 0;
    let totalBorrowed = 0;
    let expenseCount = 0;
    let earningCount = 0;
    let transferCount = 0;
    let loanCount = 0;

    filteredActivities.forEach((item) => {
      if (item.activityType === 'expense' || item.activityType === 'recurring') {
        totalExpenses += item.amount;
        expenseCount++;
      } else if (item.activityType === 'earning') {
        totalEarnings += item.amount;
        earningCount++;
      } else if (item.activityType === 'transfer') {
        totalTransfers += item.amount;
        transferCount++;
      } else if (item.activityType === 'transaction') {
        loanCount++;
        if (item.direction === 'give') {
          totalLent += item.amount;
        } else if (item.direction === 'take') {
          totalBorrowed += item.amount;
        }
      }
    });

    const netCashFlow = totalEarnings - totalExpenses;

    return {
      totalExpenses,
      totalEarnings,
      netCashFlow,
      totalTransfers,
      totalLent,
      totalBorrowed,
      totalCount: filteredActivities.length,
      expenseCount,
      earningCount,
      transferCount,
      loanCount
    };
  }, [filteredActivities]);

  const pagedList = filteredActivities.slice(0, visibleCount);

  // Selected items calculation for consolidated voucher
  const selectedItems = useMemo(() => {
    if (selectedItemIds.size === 0) return [];
    return activities.filter((a) => selectedItemIds.has(a.id));
  }, [activities, selectedItemIds]);

  const selectedTotalAmount = useMemo(() => {
    return selectedItems.reduce((acc, curr) => acc + curr.amount, 0);
  }, [selectedItems]);

  const toggleItemSelection = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAllFiltered = () => {
    const next = new Set(selectedItemIds);
    filteredActivities.forEach((a) => next.add(a.id));
    setSelectedItemIds(next);
  };

  const handleDeselectAll = () => {
    setSelectedItemIds(new Set());
  };

  const clearAllFilters = () => {
    setSearchTerm('');
    setSelectedType('all');
    setSelectedMethodId('all');
    setSelectedCategory('all');
    setSelectedPersonId('all');
    setDateFilter('all');
  };

  const hasActiveFilters =
    searchTerm !== '' ||
    selectedType !== 'all' ||
    selectedMethodId !== 'all' ||
    selectedCategory !== 'all' ||
    selectedPersonId !== 'all' ||
    dateFilter !== 'all';

  // Human readable date filter label
  const dateFilterLabel =
    dateFilter === 'today'
      ? 'Today'
      : dateFilter === 'week'
      ? 'Last 7 Days (Last Week)'
      : dateFilter === 'month'
      ? 'This Month'
      : 'All Time';

  return (
    <div className="space-y-4 pb-28 lg:pb-12 animate-in fade-in duration-150">
      {/* Title bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#E2E2E8]">Ledger History</h2>
          <p className="text-xs text-[#BCCAC1]">
            Chronological record of all expenses, income, transfers, and personal loans
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onOpenBrandedMultiVoucher && (
            <button
              type="button"
              onClick={() => {
                setIsSelectionMode((prev) => {
                  if (prev) {
                    setSelectedItemIds(new Set());
                  }
                  return !prev;
                });
              }}
              className={`px-3 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border ${
                isSelectionMode
                  ? 'bg-[#1E2024] text-[#73E3B4] border-[#73E3B4]/60'
                  : 'bg-[#1A1C20] text-[#BCCAC1] hover:text-[#E2E2E8] border-[#3D4943]/40 hover:bg-[#282A2E]'
              }`}
              title="Select multiple expenses to create a consolidated voucher"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>{isSelectionMode ? 'Cancel Selection' : 'Select for Voucher'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onOpenAddModal}
            className="px-4 py-2 bg-[#55C79A] hover:bg-[#73E3B4] active:scale-[0.98] text-[#003826] font-semibold text-xs rounded-lg transition-all shadow-sm cursor-pointer"
          >
            + Record Entry
          </button>
        </div>
      </div>

      {/* Selection Helper Bar (Visible when in selection mode) */}
      {isSelectionMode && (
        <div className="p-3 bg-[#1E2024] border border-[#73E3B4]/40 rounded-xl flex flex-wrap items-center justify-between gap-2.5 shadow-sm">
          <div className="flex items-center gap-2 text-xs text-[#E2E2E8]">
            <span className="w-2 h-2 rounded-full bg-[#73E3B4]" />
            <span className="font-semibold text-[#73E3B4]">{selectedItemIds.size}</span>
            <span>selected</span>
            {selectedItemIds.size > 0 && (
              <span className="font-mono text-xs text-[#BCCAC1]">
                · Total: {formatTaka(selectedTotalAmount)}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAllFiltered}
              className="px-2.5 py-1 text-xs font-medium rounded-md bg-[#0C0E12] hover:bg-[#282A2E] text-[#BCCAC1] hover:text-[#E2E2E8] border border-[#3D4943]/40 cursor-pointer"
            >
              Select All Filtered ({filteredActivities.length})
            </button>
            {selectedItemIds.size > 0 && (
              <button
                type="button"
                onClick={handleDeselectAll}
                className="px-2.5 py-1 text-xs font-medium rounded-md bg-[#0C0E12] hover:bg-[#282A2E] text-[#FFB4AB] border border-[#FFB4AB]/30 cursor-pointer"
              >
                Clear Selection
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- Filter Controls Card --- */}
      <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-4 space-y-3 shadow-sm">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#87948C] absolute left-3 top-2.5 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by description, person, or category..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-8 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] placeholder-[#87948C] focus:outline-none focus:border-[#73E3B4] transition-colors"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm('')}
              className="absolute right-2.5 top-2.5 text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Activity Type Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          {[
            { id: 'all', label: 'All Activities' },
            { id: 'expense', label: 'Expenses' },
            { id: 'earning', label: 'Earnings' },
            { id: 'transfer', label: 'Transfers' },
            { id: 'transaction', label: 'Loans & Debts' }
          ].map((tab) => {
            const isActive = selectedType === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedType(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-[#1E2024] text-[#73E3B4] border border-[#73E3B4]/40 font-semibold'
                    : 'text-[#BCCAC1] hover:text-[#E2E2E8] hover:bg-[#0C0E12]'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Secondary Dropdown & Date Filters */}
        <div className="flex flex-wrap items-center gap-2 text-xs pt-1 border-t border-[#3D4943]/20">
          {/* Wallets Filter */}
          <select
            value={selectedMethodId}
            onChange={(e) => setSelectedMethodId(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer text-xs"
          >
            <option value="all">All Wallets</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer text-xs"
          >
            <option value="all">All Categories</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {/* Contacts Filter */}
          {people.length > 0 && (
            <select
              value={selectedPersonId}
              onChange={(e) => setSelectedPersonId(e.target.value)}
              className="px-2.5 py-1.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer text-xs"
            >
              <option value="all">All Contacts</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Date Range Filter Pills */}
          <div className="flex items-center gap-1 bg-[#0C0E12] p-1 rounded-lg border border-[#3D4943]/50">
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
                dateFilter === 'all' ? 'bg-[#1E2024] text-[#73E3B4] font-medium' : 'text-[#87948C] hover:text-[#E2E2E8]'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('month')}
              className={`px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
                dateFilter === 'month' ? 'bg-[#1E2024] text-[#73E3B4] font-medium' : 'text-[#87948C] hover:text-[#E2E2E8]'
              }`}
            >
              This Month
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('week')}
              className={`px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
                dateFilter === 'week' ? 'bg-[#1E2024] text-[#73E3B4] font-medium' : 'text-[#87948C] hover:text-[#E2E2E8]'
              }`}
            >
              Last 7 Days
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-2 py-1 rounded text-[11px] cursor-pointer transition-colors ${
                dateFilter === 'today' ? 'bg-[#1E2024] text-[#73E3B4] font-medium' : 'text-[#87948C] hover:text-[#E2E2E8]'
              }`}
            >
              Today
            </button>
          </div>

          {/* Reset Filters CTA */}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearAllFilters}
              className="text-xs text-[#FFB4AB] hover:underline flex items-center gap-1 ml-auto cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
              <span>Reset Filters</span>
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          DYNAMIC FILTERED SUMMARY CARD (Sum & Overview as per filtration)
         ========================================================================= */}
      <div className="bg-[#1A1C20] border border-[#73E3B4]/30 rounded-xl p-4 shadow-sm space-y-3.5">
        {/* Card Header with Context and Active Criteria Badges */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#3D4943]/30 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#73E3B4]/15 text-[#73E3B4]">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-[#E2E2E8] flex items-center gap-2 flex-wrap">
                <span>
                  {selectedCategory !== 'all'
                    ? `Filtered Summary: ${selectedCategory}`
                    : selectedType === 'expense'
                    ? 'Filtered Summary: Expenses'
                    : selectedType === 'earning'
                    ? 'Filtered Summary: Income / Earnings'
                    : selectedType === 'transfer'
                    ? 'Filtered Summary: Transfers'
                    : selectedType === 'transaction'
                    ? 'Filtered Summary: Loans & Debts'
                    : 'Filtered Ledger Summary'}
                </span>
                <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-[#0C0E12] text-[#73E3B4] border border-[#73E3B4]/30">
                  {filterSummary.totalCount} {filterSummary.totalCount === 1 ? 'record' : 'records'}
                </span>
              </h3>
              <p className="text-[11px] text-[#87948C]">
                Calculated sum for: {dateFilterLabel}
                {selectedCategory !== 'all' && ` • Category: ${selectedCategory}`}
                {selectedMethodId !== 'all' && ` • Wallet: ${paymentMethods.find((m) => m.id === selectedMethodId)?.name}`}
                {selectedPersonId !== 'all' && ` • Contact: ${people.find((p) => p.id === selectedPersonId)?.name}`}
              </p>
            </div>
          </div>

          {/* Active Filter Pills Indicator */}
          <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
            {selectedCategory !== 'all' && (
              <span className="px-2 py-0.5 rounded-full bg-[#73E3B4]/15 text-[#73E3B4] border border-[#73E3B4]/40 font-semibold">
                Category: {selectedCategory}
              </span>
            )}
            <span className="px-2 py-0.5 rounded-full bg-[#0C0E12] text-[#BCCAC1] border border-[#3D4943]/40">
              {dateFilterLabel}
            </span>
            {selectedMethodId !== 'all' && (
              <span className="px-2 py-0.5 rounded-full bg-[#0C0E12] text-[#BCCAC1] border border-[#3D4943]/40">
                Wallet: {paymentMethods.find((m) => m.id === selectedMethodId)?.name}
              </span>
            )}
            {selectedPersonId !== 'all' && (
              <span className="px-2 py-0.5 rounded-full bg-[#0C0E12] text-[#BCCAC1] border border-[#3D4943]/40">
                Contact: {people.find((p) => p.id === selectedPersonId)?.name}
              </span>
            )}
            {searchTerm && (
              <span className="px-2 py-0.5 rounded-full bg-[#0C0E12] text-[#BCCAC1] border border-[#3D4943]/40">
                Search: "{searchTerm}"
              </span>
            )}
          </div>
        </div>

        {/* Primary Filtered Highlight (e.g. "Total Spent on Food in Last 7 Days") */}
        {selectedCategory !== 'all' && (
          <div className="p-3 rounded-lg bg-[#FFB4AB]/10 border border-[#FFB4AB]/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <span className="text-xs font-semibold text-[#FFB4AB] flex items-center gap-1.5">
                <TrendingDown className="w-4 h-4" />
                <span>Total Spent on "{selectedCategory}" ({dateFilterLabel})</span>
              </span>
              <p className="text-[11px] text-[#BCCAC1] mt-0.5">
                {filterSummary.expenseCount} {filterSummary.expenseCount === 1 ? 'transaction' : 'transactions'} found under this category
              </p>
            </div>
            <div className="text-lg sm:text-2xl font-mono font-bold text-[#FFB4AB]">
              {formatTaka(filterSummary.totalExpenses)}
            </div>
          </div>
        )}

        {/* KPI Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Outflow / Expense */}
          <div className="p-3 rounded-lg bg-[#0C0E12] border border-[#FFB4AB]/25">
            <div className="text-[11px] text-[#87948C] flex items-center justify-between">
              <span>Total Outflow / Spent</span>
              <span className="text-[10px] text-[#FFB4AB] font-mono">({filterSummary.expenseCount})</span>
            </div>
            <div className="text-base sm:text-lg font-mono font-bold text-[#FFB4AB] mt-1">
              {formatTaka(filterSummary.totalExpenses)}
            </div>
            <div className="text-[10px] text-[#87948C] mt-0.5">
              {selectedCategory !== 'all' ? `All ${selectedCategory} expenses` : 'Daily & recurring items'}
            </div>
          </div>

          {/* Inflow / Earned */}
          <div className="p-3 rounded-lg bg-[#0C0E12] border border-[#73E3B4]/25">
            <div className="text-[11px] text-[#87948C] flex items-center justify-between">
              <span>Total Inflow / Income</span>
              <span className="text-[10px] text-[#73E3B4] font-mono">({filterSummary.earningCount})</span>
            </div>
            <div className="text-base sm:text-lg font-mono font-bold text-[#73E3B4] mt-1">
              {formatTaka(filterSummary.totalEarnings)}
            </div>
            <div className="text-[10px] text-[#87948C] mt-0.5">Direct income recorded</div>
          </div>

          {/* Net Flow */}
          <div className="p-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40">
            <div className="text-[11px] text-[#87948C]">Net Cash Flow</div>
            <div
              className={`text-base sm:text-lg font-mono font-bold mt-1 ${
                filterSummary.netCashFlow >= 0 ? 'text-[#73E3B4]' : 'text-[#FFB4AB]'
              }`}
            >
              {filterSummary.netCashFlow >= 0 ? '+' : ''}
              {formatTaka(filterSummary.netCashFlow)}
            </div>
            <div className="text-[10px] text-[#87948C] mt-0.5">
              {filterSummary.netCashFlow >= 0 ? 'Surplus (Inflow > Outflow)' : 'Deficit (Outflow > Inflow)'}
            </div>
          </div>

          {/* Transfers or Loans Context Metric */}
          <div className="p-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40">
            {filterSummary.loanCount > 0 ? (
              <>
                <div className="text-[11px] text-[#87948C]">Loans & Debts Sum</div>
                <div className="text-base sm:text-lg font-mono font-bold text-[#E2E2E8] mt-1">
                  {formatTaka(filterSummary.totalLent + filterSummary.totalBorrowed)}
                </div>
                <div className="text-[10px] text-[#87948C] mt-0.5 truncate">
                  Lent: {formatTaka(filterSummary.totalLent)} · Took: {formatTaka(filterSummary.totalBorrowed)}
                </div>
              </>
            ) : (
              <>
                <div className="text-[11px] text-[#87948C]">Transfers Filtered</div>
                <div className="text-base sm:text-lg font-mono font-bold text-[#BEC7D5] mt-1">
                  {formatTaka(filterSummary.totalTransfers)}
                </div>
                <div className="text-[10px] text-[#87948C] mt-0.5">
                  {filterSummary.transferCount} wallet {filterSummary.transferCount === 1 ? 'shift' : 'shifts'}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* --- Activities Table / Rows --- */}
      <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl overflow-hidden divide-y divide-[#3D4943]/20 shadow-sm">
        {pagedList.length === 0 ? (
          <div className="p-12 text-center text-xs text-[#87948C] space-y-2">
            <div>No matching records found for the selected filter criteria.</div>
            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="text-[#73E3B4] hover:underline font-medium cursor-pointer"
              >
                Clear all active filters
              </button>
            )}
          </div>
        ) : (
          pagedList.map((item) => {
            const isExpense = item.activityType === 'expense' || item.activityType === 'recurring';
            const isEarning = item.activityType === 'earning';
            const isTransfer = item.activityType === 'transfer';
            const isGive = item.activityType === 'transaction' && item.direction === 'give';
            const isTake = item.activityType === 'transaction' && item.direction === 'take';

            const findMethodName = (idOrName?: string) => {
              if (!idOrName) return undefined;
              const direct = paymentMethods.find((m) => m.id === idOrName);
              if (direct) return direct.name;
              const lower = idOrName.trim().toLowerCase();
              const byName = paymentMethods.find(
                (m) =>
                  m.name.trim().toLowerCase() === lower ||
                  m.legacyNames?.some((ln) => ln.trim().toLowerCase() === lower)
              );
              return byName ? byName.name : idOrName;
            };

            const walletBadge = isTransfer
              ? `${findMethodName(item.fromMethodId) || 'Account'} → ${findMethodName(item.toMethodId) || 'Account'}`
              : findMethodName(item.payMethodId);
            const isSelected = selectedItemIds.has(item.id);

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (isSelectionMode) {
                    toggleItemSelection(item.id);
                  } else {
                    setDetailItem(item);
                  }
                }}
                className={`p-3.5 flex items-center justify-between transition-colors cursor-pointer group ${
                  isSelected ? 'bg-[#73E3B4]/10 hover:bg-[#73E3B4]/15' : 'hover:bg-[#1E2024]/70'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Selection Checkbox */}
                  {isSelectionMode && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleItemSelection(item.id);
                      }}
                      className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-[#73E3B4] border-[#73E3B4] text-[#003826]'
                          : 'border-[#3D4943] bg-[#0C0E12] hover:border-[#73E3B4]/70 text-transparent'
                      }`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </div>
                  )}

                  {/* Semantic Icon Badge */}
                  <div className="p-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30 shrink-0">
                    {isExpense && <TrendingDown className="w-4 h-4 text-[#FFB4AB]" />}
                    {isEarning && <TrendingUp className="w-4 h-4 text-[#73E3B4]" />}
                    {isTransfer && <ArrowRightLeft className="w-4 h-4 text-[#BEC7D5]" />}
                    {isGive && <ArrowUpRight className="w-4 h-4 text-[#73E3B4]" />}
                    {isTake && <ArrowDownRight className="w-4 h-4 text-[#FFB4AB]" />}
                  </div>

                  {/* Title & Metadata */}
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[#E2E2E8] group-hover:text-[#73E3B4] transition-colors truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-[#87948C] flex items-center gap-2 mt-0.5 truncate">
                      <span className="font-mono text-[10px] text-[#BCCAC1]">
                        {formatDisplayDate(item.date)}
                      </span>
                      <span>·</span>
                      <span className="capitalize">{item.categoryOrSourceOrPerson}</span>
                      {walletBadge && (
                        <>
                          <span>·</span>
                          <span className="text-[#87948C]">{walletBadge}</span>
                        </>
                      )}
                      {item.description && (
                        <>
                          <span>·</span>
                          <span className="truncate italic max-w-[180px]">{item.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Amount, Inline Edit CTA & Chevron */}
                <div className="flex items-center gap-2.5 shrink-0 ml-3">
                  <div className="text-right">
                    <div
                      className={`text-xs font-mono tabular-nums font-bold ${
                        isExpense || isTake
                          ? 'text-[#FFB4AB]'
                          : isEarning || isGive
                          ? 'text-[#73E3B4]'
                          : 'text-[#E2E2E8]'
                      }`}
                    >
                      {isExpense || isTake ? '-' : isEarning || isGive ? '+' : ''}
                      {formatTaka(item.amount)}
                    </div>
                    {item.netEffectText && (
                      <div className="text-[10px] text-[#87948C]">{item.netEffectText}</div>
                    )}
                  </div>

                  {/* Inline Direct Edit Button */}
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

                  {/* Voucher & Receipt Export Button */}
                  {onOpenBrandedVoucher && (
                    <button
                      type="button"
                      title="Generate Official EcO Voucher / Receipt (PDF & Image)"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenBrandedVoucher(item);
                      }}
                      className="p-1.5 rounded-lg bg-[#282A2E]/60 hover:bg-[#73E3B4]/20 text-[#87948C] hover:text-[#73E3B4] transition-colors cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                    </button>
                  )}

                  <ChevronRight className="w-4 h-4 text-[#87948C] group-hover:text-[#E2E2E8] transition-colors" />
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Bottom Consolidated Voucher Bar */}
      {selectedItemIds.size > 0 && onOpenBrandedMultiVoucher && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-lg bg-[#1A1C20] border-2 border-[#73E3B4]/70 rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3">
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-bold text-[#E2E2E8] flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#73E3B4]"></span>
              <span>{selectedItemIds.size} {selectedItemIds.size === 1 ? 'item' : 'items'} selected</span>
            </span>
            <span className="text-xs font-mono font-bold text-[#73E3B4] truncate">
              Total: {formatTaka(selectedTotalAmount)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (selectedItems.length > 0) {
                  onOpenBrandedMultiVoucher(selectedItems);
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-bold text-xs flex items-center gap-1.5 shadow-md cursor-pointer transition-colors active:scale-95"
            >
              <FileText className="w-4 h-4" />
              <span>Create EcO Voucher</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setSelectedItemIds(new Set());
                setIsSelectionMode(false);
              }}
              className="p-2 rounded-xl bg-[#282A2E] hover:bg-[#3D4943] text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
              title="Cancel Selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Load More Button */}
      {filteredActivities.length > visibleCount && (
        <div className="text-center pt-2">
          <button
            type="button"
            onClick={() => setVisibleCount((prev) => prev + 30)}
            className="px-5 py-2 rounded-lg bg-[#1A1C20] hover:bg-[#282A2E] border border-[#3D4943]/50 text-xs text-[#BCCAC1] hover:text-[#E2E2E8] transition-colors cursor-pointer"
          >
            Load More Transactions ({filteredActivities.length - visibleCount} remaining)
          </button>
        </div>
      )}

      {/* =========================================================================
          PROGRESSIVE DISCLOSURE: TRANSACTION DETAILS MODAL
         ========================================================================= */}
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
            {/* Modal Header */}
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

            {/* Amount Banner */}
            <div className="p-4 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30 text-center">
              <div className="text-[11px] text-[#87948C] uppercase tracking-wider">
                {detailItem.activityType.toUpperCase()}
              </div>
              <div className="text-2xl font-mono tabular-nums font-bold text-[#E2E2E8] mt-1">
                {formatTaka(detailItem.amount)}
              </div>
              <div className="text-xs text-[#BCCAC1] mt-0.5">{detailItem.title}</div>
            </div>

            {/* Dedicated Branded Voucher Action Button */}
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

            {/* Select for Consolidated Voucher Option */}
            {onOpenBrandedMultiVoucher && (
              <button
                type="button"
                onClick={() => {
                  toggleItemSelection(detailItem.id);
                  setIsSelectionMode(true);
                  setDetailItem(null);
                }}
                className="w-full py-2 px-3 rounded-lg bg-[#0C0E12] hover:bg-[#1E2024] border border-[#3D4943]/40 text-[#BCCAC1] hover:text-[#73E3B4] text-xs font-medium flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Layers className="w-3.5 h-3.5 text-[#73E3B4]" />
                <span>
                  {selectedItemIds.has(detailItem.id)
                    ? 'Remove from Consolidated Voucher'
                    : 'Add to Consolidated Voucher Selection'}
                </span>
              </button>
            )}

            {/* Field Breakdown List */}
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
                  <span className="text-[#87948C]">Wallet Account</span>
                  <span className="text-[#73E3B4] font-medium">
                    {paymentMethods.find((m) => m.id === detailItem.payMethodId)?.name || 'Account'}
                  </span>
                </div>
              )}

              {detailItem.fromMethodId && (
                <div className="py-2 flex items-center justify-between">
                  <span className="text-[#87948C]">From Wallet</span>
                  <span className="text-[#E2E2E8]">
                    {paymentMethods.find((m) => m.id === detailItem.fromMethodId)?.name || 'Source'}
                  </span>
                </div>
              )}

              {detailItem.toMethodId && (
                <div className="py-2 flex items-center justify-between">
                  <span className="text-[#87948C]">To Wallet</span>
                  <span className="text-[#E2E2E8]">
                    {paymentMethods.find((m) => m.id === detailItem.toMethodId)?.name || 'Destination'}
                  </span>
                </div>
              )}

              {detailItem.feeAmount !== undefined && detailItem.feeAmount > 0 && (
                <div className="py-2 flex items-center justify-between">
                  <span className="text-[#87948C]">Transfer Charge Applied</span>
                  <span className="font-mono tabular-nums text-[#FFB4AB]">{formatTaka(detailItem.feeAmount)}</span>
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

              <div className="py-2 flex items-center justify-between text-[11px] text-[#87948C]">
                <span>Record ID</span>
                <span className="font-mono">{detailItem.id}</span>
              </div>
            </div>

            {/* Actions: Edit, Delete, Close (Comfortably fits on mobile without wrapping) */}
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

      {/* Delete Confirmation Modal */}
      {itemToDelete && (
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

      {/* Edit Activity Modal */}
      {editingItem && (
        <EditActivityModal
          isOpen={true}
          item={editingItem}
          paymentMethods={paymentMethods}
          people={people}
          categories={categories}
          sources={sources}
          tags={tags}
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
    </div>
  );
};
