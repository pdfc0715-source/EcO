/**
 * Statistics and Analytical Computations for EcO
 * Implements full 24-month rolling window, recurring expense daily spreading,
 * filter for regular expenses, 6-month trend with past-month caching,
 * and weekday radar calculations averaged per day of week.
 */

import {
  ExpenseRecord,
  RecurringExpenseRecord,
  EarningRecord,
  PaymentMethod,
  ExpenseType
} from './types';
import { roundToTwoDecimals } from './money';
import { getTodayDateString } from './dates';

export interface MonthOption {
  key: string; // YYYY-MM
  label: string; // e.g. "October 2026"
  year: number;
  month: number;
}

/**
 * Generates the list of the most recent 24 months ending at current month.
 */
export function getRecent24Months(): MonthOption[] {
  const months: MonthOption[] = [];
  const today = getTodayDateString();
  const [currentYear, currentMonth] = today.split('-').map(Number);

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  for (let i = 0; i < 24; i++) {
    let y = currentYear;
    let m = currentMonth - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const key = `${y}-${String(m).padStart(2, '0')}`;
    const label = `${monthNames[m - 1]} ${y}`;
    months.push({ key, label, year: y, month: m });
  }

  return months;
}

/**
 * Returns the number of days in a given YYYY-MM.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Returns the day of week (0 = Sunday, 6 = Saturday) for the 1st of the month.
 */
export function getFirstDayOfWeek(year: number, month: number): number {
  return new Date(year, month - 1, 1).getDay();
}

/**
 * Spreads recurring expenses into daily entries for a specific month.
 * For each active recurring expense whose [startDate, endDate] covers a day in the month,
 * a daily entry is created with amount = rec.perDay (or rec.amount / rec.days).
 */
export function spreadRecurringExpenses(
  year: number,
  month: number,
  recurring: RecurringExpenseRecord[]
): ExpenseRecord[] {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = getDaysInMonth(year, month);
  const spreadEntries: ExpenseRecord[] = [];

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;

    for (const rec of recurring) {
      if (dateStr >= rec.startDate && dateStr <= rec.endDate) {
        const dailyAmt = rec.perDay > 0
          ? rec.perDay
          : rec.days > 0
          ? roundToTwoDecimals(rec.amount / rec.days)
          : 0;

        if (dailyAmt > 0) {
          spreadEntries.push({
            id: `spread_${rec.id}_${dateStr}`,
            reason: rec.reason || rec.category || 'Recurring Expense',
            category: rec.category || 'Recurring',
            description: `Daily allocation (${rec.startDate} to ${rec.endDate})`,
            amount: dailyAmt,
            type: 'regular',
            payMethodId: rec.payMethodId,
            date: dateStr,
            timestamp: rec.timestamp || Date.now()
          });
        }
      }
    }
  }

  return spreadEntries;
}

/**
 * Gets merged regular expenses for a given month:
 * 1. Filters expenses for type === 'regular' (or default untyped) matching the month.
 * 2. Spreads recurring expenses across their active days in this month.
 * 3. Merges them into a unified list.
 */
export function getMergedMonthRegularExpenses(
  year: number,
  month: number,
  expenses: ExpenseRecord[],
  recurring: RecurringExpenseRecord[]
): ExpenseRecord[] {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const regularExpenses = expenses.filter(
    (e) => e.date.startsWith(monthPrefix) && (e.type === 'regular' || !e.type)
  );
  const spreadRecurring = spreadRecurringExpenses(year, month, recurring);
  return [...regularExpenses, ...spreadRecurring];
}

export interface StatsOverviewData {
  totalSpent: number;
  prevMonthSpent: number;
  percentChangeVsPrevMonth: number | null; // e.g. -12.5 or +5.2
  dailyAverage: number;
  daysElapsed: number;
  highestDay: { date: string; amount: number } | null;
  transactionCount: number;
  averagePerTransaction: number;
  cashSpent: number;
  bkashSpent: number;
  nagadSpent: number;
  hasBkashMethod: boolean;
  hasNagadMethod: boolean;
  totalEarned: number;
  netSavings: number;
  methodBreakdown: {
    methodId: string;
    name: string;
    amount: number;
    percentage: number;
  }[];
}

export function computeStatsOverview(
  year: number,
  month: number,
  expenses: ExpenseRecord[],
  recurring: RecurringExpenseRecord[],
  earnings: EarningRecord[],
  methods: PaymentMethod[]
): StatsOverviewData {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;

  // Previous month determination
  let prevYear = year;
  let prevMonth = month - 1;
  if (prevMonth <= 0) {
    prevMonth = 12;
    prevYear -= 1;
  }

  // Get merged regular expenses (regular + spread recurring) for current and previous months
  const currentMergedExpenses = getMergedMonthRegularExpenses(year, month, expenses, recurring);
  const prevMergedExpenses = getMergedMonthRegularExpenses(prevYear, prevMonth, expenses, recurring);

  const totalSpent = roundToTwoDecimals(currentMergedExpenses.reduce((acc, e) => acc + e.amount, 0));
  const prevMonthSpent = roundToTwoDecimals(prevMergedExpenses.reduce((acc, e) => acc + e.amount, 0));

  let percentChangeVsPrevMonth: number | null = null;
  if (prevMonthSpent > 0) {
    percentChangeVsPrevMonth = roundToTwoDecimals(((totalSpent - prevMonthSpent) / prevMonthSpent) * 100);
  }

  // Days elapsed calculation:
  // Today's date for current month, full month length for past months
  const today = getTodayDateString();
  const daysInMonth = getDaysInMonth(year, month);
  let daysElapsed = daysInMonth;
  if (today.startsWith(monthPrefix)) {
    const [, , todayDay] = today.split('-').map(Number);
    daysElapsed = Math.max(1, Math.min(todayDay, daysInMonth));
  }
  const dailyAverage = daysElapsed > 0 ? roundToTwoDecimals(totalSpent / daysElapsed) : 0;

  // Highest spending day
  const dailyMap = new Map<string, number>();
  currentMergedExpenses.forEach((e) => {
    dailyMap.set(e.date, (dailyMap.get(e.date) || 0) + e.amount);
  });

  let highestDay: { date: string; amount: number } | null = null;
  dailyMap.forEach((amt, d) => {
    if (!highestDay || amt > highestDay.amount) {
      highestDay = { date: d, amount: roundToTwoDecimals(amt) };
    }
  });

  const transactionCount = currentMergedExpenses.length;
  const averagePerTransaction = transactionCount > 0 ? roundToTwoDecimals(totalSpent / transactionCount) : 0;

  // Wallet breakdowns
  const findMethod = (idOrName?: string) => {
    if (!idOrName) return undefined;
    const direct = methods.find((m) => m.id === idOrName);
    if (direct) return direct;
    const lower = idOrName.trim().toLowerCase();
    return methods.find(
      (m) =>
        m.name.trim().toLowerCase() === lower ||
        m.legacyNames?.some((ln) => ln.trim().toLowerCase() === lower)
    );
  };

  const cashMethod = findMethod('Cash');
  const bkashMethod = findMethod('bKash');
  const nagadMethod = findMethod('Nagad');

  let cashSpent = 0;
  let bkashSpent = 0;
  let nagadSpent = 0;
  const methodSpentMap = new Map<string, number>();

  currentMergedExpenses.forEach((e) => {
    const m = findMethod(e.payMethodId);
    const key = m ? m.id : (e.payMethodId || 'cash');
    const current = methodSpentMap.get(key) || 0;
    methodSpentMap.set(key, current + e.amount);

    if (m && cashMethod && m.id === cashMethod.id) {
      cashSpent += e.amount;
    } else if (m && bkashMethod && m.id === bkashMethod.id) {
      bkashSpent += e.amount;
    } else if (m && nagadMethod && m.id === nagadMethod.id) {
      nagadSpent += e.amount;
    }
  });

  cashSpent = roundToTwoDecimals(cashSpent);
  bkashSpent = roundToTwoDecimals(bkashSpent);
  nagadSpent = roundToTwoDecimals(nagadSpent);

  const methodBreakdown = Array.from(methodSpentMap.entries()).map(([mId, amt]) => {
    const m = findMethod(mId);
    return {
      methodId: mId,
      name: m ? m.name : mId,
      amount: roundToTwoDecimals(amt),
      percentage: totalSpent > 0 ? Math.round((amt / totalSpent) * 100) : 0
    };
  }).sort((a, b) => b.amount - a.amount);

  // Inflow / Earnings for the month
  const currentEarnings = earnings.filter((earn) => earn.date.startsWith(monthPrefix));
  const totalEarned = roundToTwoDecimals(currentEarnings.reduce((acc, curr) => acc + curr.amount, 0));
  const netSavings = roundToTwoDecimals(totalEarned - totalSpent);

  return {
    totalSpent,
    prevMonthSpent,
    percentChangeVsPrevMonth,
    dailyAverage,
    daysElapsed,
    highestDay,
    transactionCount,
    averagePerTransaction,
    cashSpent,
    bkashSpent,
    nagadSpent,
    hasBkashMethod: !!bkashMethod,
    hasNagadMethod: !!nagadMethod,
    totalEarned,
    netSavings,
    methodBreakdown
  };
}

export interface CategoryStat {
  name: string;
  amount: number;
  percentage: number;
}

export function computeCategoryStats(
  year: number,
  month: number,
  expenses: ExpenseRecord[],
  recurring: RecurringExpenseRecord[] = []
): CategoryStat[] {
  const merged = getMergedMonthRegularExpenses(year, month, expenses, recurring);
  const totalSpent = merged.reduce((acc, e) => acc + e.amount, 0);

  const map = new Map<string, number>();
  merged.forEach((e) => {
    const cat = e.category || 'Other';
    map.set(cat, (map.get(cat) || 0) + e.amount);
  });

  return Array.from(map.entries())
    .map(([name, amount]) => ({
      name,
      amount: roundToTwoDecimals(amount),
      percentage: totalSpent > 0 ? Math.round((amount / totalSpent) * 100) : 0
    }))
    .sort((a, b) => b.amount - a.amount);
}

export interface HeatmapCell {
  dayOfMonth: number;
  dateStr: string;
  amount: number;
  intensityLevel: number; // 0..5
  isToday: boolean;
}

export function computeMonthHeatmap(
  year: number,
  month: number,
  expenses: ExpenseRecord[],
  recurring: RecurringExpenseRecord[] = []
): {
  cells: (HeatmapCell | null)[];
  topDays: { dateStr: string; amount: number; dayOfMonth: number }[];
  maxSpending: number;
} {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = getDaysInMonth(year, month);
  const firstDow = getFirstDayOfWeek(year, month);
  const todayStr = getTodayDateString();

  const merged = getMergedMonthRegularExpenses(year, month, expenses, recurring);
  const dayMap = new Map<number, number>();

  merged.forEach((e) => {
    const day = parseInt(e.date.split('-')[2], 10);
    dayMap.set(day, (dayMap.get(day) || 0) + e.amount);
  });

  let maxSpending = 0;
  dayMap.forEach((amt) => {
    if (amt > maxSpending) maxSpending = amt;
  });

  const cells: (HeatmapCell | null)[] = [];

  // Prepend nulls for offset days before Sunday
  for (let i = 0; i < firstDow; i++) {
    cells.push(null);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const amt = dayMap.get(d) || 0;
    const dateStr = `${monthPrefix}-${String(d).padStart(2, '0')}`;
    let level = 0;
    if (amt > 0 && maxSpending > 0) {
      const ratio = amt / maxSpending;
      if (ratio >= 0.8) level = 5;
      else if (ratio >= 0.6) level = 4;
      else if (ratio >= 0.4) level = 3;
      else if (ratio >= 0.2) level = 2;
      else level = 1;
    }

    cells.push({
      dayOfMonth: d,
      dateStr,
      amount: roundToTwoDecimals(amt),
      intensityLevel: level,
      isToday: dateStr === todayStr
    });
  }

  // Top 7 days
  const topDays = Array.from(dayMap.entries())
    .map(([day, amount]) => ({
      dayOfMonth: day,
      dateStr: `${monthPrefix}-${String(day).padStart(2, '0')}`,
      amount: roundToTwoDecimals(amount)
    }))
    .filter((d) => d.amount > 0)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 7);

  return {
    cells,
    topDays,
    maxSpending
  };
}

export interface ExpenseTypeStat {
  label: 'Regular' | 'Fixed' | 'Emergency' | 'Recurring';
  amount: number;
  percentage: number;
  color: string;
}

/**
 * Loads ALL expense types for the selected month to prevent Fixed and Emergency showing 0.
 */
export function computeExpenseTypeBreakdown(
  year: number,
  month: number,
  expenses: ExpenseRecord[],
  recurring: RecurringExpenseRecord[]
): ExpenseTypeStat[] {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const monthExpenses = expenses.filter((e) => e.date.startsWith(monthPrefix));

  const regularAmt = monthExpenses
    .filter((e) => e.type === 'regular' || !e.type)
    .reduce((sum, e) => sum + e.amount, 0);

  const fixedAmt = monthExpenses
    .filter((e) => e.type === 'fixed')
    .reduce((sum, e) => sum + e.amount, 0);

  const emergencyAmt = monthExpenses
    .filter((e) => e.type === 'emergency')
    .reduce((sum, e) => sum + e.amount, 0);

  // Active recurring expenses spread or scheduled in this month
  const spreadEntries = spreadRecurringExpenses(year, month, recurring);
  const recurringAmt = spreadEntries.reduce((sum, e) => sum + e.amount, 0);

  const total = regularAmt + fixedAmt + emergencyAmt + recurringAmt;

  return [
    {
      label: 'Regular',
      amount: roundToTwoDecimals(regularAmt),
      percentage: total > 0 ? Math.round((regularAmt / total) * 100) : 0,
      color: '#73E3B4'
    },
    {
      label: 'Fixed',
      amount: roundToTwoDecimals(fixedAmt),
      percentage: total > 0 ? Math.round((fixedAmt / total) * 100) : 0,
      color: '#55C79A'
    },
    {
      label: 'Emergency',
      amount: roundToTwoDecimals(emergencyAmt),
      percentage: total > 0 ? Math.round((emergencyAmt / total) * 100) : 0,
      color: '#FFB4AB'
    },
    {
      label: 'Recurring',
      amount: roundToTwoDecimals(recurringAmt),
      percentage: total > 0 ? Math.round((recurringAmt / total) * 100) : 0,
      color: '#BEC7D5'
    }
  ];
}

export interface SixMonthTrendItem {
  monthKey: string;
  monthLabel: string;
  totalSpent: number;
  totalEarned: number;
}

// In-memory cache for past months. Never caches the current calendar month.
const pastMonthTrendCache = new Map<string, { totalSpent: number; totalEarned: number }>();

export function computeSixMonthTrend(
  endYear: number,
  endMonth: number,
  expenses: ExpenseRecord[],
  earnings: EarningRecord[],
  recurring: RecurringExpenseRecord[] = []
): SixMonthTrendItem[] {
  const result: SixMonthTrendItem[] = [];
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const currentCalendarMonth = getTodayDateString().slice(0, 7); // "YYYY-MM"

  for (let i = 5; i >= 0; i--) {
    let y = endYear;
    let m = endMonth - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const prefix = `${y}-${String(m).padStart(2, '0')}`;
    const label = `${monthNames[m - 1]} ${String(y).slice(-2)}`;

    // Check cache for past months
    if (prefix < currentCalendarMonth && pastMonthTrendCache.has(prefix)) {
      const cached = pastMonthTrendCache.get(prefix)!;
      result.push({
        monthKey: prefix,
        monthLabel: label,
        totalSpent: cached.totalSpent,
        totalEarned: cached.totalEarned
      });
      continue;
    }

    // Compute fresh
    const mergedExpenses = getMergedMonthRegularExpenses(y, m, expenses, recurring);
    const mSpent = roundToTwoDecimals(mergedExpenses.reduce((a, b) => a + b.amount, 0));
    const mEarned = roundToTwoDecimals(
      earnings.filter((e) => e.date.startsWith(prefix)).reduce((a, b) => a + b.amount, 0)
    );

    // If it's a past month, store in cache
    if (prefix < currentCalendarMonth) {
      pastMonthTrendCache.set(prefix, { totalSpent: mSpent, totalEarned: mEarned });
    }

    result.push({
      monthKey: prefix,
      monthLabel: label,
      totalSpent: mSpent,
      totalEarned: mEarned
    });
  }

  return result;
}

export interface WeekdayStat {
  dayOfWeek: number; // 0 = Sunday, 6 = Saturday
  dayName: string;
  shortName: string;
  averageSpent: number;
  totalSpent: number;
  occurrencesInMonth: number;
}

/**
 * Computes average spend per day of week (Sun-Sat).
 * Averages per day of week (total on that DOW / number of times that DOW occurs in the month),
 * not per transaction.
 */
export function computeWeekdaySpending(
  year: number,
  month: number,
  expenses: ExpenseRecord[],
  recurring: RecurringExpenseRecord[] = []
): WeekdayStat[] {
  const monthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = getDaysInMonth(year, month);
  const mergedExpenses = getMergedMonthRegularExpenses(year, month, expenses, recurring);

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const shortNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const dowOccurrences = [0, 0, 0, 0, 0, 0, 0];
  const dowTotals = [0, 0, 0, 0, 0, 0, 0];

  // Count how many times each day of week occurs in this month
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    dowOccurrences[dow] += 1;
  }

  // Sum spending for each day of week
  mergedExpenses.forEach((e) => {
    const [y, m, d] = e.date.split('-').map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    dowTotals[dow] += e.amount;
  });

  return dayNames.map((name, idx) => {
    const count = dowOccurrences[idx];
    const total = roundToTwoDecimals(dowTotals[idx]);
    const average = count > 0 ? roundToTwoDecimals(total / count) : 0;

    return {
      dayOfWeek: idx,
      dayName: name,
      shortName: shortNames[idx],
      totalSpent: total,
      averageSpent: average,
      occurrencesInMonth: count
    };
  });
}
