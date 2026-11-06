import { formatTaka } from './money';
import { calculateFinancialSummary, calculateBudgetMetrics } from './calculations';
import { resolveDuplicateMethodName } from './paymentMethods';
import { validateEcoBackupV1, migrateBackupV1ToDomain, SAMPLE_ECO_BACKUP_V1 } from './backupV1';
import { calculateRecurringEndDate, formatExactDate, formatExactDateTime } from './dates';
import {
  PaymentMethod,
  PersonRecord,
  PeerTransactionRecord,
  ExpenseRecord,
  UserSettings,
  UnifiedActivityItem,
  encodePersonShareToken,
  decodePersonShareToken
} from './types';
import {
  evaluateLoanMilestone,
  addCalendarMonths,
  addCalendarDays,
  addCalendarYears,
  buildBanglaWhatsAppReminder,
  computeDashboardLoanReminders,
  normalizeWhatsAppPhone
} from './milestones';
import { invertProposalDirection, validateConnectionCode } from './connections';
import { getRecent24Months, computeStatsOverview, computeMonthHeatmap } from './statistics';
import { buildMultiVoucherData } from './exportBrandedDocument';
import { runAllSettlementTests } from './settlementTests';

export interface TestResult {
  name: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  error?: string;
}

export function runAllRegressionTests(): TestResult[] {
  const results: TestResult[] = [];

  // Test 1: Indian/Bangladeshi digit grouping
  try {
    const formatted = formatTaka(162450);
    const passed = formatted === '৳ 1,62,450.00';
    results.push({
      name: 'Format Taka (Indian Digit Grouping: 162450 -> ৳ 1,62,450.00)',
      passed,
      actual: formatted,
      expected: '৳ 1,62,450.00'
    });
  } catch (e: any) {
    results.push({ name: 'Format Taka', passed: false, error: e.message });
  }

  // Test 2: Required Wallet Regression Case (Blueprint Section 26.1)
  try {
    const methods: PaymentMethod[] = [
      { id: 'm_cash', name: 'Cash', type: 'cash', isBuiltIn: true, isActive: true, balance: 0, openingBalance: 1040, createdAt: '', updatedAt: '' },
      { id: 'm_bkash', name: 'bKash', type: 'mobile_money', isBuiltIn: false, isActive: true, balance: 0, openingBalance: 8000, createdAt: '', updatedAt: '' },
      { id: 'm_nagad', name: 'Nagad', type: 'mobile_money', isBuiltIn: false, isActive: true, balance: 0, openingBalance: 0, createdAt: '', updatedAt: '' }
    ];

    const people: PersonRecord[] = [
      { id: 'p_emon', name: 'Emon', isConnected: false, createdAt: '' }
    ];

    // Initial state before lending
    const initialSummary = calculateFinancialSummary(methods, [], [], [], [], [], people);
    const initialWalletPassed = initialSummary.liquidWalletTotal === 9040;
    const initialNetPassed = initialSummary.netTotal === 9040;

    // User lends ৳500 to Emon from bKash
    const lendTx: PeerTransactionRecord = {
      id: 'tx_lend_500',
      personId: 'p_emon',
      type: 'give',
      amount: 500,
      totalAmount: 500,
      payMethodId: 'm_bkash',
      tag: 'Loan',
      description: 'Lent to Emon',
      date: '2026-10-21',
      timestamp: Date.now()
    };

    const afterSummary = calculateFinancialSummary(methods, [], [], [], [], [lendTx], people);
    const bkashBreakdown = afterSummary.walletBalances.find((b) => b.methodId === 'm_bkash');
    const cashBreakdown = afterSummary.walletBalances.find((b) => b.methodId === 'm_cash');
    const nagadBreakdown = afterSummary.walletBalances.find((b) => b.methodId === 'm_nagad');

    const bkashCorrect = bkashBreakdown?.currentBalance === 7500;
    const cashCorrect = cashBreakdown?.currentBalance === 1040;
    const nagadCorrect = nagadBreakdown?.currentBalance === 0;
    const receivableCorrect = afterSummary.totalReceivables === 500;
    const netTotalCorrect = afterSummary.netTotal === 9040;
    const liquidWalletCorrect = afterSummary.liquidWalletTotal === 8540;

    const allPassed =
      initialWalletPassed &&
      initialNetPassed &&
      bkashCorrect &&
      cashCorrect &&
      nagadCorrect &&
      receivableCorrect &&
      netTotalCorrect &&
      liquidWalletCorrect;

    results.push({
      name: 'Required Wallet Regression Test (Give ৳500 from bKash to Emon)',
      passed: allPassed,
      actual: {
        liquidWalletTotal: afterSummary.liquidWalletTotal,
        receivables: afterSummary.totalReceivables,
        netTotal: afterSummary.netTotal,
        bkashBalance: bkashBreakdown?.currentBalance,
        cashBalance: cashBreakdown?.currentBalance
      },
      expected: {
        liquidWalletTotal: 8540,
        receivables: 500,
        netTotal: 9040,
        bkashBalance: 7500,
        cashBalance: 1040
      }
    });
  } catch (e: any) {
    results.push({ name: 'Wallet Regression Test', passed: false, error: e.message });
  }

  // Test 3: Duplicate Method Naming (Name, Name~2, Name~3)
  try {
    const list: PaymentMethod[] = [
      { id: '1', name: 'Cash', type: 'cash', isBuiltIn: true, isActive: true, balance: 0, openingBalance: 0, createdAt: '', updatedAt: '' },
      { id: '2', name: 'City Bank', type: 'bank', isBuiltIn: false, isActive: true, balance: 0, openingBalance: 0, createdAt: '', updatedAt: '' },
      { id: '3', name: 'City Bank~2', type: 'bank', isBuiltIn: false, isActive: true, balance: 0, openingBalance: 0, createdAt: '', updatedAt: '' }
    ];

    const nextName = resolveDuplicateMethodName('City Bank', list);
    const passed = nextName === 'City Bank~3';
    results.push({
      name: 'Duplicate Payment Method Naming ("City Bank" -> "City Bank~3")',
      passed,
      actual: nextName,
      expected: 'City Bank~3'
    });
  } catch (e: any) {
    results.push({ name: 'Duplicate Method Naming', passed: false, error: e.message });
  }

  // Test 4: Recurring Expense Inclusive End Date Formula
  try {
    const endDate = calculateRecurringEndDate('2026-10-01', 30);
    const passed = endDate === '2026-10-30';
    results.push({
      name: 'Recurring End Date Inclusive Math (2026-10-01 + 30 days -> 2026-10-30)',
      passed,
      actual: endDate,
      expected: '2026-10-30'
    });
  } catch (e: any) {
    results.push({ name: 'Recurring Date Math', passed: false, error: e.message });
  }

  // Test 5: eco-backup v1 Contract Validation & Migration
  try {
    const jsonStr = JSON.stringify(SAMPLE_ECO_BACKUP_V1);
    const { result, parsedData } = validateEcoBackupV1(jsonStr);
    const valid = result.isValid && parsedData !== undefined;
    const migrated = valid ? migrateBackupV1ToDomain(parsedData!) : null;

    const restoredNagad = migrated?.paymentMethods.some((m) => m.name.toLowerCase() === 'nagad');
    const restoredBkash = migrated?.paymentMethods.some((m) => m.name.toLowerCase() === 'bkash');
    const selectivePassed = valid && restoredBkash === true && restoredNagad === false;

    results.push({
      name: 'eco-backup v1 Selective Method Restoration (bKash restored, Nagad omitted)',
      passed: selectivePassed,
      actual: {
        isValid: result.isValid,
        restoredBkash,
        restoredNagad
      },
      expected: {
        isValid: true,
        restoredBkash: true,
        restoredNagad: false
      }
    });
  } catch (e: any) {
    results.push({ name: 'eco-backup v1 Migration', passed: false, error: e.message });
  }

  // Test 6: Milestone Calendar Math & Month-End Clamping
  try {
    // 7 days: 2026-10-01 + 7 = 2026-10-08
    const day7 = addCalendarDays('2026-10-01', 7);
    // 15 days: 2026-10-01 + 15 = 2026-10-16
    const day15 = addCalendarDays('2026-10-01', 15);
    // 1 month from Jan 31 (non-leap 2025) -> Feb 28
    const jan31PlusMonth = addCalendarMonths('2025-01-31', 1);
    // 1 year from leap Feb 29, 2024 -> Feb 28, 2025
    const leapYearPlusOne = addCalendarYears('2024-02-29', 1);

    const passed =
      day7 === '2026-10-08' &&
      day15 === '2026-10-16' &&
      jan31PlusMonth === '2025-02-28' &&
      leapYearPlusOne === '2025-02-28';

    results.push({
      name: 'Calendar Milestone Arithmetic & Month-End Clamping (Jan 31->Feb 28, Leap Feb 29->Feb 28)',
      passed,
      actual: { day7, day15, jan31PlusMonth, leapYearPlusOne },
      expected: { day7: '2026-10-08', day15: '2026-10-16', jan31PlusMonth: '2025-02-28', leapYearPlusOne: '2025-02-28' }
    });
  } catch (e: any) {
    results.push({ name: 'Milestone Calendar Math', passed: false, error: e.message });
  }

  // Test 7: Milestone Age Qualification & Schedule
  try {
    // A loan recorded on 2026-10-01 evaluated on 2026-10-06 (5 days old) -> NO milestone reached
    const evalUnder7 = evaluateLoanMilestone('2026-10-01', '2026-10-06');
    const under7Eligible = evalUnder7.highestReachedMilestone === null;

    // A loan recorded on 2026-10-01 evaluated on 2026-10-08 (7 days old) -> 7_days reached
    const eval7 = evaluateLoanMilestone('2026-10-01', '2026-10-08');
    const day7Eligible = eval7.highestReachedMilestone?.key === '7_days';

    // Evaluated on 2026-11-01 (1 calendar month) -> 1_month reached
    const evalMonth = evaluateLoanMilestone('2026-10-01', '2026-11-01');
    const monthEligible = evalMonth.highestReachedMilestone?.key === '1_month';

    const passed = under7Eligible && day7Eligible && monthEligible;
    results.push({
      name: 'Milestone Age Eligibility (Under 7d excluded, 7d and 1mo qualify on exact calendar date)',
      passed,
      actual: {
        under7: evalUnder7.highestReachedMilestone,
        day7: eval7.highestReachedMilestone?.key,
        month1: evalMonth.highestReachedMilestone?.key
      },
      expected: { under7: null, day7: '7_days', month1: '1_month' }
    });
  } catch (e: any) {
    results.push({ name: 'Milestone Age Eligibility', passed: false, error: e.message });
  }

  // Test 8: Polite Bangla WhatsApp Reminder Generation
  try {
    const reminder = buildBanglaWhatsAppReminder('Emon', 500, '১৫ দিন', '2026-10-08');
    const containsAssalamu = reminder.includes('আসসালামু আলাইকুম Emon');
    const containsAmount = reminder.includes('৳ 500.00');
    const containsMilestone = reminder.includes('১৫ দিন আগে');
    const containsPoliteSignoff = reminder.includes('EcO Smart Ledger');

    const passed = containsAssalamu && containsAmount && containsMilestone && containsPoliteSignoff;
    results.push({
      name: 'Bangla WhatsApp Reminder Generator (Polite non-threatening tone with BDT format)',
      passed,
      actual: { containsAssalamu, containsAmount, containsMilestone, containsPoliteSignoff },
      expected: { containsAssalamu: true, containsAmount: true, containsMilestone: true, containsPoliteSignoff: true }
    });
  } catch (e: any) {
    results.push({ name: 'Bangla WhatsApp Reminder Generator', passed: false, error: e.message });
  }

  // Test 9: All-Settled vs No-Reminders-Due Dashboard Logic
  try {
    const people: PersonRecord[] = [
      { id: 'p1', name: 'Rahim', isConnected: false, createdAt: '' }
    ];
    // Case A: 0 balance -> All settled
    const zeroBalances = new Map<string, number>([['p1', 0]]);
    const resA = computeDashboardLoanReminders(people, [], zeroBalances, '2026-10-23');
    const allSettledPassed = resA.allSettled === true;

    // Case B: Loan of 500 recorded yesterday (1 day old) -> Not all-settled, but hasOutstandingWithoutReminder
    const activeBalance = new Map<string, number>([['p1', 500]]);
    const youngTx: PeerTransactionRecord = {
      id: 'tx_young',
      personId: 'p1',
      type: 'give',
      amount: 500,
      totalAmount: 500,
      payMethodId: 'm_cash',
      tag: '',
      description: '',
      date: '2026-10-22',
      timestamp: Date.now()
    };
    const resB = computeDashboardLoanReminders(people, [youngTx], activeBalance, '2026-10-23');
    const youngLoanPassed = resB.allSettled === false && resB.hasOutstandingWithoutReminder === true && resB.activeReminders.length === 0;

    const passed = allSettledPassed && youngLoanPassed;
    results.push({
      name: 'All-Settled vs No-Reminders-Due State (Distinguishes ৳0 balance from fresh debt <7d)',
      passed,
      actual: { allSettled: resA.allSettled, youngHasOutstandingWithoutReminder: resB.hasOutstandingWithoutReminder },
      expected: { allSettled: true, youngHasOutstandingWithoutReminder: true }
    });
  } catch (e: any) {
    results.push({ name: 'All-Settled State Check', passed: false, error: e.message });
  }

  // Test 10: EcO-to-EcO Direction Inversion
  try {
    const giveInverted = invertProposalDirection('give');
    const takeInverted = invertProposalDirection('take');
    const passed = giveInverted === 'take' && takeInverted === 'give';

    results.push({
      name: 'EcO-to-EcO Direction Inversion (Sender "give" -> Recipient "take", and vice versa)',
      passed,
      actual: { giveInverted, takeInverted },
      expected: { giveInverted: 'take', takeInverted: 'give' }
    });
  } catch (e: any) {
    results.push({ name: 'Direction Inversion', passed: false, error: e.message });
  }

  // Test 11: 24-Month Selector Consistency
  try {
    const months = getRecent24Months();
    const countPassed = months.length === 24;
    const formatPassed = /^\d{4}-\d{2}$/.test(months[0].key);
    const passed = countPassed && formatPassed;

    results.push({
      name: 'Statistics 24-Month Window (Exactly 24 months generated with YYYY-MM keys)',
      passed,
      actual: { count: months.length, latestKey: months[0]?.key },
      expected: { count: 24, latestKey: 'YYYY-MM format' }
    });
  } catch (e: any) {
    results.push({ name: '24-Month Window', passed: false, error: e.message });
  }

  // Test 12: Example A - Peer Lending with Fee Covered Separately
  try {
    const methods: PaymentMethod[] = [
      { id: 'm_cash', name: 'Cash', type: 'cash', isBuiltIn: true, isActive: true, balance: 0, openingBalance: 1000, createdAt: '', updatedAt: '' },
      { id: 'm_bkash', name: 'bKash', type: 'mobile_money', isBuiltIn: false, isActive: true, balance: 0, openingBalance: 5000, createdAt: '', updatedAt: '' }
    ];
    const people: PersonRecord[] = [
      { id: 'p_rakib', name: 'Rakib', isConnected: false, createdAt: '' }
    ];

    // User lends ৳1000 from bKash with 1.85% fee covered separately
    const lendTx: PeerTransactionRecord = {
      id: 'tx_give_1000',
      personId: 'p_rakib',
      type: 'give',
      amount: 1000,
      totalAmount: 1000,
      payMethodId: 'm_bkash',
      tag: 'Personal',
      description: 'Lent with fee separate',
      date: '2026-10-24',
      chargeApplied: true,
      chargeRate: 1.85,
      chargeAmount: 18.50,
      feeTreatment: 'separate',
      timestamp: Date.now()
    };

    const summary1 = calculateFinancialSummary(methods, [], [], [], [], [lendTx], people);
    const bkashBal1 = summary1.walletBalances.find((b) => b.methodId === 'm_bkash')?.currentBalance;
    const rakibBal1 = summary1.personBalances.get('p_rakib');

    // Repayment: Rakib repays ৳1000 in cash
    const repayTx: PeerTransactionRecord = {
      id: 'tx_repay_1000',
      personId: 'p_rakib',
      type: 'take',
      amount: 1000,
      totalAmount: 1000,
      payMethodId: 'm_cash',
      tag: 'Settlement',
      description: 'Cash repayment',
      date: '2026-10-25',
      timestamp: Date.now() + 1000
    };

    const summary2 = calculateFinancialSummary(methods, [], [], [], [], [lendTx, repayTx], people);
    const bkashBal2 = summary2.walletBalances.find((b) => b.methodId === 'm_bkash')?.currentBalance;
    const cashBal2 = summary2.walletBalances.find((b) => b.methodId === 'm_cash')?.currentBalance;
    const rakibBal2 = summary2.personBalances.get('p_rakib');

    const passed =
      bkashBal1 === 3981.5 && // 5000 - 1018.50
      rakibBal1 === 1000 &&   // Rakib owes exactly 1000
      cashBal2 === 2000 &&    // 1000 + 1000 cash
      bkashBal2 === 3981.5 &&
      rakibBal2 === 0;        // Fully settled, no phantom 18.50 debt

    results.push({
      name: 'Peer Cashout Fee - Example A (Fee covered separately settles cleanly to ৳0 on repayment)',
      passed,
      actual: { bkashBal1, rakibBal1, cashBal2, rakibBal2 },
      expected: { bkashBal1: 3981.5, rakibBal1: 1000, cashBal2: 2000, rakibBal2: 0 }
    });
  } catch (e: any) {
    results.push({ name: 'Peer Fee Example A', passed: false, error: e.message });
  }

  // Test 13: Example C - Peer Lending with Fee Included in Debt
  try {
    const methods: PaymentMethod[] = [
      { id: 'm_bkash', name: 'bKash', type: 'mobile_money', isBuiltIn: false, isActive: true, balance: 0, openingBalance: 5000, createdAt: '', updatedAt: '' }
    ];
    const people: PersonRecord[] = [
      { id: 'p_sami', name: 'Sami', isConnected: false, createdAt: '' }
    ];

    const lendTx: PeerTransactionRecord = {
      id: 'tx_give_included',
      personId: 'p_sami',
      type: 'give',
      amount: 1000,
      totalAmount: 1000,
      payMethodId: 'm_bkash',
      tag: 'Personal',
      description: 'Lent with fee included',
      date: '2026-10-24',
      chargeApplied: true,
      chargeRate: 1.85,
      chargeAmount: 18.50,
      feeTreatment: 'included',
      timestamp: Date.now()
    };

    const summary = calculateFinancialSummary(methods, [], [], [], [], [lendTx], people);
    const bkashBal = summary.walletBalances.find((b) => b.methodId === 'm_bkash')?.currentBalance;
    const samiBal = summary.personBalances.get('p_sami');

    const passed = bkashBal === 3981.5 && samiBal === 1018.5;
    results.push({
      name: 'Peer Cashout Fee - Example C (Fee included in agreed debt -> borrower owes principal + fee)',
      passed,
      actual: { bkashBal, samiBal },
      expected: { bkashBal: 3981.5, samiBal: 1018.5 }
    });
  } catch (e: any) {
    results.push({ name: 'Peer Fee Example C', passed: false, error: e.message });
  }

  // Test 14: Phone Number Normalization for WhatsApp
  try {
    const local = normalizeWhatsAppPhone('01712345678');
    const withPlus = normalizeWhatsAppPhone('+8801712345678');
    const with880 = normalizeWhatsAppPhone('8801712345678');
    const withDashes = normalizeWhatsAppPhone('017-1234-5678');

    const passed =
      local === '8801712345678' &&
      withPlus === '8801712345678' &&
      with880 === '8801712345678' &&
      withDashes === '8801712345678';

    results.push({
      name: 'WhatsApp Phone Normalization (Guarantees single 880 prefix, strips formatting)',
      passed,
      actual: { local, withPlus, with880, withDashes },
      expected: '8801712345678 for all forms'
    });
  } catch (e: any) {
    results.push({ name: 'WhatsApp Phone Normalization', passed: false, error: e.message });
  }

  // Test 15: Adaptive Daily Budget - Today's Limit remains stable as today's expenses increase
  try {
    const baseSettings: UserSettings = {
      id: 'main',
      theme: 'dark',
      setupComplete: true,
      budgetMode: 'calculated',
      directDailyBudget: 500,
      monthlyIncome: 30000,
      monthlyFixed: 10000,
      monthlySavings: 5000,
      monthlyEmergency: 3000,
      bufferPct: 10,
      cashoutChargeRate: 2,
      categories: ['Food'],
      tags: [],
      currencySymbol: '৳'
    };

    // October 2026: 31 days. Evaluating on 2026-10-24 (Day 24, days left = 31 - 24 + 1 = 8)
    // Spendable = (30000 - 10000 - 5000 - 3000) * 0.9 = 12000 * 0.9 = 10800
    // Suppose prior regular spend (up to yesterday, 2026-10-23) was 6000
    // Remaining spendable = 10800 - 6000 = 4800
    // Today's Limit = 4800 / 8 = 600
    const priorExpenses: ExpenseRecord[] = [
      { id: '1', reason: 'Grocery', category: 'Food', description: '', amount: 6000, type: 'regular', payMethodId: 'm_cash', date: '2026-10-20', timestamp: 1 }
    ];

    const morningMetrics = calculateBudgetMetrics(baseSettings, priorExpenses, [], '2026-10-24');

    // Now user logs 200 regular expense TODAY (2026-10-24)
    const withTodayExpenses: ExpenseRecord[] = [
      ...priorExpenses,
      { id: '2', reason: 'Lunch', category: 'Food', description: '', amount: 200, type: 'regular', payMethodId: 'm_cash', date: '2026-10-24', timestamp: 2 }
    ];

    const eveningMetrics = calculateBudgetMetrics(baseSettings, withTodayExpenses, [], '2026-10-24');

    // CRITICAL: todayLimit must stay 600, NOT shrink!
    // Spent today should go from 0 to 200
    // Left today should go from 600 to 400
    const limitMaintained = morningMetrics.todayLimit === 600 && eveningMetrics.todayLimit === 600;
    const spentAccurate = morningMetrics.spentToday === 0 && eveningMetrics.spentToday === 200;
    const leftAccurate = morningMetrics.leftToday === 600 && eveningMetrics.leftToday === 400;

    const passed = limitMaintained && spentAccurate && leftAccurate;
    results.push({
      name: 'Adaptive Budget - Today\'s limit stability (stays fixed at ৳600 as today\'s spending occurs)',
      passed,
      actual: {
        morningLimit: morningMetrics.todayLimit,
        eveningLimit: eveningMetrics.todayLimit,
        eveningSpent: eveningMetrics.spentToday,
        eveningLeft: eveningMetrics.leftToday
      },
      expected: {
        morningLimit: 600,
        eveningLimit: 600,
        eveningSpent: 200,
        eveningLeft: 400
      }
    });
  } catch (e: any) {
    results.push({ name: 'Adaptive Budget Stability Test', passed: false, error: e.message });
  }

  // Test 16: Adaptive Budget - Higher actual Fixed/Emergency deduction
  try {
    const baseSettings: UserSettings = {
      id: 'main',
      theme: 'dark',
      setupComplete: true,
      budgetMode: 'calculated',
      directDailyBudget: 500,
      monthlyIncome: 30000,
      monthlyFixed: 5000,
      monthlySavings: 5000,
      monthlyEmergency: 2000,
      bufferPct: 0, // 0% buffer for easy math
      cashoutChargeRate: 2,
      categories: ['Bills'],
      tags: [],
      currencySymbol: '৳'
    };

    // Actual fixed is 7000 (exceeds planned 5000 by 2000)
    // Fixed used should be max(5000, 7000) = 7000
    // Spendable = 30000 - 7000 - 5000 - 2000 = 16000 (instead of 18000)
    const fixedOverExpenses: ExpenseRecord[] = [
      { id: '1', reason: 'Rent', category: 'Bills', description: '', amount: 7000, type: 'fixed', payMethodId: 'm_cash', date: '2026-10-05', timestamp: 1 }
    ];

    const metrics = calculateBudgetMetrics(baseSettings, fixedOverExpenses, [], '2026-10-24');
    const passed = metrics.fixedUsed === 7000 && metrics.isFixedOver === true && metrics.fixedOverAmount === 2000 && metrics.spendable === 16000;

    results.push({
      name: 'Adaptive Budget - Fixed cost overspend adaptation (uses higher actual ৳7000, flags overspend)',
      passed,
      actual: {
        fixedUsed: metrics.fixedUsed,
        isFixedOver: metrics.isFixedOver,
        fixedOverAmount: metrics.fixedOverAmount,
        spendable: metrics.spendable
      },
      expected: {
        fixedUsed: 7000,
        isFixedOver: true,
        fixedOverAmount: 2000,
        spendable: 16000
      }
    });
  } catch (e: any) {
    results.push({ name: 'Adaptive Budget Overspend Test', passed: false, error: e.message });
  }

  // Test 17: eco-backup v1 Import with missing phone (Never creates undefined property)
  try {
    const mockBackup = {
      format: 'eco-backup',
      formatVersion: 1,
      exportedAt: '2026-10-25T10:00:00.000Z',
      app: { name: 'EcO', purpose: 'Ledger' },
      data: {
        people: [
          {
            id: 'A8clAu47ApAwQprM4jkL',
            fields: {
              name: 'Shakil Khan',
              // No phone field here!
              createdAt: '2026-10-20T00:00:00.000Z'
            }
          }
        ]
      },
      integrity: { complete: true, counts: { people: 1 } }
    };

    const domain = migrateBackupV1ToDomain(mockBackup as any);
    const person = domain.people[0];
    const hasUndefinedPhone = Object.prototype.hasOwnProperty.call(person, 'phone') && person.phone === undefined;
    const passed = person.id === 'A8clAu47ApAwQprM4jkL' && person.name === 'Shakil Khan' && !hasUndefinedPhone;

    results.push({
      name: 'Backup Import - Person without phone avoids undefined field',
      passed,
      actual: { hasUndefinedPhone, person },
      expected: { hasUndefinedPhone: false }
    });
  } catch (e: any) {
    results.push({ name: 'Backup Import Person Phone Test', passed: false, error: e.message });
  }

  // Test 22: Backup Import - Multi-Wallet Transaction & Transfer Balance Accuracy
  try {
    const multiWalletBackup = {
      format: 'eco-backup',
      formatVersion: 1,
      exportedAt: '2026-10-25T10:00:00.000Z',
      app: { name: 'EcO', purpose: 'Backup' },
      data: {
        openingBalances: [
          {
            id: 'current',
            fields: { cash: 2500, bkash: 7500, nagad: 1200 }
          }
        ],
        people: [{ id: 'person_emon', fields: { name: 'Emon Ahmed' } }],
        expenses: [
          { id: 'exp_1', fields: { amount: 1450, payMethodId: 'cash' } },
          { id: 'exp_2', fields: { amount: 1000, payMethodId: 'bkash' } }
        ],
        earnings: [
          { id: 'earn_1', fields: { amount: 35000, payMethodId: 'cash' } }
        ],
        transfers: [
          { id: 'tr_1', fields: { fromMethodId: 'cash', toMethodId: 'bkash', requestedAmount: 3000 } }
        ],
        transactions: [
          { id: 'tx_1', fields: { personId: 'person_emon', type: 'give', amount: 1500, payMethodId: 'bkash' } }
        ]
      },
      integrity: { complete: true, counts: {} }
    };

    const domain = migrateBackupV1ToDomain(multiWalletBackup as any);
    const summary = calculateFinancialSummary(
      domain.paymentMethods,
      domain.expenses,
      domain.recurringExpenses,
      domain.earnings,
      domain.transfers,
      domain.transactions,
      domain.people
    );

    const cashWallet = summary.walletBalances.find((w) => w.name.toLowerCase() === 'cash');
    const bkashWallet = summary.walletBalances.find((w) => w.name.toLowerCase().includes('bkash'));
    const nagadWallet = summary.walletBalances.find((w) => w.name.toLowerCase().includes('nagad'));

    const passed =
      cashWallet?.currentBalance === 33050 &&
      bkashWallet?.currentBalance === 8000 &&
      nagadWallet?.currentBalance === 1200 &&
      summary.liquidWalletTotal === 42250;

    results.push({
      name: 'Backup Import - Multi-Wallet Transaction & Transfer Balance Accuracy',
      passed,
      actual: {
        cash: cashWallet?.currentBalance,
        bkash: bkashWallet?.currentBalance,
        nagad: nagadWallet?.currentBalance,
        total: summary.liquidWalletTotal
      },
      expected: { cash: 33050, bkash: 8000, nagad: 1200, total: 42250 }
    });
  } catch (e: any) {
    results.push({ name: 'Multi-Wallet Balance Accuracy Test', passed: false, error: e.message });
  }

  // Test 23: Universal Account Balance Calculation Method (Master Formula & Worked Example Verification)
  try {
    const universalBackup = {
      format: 'eco-backup',
      formatVersion: 1,
      exportedAt: '2026-10-25T13:27:48.234Z',
      app: { name: 'EcO (Echo)', purpose: 'Test' },
      data: {
        openingBalances: [
          {
            id: 'current',
            fields: { cash: 6900, bkash: 23.50, nagad: 0 }
          }
        ],
        earnings: [
          { id: 'e1', fields: { amount: 5140, payMethod: 'cash' } },
          { id: 'e2', fields: { amount: 26362, payMethod: 'bkash' } }
        ],
        expenses: [
          { id: 'x1', fields: { amount: 19295, payMethod: 'cash' } },
          { id: 'x2', fields: { amount: 11764.58, payMethod: 'bkash' } }
        ],
        recurringExpenses: [
          { id: 'r1', fields: { amount: 2340, payMethod: 'cash' } },
          { id: 'r2', fields: { amount: 716, payMethod: 'bkash' } }
        ],
        transfers: [
          { id: 't1', fields: { from: 'bkash', to: 'cash', requestedAmount: 7050, sourceDeducted: 7148.35 } },
          { id: 't2', fields: { from: 'cash', to: 'bkash', requestedAmount: 22, sourceDeducted: 22 } }
        ],
        people: [{ id: 'p1', fields: { name: 'Friend' } }],
        transactions: [
          // isOpening should be skipped
          { id: 'tx_seed', fields: { personId: 'p1', type: 'give', amount: 55, payMethod: 'cash', isOpening: true } },
          { id: 'tx1', fields: { personId: 'p1', type: 'take', amount: 6822, payMethod: 'cash', isOpening: false } },
          { id: 'tx2', fields: { personId: 'p1', type: 'give', amount: 4135, payMethod: 'cash', isOpening: false } },
          { id: 'tx3', fields: { personId: 'p1', type: 'take', amount: 1275, payMethod: 'bkash', isOpening: false } },
          { id: 'tx4', fields: { personId: 'p1', type: 'give', amount: 3937, payMethod: 'bkash', isOpening: false } }
        ]
      },
      integrity: { complete: true, counts: {} }
    };

    const domain = migrateBackupV1ToDomain(universalBackup as any);
    const summary = calculateFinancialSummary(
      domain.paymentMethods,
      domain.expenses,
      domain.recurringExpenses,
      domain.earnings,
      domain.transfers,
      domain.transactions,
      domain.people
    );

    const cashWallet = summary.walletBalances.find((w) => w.name.toLowerCase() === 'cash');
    const bkashWallet = summary.walletBalances.find((w) => w.name.toLowerCase().includes('bkash'));
    const nagadWallet = summary.walletBalances.find((w) => w.name.toLowerCase().includes('nagad'));

    const cashCorrect = cashWallet?.currentBalance === 120;
    const bkashCorrect = bkashWallet?.currentBalance === 4116.57;
    const nagadCorrect = nagadWallet?.currentBalance === 0;
    const totalCorrect = summary.liquidWalletTotal === 4236.57;

    const passed = cashCorrect && bkashCorrect && nagadCorrect && totalCorrect;

    results.push({
      name: 'Universal Account Balance Calculation Method (Cash ৳120, bKash ৳4116.57, Total ৳4236.57)',
      passed,
      actual: {
        cash: cashWallet?.currentBalance,
        bkash: bkashWallet?.currentBalance,
        nagad: nagadWallet?.currentBalance,
        total: summary.liquidWalletTotal
      },
      expected: { cash: 120, bkash: 4116.57, nagad: 0, total: 4236.57 }
    });
  } catch (e: any) {
    results.push({ name: 'Universal Account Balance Calculation Test', passed: false, error: e.message });
  }

  // Test 26: Consolidated Multi-Expense Voucher Generation & Calculation
  try {
    const testMethods: PaymentMethod[] = [
      { id: 'm_cash', name: 'Cash', type: 'cash', isBuiltIn: true, isActive: true, balance: 5000, openingBalance: 5000, createdAt: '', updatedAt: '' },
      { id: 'm_bkash', name: 'bKash', type: 'mobile_money', isBuiltIn: false, isActive: true, balance: 2000, openingBalance: 2000, createdAt: '', updatedAt: '' }
    ];

    const testActivities: UnifiedActivityItem[] = [
      {
        id: 'item_1',
        activityType: 'expense',
        title: 'Fish & Prawns',
        categoryOrSourceOrPerson: 'Bazaar',
        amount: 850,
        payMethodId: 'm_cash',
        date: '2026-11-04',
        timestamp: 1000
      },
      {
        id: 'item_2',
        activityType: 'expense',
        title: 'Vegetables & Spices',
        categoryOrSourceOrPerson: 'Bazaar',
        amount: 320,
        payMethodId: 'm_cash',
        date: '2026-11-04',
        timestamp: 1010
      },
      {
        id: 'item_3',
        activityType: 'expense',
        title: 'Supermarket Groceries',
        categoryOrSourceOrPerson: 'Groceries',
        amount: 1450,
        payMethodId: 'm_bkash',
        date: '2026-11-04',
        timestamp: 1020
      }
    ];

    const multiData = buildMultiVoucherData(
      testActivities,
      testMethods,
      [],
      'Fardin Hossain',
      'Kitchen Market Bazaar'
    );

    const totalPassed = multiData.totalAmount === 2620;
    const countPassed = multiData.totalCount === 3;
    const titlePassed = multiData.customTitle === 'Kitchen Market Bazaar';
    const dateCreatedPassed = Boolean(multiData.createdDate && multiData.createdDate.length > 5);
    const cashWallet = multiData.walletBreakdown.find((w) => w.walletName === 'Cash');
    const bkashWallet = multiData.walletBreakdown.find((w) => w.walletName === 'bKash');
    const walletsPassed = cashWallet?.amount === 1170 && bkashWallet?.amount === 1450;
    const refPassed = multiData.referenceId.startsWith('ECO-TX-');

    const passed = totalPassed && countPassed && titlePassed && dateCreatedPassed && walletsPassed && refPassed;

    results.push({
      name: 'Consolidated Multi-Expense Voucher (Total ৳2,620, Count 3, Custom Title & Created Date)',
      passed,
      actual: {
        totalAmount: multiData.totalAmount,
        totalCount: multiData.totalCount,
        customTitle: multiData.customTitle,
        hasCreatedDate: Boolean(multiData.createdDate),
        cashAmount: cashWallet?.amount,
        bkashAmount: bkashWallet?.amount
      },
      expected: {
        totalAmount: 2620,
        totalCount: 3,
        customTitle: 'Kitchen Market Bazaar',
        hasCreatedDate: true,
        cashAmount: 1170,
        bkashAmount: 1450
      }
    });
  } catch (e: any) {
    results.push({ name: 'Consolidated Multi-Expense Voucher Test', passed: false, error: e.message });
  }

  // Test 27: Person Share Token Distinctness & Exact Date Formatting
  try {
    const tokenA = encodePersonShareToken('person_rahim_101');
    const tokenB = encodePersonShareToken('person_karim_202');
    const tokensDifferent = tokenA !== tokenB;
    const decodedA = decodePersonShareToken(tokenA);
    const decodedB = decodePersonShareToken(tokenB);
    const decodeCorrect = decodedA === 'person_rahim_101' && decodedB === 'person_karim_202';
    const exactDate = formatExactDate('2026-11-05');
    const dateNeverRelative = exactDate === '05 Nov 2026' && !exactDate.includes('Today');

    results.push({
      name: 'Person Share Token Distinctness & Exact Date Verification',
      passed: tokensDifferent && decodeCorrect && dateNeverRelative,
      actual: { tokenA, tokenB, decodedA, decodedB, exactDate },
      expected: { decodedA: 'person_rahim_101', decodedB: 'person_karim_202', exactDate: '05 Nov 2026' }
    });
  } catch (e: any) {
    results.push({ name: 'Person Share Token Distinctness Test', passed: false, error: e.message });
  }

  // Test 28: Custom Bank & Multi-Wallet Balance Isolation
  try {
    const initialMethods: PaymentMethod[] = [
      { id: 'm_cash', name: 'Cash', type: 'cash', isBuiltIn: true, isActive: true, balance: 230, openingBalance: 230, createdAt: '', updatedAt: '' },
      { id: 'm_bkash', name: 'bKash', type: 'mobile_money', isBuiltIn: false, isActive: true, balance: 2195, openingBalance: 2195, createdAt: '', updatedAt: '' },
      { id: 'm_nagad', name: 'Nagad', type: 'mobile_money', isBuiltIn: false, isActive: true, balance: 132, openingBalance: 132, createdAt: '', updatedAt: '' }
    ];

    const extraBank: PaymentMethod = {
      id: 'method_city_bank',
      name: 'City Bank',
      type: 'bank',
      isBuiltIn: false,
      isActive: true,
      balance: 5000,
      openingBalance: 5000,
      createdAt: '',
      updatedAt: '',
      legacyNames: ['City Bank', 'city bank', 'CityBank']
    };

    const allMethods = [...initialMethods, extraBank];

    const testExpenses: ExpenseRecord[] = [
      { id: 'e_bank', reason: 'Office Equipment', category: 'Office', description: '', amount: 1000, type: 'regular', payMethodId: 'method_city_bank', date: '2026-11-05', timestamp: 100 },
      { id: 'e_bkash', reason: 'Dinner', category: 'Food', description: '', amount: 195, type: 'regular', payMethodId: 'm_bkash', date: '2026-11-05', timestamp: 200 }
    ];

    const summaryRes = calculateFinancialSummary(
      allMethods,
      testExpenses,
      [],
      [],
      [],
      [],
      []
    );

    const cashRes = summaryRes.walletBalances.find((w) => w.name === 'Cash');
    const bkashRes = summaryRes.walletBalances.find((w) => w.name === 'bKash');
    const nagadRes = summaryRes.walletBalances.find((w) => w.name === 'Nagad');
    const bankRes = summaryRes.walletBalances.find((w) => w.name === 'City Bank');

    const cashOk = cashRes?.currentBalance === 230;
    const bkashOk = bkashRes?.currentBalance === 2000;
    const nagadOk = nagadRes?.currentBalance === 132;
    const bankOk = bankRes?.currentBalance === 4000;
    const totalOk = summaryRes.liquidWalletTotal === 6362;
    const countOk = summaryRes.walletBalances.length === 4;

    results.push({
      name: 'Custom Bank & Multi-Wallet Balance Isolation (Cash, bKash, Nagad preserved without drift)',
      passed: cashOk && bkashOk && nagadOk && bankOk && totalOk && countOk,
      actual: {
        cash: cashRes?.currentBalance,
        bkash: bkashRes?.currentBalance,
        nagad: nagadRes?.currentBalance,
        bank: bankRes?.currentBalance,
        liquidTotal: summaryRes.liquidWalletTotal,
        walletCount: summaryRes.walletBalances.length
      },
      expected: {
        cash: 230,
        bkash: 2000,
        nagad: 132,
        bank: 4000,
        liquidTotal: 6362,
        walletCount: 4
      }
    });
  } catch (e: any) {
    results.push({ name: 'Custom Bank Multi-Wallet Test', passed: false, error: e.message });
  }

  // Smart Settlement Engine Acceptance Tests
  try {
    results.push(...runAllSettlementTests());
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test Suite', passed: false, error: e.message });
  }

  return results;
}
