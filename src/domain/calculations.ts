import {
  ExpenseRecord,
  EarningRecord,
  TransferRecord,
  PeerTransactionRecord,
  RecurringExpenseRecord,
  PaymentMethod,
  PersonRecord,
  UserSettings,
  BudgetMode
} from './types';
import { roundToTwoDecimals } from './money';
import { getTodayDateString } from './dates';
import { resolvePaymentMethod, isMethodActive } from './paymentMethods';

export interface MethodBalanceBreakdown {
  methodId: string;
  name: string;
  openingBalance: number;
  earnings: number;
  expenses: number;
  recurringExpenses: number;
  transfersIn: number;
  transfersOut: number;
  transfersFees: number;
  peerGivenOut: number; // money lent from wallet
  peerTakenIn: number; // money borrowed into wallet
  currentBalance: number;
}

export interface FinancialSummary {
  walletBalances: MethodBalanceBreakdown[];
  liquidWalletTotal: number; // Sum of money physically in active accounts
  totalReceivables: number; // Sum of money others owe user (Give > Take)
  totalPayables: number; // Sum of money user owes others (Take > Give)
  netTotal: number; // liquidWalletTotal + totalReceivables - totalPayables
  personBalances: Map<string, number>; // personId -> net balance (+ = they owe user, - = user owes them)
}

export function calculateFinancialSummary(
  methods: PaymentMethod[],
  expenses: ExpenseRecord[],
  recurringExpenses: RecurringExpenseRecord[],
  earnings: EarningRecord[],
  transfers: TransferRecord[],
  transactions: PeerTransactionRecord[],
  people: PersonRecord[]
): FinancialSummary {
  const breakdownMap = new Map<string, MethodBalanceBreakdown>();

  methods.forEach((m) => {
    breakdownMap.set(m.id, {
      methodId: m.id,
      name: m.name,
      openingBalance: m.openingBalance || 0,
      earnings: 0,
      expenses: 0,
      recurringExpenses: 0,
      transfersIn: 0,
      transfersOut: 0,
      transfersFees: 0,
      peerGivenOut: 0,
      peerTakenIn: 0,
      currentBalance: m.openingBalance || 0
    });
  });

  // Multi-key alias resolver so transactions with legacy IDs, names, or aliases match their wallet
  const resolveItem = (payMethodId?: string): MethodBalanceBreakdown | undefined => {
    if (!payMethodId) return undefined;
    const direct = breakdownMap.get(payMethodId);
    if (direct) return direct;
    const resolvedMethod = resolvePaymentMethod(payMethodId, methods);
    if (resolvedMethod) {
      return breakdownMap.get(resolvedMethod.id);
    }
    const clean = payMethodId.trim().toLowerCase();
    for (const [id, item] of breakdownMap.entries()) {
      if (id.toLowerCase() === clean || item.name.toLowerCase() === clean) {
        return item;
      }
    }
    return undefined;
  };

  // 1. Process Earnings (+ into wallet)
  earnings.forEach((e) => {
    const item = resolveItem(e.payMethodId);
    if (item) {
      item.earnings += Number(e.amount) || 0;
    }
  });

  // 2. Process Expenses (− from wallet)
  expenses.forEach((ex) => {
    const item = resolveItem(ex.payMethodId);
    if (item) {
      item.expenses += Number(ex.amount) || 0;
    }
  });

  // 3. Process Recurring Expenses (− full amount applied once per account)
  recurringExpenses.forEach((r) => {
    const item = resolveItem(r.payMethodId);
    if (item) {
      item.recurringExpenses += Number(r.amount) || 0;
    }
  });

  // 4. Process Transfers (sourceDeducted for from, requestedAmount for to)
  transfers.forEach((t) => {
    const fromItem = resolveItem(t.fromMethodId);
    const toItem = resolveItem(t.toMethodId);
    const reqAmt = Number(t.requestedAmount) || 0;
    const fee = Number(t.chargeAmount) || 0;
    const srcDed = Number(t.sourceDeducted) || (reqAmt + (t.chargeApplied ? fee : 0));

    if (fromItem) {
      fromItem.transfersOut += srcDed;
      if (fee > 0) {
        fromItem.transfersFees += fee;
      }
    }

    if (toItem) {
      toItem.transfersIn += reqAmt;
    }
  });

  // 5. Process Peer Transactions (skip historical seed entries where isOpening is true)
  transactions.forEach((tx) => {
    if (tx.isOpening === true) {
      return; // Historical seed entries already captured in openingBalances
    }
    // If it's a connected proposal that isn't confirmed or is cancelled, skip
    if (tx.status === 'pending' || tx.status === 'rejected' || tx.status === 'cancelled') {
      return;
    }

    const item = resolveItem(tx.payMethodId);
    if (item) {
      const amt = Number(tx.amount) || 0;
      const charge = tx.chargeApplied && tx.chargeAmount && tx.chargeAmount > 0 ? tx.chargeAmount : 0;
      if (tx.type === 'give') {
        // You gave money to a person -> leaves wallet (plus any cashout charge applied at agent)
        item.peerGivenOut += (amt + charge);
      } else if (tx.type === 'take') {
        // You received money from a person -> enters wallet
        item.peerTakenIn += amt;
      }
    }
  });

  // Calculate each method's current balance according to the Universal Formula:
  // Balance(A) = Opening + earnings − expenses − recurring + transfersIn − transfersOut + peerTakenIn − peerGivenOut
  let liquidWalletTotal = 0;
  const walletBalances: MethodBalanceBreakdown[] = [];

  breakdownMap.forEach((item) => {
    item.currentBalance = roundToTwoDecimals(
      item.openingBalance +
      item.earnings -
      item.expenses -
      item.recurringExpenses +
      item.transfersIn -
      item.transfersOut +
      item.peerTakenIn -
      item.peerGivenOut
    );

    // Only active methods contribute to active liquid total (treat undefined as active)
    const methodObj = methods.find((m) => m.id === item.methodId);
    if (!methodObj || isMethodActive(methodObj)) {
      liquidWalletTotal += item.currentBalance;
    }
    walletBalances.push(item);
  });

  liquidWalletTotal = roundToTwoDecimals(liquidWalletTotal);

  // 5. Calculate Person Balances (Receivables vs Payables)
  const personBalances = new Map<string, number>();
  people.forEach((p) => personBalances.set(p.id, 0));

  transactions.forEach((tx) => {
    if (tx.status === 'pending' || tx.status === 'rejected' || tx.status === 'cancelled') {
      return;
    }

    const current = personBalances.get(tx.personId) || 0;
    // Debt balance affects:
    // If feeTreatment === 'included', the debt includes chargeAmount.
    // If feeTreatment === 'separate' or 'none', debt balance is strictly tx.amount (principal)!
    const charge = tx.chargeApplied && tx.feeTreatment === 'included' && tx.chargeAmount && tx.chargeAmount > 0
      ? tx.chargeAmount
      : 0;
    const debtAmount = roundToTwoDecimals(tx.amount + charge);
    // 'give' = user gave money (they owe user +debtAmount)
    // 'take' = user received money (user owes them -debtAmount)
    const delta = tx.type === 'give' ? debtAmount : -debtAmount;
    personBalances.set(tx.personId, roundToTwoDecimals(current + delta));
  });

  let totalReceivables = 0;
  let totalPayables = 0;

  personBalances.forEach((balance) => {
    if (balance > 0) {
      totalReceivables += balance;
    } else if (balance < 0) {
      totalPayables += Math.abs(balance);
    }
  });

  totalReceivables = roundToTwoDecimals(totalReceivables);
  totalPayables = roundToTwoDecimals(totalPayables);

  // Net Total is Liquid Wallet Funds + Receivables (money owed to user) - Payables (debts user owes)
  const netTotal = roundToTwoDecimals(liquidWalletTotal + totalReceivables - totalPayables);

  return {
    walletBalances,
    liquidWalletTotal,
    totalReceivables,
    totalPayables,
    netTotal,
    personBalances
  };
}

export interface BudgetMetrics {
  mode: BudgetMode;
  isActive: boolean;
  dayOfMonth: number;
  daysInMonth: number;
  daysLeft: number;
  todayLimit: number;
  spentToday: number;
  leftToday: number;
  percentageUsed: number;
  isOverBudget: boolean;
  overAmount: number;
  plannedDaily: number;
  // Detail numbers for the "Details" popup modal
  income: number;
  plannedFixed: number;
  actualFixed: number;
  fixedUsed: number;
  isFixedOver: boolean;
  fixedOverAmount: number;
  plannedEmergency: number;
  actualEmergency: number;
  emergencyUsed: number;
  isEmergencyOver: boolean;
  emergencyOverAmount: number;
  plannedSavings: number;
  bufferPct: number;
  bufferAmount: number;
  spendable: number;
  priorRegularSpend: number;
  remainingSpendable: number;
  countingLabel: string;
  // Backward compatibility aliases
  dailyAllowance: number;
  remainingDailyBudget: number;
}

/**
 * Calculates adaptive daily budget metrics based on user settings,
 * actual spending this month (partitioned into prior days vs today),
 * and dynamic adaptation for Fixed & Emergency commitments.
 */
export function calculateBudgetMetrics(
  settings: UserSettings,
  expensesOrTodayAmount: ExpenseRecord[] | number,
  recurringExpenses: RecurringExpenseRecord[] = [],
  targetDate?: string
): BudgetMetrics {
  const mode = settings.budgetMode || 'none';
  const isActive = mode !== 'none' && mode !== 'off';

  const todayStr = targetDate || getTodayDateString();
  const [year, month, day] = todayStr.split('-').map(Number);
  const currentMonthPrefix = `${year}-${String(month).padStart(2, '0')}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dayOfMonth = Math.min(daysInMonth, Math.max(1, day));
  const daysLeft = Math.max(1, daysInMonth - dayOfMonth + 1);

  // If legacy number passed
  if (typeof expensesOrTodayAmount === 'number') {
    const spentToday = roundToTwoDecimals(expensesOrTodayAmount);
    let todayLimit = 0;
    if (mode === 'direct') {
      todayLimit = roundToTwoDecimals(settings.directDailyBudget || 0);
    } else if (mode === 'calculated') {
      const income = settings.monthlyIncome || 0;
      const commitments = (settings.monthlyFixed || 0) + (settings.monthlySavings || 0) + (settings.monthlyEmergency || 0);
      const available = Math.max(0, income - commitments);
      const buffer = (settings.bufferPct || 0) / 100;
      const netAllowance = available * (1 - buffer);
      todayLimit = roundToTwoDecimals(netAllowance / daysInMonth);
    }

    const leftToday = roundToTwoDecimals(Math.max(0, todayLimit - spentToday));
    const isOverBudget = todayLimit > 0 ? spentToday > todayLimit : spentToday > 0;
    const overAmount = spentToday > todayLimit ? roundToTwoDecimals(spentToday - todayLimit) : 0;
    const percentageUsed = todayLimit > 0
      ? Math.round((spentToday / todayLimit) * 100)
      : spentToday > 0 ? 100 : 0;

    return {
      mode,
      isActive,
      dayOfMonth,
      daysInMonth,
      daysLeft,
      todayLimit,
      spentToday,
      leftToday,
      percentageUsed,
      isOverBudget,
      overAmount,
      plannedDaily: todayLimit,
      income: settings.monthlyIncome || 0,
      plannedFixed: settings.monthlyFixed || 0,
      actualFixed: 0,
      fixedUsed: settings.monthlyFixed || 0,
      isFixedOver: false,
      fixedOverAmount: 0,
      plannedEmergency: settings.monthlyEmergency || 0,
      actualEmergency: 0,
      emergencyUsed: settings.monthlyEmergency || 0,
      isEmergencyOver: false,
      emergencyOverAmount: 0,
      plannedSavings: settings.monthlySavings || 0,
      bufferPct: settings.bufferPct ?? 10,
      bufferAmount: 0,
      spendable: 0,
      priorRegularSpend: 0,
      remainingSpendable: 0,
      countingLabel: mode === 'calculated' ? 'Only regular expenses count toward this limit' : 'All expenses count',
      dailyAllowance: todayLimit,
      remainingDailyBudget: leftToday
    };
  }

  // --- Full Adaptive Calculation from records ---
  const expenses = expensesOrTodayAmount || [];

  // Filter expenses belonging to the current calendar month
  const monthExpenses = expenses.filter((e) => e.date && e.date.startsWith(currentMonthPrefix));

  let actualFixed = 0;
  let actualEmergency = 0;
  let priorRegularSpend = 0;
  let todayRegularSpend = 0;
  let todayFixedSpend = 0;
  let todayEmergencySpend = 0;

  monthExpenses.forEach((e) => {
    const type = e.type || 'regular';
    if (type === 'fixed') {
      actualFixed += e.amount;
      if (e.date === todayStr) {
        todayFixedSpend += e.amount;
      }
    } else if (type === 'emergency') {
      actualEmergency += e.amount;
      if (e.date === todayStr) {
        todayEmergencySpend += e.amount;
      }
    } else {
      // Regular expense: partition strictly by date
      if (e.date < todayStr) {
        priorRegularSpend += e.amount;
      } else if (e.date === todayStr) {
        todayRegularSpend += e.amount;
      }
      // Future dates in month are not yet spent
    }
  });

  // Distribute recurring expense daily shares
  recurringExpenses.forEach((r) => {
    if (!r.startDate || !r.endDate || r.days <= 0 || r.amount <= 0) return;
    const dailyShare = r.perDay || (r.amount / r.days);
    const rType = r.type || 'regular';

    // Loop through each day of this month
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${currentMonthPrefix}-${String(d).padStart(2, '0')}`;
      if (dateStr >= r.startDate && dateStr <= r.endDate) {
        if (rType === 'fixed') {
          actualFixed += dailyShare;
          if (dateStr === todayStr) todayFixedSpend += dailyShare;
        } else if (rType === 'emergency') {
          actualEmergency += dailyShare;
          if (dateStr === todayStr) todayEmergencySpend += dailyShare;
        } else {
          if (dateStr < todayStr) {
            priorRegularSpend += dailyShare;
          } else if (dateStr === todayStr) {
            todayRegularSpend += dailyShare;
          }
        }
      }
    }
  });

  actualFixed = roundToTwoDecimals(actualFixed);
  actualEmergency = roundToTwoDecimals(actualEmergency);
  priorRegularSpend = roundToTwoDecimals(priorRegularSpend);
  todayRegularSpend = roundToTwoDecimals(todayRegularSpend);
  todayFixedSpend = roundToTwoDecimals(todayFixedSpend);
  todayEmergencySpend = roundToTwoDecimals(todayEmergencySpend);

  const plannedFixed = roundToTwoDecimals(settings.monthlyFixed || 0);
  const plannedEmergency = roundToTwoDecimals(settings.monthlyEmergency || 0);
  const plannedSavings = roundToTwoDecimals(settings.monthlySavings || 0);
  const income = roundToTwoDecimals(settings.monthlyIncome || 0);
  const bufferPct = Math.min(100, Math.max(0, settings.bufferPct ?? 10));

  // Step 1: Fixed & Emergency adapt to reality (larger of planned vs actual)
  const fixedUsed = Math.max(plannedFixed, actualFixed);
  const emergencyUsed = Math.max(plannedEmergency, actualEmergency);
  const isFixedOver = actualFixed > plannedFixed;
  const fixedOverAmount = isFixedOver ? roundToTwoDecimals(actualFixed - plannedFixed) : 0;
  const isEmergencyOver = actualEmergency > plannedEmergency;
  const emergencyOverAmount = isEmergencyOver ? roundToTwoDecimals(actualEmergency - plannedEmergency) : 0;

  // Step 2: Monthly spendable money
  const rawDiscretionary = Math.max(0, income - fixedUsed - plannedSavings - emergencyUsed);
  const bufferAmount = roundToTwoDecimals(rawDiscretionary * (bufferPct / 100));
  const spendable = roundToTwoDecimals(Math.max(0, rawDiscretionary - bufferAmount));

  // Planned static spendable for reference
  const plannedRaw = Math.max(0, income - plannedFixed - plannedSavings - plannedEmergency);
  const plannedSpendable = Math.max(0, plannedRaw * (1 - bufferPct / 100));
  const plannedDaily = roundToTwoDecimals(plannedSpendable / daysInMonth);

  // Step 3: Today's daily limit
  let todayLimit = 0;
  let spentToday = 0;
  let remainingSpendable = 0;

  if (mode === 'calculated') {
    remainingSpendable = roundToTwoDecimals(Math.max(0, spendable - priorRegularSpend));
    todayLimit = daysLeft > 0 ? roundToTwoDecimals(remainingSpendable / daysLeft) : 0;
    spentToday = roundToTwoDecimals(todayRegularSpend);
  } else if (mode === 'direct') {
    todayLimit = roundToTwoDecimals(settings.directDailyBudget || 0);
    // In direct mode, ALL expenses today count
    spentToday = roundToTwoDecimals(todayRegularSpend + todayFixedSpend + todayEmergencySpend);
    remainingSpendable = roundToTwoDecimals(todayLimit * daysLeft);
  }

  const leftToday = roundToTwoDecimals(Math.max(0, todayLimit - spentToday));
  const isOverBudget = todayLimit > 0 ? spentToday > todayLimit : spentToday > 0;
  const overAmount = spentToday > todayLimit ? roundToTwoDecimals(spentToday - todayLimit) : 0;
  const percentageUsed = todayLimit > 0
    ? Math.round((spentToday / todayLimit) * 100)
    : spentToday > 0 ? 100 : 0;

  const countingLabel = mode === 'calculated'
    ? 'Only regular expenses count toward this limit. Bills and emergency reserve are already protected.'
    : 'All expenses count toward this direct limit.';

  return {
    mode,
    isActive,
    dayOfMonth,
    daysInMonth,
    daysLeft,
    todayLimit,
    spentToday,
    leftToday,
    percentageUsed,
    isOverBudget,
    overAmount,
    plannedDaily,
    income,
    plannedFixed,
    actualFixed,
    fixedUsed,
    isFixedOver,
    fixedOverAmount,
    plannedEmergency,
    actualEmergency,
    emergencyUsed,
    isEmergencyOver,
    emergencyOverAmount,
    plannedSavings,
    bufferPct,
    bufferAmount,
    spendable,
    priorRegularSpend,
    remainingSpendable,
    countingLabel,
    dailyAllowance: todayLimit,
    remainingDailyBudget: leftToday
  };
}

/**
 * Transfer cashout charge calculation:
 * Default 2% on qualifying directions (e.g. mobile money to bank or cashout).
 * A 0% charge rate is strictly preserved as 0 (not overridden with default).
 */
export function calculateTransferCharge(
  requestedAmount: number,
  chargeRate: number,
  isEligible: boolean
): { chargeAmount: number; totalSourceDeduction: number } {
  if (!isEligible || chargeRate <= 0 || requestedAmount <= 0) {
    return {
      chargeAmount: 0,
      totalSourceDeduction: requestedAmount
    };
  }

  const chargeAmount = roundToTwoDecimals((requestedAmount * chargeRate) / 100);
  const totalSourceDeduction = roundToTwoDecimals(requestedAmount + chargeAmount);

  return {
    chargeAmount,
    totalSourceDeduction
  };
}
