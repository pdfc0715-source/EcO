import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  TrendingDown,
  TrendingUp,
  PieChart,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  Flame,
  Target,
  Wallet,
  Activity,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Layers,
  RotateCw,
  SlidersHorizontal,
  Radar,
  Sparkles
} from 'lucide-react';
import {
  ExpenseRecord,
  RecurringExpenseRecord,
  EarningRecord,
  TransferRecord,
  PaymentMethod,
  UserSettings
} from '../domain/types';
import { formatTaka } from '../domain/money';
import { formatDisplayDate, getTodayDateString } from '../domain/dates';
import {
  getRecent24Months,
  getDaysInMonth,
  computeStatsOverview,
  computeCategoryStats,
  computeMonthHeatmap,
  computeExpenseTypeBreakdown,
  computeSixMonthTrend,
  computeWeekdaySpending,
  spreadRecurringExpenses
} from '../domain/statistics';

// Modular UI & Chart Components
import { StatsKpiCard } from '../components/stats/StatsKpiCard';
import { StatsChartCard } from '../components/stats/StatsChartCard';
import { RankedListRow } from '../components/stats/RankedListRow';
import { PaymentDoughnutChart } from '../components/stats/PaymentDoughnutChart';
import { CategoryDoughnutChart } from '../components/stats/CategoryDoughnutChart';
import { EarningsSpendBarChart } from '../components/stats/EarningsSpendBarChart';
import { DailyBarChart } from '../components/stats/DailyBarChart';
import { SixMonthLineChart } from '../components/stats/SixMonthLineChart';
import { ExpenseTypeBarChart } from '../components/stats/ExpenseTypeBarChart';
import { CalendarHeatmap } from '../components/stats/CalendarHeatmap';
import { BudgetComboChart } from '../components/stats/BudgetComboChart';
import { WeekdayRadarChart } from '../components/stats/WeekdayRadarChart';

export type StatsSection = 'overview' | 'categories' | 'trend' | 'heatmap' | 'budget' | 'insights';

interface StatsViewProps {
  expenses: ExpenseRecord[];
  recurringExpenses?: RecurringExpenseRecord[];
  earnings: EarningRecord[];
  transfers: TransferRecord[];
  paymentMethods: PaymentMethod[];
  settings: UserSettings;
  theme?: 'dark' | 'light';
  onNavigateToSettings?: () => void;
  onOpenBrandedMonthlyReport?: (monthKey: string) => void;
  showToast?: (msg: string) => void;
}

export const StatsView: React.FC<StatsViewProps> = ({
  expenses,
  recurringExpenses = [],
  earnings,
  paymentMethods,
  settings,
  theme = 'dark',
  onNavigateToSettings,
  onOpenBrandedMonthlyReport,
  showToast
}) => {
  const isDark = theme === 'dark';

  // 1. Month Selector: 24-Month Rolling Window
  const monthOptions = useMemo(() => getRecent24Months(), []);
  const [selectedMonthKey, setSelectedMonthKey] = useState<string>(() => monthOptions[0]?.key || '2026-10');
  const [activeSection, setActiveSection] = useState<StatsSection>('overview');

  // Selected Month Breakdown
  const currentMonthIdx = monthOptions.findIndex((m) => m.key === selectedMonthKey);
  const selectedMonthOption = monthOptions[currentMonthIdx] || monthOptions[0];
  const [selectedYear, selectedMonth] = selectedMonthKey.split('-').map(Number);
  const daysInMonth = getDaysInMonth(selectedYear, selectedMonth);

  const handlePrevMonth = () => {
    if (currentMonthIdx < monthOptions.length - 1) {
      setSelectedMonthKey(monthOptions[currentMonthIdx + 1].key);
    }
  };

  const handleNextMonth = () => {
    if (currentMonthIdx > 0) {
      setSelectedMonthKey(monthOptions[currentMonthIdx - 1].key);
    }
  };

  // Section 1: Overview Data (Merged regular expenses + spread recurring)
  const overviewData = useMemo(() => {
    return computeStatsOverview(
      selectedYear,
      selectedMonth,
      expenses,
      recurringExpenses,
      earnings,
      paymentMethods
    );
  }, [selectedYear, selectedMonth, expenses, recurringExpenses, earnings, paymentMethods]);

  // Section 2: Category Stats (Top 10 ranked)
  const categoryStats = useMemo(() => {
    return computeCategoryStats(selectedYear, selectedMonth, expenses, recurringExpenses);
  }, [selectedYear, selectedMonth, expenses, recurringExpenses]);

  // Section 3: Trend & Daily Data
  const dailySpendingList = useMemo(() => {
    const monthPrefix = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
    const map = new Map<number, number>();

    // Regular expenses
    expenses
      .filter((e) => e.date.startsWith(monthPrefix) && (e.type === 'regular' || !e.type))
      .forEach((e) => {
        const d = parseInt(e.date.split('-')[2], 10);
        map.set(d, (map.get(d) || 0) + e.amount);
      });

    // Spread recurring daily allocations
    const spreadEntries = spreadRecurringExpenses(selectedYear, selectedMonth, recurringExpenses);
    spreadEntries.forEach((e) => {
      const d = parseInt(e.date.split('-')[2], 10);
      map.set(d, (map.get(d) || 0) + e.amount);
    });

    const list: { day: number; dateStr: string; amount: number }[] = [];
    for (let d = 1; d <= daysInMonth; d++) {
      list.push({
        day: d,
        dateStr: `${monthPrefix}-${String(d).padStart(2, '0')}`,
        amount: map.get(d) || 0
      });
    }
    return list;
  }, [selectedYear, selectedMonth, daysInMonth, expenses, recurringExpenses]);

  // 6-Month Trend Data (with past-month caching)
  const sixMonthTrend = useMemo(() => {
    return computeSixMonthTrend(selectedYear, selectedMonth, expenses, earnings, recurringExpenses);
  }, [selectedYear, selectedMonth, expenses, earnings, recurringExpenses]);

  // Expense Type Breakdown (loads ALL types: Regular, Fixed, Emergency, Recurring)
  const expenseTypes = useMemo(() => {
    return computeExpenseTypeBreakdown(selectedYear, selectedMonth, expenses, recurringExpenses);
  }, [selectedYear, selectedMonth, expenses, recurringExpenses]);

  // Section 4: Heatmap Data
  const heatmapData = useMemo(() => {
    return computeMonthHeatmap(selectedYear, selectedMonth, expenses, recurringExpenses);
  }, [selectedYear, selectedMonth, expenses, recurringExpenses]);

  // Section 5: Budget Calculations
  const todayStr = getTodayDateString();
  const isCurrentCalendarMonth = todayStr.startsWith(selectedMonthKey);
  const todayDay = isCurrentCalendarMonth ? parseInt(todayStr.split('-')[2], 10) : daysInMonth;
  const daysRemainingInMonth = Math.max(0, daysInMonth - (isCurrentCalendarMonth ? todayDay - 1 : daysInMonth));

  const budgetMonthlyAllowance = useMemo(() => {
    if (settings.budgetMode === 'direct') {
      return (settings.directDailyBudget || 0) * daysInMonth;
    }
    if (settings.budgetMode === 'calculated') {
      const income = settings.monthlyIncome || 0;
      const commitments =
        (settings.monthlyFixed || 0) + (settings.monthlySavings || 0) + (settings.monthlyEmergency || 0);
      const available = Math.max(0, income - commitments);
      const buffer = (settings.bufferPct || 0) / 100;
      return available * (1 - buffer);
    }
    return 0;
  }, [settings, daysInMonth]);

  const budgetSpentSoFar = overviewData.totalSpent;
  const budgetRemaining = Math.max(0, budgetMonthlyAllowance - budgetSpentSoFar);
  const budgetPctUsed = budgetMonthlyAllowance > 0
    ? Math.round((budgetSpentSoFar / budgetMonthlyAllowance) * 100)
    : budgetSpentSoFar > 0 ? 100 : 0;
  const isOverBudget = budgetMonthlyAllowance > 0 && budgetSpentSoFar >= budgetMonthlyAllowance;

  // Today's Budget = (A - spent) / days left including today
  const daysLeftIncludingToday = Math.max(1, daysInMonth - todayDay + 1);
  const todayAllowance = budgetMonthlyAllowance > 0
    ? Math.max(0, Math.round((budgetMonthlyAllowance - budgetSpentSoFar) / daysLeftIncludingToday))
    : 0;

  // Last 14 days daily spend vs daily budget
  const last14DaysBudget = useMemo(() => {
    const dailyLimit = settings.budgetMode === 'direct'
      ? settings.directDailyBudget || 500
      : settings.budgetMode === 'calculated' && budgetMonthlyAllowance > 0
      ? Math.round(budgetMonthlyAllowance / daysInMonth)
      : 500;

    const list: { dateStr: string; label: string; spent: number; limit: number; isOver: boolean }[] = [];
    const [cy, cm, cd] = todayStr.split('-').map(Number);

    for (let i = 13; i >= 0; i--) {
      const d = new Date(cy, cm - 1, cd - i);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const dayRegular = expenses
        .filter((e) => e.date === ds && (e.type === 'regular' || !e.type))
        .reduce((sum, e) => sum + e.amount, 0);

      // Check recurring allocation on this date
      let recTotal = 0;
      recurringExpenses.forEach((r) => {
        if (ds >= r.startDate && ds <= r.endDate) {
          recTotal += r.perDay > 0 ? r.perDay : r.days > 0 ? r.amount / r.days : 0;
        }
      });

      const daySpent = dayRegular + recTotal;

      list.push({
        dateStr: ds,
        label: `${d.getDate()}/${d.getMonth() + 1}`,
        spent: Math.round(daySpent),
        limit: dailyLimit,
        isOver: daySpent > dailyLimit
      });
    }
    return list;
  }, [expenses, recurringExpenses, settings, budgetMonthlyAllowance, daysInMonth, todayStr]);

  // Section 6: Weekday Spending & Radar (averaged per day of week)
  const weekdayStats = useMemo(() => {
    return computeWeekdaySpending(selectedYear, selectedMonth, expenses, recurringExpenses);
  }, [selectedYear, selectedMonth, expenses, recurringExpenses]);

  // Grounded rule-based insights
  const groundedInsights = useMemo(() => {
    const items: { title: string; desc: string; icon: any; color: string }[] = [];

    // 1. Spending up/down vs last month
    if (overviewData.percentChangeVsPrevMonth !== null) {
      if (overviewData.percentChangeVsPrevMonth > 0) {
        items.push({
          title: 'Spending Increased vs Last Month',
          desc: `Total monthly spend is ${overviewData.percentChangeVsPrevMonth}% higher than previous month (${formatTaka(overviewData.prevMonthSpent)}).`,
          icon: TrendingUp,
          color: isDark ? 'text-[#FFB4AB]' : 'text-rose-600'
        });
      } else {
        items.push({
          title: 'Spending Reduced vs Last Month',
          desc: `Excellent discipline! Monthly expenditures dropped by ${Math.abs(overviewData.percentChangeVsPrevMonth)}% compared to last month.`,
          icon: TrendingDown,
          color: isDark ? 'text-[#73E3B4]' : 'text-emerald-600'
        });
      }
    }

    // 2. Behind pace / ahead of pace vs budget
    if (budgetMonthlyAllowance > 0) {
      if (isOverBudget) {
        items.push({
          title: 'Exceeded Monthly Budget Pace',
          desc: `You have exhausted the configured monthly budget limit by ${formatTaka(budgetSpentSoFar - budgetMonthlyAllowance)}.`,
          icon: AlertTriangle,
          color: isDark ? 'text-[#FFB4AB]' : 'text-rose-600'
        });
      } else {
        items.push({
          title: 'Within Monthly Budget Pace',
          desc: `${budgetPctUsed}% of allocated budget utilized with ${formatTaka(budgetRemaining)} remaining allowance.`,
          icon: Target,
          color: isDark ? 'text-[#73E3B4]' : 'text-emerald-600'
        });
      }
    }

    // 3. Top category and its % of total
    if (categoryStats.length > 0 && categoryStats[0].percentage > 0) {
      items.push({
        title: `Dominant Category: ${categoryStats[0].name}`,
        desc: `${categoryStats[0].name} represents ${categoryStats[0].percentage}% of total outflows (${formatTaka(categoryStats[0].amount)}).`,
        icon: PieChart,
        color: isDark ? 'text-[#73E3B4]' : 'text-emerald-600'
      });
    }

    // 4. Big-spend day (more than 2x the daily limit)
    const dailyLimit = budgetMonthlyAllowance > 0 ? budgetMonthlyAllowance / daysInMonth : 1000;
    const bigSpendDays = dailySpendingList.filter((d) => d.amount > dailyLimit * 2);
    if (bigSpendDays.length > 0) {
      const topBigDay = bigSpendDays.sort((a, b) => b.amount - a.amount)[0];
      items.push({
        title: 'High Expenditure Surge Detected',
        desc: `Day ${topBigDay.day} incurred ${formatTaka(topBigDay.amount)}, which exceeded 2× your standard daily pace (${formatTaka(Math.round(dailyLimit))}).`,
        icon: Flame,
        color: isDark ? 'text-[#FFB4AB]' : 'text-amber-600'
      });
    }

    // 5. Emergency expenses present
    const emergencyTotal = expenses
      .filter((e) => e.date.startsWith(selectedMonthKey) && e.type === 'emergency')
      .reduce((sum, e) => sum + e.amount, 0);
    if (emergencyTotal > 0) {
      items.push({
        title: 'Emergency Expenditures Logged',
        desc: `${formatTaka(emergencyTotal)} was recorded as unexpected or emergency spending this month.`,
        icon: AlertTriangle,
        color: isDark ? 'text-[#FFB4AB]' : 'text-rose-600'
      });
    }

    // 6. Mobile-wallet share larger than cash share
    if (overviewData.bkashSpent > overviewData.cashSpent && overviewData.bkashSpent > 0) {
      const bkashPct = overviewData.totalSpent > 0 ? Math.round((overviewData.bkashSpent / overviewData.totalSpent) * 100) : 0;
      items.push({
        title: 'Digital Wallet Dominance',
        desc: `bKash accounted for ${bkashPct}% (${formatTaka(overviewData.bkashSpent)}) of your total spending, exceeding physical cash (${formatTaka(overviewData.cashSpent)}).`,
        icon: Wallet,
        color: isDark ? 'text-[#73E3B4]' : 'text-emerald-600'
      });
    }

    // 7. Count of no-spend days
    const noSpendDays = dailySpendingList.filter((d) => d.amount === 0).length;
    if (noSpendDays > 0) {
      items.push({
        title: 'Zero-Outflow Discipline',
        desc: `You maintained strict ৳0 financial outflow on ${noSpendDays} separate days this month.`,
        icon: CheckCircle2,
        color: isDark ? 'text-[#73E3B4]' : 'text-emerald-600'
      });
    }

    // Fallback if empty
    if (items.length === 0) {
      items.push({
        title: 'Not enough data yet',
        desc: 'Log additional expenses and daily activities across this month to generate analytical telemetry and smart patterns.',
        icon: Lightbulb,
        color: isDark ? 'text-[#87948C]' : 'text-slate-400'
      });
    }

    return items;
  }, [
    overviewData,
    budgetMonthlyAllowance,
    isOverBudget,
    budgetSpentSoFar,
    budgetRemaining,
    budgetPctUsed,
    categoryStats,
    dailySpendingList,
    daysInMonth,
    expenses,
    selectedMonthKey,
    isDark
  ]);

  // Tabs configuration
  const tabList = [
    { id: 'overview' as StatsSection, label: 'Overview', icon: BarChart3 },
    { id: 'categories' as StatsSection, label: 'Categories', icon: PieChart },
    { id: 'trend' as StatsSection, label: 'Trend', icon: Activity },
    { id: 'heatmap' as StatsSection, label: 'Heatmap', icon: Flame },
    { id: 'budget' as StatsSection, label: 'Budget', icon: Target },
    { id: 'insights' as StatsSection, label: 'Insights', icon: Lightbulb }
  ];

  return (
    <div className="space-y-6 pb-20 lg:pb-12 animate-in fade-in duration-150">
      {/* =========================================================================
          GLOBAL CONTROLS: 24-Month Selector & Section Tabs (Desktop Pill vs Mobile Dropdown)
         ========================================================================= */}
      <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${
        isDark ? 'border-[#3D4943]/30' : 'border-slate-200'
      }`}>
        <div>
          <h2 className={`text-lg sm:text-xl font-bold tracking-tight ${isDark ? 'text-[#E2E2E8]' : 'text-slate-900'}`}>
            Financial Statistics
          </h2>
          <p className={`text-xs ${isDark ? 'text-[#BCCAC1]' : 'text-slate-500'}`}>
            Analytical telemetry, multi-wallet breakdowns, and spending intelligence
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          {/* 24-Month Selector: Prev / Next buttons + centered month label + dropdown */}
          <div className={`flex items-center gap-1.5 rounded-lg p-1 border shadow-xs ${
            isDark ? 'bg-[#1A1C20] border-[#3D4943]/40' : 'bg-white border-slate-200'
          }`}>
            <button
              type="button"
              onClick={handlePrevMonth}
              disabled={currentMonthIdx >= monthOptions.length - 1}
              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer ${
                isDark ? 'text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E]' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Previous month"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <select
              value={selectedMonthKey}
              onChange={(e) => setSelectedMonthKey(e.target.value)}
              className={`bg-transparent text-xs font-semibold outline-none cursor-pointer py-1 px-2 border-0 font-mono ${
                isDark ? 'text-[#73E3B4]' : 'text-emerald-700'
              }`}
            >
              {monthOptions.map((opt) => (
                <option key={opt.key} value={opt.key} className={isDark ? 'bg-[#1A1C20] text-[#E2E2E8]' : 'bg-white text-slate-900'}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleNextMonth}
              disabled={currentMonthIdx <= 0}
              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer ${
                isDark ? 'text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E]' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
              }`}
              title="Next month"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {onOpenBrandedMonthlyReport && (
            <button
              type="button"
              onClick={() => onOpenBrandedMonthlyReport(selectedMonthKey)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#55C79A]/15 hover:bg-[#55C79A]/25 border border-[#73E3B4]/40 text-xs text-[#73E3B4] font-semibold transition-all cursor-pointer shadow-xs active:scale-95"
              title="Generate EcO Story Card & Monthly Report (PDF & Image)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export Report & Card</span>
              <span className="sm:hidden">Export</span>
            </button>
          )}
        </div>
      </div>

      {/* =========================================================================
          SECTION SWITCHER:
          - Desktop (≥1000px): Pill buttons
          - Mobile (<1000px): Dropdown select
          Both stay in sync!
         ========================================================================= */}
      {/* Desktop Pill Buttons */}
      <div className={`hidden min-[1000px]:flex items-center gap-1.5 pb-2 border-b ${
        isDark ? 'border-[#3D4943]/20' : 'border-slate-200'
      }`}>
        {tabList.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-4 py-2 rounded-lg text-xs font-medium flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? isDark
                    ? 'bg-[#1E2024] text-[#73E3B4] border border-[#73E3B4]/40 shadow-xs'
                    : 'bg-emerald-600 text-white shadow-xs font-semibold'
                  : isDark
                  ? 'text-[#BCCAC1] hover:text-[#E2E2E8] hover:bg-[#1A1C20]'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Mobile Dropdown Select (<1000px) */}
      <div className="min-[1000px]:hidden">
        <label className={`block text-[11px] font-medium uppercase tracking-wider mb-1 ${isDark ? 'text-[#87948C]' : 'text-slate-500'}`}>
          Select Section
        </label>
        <div className={`rounded-lg border px-3 py-2 flex items-center justify-between ${
          isDark ? 'bg-[#1A1C20] border-[#3D4943]/40' : 'bg-white border-slate-200'
        }`}>
          <select
            value={activeSection}
            onChange={(e) => setActiveSection(e.target.value as StatsSection)}
            className={`w-full bg-transparent text-xs font-medium outline-none cursor-pointer ${
              isDark ? 'text-[#E2E2E8]' : 'text-slate-900'
            }`}
          >
            {tabList.map((t) => (
              <option key={t.id} value={t.id} className={isDark ? 'bg-[#1A1C20] text-[#E2E2E8]' : 'bg-white text-slate-900'}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* =========================================================================
          LAZY RENDERING: ONLY THE ACTIVE SECTION IS RENDERED
         ========================================================================= */}

      {/* =========================================================================
          SECTION A: OVERVIEW
         ========================================================================= */}
      {activeSection === 'overview' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* 6 KPI Cards with Top Accent Bars */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* 1. Total Spent */}
            <StatsKpiCard
              label="Total Spent"
              value={formatTaka(overviewData.totalSpent)}
              accentColor="#FFB4AB"
              theme={theme}
              subline={
                overviewData.percentChangeVsPrevMonth !== null ? (
                  <span
                    className={`font-semibold ${
                      overviewData.percentChangeVsPrevMonth > 0
                        ? isDark ? 'text-[#FFB4AB]' : 'text-rose-600'
                        : isDark ? 'text-[#73E3B4]' : 'text-emerald-600'
                    }`}
                  >
                    {overviewData.percentChangeVsPrevMonth > 0 ? '▲' : '▼'}{' '}
                    {Math.abs(overviewData.percentChangeVsPrevMonth)}% vs last mo
                  </span>
                ) : (
                  <span>First tracked month</span>
                )
              }
            />

            {/* 2. Daily Average */}
            <StatsKpiCard
              label="Daily Average"
              value={formatTaka(overviewData.dailyAverage)}
              accentColor="#73E3B4"
              theme={theme}
              subline={<span>Over {overviewData.daysElapsed} days</span>}
            />

            {/* 3. Highest Day */}
            <StatsKpiCard
              label="Highest Day"
              value={overviewData.highestDay ? formatTaka(overviewData.highestDay.amount) : '৳0.00'}
              accentColor="#BEC7D5"
              theme={theme}
              subline={
                <span className="truncate block">
                  {overviewData.highestDay ? formatDisplayDate(overviewData.highestDay.date) : 'No data'}
                </span>
              }
            />

            {/* 4. Transactions */}
            <StatsKpiCard
              label="Transactions"
              value={overviewData.transactionCount}
              accentColor="#55C79A"
              theme={theme}
              subline={<span>avg/tx: {formatTaka(overviewData.averagePerTransaction)}</span>}
            />

            {/* 5. Cash Spent */}
            <StatsKpiCard
              label="Cash Spent"
              value={formatTaka(overviewData.cashSpent)}
              accentColor="#38BDF8"
              theme={theme}
              subline={
                <span>
                  {overviewData.totalSpent > 0
                    ? `${Math.round((overviewData.cashSpent / overviewData.totalSpent) * 100)}% of total`
                    : 'From Cash wallet'}
                </span>
              }
            />

            {/* 6. bKash Spent */}
            <StatsKpiCard
              label="bKash Spent"
              value={overviewData.hasBkashMethod ? formatTaka(overviewData.bkashSpent) : '—'}
              accentColor="#F472B6"
              theme={theme}
              subline={
                <span className="truncate block">
                  {overviewData.hasBkashMethod
                    ? overviewData.totalSpent > 0
                      ? `${Math.round((overviewData.bkashSpent / overviewData.totalSpent) * 100)}% of total`
                      : 'From bKash wallet'
                    : 'Wallet not added'}
                </span>
              }
            />
          </div>

          {/* Charts Row: Payment Method Doughnut & Earnings vs Spent vs Net */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Payment Method Doughnut (68% cutout, custom 3-tile legend below) */}
            <StatsChartCard
              title="Payment Method Breakdown"
              icon={Wallet}
              subtitle="Cash / bKash / Nagad allocation"
              theme={theme}
              fixedHeightClass="h-[300px]"
            >
              <PaymentDoughnutChart
                methods={overviewData.methodBreakdown}
                totalSpent={overviewData.totalSpent}
                theme={theme}
              />
            </StatsChartCard>

            {/* Earnings vs Spent vs Net Bar Chart */}
            <StatsChartCard
              title="Earnings vs Spent vs Net"
              icon={BarChart3}
              subtitle="Cashflow balance & net savings"
              theme={theme}
              fixedHeightClass="h-[300px]"
            >
              <EarningsSpendBarChart
                totalEarned={overviewData.totalEarned}
                totalSpent={overviewData.totalSpent}
                netSavings={overviewData.netSavings}
                theme={theme}
              />
            </StatsChartCard>
          </div>
        </div>
      )}

      {/* =========================================================================
          SECTION B: CATEGORIES
         ========================================================================= */}
      {activeSection === 'categories' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Category Doughnut Chart (~55% cutout, legend on right) */}
            <div className="lg:col-span-6">
              <StatsChartCard
                title="Category Breakdown"
                icon={PieChart}
                subtitle={`${selectedMonthOption.label} outflow slices`}
                theme={theme}
                fixedHeightClass="h-[280px]"
                isEmpty={categoryStats.length === 0}
                emptyMessage={`No expenses logged for ${selectedMonthOption.label}.`}
              >
                <CategoryDoughnutChart
                  categories={categoryStats}
                  totalSpent={overviewData.totalSpent}
                  theme={theme}
                />
              </StatsChartCard>
            </div>

            {/* Top 10 Ranked Categories List */}
            <div className="lg:col-span-6">
              <div
                className={`p-5 rounded-xl border shadow-sm flex flex-col justify-between ${
                  isDark ? 'bg-[#1A1C20] border-[#3D4943]/40' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between pb-3 border-b border-inherit">
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-[#E2E2E8]' : 'text-slate-800'}`}>
                    Top 10 Categories
                  </h3>
                  <span className={`text-[11px] font-mono tabular-nums ${isDark ? 'text-[#87948C]' : 'text-slate-500'}`}>
                    {categoryStats.length} recorded
                  </span>
                </div>

                {categoryStats.length === 0 ? (
                  <div className={`py-16 text-center text-xs ${isDark ? 'text-[#87948C]' : 'text-slate-400'}`}>
                    No expenses logged in this period.
                  </div>
                ) : (
                  <div className="divide-y divide-inherit max-h-[300px] overflow-y-auto pr-1 scrollbar-thin">
                    {categoryStats.slice(0, 10).map((cat, idx) => {
                      const topAmt = categoryStats[0]?.amount || 1;
                      const colors = ['#73E3B4', '#55C79A', '#38BDF8', '#A78BFA', '#F472B6', '#FBBF24', '#FB923C', '#94A3B8'];
                      return (
                        <RankedListRow
                          key={cat.name}
                          rank={idx + 1}
                          name={cat.name}
                          amount={cat.amount}
                          maxAmount={topAmt}
                          percentage={cat.percentage}
                          color={colors[idx % colors.length]}
                          theme={theme}
                          showPercentage={true}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          SECTION C: TREND
         ========================================================================= */}
      {activeSection === 'trend' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Daily Bar Chart (1 to 28/30/31 with faint zero bars) */}
          <StatsChartCard
            title="Daily Spending Profile"
            icon={Activity}
            subtitle={`All ${daysInMonth} calendar days in ${selectedMonthOption.label}`}
            theme={theme}
            fixedHeightClass="h-[250px]"
          >
            <DailyBarChart
              days={dailySpendingList}
              daysInMonth={daysInMonth}
              theme={theme}
            />
          </StatsChartCard>

          {/* 6-Month Filled Line Chart (tension 0.4, cached past months) */}
          <StatsChartCard
            title="6-Month History Trend"
            icon={Calendar}
            subtitle="Cubic Bezier curve with cached past performance"
            theme={theme}
            fixedHeightClass="h-[250px]"
          >
            <SixMonthLineChart
              trend={sixMonthTrend}
              theme={theme}
            />
          </StatsChartCard>

          {/* Expense Type Bar Chart (Loads ALL types: Regular, Fixed, Emergency, Recurring) */}
          <StatsChartCard
            title="Expense Type Breakdown"
            icon={Layers}
            subtitle="Full spectrum including Fixed & Emergency commitments"
            theme={theme}
            fixedHeightClass="h-[220px]"
          >
            <ExpenseTypeBarChart
              types={expenseTypes}
              theme={theme}
            />
          </StatsChartCard>
        </div>
      )}

      {/* =========================================================================
          SECTION D: HEATMAP
         ========================================================================= */}
      {activeSection === 'heatmap' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <CalendarHeatmap
            cells={heatmapData.cells}
            topDays={heatmapData.topDays}
            maxSpending={heatmapData.maxSpending}
            monthLabel={selectedMonthOption.label}
            theme={theme}
          />
        </div>
      )}

      {/* =========================================================================
          SECTION E: BUDGET
         ========================================================================= */}
      {activeSection === 'budget' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Not Configured State */}
          {budgetMonthlyAllowance <= 0 ? (
            <div
              className={`p-8 rounded-xl border text-center space-y-4 max-w-lg mx-auto shadow-sm ${
                isDark ? 'bg-[#1A1C20] border-[#3D4943]/40' : 'bg-white border-slate-200'
              }`}
            >
              <div className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center ${
                isDark ? 'bg-[#0C0E12] text-[#73E3B4]' : 'bg-emerald-50 text-emerald-700'
              }`}>
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h3 className={`text-base font-bold ${isDark ? 'text-[#E2E2E8]' : 'text-slate-900'}`}>
                  Budget Not Configured
                </h3>
                <p className={`text-xs mt-1 leading-relaxed ${isDark ? 'text-[#BCCAC1]' : 'text-slate-500'}`}>
                  Configure a direct daily allowance or a calculated monthly budget from your income, savings, and fixed commitments to unlock budget telemetry.
                </p>
              </div>
              <button
                type="button"
                onClick={onNavigateToSettings}
                className={`px-5 py-2.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer inline-flex items-center gap-2 ${
                  isDark
                    ? 'bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826]'
                    : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span>Go to Settings</span>
              </button>
            </div>
          ) : (
            <>
              {/* Refresh Button & Toast */}
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-[#BCCAC1]' : 'text-slate-600'}`}>
                  Budget Telemetry & Pacing ({settings.budgetMode.toUpperCase()})
                </span>
                <button
                  type="button"
                  onClick={() => showToast?.('Budget telemetry refreshed.')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                    isDark
                      ? 'bg-[#1A1C20] border-[#3D4943]/40 text-[#73E3B4] hover:bg-[#282A2E]'
                      : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  <span>Refresh</span>
                </button>
              </div>

              {/* 4 Budget KPI Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <StatsKpiCard
                  label="Monthly Budget"
                  value={formatTaka(budgetMonthlyAllowance)}
                  accentColor="#73E3B4"
                  theme={theme}
                  subline={<span>Configured Limit (A)</span>}
                />

                <StatsKpiCard
                  label="Spent So Far"
                  value={formatTaka(budgetSpentSoFar)}
                  accentColor="#FFB4AB"
                  theme={theme}
                  subline={<span>{budgetPctUsed}% of budget</span>}
                />

                <StatsKpiCard
                  label="Remaining"
                  value={formatTaka(budgetRemaining)}
                  accentColor={isOverBudget ? '#EF4444' : '#55C79A'}
                  theme={theme}
                  subline={
                    <span>
                      {daysRemainingInMonth} days remaining in month
                    </span>
                  }
                />

                <StatsKpiCard
                  label="Today's Budget"
                  value={formatTaka(todayAllowance)}
                  accentColor="#38BDF8"
                  theme={theme}
                  subline={<span>(A − spent) ÷ {daysLeftIncludingToday} days</span>}
                />
              </div>

              {/* Progress Bar with 3 States (<75% good, 75-99% caution, >=100% over with pulsing animation) */}
              <div
                className={`p-5 rounded-xl border shadow-sm space-y-2 ${
                  isDark ? 'bg-[#1A1C20] border-[#3D4943]/40' : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className={`font-semibold ${isDark ? 'text-[#E2E2E8]' : 'text-slate-800'}`}>
                    Monthly Budget Consumption
                  </span>
                  <span
                    className={`font-mono tabular-nums font-bold ${
                      isOverBudget
                        ? isDark ? 'text-[#FFB4AB]' : 'text-rose-600'
                        : budgetPctUsed >= 75
                        ? isDark ? 'text-[#F59E0B]' : 'text-amber-600'
                        : isDark ? 'text-[#73E3B4]' : 'text-emerald-600'
                    }`}
                  >
                    {budgetPctUsed}%
                  </span>
                </div>

                <div className={`w-full h-3 rounded-full overflow-hidden border ${
                  isDark ? 'bg-[#0C0E12] border-[#3D4943]/30' : 'bg-slate-100 border-slate-200'
                }`}>
                  <div
                    className={`h-full transition-all duration-300 rounded-full ${
                      isOverBudget
                        ? 'bg-[#EF4444] animate-pulse'
                        : budgetPctUsed >= 75
                        ? 'bg-[#F59E0B]'
                        : 'bg-[#73E3B4]'
                    }`}
                    style={{ width: `${Math.min(100, budgetPctUsed)}%` }}
                  />
                </div>
              </div>

              {/* Breakdown Rows (only in "calculated" budget mode) */}
              {settings.budgetMode === 'calculated' && (
                <div
                  className={`p-5 rounded-xl border shadow-sm space-y-3 ${
                    isDark ? 'bg-[#1A1C20] border-[#3D4943]/40' : 'bg-white border-slate-200'
                  }`}
                >
                  <h3 className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-[#E2E2E8]' : 'text-slate-800'}`}>
                    Calculated Budget Allocations
                  </h3>

                  <div className="space-y-2.5">
                    {[
                      { label: 'Income', amount: settings.monthlyIncome || 0, max: settings.monthlyIncome || 1, color: '#73E3B4' },
                      { label: 'Fixed Costs', amount: settings.monthlyFixed || 0, max: settings.monthlyIncome || 1, color: '#55C79A' },
                      { label: 'Savings', amount: settings.monthlySavings || 0, max: settings.monthlyIncome || 1, color: '#38BDF8' },
                      { label: 'Emergency', amount: settings.monthlyEmergency || 0, max: settings.monthlyIncome || 1, color: '#FFB4AB' },
                      { label: 'Spent So Far', amount: budgetSpentSoFar, max: budgetMonthlyAllowance || 1, color: '#EF4444' }
                    ].map((row) => {
                      const widthPct = row.max > 0 ? Math.min(100, Math.round((row.amount / row.max) * 100)) : 0;
                      return (
                        <div key={row.label} className="space-y-1">
                          <div className="flex items-center justify-between text-xs">
                            <span className={isDark ? 'text-[#BCCAC1]' : 'text-slate-600'}>{row.label}</span>
                            <span className={`font-mono tabular-nums font-semibold ${isDark ? 'text-[#E2E2E8]' : 'text-slate-900'}`}>
                              {formatTaka(row.amount)}
                            </span>
                          </div>
                          <div className={`w-full h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-[#0C0E12]' : 'bg-slate-100'}`}>
                            <div
                              className="h-full rounded-full transition-all duration-300"
                              style={{ width: `${widthPct}%`, backgroundColor: row.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Combo Chart: Last 14 Days with Dashed Limit Line */}
              <StatsChartCard
                title="Last 14 Days: Daily Spend vs. Limit"
                icon={Target}
                subtitle="Bars highlight overage days exceeding daily allowance"
                theme={theme}
                fixedHeightClass="h-[250px]"
              >
                <BudgetComboChart
                  days={last14DaysBudget}
                  dailyBudgetLimit={
                    settings.budgetMode === 'direct'
                      ? settings.directDailyBudget || 500
                      : Math.round(budgetMonthlyAllowance / daysInMonth)
                  }
                  theme={theme}
                />
              </StatsChartCard>
            </>
          )}
        </div>
      )}

      {/* =========================================================================
          SECTION F: INSIGHTS
         ========================================================================= */}
      {activeSection === 'insights' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {/* Weekday Spending Distribution Radar (7-axis Sun..Sat averaged per day of week) */}
          <StatsChartCard
            title="Weekday Spending Distribution"
            icon={Radar}
            subtitle="7-axis radar chart: Average expenditure per day of week"
            theme={theme}
            fixedHeightClass="h-[300px]"
          >
            <WeekdayRadarChart
              weekdayStats={weekdayStats}
              theme={theme}
            />
          </StatsChartCard>

          {/* Rule-based insight cards with tinted rounded square icons */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
            {groundedInsights.map((ins, idx) => {
              const Icon = ins.icon;
              return (
                <div
                  key={idx}
                  className={`p-4 rounded-xl border flex items-start gap-3.5 transition-all shadow-xs ${
                    isDark
                      ? 'bg-[#1A1C20] border-[#3D4943]/40 hover:border-[#3D4943]/80'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-slate-100'
                  }`}
                >
                  <div
                    className={`p-2.5 rounded-lg border shrink-0 ${ins.color} ${
                      isDark ? 'bg-[#0C0E12] border-[#3D4943]/40' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div>
                    <h4 className={`text-xs font-semibold ${isDark ? 'text-[#E2E2E8]' : 'text-slate-900'}`}>
                      {ins.title}
                    </h4>
                    <p className={`text-[11px] mt-0.5 leading-relaxed ${isDark ? 'text-[#BCCAC1]' : 'text-slate-600'}`}>
                      {ins.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
