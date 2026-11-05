/**
 * EcO — Smart Settlement Automated Regression Test Suite
 * Acceptance criteria tests covering Section 12 & Edge cases from the brief.
 */

import {
  SettlementMember,
  SettlementExpense,
  SettlementPayment,
  SettlementRefund
} from './settlementTypes';
import {
  takaToPoisha,
  poishaToTaka,
  calculateExpenseSplits,
  validateExpensePayers,
  validateMoneyInput,
  calculateSettlementSummary
} from './settlementEngine';

export interface SettlementTestResult {
  name: string;
  passed: boolean;
  actual?: any;
  expected?: any;
  error?: string;
}

export function runAllSettlementTests(): SettlementTestResult[] {
  const results: SettlementTestResult[] = [];

  // --------------------------------------------------------------------------
  // TEST 1: Friends Trip (Main Scenario)
  // --------------------------------------------------------------------------
  try {
    const members: SettlementMember[] = [
      { id: 'm_fardin', name: 'Fardin', isMe: true, isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_rahat', name: 'Rahat', isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_nisa', name: 'Nisa', isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_anika', name: 'Anika', isActive: true, joinedAt: '2026-11-04' }
    ];

    // Expense 1: Going Rickshaw ৳50, paid by Rahat, participants Fardin & Rahat, equal
    const exp1Splits = calculateExpenseSplits(5000, ['m_fardin', 'm_rahat'], 'equal');
    const exp1: SettlementExpense = {
      id: 'exp_1',
      settlementId: 'set_friends',
      title: 'Going Rickshaw',
      totalPoisha: 5000,
      date: '2026-11-04',
      payers: [{ memberId: 'm_rahat', amountPoisha: 5000 }],
      participantIds: ['m_fardin', 'm_rahat'],
      splitMethod: 'equal',
      splits: exp1Splits,
      createdAt: 1000,
      updatedAt: 1000
    };

    // Expense 2: Tickets ৳120, paid by Fardin, all four, equal
    const exp2Splits = calculateExpenseSplits(12000, ['m_fardin', 'm_rahat', 'm_nisa', 'm_anika'], 'equal');
    const exp2: SettlementExpense = {
      id: 'exp_2',
      settlementId: 'set_friends',
      title: 'Tickets',
      totalPoisha: 12000,
      date: '2026-11-04',
      payers: [{ memberId: 'm_fardin', amountPoisha: 12000 }],
      participantIds: ['m_fardin', 'm_rahat', 'm_nisa', 'm_anika'],
      splitMethod: 'equal',
      splits: exp2Splits,
      createdAt: 1010,
      updatedAt: 1010
    };

    // Expense 3: Food ৳1,050, paid by Nisa, all four, equal
    const exp3Splits = calculateExpenseSplits(105000, ['m_fardin', 'm_rahat', 'm_nisa', 'm_anika'], 'equal');
    const exp3: SettlementExpense = {
      id: 'exp_3',
      settlementId: 'set_friends',
      title: 'Food',
      totalPoisha: 105000,
      date: '2026-11-04',
      payers: [{ memberId: 'm_nisa', amountPoisha: 105000 }],
      participantIds: ['m_fardin', 'm_rahat', 'm_nisa', 'm_anika'],
      splitMethod: 'equal',
      splits: exp3Splits,
      createdAt: 1020,
      updatedAt: 1020
    };

    // Expense 4: Return Rickshaw ৳50, paid by Fardin, participants Fardin, Rahat, Anika (in that order), equal
    const exp4Splits = calculateExpenseSplits(5000, ['m_fardin', 'm_rahat', 'm_anika'], 'equal');
    const exp4: SettlementExpense = {
      id: 'exp_4',
      settlementId: 'set_friends',
      title: 'Return Rickshaw',
      totalPoisha: 5000,
      date: '2026-11-04',
      payers: [{ memberId: 'm_fardin', amountPoisha: 5000 }],
      participantIds: ['m_fardin', 'm_rahat', 'm_anika'],
      splitMethod: 'equal',
      splits: exp4Splits,
      createdAt: 1030,
      updatedAt: 1030
    };

    const summary = calculateSettlementSummary('set_friends', members, [exp1, exp2, exp3, exp4]);

    const fardin = summary.memberBalances.find((m) => m.memberId === 'm_fardin');
    const rahat = summary.memberBalances.find((m) => m.memberId === 'm_rahat');
    const nisa = summary.memberBalances.find((m) => m.memberId === 'm_nisa');
    const anika = summary.memberBalances.find((m) => m.memberId === 'm_anika');

    const totalPassed = summary.totalExpenses === 1270;
    const fardinPassed = fardin?.totalPaid === 170.0 && fardin?.totalShare === 334.17 && fardin?.netBalance === -164.17;
    const rahatPassed = rahat?.totalPaid === 50.0 && rahat?.totalShare === 334.17 && rahat?.netBalance === -284.17;
    const nisaPassed = nisa?.totalPaid === 1050.0 && nisa?.totalShare === 292.5 && nisa?.netBalance === 757.5;
    const anikaPassed = anika?.totalPaid === 0.0 && anika?.totalShare === 309.16 && anika?.netBalance === -309.16;
    const invariantPassed = summary.zeroSumInvariantPassed;
    const transfersCountPassed = summary.suggestedTransfers.length === 3;

    const passed = totalPassed && fardinPassed && rahatPassed && nisaPassed && anikaPassed && invariantPassed && transfersCountPassed;

    results.push({
      name: 'Smart Settlement Test 1: Friends Trip (Fardin -164.17, Rahat -284.17, Nisa +757.50, Anika -309.16)',
      passed,
      actual: {
        total: summary.totalExpenses,
        fardin: { paid: fardin?.totalPaid, share: fardin?.totalShare, net: fardin?.netBalance },
        rahat: { paid: rahat?.totalPaid, share: rahat?.totalShare, net: rahat?.netBalance },
        nisa: { paid: nisa?.totalPaid, share: nisa?.totalShare, net: nisa?.netBalance },
        anika: { paid: anika?.totalPaid, share: anika?.totalShare, net: anika?.netBalance },
        transfers: summary.suggestedTransfers.length
      },
      expected: {
        total: 1270,
        fardin: { paid: 170.0, share: 334.17, net: -164.17 },
        rahat: { paid: 50.0, share: 334.17, net: -284.17 },
        nisa: { paid: 1050.0, share: 292.5, net: 757.5 },
        anika: { paid: 0.0, share: 309.16, net: -309.16 },
        transfers: 3
      }
    });
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test 1: Friends Trip', passed: false, error: e.message });
  }

  // --------------------------------------------------------------------------
  // TEST 2: Multiple Payers (A paid 600, B paid 400, total 1000, equal among A, B, C)
  // --------------------------------------------------------------------------
  try {
    const members: SettlementMember[] = [
      { id: 'm_a', name: 'A', isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_b', name: 'B', isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_c', name: 'C', isActive: true, joinedAt: '2026-11-04' }
    ];

    const splits = calculateExpenseSplits(100000, ['m_a', 'm_b', 'm_c'], 'equal');
    const exp: SettlementExpense = {
      id: 'exp_multipay',
      settlementId: 'set_multi',
      title: 'Shared Dinner',
      totalPoisha: 100000,
      date: '2026-11-04',
      payers: [
        { memberId: 'm_a', amountPoisha: 60000 },
        { memberId: 'm_b', amountPoisha: 40000 }
      ],
      participantIds: ['m_a', 'm_b', 'm_c'],
      splitMethod: 'equal',
      splits,
      createdAt: 2000,
      updatedAt: 2000
    };

    const summary = calculateSettlementSummary('set_multi', members, [exp]);

    const a = summary.memberBalances.find((m) => m.memberId === 'm_a');
    const b = summary.memberBalances.find((m) => m.memberId === 'm_b');
    const c = summary.memberBalances.find((m) => m.memberId === 'm_c');

    const passed =
      a?.totalShare === 333.34 &&
      b?.totalShare === 333.33 &&
      c?.totalShare === 333.33 &&
      a?.netBalance === 266.66 &&
      b?.netBalance === 66.67 &&
      c?.netBalance === -333.33 &&
      summary.zeroSumInvariantPassed;

    results.push({
      name: 'Smart Settlement Test 2: Multiple Payers (A +266.66, B +66.67, C -333.33)',
      passed,
      actual: { aNet: a?.netBalance, bNet: b?.netBalance, cNet: c?.netBalance },
      expected: { aNet: 266.66, bNet: 66.67, cNet: -333.33 }
    });
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test 2: Multiple Payers', passed: false, error: e.message });
  }

  // --------------------------------------------------------------------------
  // TEST 3: Non-Participant Payer (৳500 paid by A; participants B, C equal)
  // --------------------------------------------------------------------------
  try {
    const members: SettlementMember[] = [
      { id: 'm_a', name: 'A', isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_b', name: 'B', isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_c', name: 'C', isActive: true, joinedAt: '2026-11-04' }
    ];

    const splits = calculateExpenseSplits(50000, ['m_b', 'm_c'], 'equal');
    const exp: SettlementExpense = {
      id: 'exp_nonpart',
      settlementId: 'set_nonpart',
      title: 'Gift',
      totalPoisha: 50000,
      date: '2026-11-04',
      payers: [{ memberId: 'm_a', amountPoisha: 50000 }],
      participantIds: ['m_b', 'm_c'],
      splitMethod: 'equal',
      splits,
      createdAt: 3000,
      updatedAt: 3000
    };

    const summary = calculateSettlementSummary('set_nonpart', members, [exp]);

    const a = summary.memberBalances.find((m) => m.memberId === 'm_a');
    const b = summary.memberBalances.find((m) => m.memberId === 'm_b');
    const c = summary.memberBalances.find((m) => m.memberId === 'm_c');

    const passed =
      a?.totalShare === 0 &&
      b?.totalShare === 250 &&
      c?.totalShare === 250 &&
      a?.netBalance === 500 &&
      b?.netBalance === -250 &&
      c?.netBalance === -250 &&
      summary.zeroSumInvariantPassed;

    results.push({
      name: 'Smart Settlement Test 3: Non-Participant Payer (A +500, B -250, C -250)',
      passed,
      actual: { aNet: a?.netBalance, bNet: b?.netBalance, cNet: c?.netBalance },
      expected: { aNet: 500, bNet: -250, cNet: -250 }
    });
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test 3: Non-Participant Payer', passed: false, error: e.message });
  }

  // --------------------------------------------------------------------------
  // TEST 4: Percentage Split (৳1,000 paid by A; A 50%, B 30%, C 20%)
  // --------------------------------------------------------------------------
  try {
    const splits = calculateExpenseSplits(100000, ['m_a', 'm_b', 'm_c'], 'percentage', [
      { memberId: 'm_a', value: 50 },
      { memberId: 'm_b', value: 30 },
      { memberId: 'm_c', value: 20 }
    ]);

    const sA = splits.find((s) => s.memberId === 'm_a')?.allocatedPoisha;
    const sB = splits.find((s) => s.memberId === 'm_b')?.allocatedPoisha;
    const sC = splits.find((s) => s.memberId === 'm_c')?.allocatedPoisha;

    const passed = sA === 50000 && sB === 30000 && sC === 20000;

    results.push({
      name: 'Smart Settlement Test 4: Percentage Split (50% ৳500, 30% ৳300, 20% ৳200)',
      passed,
      actual: { a: poishaToTaka(sA!), b: poishaToTaka(sB!), c: poishaToTaka(sC!) },
      expected: { a: 500, b: 300, c: 200 }
    });
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test 4: Percentage Split', passed: false, error: e.message });
  }

  // --------------------------------------------------------------------------
  // TEST 5: Weighted / Shares Split (৳400 paid by A; weights A2, B1, C1)
  // --------------------------------------------------------------------------
  try {
    const splits = calculateExpenseSplits(40000, ['m_a', 'm_b', 'm_c'], 'weighted', [
      { memberId: 'm_a', value: 2 },
      { memberId: 'm_b', value: 1 },
      { memberId: 'm_c', value: 1 }
    ]);

    const sA = splits.find((s) => s.memberId === 'm_a')?.allocatedPoisha;
    const sB = splits.find((s) => s.memberId === 'm_b')?.allocatedPoisha;
    const sC = splits.find((s) => s.memberId === 'm_c')?.allocatedPoisha;

    const passed = sA === 20000 && sB === 10000 && sC === 10000;

    results.push({
      name: 'Smart Settlement Test 5: Weighted Split (A2: ৳200, B1: ৳100, C1: ৳100)',
      passed,
      actual: { a: poishaToTaka(sA!), b: poishaToTaka(sB!), c: poishaToTaka(sC!) },
      expected: { a: 200, b: 100, c: 100 }
    });
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test 5: Weighted Split', passed: false, error: e.message });
  }

  // --------------------------------------------------------------------------
  // TEST 6: Partial Settlement (A owes B ৳500; A pays ৳200 -> A debt ৳300; B receivable ৳300)
  // --------------------------------------------------------------------------
  try {
    const members: SettlementMember[] = [
      { id: 'm_b', name: 'B', isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_a', name: 'A', isActive: true, joinedAt: '2026-11-04' }
    ];

    const splits = calculateExpenseSplits(50000, ['m_a'], 'equal');
    const exp: SettlementExpense = {
      id: 'exp_loan',
      settlementId: 'set_part',
      title: 'Advance',
      totalPoisha: 50000,
      date: '2026-11-04',
      payers: [{ memberId: 'm_b', amountPoisha: 50000 }],
      participantIds: ['m_a'],
      splitMethod: 'equal',
      splits,
      createdAt: 4000,
      updatedAt: 4000
    };

    const pmt: SettlementPayment = {
      id: 'pmt_1',
      settlementId: 'set_part',
      fromMemberId: 'm_a',
      toMemberId: 'm_b',
      amountPoisha: 20000,
      date: '2026-11-04',
      createdAt: 4010
    };

    const summary = calculateSettlementSummary('set_part', members, [exp], [pmt]);

    const a = summary.memberBalances.find((m) => m.memberId === 'm_a');
    const b = summary.memberBalances.find((m) => m.memberId === 'm_b');

    const passed =
      a?.netBalance === -300 &&
      b?.netBalance === 300 &&
      summary.suggestedTransfers.length === 1 &&
      summary.suggestedTransfers[0].amount === 300 &&
      summary.zeroSumInvariantPassed;

    results.push({
      name: 'Smart Settlement Test 6: Partial Settlement (A owes ৳300; B receives ৳300)',
      passed,
      actual: { aNet: a?.netBalance, bNet: b?.netBalance, suggested: summary.suggestedTransfers[0]?.amount },
      expected: { aNet: -300, bNet: 300, suggested: 300 }
    });
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test 6: Partial Settlement', passed: false, error: e.message });
  }

  // --------------------------------------------------------------------------
  // TEST 7: All Settled (A owes B ৳300; A pays ৳300 -> both ৳0, no suggestions)
  // --------------------------------------------------------------------------
  try {
    const members: SettlementMember[] = [
      { id: 'm_b', name: 'B', isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_a', name: 'A', isActive: true, joinedAt: '2026-11-04' }
    ];

    const splits = calculateExpenseSplits(30000, ['m_a'], 'equal');
    const exp: SettlementExpense = {
      id: 'exp_loan2',
      settlementId: 'set_all',
      title: 'Advance',
      totalPoisha: 30000,
      date: '2026-11-04',
      payers: [{ memberId: 'm_b', amountPoisha: 30000 }],
      participantIds: ['m_a'],
      splitMethod: 'equal',
      splits,
      createdAt: 5000,
      updatedAt: 5000
    };

    const pmt: SettlementPayment = {
      id: 'pmt_full',
      settlementId: 'set_all',
      fromMemberId: 'm_a',
      toMemberId: 'm_b',
      amountPoisha: 30000,
      date: '2026-11-04',
      createdAt: 5010
    };

    const summary = calculateSettlementSummary('set_all', members, [exp], [pmt]);

    const a = summary.memberBalances.find((m) => m.memberId === 'm_a');
    const b = summary.memberBalances.find((m) => m.memberId === 'm_b');

    const passed =
      a?.netBalance === 0 &&
      b?.netBalance === 0 &&
      summary.isAllSettled &&
      summary.suggestedTransfers.length === 0 &&
      summary.zeroSumInvariantPassed;

    results.push({
      name: 'Smart Settlement Test 7: All Settled (Both ৳0.00, isAllSettled=true, 0 transfers)',
      passed,
      actual: { aNet: a?.netBalance, bNet: b?.netBalance, isAllSettled: summary.isAllSettled },
      expected: { aNet: 0, bNet: 0, isAllSettled: true }
    });
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test 7: All Settled', passed: false, error: e.message });
  }

  // --------------------------------------------------------------------------
  // TEST 8: Refund Allocation & Accounting
  // --------------------------------------------------------------------------
  try {
    const members: SettlementMember[] = [
      { id: 'm_a', name: 'A', isActive: true, joinedAt: '2026-11-04' },
      { id: 'm_b', name: 'B', isActive: true, joinedAt: '2026-11-04' }
    ];

    const splits = calculateExpenseSplits(20000, ['m_a', 'm_b'], 'equal');
    const exp: SettlementExpense = {
      id: 'exp_hotel',
      settlementId: 'set_ref',
      title: 'Hotel Deposit',
      totalPoisha: 20000,
      date: '2026-11-04',
      payers: [{ memberId: 'm_a', amountPoisha: 20000 }],
      participantIds: ['m_a', 'm_b'],
      splitMethod: 'equal',
      splits,
      createdAt: 6000,
      updatedAt: 6000
    };

    // Refund ৳50 allocated equally (25 to A, 25 to B); A collects the refund cash
    const ref: SettlementRefund = {
      id: 'ref_1',
      settlementId: 'set_ref',
      expenseId: 'exp_hotel',
      amountPoisha: 5000,
      receiverMemberId: 'm_a',
      participantIds: ['m_a', 'm_b'],
      refundSplits: [
        { memberId: 'm_a', reductionPoisha: 2500 },
        { memberId: 'm_b', reductionPoisha: 2500 }
      ],
      date: '2026-11-04',
      createdAt: 6010
    };

    const summary = calculateSettlementSummary('set_ref', members, [exp], [], [ref]);

    const a = summary.memberBalances.find((m) => m.memberId === 'm_a');
    const b = summary.memberBalances.find((m) => m.memberId === 'm_b');

    // Effective shares are 75 each; A collected 50 cash back; A net = +75, B net = -75
    const passed =
      a?.totalShare === 75 &&
      b?.totalShare === 75 &&
      a?.netBalance === 75 &&
      b?.netBalance === -75 &&
      summary.zeroSumInvariantPassed;

    results.push({
      name: 'Smart Settlement Test 8: Refund Accounting (Effective ৳150, shares 75/75, exact zero-sum)',
      passed,
      actual: { aShare: a?.totalShare, bShare: b?.totalShare, aNet: a?.netBalance, bNet: b?.netBalance },
      expected: { aShare: 75, bShare: 75, aNet: 75, bNet: -75 }
    });
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test 8: Refund Accounting', passed: false, error: e.message });
  }

  // --------------------------------------------------------------------------
  // TEST 9: Input Validation & Edge Case Rejections
  // --------------------------------------------------------------------------
  try {
    const valid1 = validateMoneyInput('100.50').isValid;
    const valid2 = validateMoneyInput('25').isValid;
    const invalid3Decimals = !validateMoneyInput('100.555').isValid;
    const invalidLetters = !validateMoneyInput('abc').isValid;
    const invalidNegative = !validateMoneyInput('-50').isValid;
    const invalidZero = !validateMoneyInput('0').isValid;

    let payersRejected = false;
    try {
      validateExpensePayers([{ memberId: 'm_1', amountPoisha: 4000 }], 5000);
    } catch {
      payersRejected = true;
    }

    let pctRejected = false;
    try {
      calculateExpenseSplits(10000, ['m_1', 'm_2'], 'percentage', [
        { memberId: 'm_1', value: 60 },
        { memberId: 'm_2', value: 30 } // Total 90% != 100%
      ]);
    } catch {
      pctRejected = true;
    }

    const passed =
      valid1 &&
      valid2 &&
      invalid3Decimals &&
      invalidLetters &&
      invalidNegative &&
      invalidZero &&
      payersRejected &&
      pctRejected;

    results.push({
      name: 'Smart Settlement Test 9: Strict Input & Financial Validation Rejections',
      passed,
      actual: { valid1, valid2, invalid3Decimals, invalidLetters, payersRejected, pctRejected },
      expected: { valid1: true, valid2: true, invalid3Decimals: true, invalidLetters: true, payersRejected: true, pctRejected: true }
    });
  } catch (e: any) {
    results.push({ name: 'Smart Settlement Test 9: Validation', passed: false, error: e.message });
  }

  return results;
}
