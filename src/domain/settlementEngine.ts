/**
 * EcO — Smart Settlement Calculation Engine
 * Pure integer-arithmetic (poisha) financial split and debt-resolution engine.
 * 
 * Rules:
 * 1. 1 Taka = 100 poisha. Never use floating-point arithmetic for balance calculations.
 * 2. Deterministic remainder distribution: Leftover poisha are given 1-by-1 to participants
 *    in the stable order they were specified.
 * 3. Zero-sum invariant: The sum of all member net balances must always equal zero.
 * 4. Greedy minimal transfer settlement planner.
 */

import {
  SettlementMember,
  SettlementExpense,
  SettlementPayment,
  SettlementRefund,
  SplitMethod,
  ExpensePayer,
  ExpenseParticipantSplit,
  MemberCalculationBreakdown,
  MemberExpenseBreakdownItem,
  SuggestedPaymentTransfer,
  SettlementCalculationSummary,
  SmartSettlement
} from './settlementTypes';

// ============================================================================
// CURRENCY & INTEGER HELPERS
// ============================================================================

/**
 * Converts decimal Taka to integer poisha safely without floating point rounding error.
 * e.g. 50.50 -> 5050, 100 -> 10000, 16.67 -> 1667.
 */
export function takaToPoisha(taka: number | string): number {
  if (typeof taka === 'number') {
    if (isNaN(taka) || !isFinite(taka)) {
      throw new Error('Invalid financial amount: not a finite number');
    }
    return Math.round(taka * 100);
  }
  const clean = taka.trim();
  if (!clean || !/^-?\d+(\.\d{1,2})?$/.test(clean)) {
    throw new Error(`Invalid financial format: "${clean}". Expected maximum 2 decimal places.`);
  }
  const parts = clean.split('.');
  const whole = parseInt(parts[0], 10);
  const frac = parts[1] ? parts[1].padEnd(2, '0') : '00';
  const sign = clean.startsWith('-') ? -1 : 1;
  const absWhole = Math.abs(whole);
  return sign * (absWhole * 100 + parseInt(frac, 10));
}

/**
 * Converts integer poisha to decimal Taka for display.
 * e.g. 5050 -> 50.5, 1667 -> 16.67.
 */
export function poishaToTaka(poisha: number): number {
  return poisha / 100;
}

/**
 * Safely extracts total poisha from an expense regardless of alias name.
 */
export function getExpenseTotalPoisha(exp: SettlementExpense): number {
  return exp.totalAmountPoisha ?? exp.totalPoisha ?? 0;
}

/**
 * Safely extracts participant member IDs from an expense regardless of alias name.
 */
export function getExpenseParticipants(exp: SettlementExpense): string[] {
  return exp.participantMemberIds ?? exp.participantIds ?? [];
}

/**
 * Validates a user string input for money entry.
 */
export function validateMoneyInput(input: string): { isValid: boolean; poisha?: number; error?: string } {
  const trimmed = input.trim();
  if (!trimmed) {
    return { isValid: false, error: 'Amount is required' };
  }
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
    if (/\.\d{3,}/.test(trimmed)) {
      return { isValid: false, error: 'Maximum 2 decimal places allowed (poisha)' };
    }
    return { isValid: false, error: 'Please enter a valid positive amount' };
  }
  try {
    const poisha = takaToPoisha(trimmed);
    if (poisha <= 0) {
      return { isValid: false, error: 'Amount must be greater than zero' };
    }
    return { isValid: true, poisha };
  } catch (err: any) {
    return { isValid: false, error: err.message || 'Invalid amount' };
  }
}

// ============================================================================
// SPLIT ALLOCATION CALCULATORS
// ============================================================================

/**
 * Allocates totalPoisha among participants based on the chosen split method.
 * Guaranteed to sum to totalPoisha exactly with deterministic remainder handling.
 */
export function calculateExpenseSplits(
  totalPoisha: number,
  participantIds: string[],
  splitMethod: SplitMethod,
  splitInputs?: { memberId: string; value?: number }[] | any
): ExpenseParticipantSplit[] {
  if (totalPoisha <= 0) {
    throw new Error('Expense amount must be greater than zero');
  }
  if (!participantIds || participantIds.length === 0) {
    throw new Error('At least one participant is required');
  }

  let normalizedInputs: { memberId: string; value?: number }[] | undefined = undefined;
  if (Array.isArray(splitInputs)) {
    normalizedInputs = splitInputs;
  } else if (splitInputs && typeof splitInputs === 'object') {
    if (splitInputs.exactAmounts) {
      normalizedInputs = Object.entries(splitInputs.exactAmounts).map(([memberId, value]) => ({
        memberId,
        value: typeof value === 'number' ? value : 0
      }));
    } else if (splitInputs.percentages) {
      normalizedInputs = Object.entries(splitInputs.percentages).map(([memberId, value]) => ({
        memberId,
        value: typeof value === 'number' ? value : 0
      }));
    } else if (splitInputs.weights) {
      normalizedInputs = Object.entries(splitInputs.weights).map(([memberId, value]) => ({
        memberId,
        value: typeof value === 'number' ? value : 1
      }));
    } else if (splitInputs.customAdjustments) {
      normalizedInputs = Object.entries(splitInputs.customAdjustments).map(([memberId, value]) => ({
        memberId,
        value: typeof value === 'number' ? value : 0
      }));
    }
  }

  const n = participantIds.length;

  // 1. EQUAL SPLIT
  if (splitMethod === 'equal') {
    const baseShare = Math.floor(totalPoisha / n);
    const remainder = totalPoisha % n;

    return participantIds.map((memberId, idx) => ({
      memberId,
      allocatedPoisha: idx < remainder ? baseShare + 1 : baseShare
    }));
  }

  // 2. EXACT SPLIT (values provided in poisha)
  if (splitMethod === 'exact') {
    if (!normalizedInputs || normalizedInputs.length === 0) {
      throw new Error('Exact share amounts must be provided for all participants');
    }
    let sum = 0;
    const splits: ExpenseParticipantSplit[] = participantIds.map((memberId) => {
      const input = normalizedInputs!.find((s) => s.memberId === memberId);
      const val = input?.value !== undefined ? Math.round(input.value) : 0;
      if (val < 0) {
        throw new Error('Individual shares cannot be negative');
      }
      sum += val;
      return {
        memberId,
        value: val,
        allocatedPoisha: val
      };
    });

    if (sum !== totalPoisha) {
      const diff = poishaToTaka(Math.abs(totalPoisha - sum));
      const direction = sum < totalPoisha ? 'under by' : 'over by';
      throw new Error(`Total of exact shares (৳${poishaToTaka(sum).toFixed(2)}) is ${direction} ৳${diff.toFixed(2)}.`);
    }
    return splits;
  }

  // 3. CUSTOM SPLIT (either exact shares or base equal + offsets)
  if (splitMethod === 'custom') {
    if (!normalizedInputs || normalizedInputs.length === 0) {
      // Fallback to equal split if no adjustments
      const baseShare = Math.floor(totalPoisha / n);
      const remainder = totalPoisha % n;
      return participantIds.map((memberId, idx) => ({
        memberId,
        allocatedPoisha: idx < remainder ? baseShare + 1 : baseShare
      }));
    }

    const inputSum = normalizedInputs.reduce((sum, inp) => sum + (inp.value || 0), 0);
    // If the inputs sum directly to totalPoisha, treat as exact allocations
    if (inputSum === totalPoisha) {
      return participantIds.map((memberId) => {
        const input = normalizedInputs!.find((s) => s.memberId === memberId);
        const val = input?.value !== undefined ? Math.round(input.value) : 0;
        return {
          memberId,
          value: val,
          allocatedPoisha: val
        };
      });
    }

    // Otherwise, treat inputs as adjustments (+ / -) against base equal share
    const totalAdjustments = inputSum;
    const remainingToSplit = totalPoisha - totalAdjustments;
    const baseShare = Math.floor(remainingToSplit / n);
    const remainder = ((remainingToSplit % n) + n) % n;

    return participantIds.map((memberId, idx) => {
      const inp = normalizedInputs!.find((s) => s.memberId === memberId);
      const adj = inp?.value !== undefined ? Math.round(inp.value) : 0;
      const extra = idx < remainder ? 1 : 0;
      const allocated = Math.max(0, baseShare + extra + adj);
      return {
        memberId,
        value: adj,
        allocatedPoisha: allocated
      };
    });
  }

  // 4. PERCENTAGE SPLIT
  if (splitMethod === 'percentage') {
    if (!normalizedInputs || normalizedInputs.length === 0) {
      throw new Error('Percentages must be provided for all participants');
    }
    let totalPct = 0;
    normalizedInputs.forEach((s) => {
      if (s.value === undefined || s.value < 0) {
        throw new Error('Percentages cannot be negative');
      }
      totalPct += s.value;
    });

    if (Math.round(totalPct * 100) !== 10000) {
      throw new Error(`Percentages must total exactly 100% (currently ${totalPct.toFixed(2)}%)`);
    }

    // Allocate base poisha and track fractional remainders
    const rawShares = participantIds.map((memberId) => {
      const inp = normalizedInputs!.find((s) => s.memberId === memberId);
      const pct = inp?.value || 0;
      const rawExact = (totalPoisha * pct) / 100;
      const floorVal = Math.floor(rawExact);
      const fraction = rawExact - floorVal;
      return {
        memberId,
        pct,
        floorVal,
        fraction
      };
    });

    const allocatedSum = rawShares.reduce((acc, r) => acc + r.floorVal, 0);
    const remainder = totalPoisha - allocatedSum;

    // Distribute remainder poisha by largest fraction, breaking ties by participant order
    const sortedIndices = rawShares
      .map((r, originalIdx) => ({ fraction: r.fraction, originalIdx }))
      .sort((a, b) => b.fraction - a.fraction || a.originalIdx - b.originalIdx);

    const bonusIndices = new Set(sortedIndices.slice(0, remainder).map((s) => s.originalIdx));

    return rawShares.map((r, idx) => ({
      memberId: r.memberId,
      value: r.pct,
      allocatedPoisha: bonusIndices.has(idx) ? r.floorVal + 1 : r.floorVal
    }));
  }

  // 5. WEIGHTED / SHARES SPLIT
  if (splitMethod === 'weighted') {
    if (!normalizedInputs || normalizedInputs.length === 0) {
      throw new Error('Weights must be provided for all participants');
    }
    let totalWeight = 0;
    normalizedInputs.forEach((s) => {
      const w = s.value !== undefined ? s.value : 1;
      if (w <= 0) {
        throw new Error('Weights must be greater than zero');
      }
      totalWeight += w;
    });

    if (totalWeight <= 0) {
      throw new Error('Total weight must be positive');
    }

    const rawShares = participantIds.map((memberId) => {
      const inp = normalizedInputs!.find((s) => s.memberId === memberId);
      const weight = inp?.value !== undefined && inp.value > 0 ? inp.value : 1;
      const rawExact = (totalPoisha * weight) / totalWeight;
      const floorVal = Math.floor(rawExact);
      const fraction = rawExact - floorVal;
      return {
        memberId,
        weight,
        floorVal,
        fraction
      };
    });

    const allocatedSum = rawShares.reduce((acc, r) => acc + r.floorVal, 0);
    const remainder = totalPoisha - allocatedSum;

    const sortedIndices = rawShares
      .map((r, originalIdx) => ({ fraction: r.fraction, originalIdx }))
      .sort((a, b) => b.fraction - a.fraction || a.originalIdx - b.originalIdx);

    const bonusIndices = new Set(sortedIndices.slice(0, remainder).map((s) => s.originalIdx));

    return rawShares.map((r, idx) => ({
      memberId: r.memberId,
      value: r.weight,
      allocatedPoisha: bonusIndices.has(idx) ? r.floorVal + 1 : r.floorVal
    }));
  }

  throw new Error(`Unsupported split method: ${splitMethod}`);
}

/**
 * Validates that payers total equals expense total.
 */
export function validateExpensePayers(payers: ExpensePayer[], totalPoisha: number): void {
  if (!payers || payers.length === 0) {
    throw new Error('At least one payer must be specified');
  }
  let sum = 0;
  payers.forEach((p) => {
    if (p.amountPoisha <= 0) {
      throw new Error('Payer amount must be greater than zero');
    }
    sum += p.amountPoisha;
  });
  if (sum !== totalPoisha) {
    const diff = poishaToTaka(Math.abs(totalPoisha - sum));
    const direction = sum < totalPoisha ? 'under' : 'over';
    throw new Error(`Sum of payer amounts (৳${poishaToTaka(sum).toFixed(2)}) is ${direction} by ৳${diff.toFixed(2)}.`);
  }
}

// ============================================================================
// MAIN FINANCIAL ENGINE & SETTLEMENT PLANNER
// ============================================================================

/**
 * Distributes odd remainder poisha deterministically 1-by-1 among participants.
 */
export function distributePoishaRemainder(
  totalPoisha: number,
  participantIds: string[],
  shares: Record<string, number>
): void {
  const currentSum = Object.values(shares).reduce((a, b) => a + b, 0);
  let remainder = totalPoisha - currentSum;
  let idx = 0;
  while (remainder > 0 && idx < participantIds.length) {
    shares[participantIds[idx]] = (shares[participantIds[idx]] || 0) + 1;
    remainder--;
    idx++;
  }
}

/**
 * Pure calculation engine function.
 * Given members, expenses, refunds, and payments (or a SmartSettlement object),
 * computes exact balances, verifies zero-sum invariant, and generates minimal suggested settlement transfers.
 */
export function calculateSettlementSummary(
  settlementOrId: SmartSettlement | string,
  rawMembers?: SettlementMember[],
  rawExpenses?: SettlementExpense[],
  rawPayments: SettlementPayment[] = [],
  rawRefunds: SettlementRefund[] = []
): SettlementCalculationSummary & {
  totalSpentPoisha: number;
  totalSpent: number;
  allSettled: boolean;
  memberSummaries: Record<
    string,
    {
      memberId: string;
      totalPaidPoisha: number;
      totalOwedPoisha: number;
      paymentsSentPoisha: number;
      paymentsReceivedPoisha: number;
      refundCashHeldPoisha: number;
      netBalancePoisha: number;
    }
  >;
} {
  let settlementId: string;
  let members: SettlementMember[];
  let expenses: SettlementExpense[];
  let payments: SettlementPayment[];
  let refunds: SettlementRefund[];

  if (typeof settlementOrId === 'object' && settlementOrId !== null) {
    settlementId = settlementOrId.id;
    members = settlementOrId.members || [];
    expenses = settlementOrId.expenses || [];
    payments = settlementOrId.payments || [];
    refunds = settlementOrId.refunds || [];
  } else {
    settlementId = settlementOrId;
    members = rawMembers || [];
    expenses = rawExpenses || [];
    payments = rawPayments || [];
    refunds = rawRefunds || [];
  }

  // Aggregate tracking structures in integer poisha
  const totalPaidMap = new Map<string, number>();
  const totalShareMap = new Map<string, number>();
  const refundCashCollectedMap = new Map<string, number>();
  const refundReductionsMap = new Map<string, number>();
  const paymentsReceivedMap = new Map<string, number>();
  const paymentsSentMap = new Map<string, number>();
  const breakdownItemsMap = new Map<string, MemberExpenseBreakdownItem[]>();

  // Initialize all members
  members.forEach((m) => {
    totalPaidMap.set(m.id, 0);
    totalShareMap.set(m.id, 0);
    refundCashCollectedMap.set(m.id, 0);
    refundReductionsMap.set(m.id, 0);
    paymentsReceivedMap.set(m.id, 0);
    paymentsSentMap.set(m.id, 0);
    breakdownItemsMap.set(m.id, []);
  });

  let totalExpensesPoisha = 0;
  let totalPaymentsPoisha = 0;

  // 1. Process Expenses
  expenses.forEach((exp) => {
    const expenseTotal = exp.totalPoisha || (exp as any).totalAmountPoisha || 0;
    totalExpensesPoisha += expenseTotal;

    // Track payers
    exp.payers.forEach((payer) => {
      const cur = totalPaidMap.get(payer.memberId) || 0;
      totalPaidMap.set(payer.memberId, cur + payer.amountPoisha);
    });

    // Track participant shares
    let splits = exp.splits;
    if (!splits || splits.length === 0) {
      const pIds = exp.participantIds || (exp as any).participantMemberIds || [];
      if (pIds.length > 0) {
        splits = calculateExpenseSplits(expenseTotal, pIds, exp.splitMethod || 'equal');
      } else {
        splits = [];
      }
    }

    splits.forEach((split) => {
      const curShare = totalShareMap.get(split.memberId) || 0;
      const allocated = split.allocatedPoisha !== undefined ? split.allocatedPoisha : (split as any).amountPoisha || 0;
      totalShareMap.set(split.memberId, curShare + allocated);

      // Add breakdown item
      const payerRec = exp.payers.find((p) => p.memberId === split.memberId);
      const paidForThis = payerRec ? payerRec.amountPoisha : 0;

      const items = breakdownItemsMap.get(split.memberId) || [];
      items.push({
        expenseId: exp.id,
        expenseTitle: exp.title,
        date: exp.date,
        totalExpenseAmount: poishaToTaka(expenseTotal),
        memberPaidAmount: poishaToTaka(paidForThis),
        memberShareAmount: poishaToTaka(allocated),
        refundReductionAmount: 0
      });
      breakdownItemsMap.set(split.memberId, items);
    });

    // If a member paid but wasn't a participant, still record their breakdown item
    exp.payers.forEach((payer) => {
      const isParticipant = splits.some((s) => s.memberId === payer.memberId);
      if (!isParticipant) {
        const items = breakdownItemsMap.get(payer.memberId) || [];
        items.push({
          expenseId: exp.id,
          expenseTitle: exp.title,
          date: exp.date,
          totalExpenseAmount: poishaToTaka(expenseTotal),
          memberPaidAmount: poishaToTaka(payer.amountPoisha),
          memberShareAmount: 0,
          refundReductionAmount: 0
        });
        breakdownItemsMap.set(payer.memberId, items);
      }
    });
  });

  // 2. Process Refunds
  refunds.forEach((ref) => {
    // Member who collected the cash refund holds that cash (must be accounted)
    const receiverId = ref.receiverMemberId || (ref as any).receivedByMemberId;
    if (receiverId) {
      const curCollected = refundCashCollectedMap.get(receiverId) || 0;
      refundCashCollectedMap.set(receiverId, curCollected + ref.amountPoisha);
    }

    // Participants whose expense shares are reduced
    const rSplits = ref.refundSplits || (ref as any).reductionShares || [];
    rSplits.forEach((split: any) => {
      const redAmount = split.reductionPoisha !== undefined ? split.reductionPoisha : split.amountPoisha || 0;
      const curRed = refundReductionsMap.get(split.memberId) || 0;
      refundReductionsMap.set(split.memberId, curRed + redAmount);

      // Update breakdown item
      const items = breakdownItemsMap.get(split.memberId) || [];
      const item = items.find((it) => it.expenseId === ref.expenseId);
      if (item) {
        item.refundReductionAmount += poishaToTaka(redAmount);
      }
    });
  });

  // 3. Process Payments (Settlement Transfers)
  payments.forEach((pmt) => {
    totalPaymentsPoisha += pmt.amountPoisha;

    const curSent = paymentsSentMap.get(pmt.fromMemberId) || 0;
    paymentsSentMap.set(pmt.fromMemberId, curSent + pmt.amountPoisha);

    const curRecv = paymentsReceivedMap.get(pmt.toMemberId) || 0;
    paymentsReceivedMap.set(pmt.toMemberId, curRecv + pmt.amountPoisha);
  });

  // 4. Calculate Net Balances per Member (in integer poisha)
  // Net = Total Paid - (Total Share - Refund Reductions) - Refund Cash Collected + Payments Received - Payments Sent
  const netPoishaMap = new Map<string, number>();
  let sumOfNetsPoisha = 0;

  const memberBalances: MemberCalculationBreakdown[] = members.map((m) => {
    const paid = totalPaidMap.get(m.id) || 0;
    const rawShare = totalShareMap.get(m.id) || 0;
    const refundRed = refundReductionsMap.get(m.id) || 0;
    const effectiveShare = Math.max(0, rawShare - refundRed);
    const refundCash = refundCashCollectedMap.get(m.id) || 0;
    const pmtRecv = paymentsReceivedMap.get(m.id) || 0;
    const pmtSent = paymentsSentMap.get(m.id) || 0;

    // Payments sent by member pay off their debt (+pmtSent)
    // Payments received by member reduce what is owed to them (-pmtRecv)
    const netPoisha = paid - effectiveShare - refundCash + pmtSent - pmtRecv;
    netPoishaMap.set(m.id, netPoisha);
    sumOfNetsPoisha += netPoisha;

    const netTaka = poishaToTaka(netPoisha);
    const status: MemberCalculationBreakdown['status'] =
      netPoisha > 0 ? 'receive' : netPoisha < 0 ? 'pay' : 'settled';

    // Build transparent explanation formula
    const paidFormatted = `৳${poishaToTaka(paid).toFixed(2)}`;
    const shareFormatted = `৳${poishaToTaka(effectiveShare).toFixed(2)}`;
    let formula = `Paid ${paidFormatted} − Share ${shareFormatted}`;

    if (pmtSent > 0) {
      formula += ` + Paid Out ৳${poishaToTaka(pmtSent).toFixed(2)}`;
    }
    if (pmtRecv > 0) {
      formula += ` − Received ৳${poishaToTaka(pmtRecv).toFixed(2)}`;
    }

    formula += ` = ${netTaka >= 0 ? '+' : ''}৳${netTaka.toFixed(2)}`;

    return {
      memberId: m.id,
      memberName: m.name,
      isMe: Boolean(m.isMe),
      totalPaid: poishaToTaka(paid),
      totalShare: poishaToTaka(effectiveShare),
      refundsCollected: poishaToTaka(refundCash),
      refundReductions: poishaToTaka(refundRed),
      paymentsReceived: poishaToTaka(pmtRecv),
      paymentsSent: poishaToTaka(pmtSent),
      netBalance: netTaka,
      status,
      formulaExplanation: formula,
      items: breakdownItemsMap.get(m.id) || []
    };
  });

  // 5. Zero-Sum Invariant Verification
  const zeroSumInvariantPassed = sumOfNetsPoisha === 0;
  let invariantError: string | undefined = undefined;

  if (!zeroSumInvariantPassed) {
    const diffTaka = poishaToTaka(sumOfNetsPoisha);
    invariantError = `Calculation discrepancy detected: Sum of net balances is ৳${diffTaka.toFixed(2)} (must equal ৳0.00). Suggested payments cannot be generated.`;
    console.error(`[Smart Settlement Engine] Invariant violation: sumOfNetsPoisha = ${sumOfNetsPoisha}`);
  }

  // 6. Greedy Minimal Transfer Settlement Planner
  const suggestedTransfers: SuggestedPaymentTransfer[] = [];

  if (zeroSumInvariantPassed) {
    // Debtors (need to pay, netPoisha < 0)
    // Creditors (will receive, netPoisha > 0)
    const debtors: { memberId: string; name: string; amountLeft: number }[] = [];
    const creditors: { memberId: string; name: string; amountLeft: number }[] = [];

    members.forEach((m) => {
      const net = netPoishaMap.get(m.id) || 0;
      if (net < 0) {
        debtors.push({ memberId: m.id, name: m.name, amountLeft: Math.abs(net) });
      } else if (net > 0) {
        creditors.push({ memberId: m.id, name: m.name, amountLeft: net });
      }
    });

    let dIdx = 0;
    let cIdx = 0;

    while (dIdx < debtors.length && cIdx < creditors.length) {
      const debtor = debtors[dIdx];
      const creditor = creditors[cIdx];

      const transferPoisha = Math.min(debtor.amountLeft, creditor.amountLeft);

      if (transferPoisha > 0) {
        suggestedTransfers.push({
          fromMemberId: debtor.memberId,
          fromMemberName: debtor.name,
          toMemberId: creditor.memberId,
          toMemberName: creditor.name,
          amountPoisha: transferPoisha,
          amount: poishaToTaka(transferPoisha)
        });

        debtor.amountLeft -= transferPoisha;
        creditor.amountLeft -= transferPoisha;
      }

      if (debtor.amountLeft === 0) dIdx++;
      if (creditor.amountLeft === 0) cIdx++;
    }
  }

  // Total outstanding debt & receivables
  let totalOutstandingDebt = 0;
  let totalOutstandingReceivable = 0;

  memberBalances.forEach((m) => {
    if (m.netBalance < 0) totalOutstandingDebt += Math.abs(m.netBalance);
    else if (m.netBalance > 0) totalOutstandingReceivable += m.netBalance;
  });

  const isAllSettled = suggestedTransfers.length === 0;

  // Me status personalization
  const meMember = memberBalances.find((m) => m.isMe);
  let meStatus: SettlementCalculationSummary['meStatus'] = undefined;

  if (meMember) {
    const toPay = suggestedTransfers.filter((t) => t.fromMemberId === meMember.memberId);
    const toReceive = suggestedTransfers.filter((t) => t.toMemberId === meMember.memberId);

    let text = 'You are all settled';
    if (meMember.netBalance > 0) {
      text = `You will receive ৳${meMember.netBalance.toFixed(2)}`;
    } else if (meMember.netBalance < 0) {
      text = `You need to pay ৳${Math.abs(meMember.netBalance).toFixed(2)}`;
    }

    meStatus = {
      isMeDefined: true,
      meMemberId: meMember.memberId,
      netBalance: meMember.netBalance,
      text,
      actionableTransfersToPay: toPay,
      actionableTransfersToReceive: toReceive
    };
  }

  const memberSummaries: Record<
    string,
    {
      memberId: string;
      totalPaidPoisha: number;
      totalOwedPoisha: number;
      paymentsSentPoisha: number;
      paymentsReceivedPoisha: number;
      refundCashHeldPoisha: number;
      netBalancePoisha: number;
    }
  > = {};

  members.forEach((m) => {
    const paid = totalPaidMap.get(m.id) || 0;
    const rawShare = totalShareMap.get(m.id) || 0;
    const refundRed = refundReductionsMap.get(m.id) || 0;
    const effectiveShare = Math.max(0, rawShare - refundRed);
    const refundCash = refundCashCollectedMap.get(m.id) || 0;
    const pmtRecv = paymentsReceivedMap.get(m.id) || 0;
    const pmtSent = paymentsSentMap.get(m.id) || 0;
    const net = netPoishaMap.get(m.id) || 0;

    memberSummaries[m.id] = {
      memberId: m.id,
      totalPaidPoisha: paid,
      totalOwedPoisha: effectiveShare,
      paymentsSentPoisha: pmtSent,
      paymentsReceivedPoisha: pmtRecv,
      refundCashHeldPoisha: refundCash,
      netBalancePoisha: net
    };
  });

  return {
    settlementId,
    totalExpensesPoisha,
    totalExpenses: poishaToTaka(totalExpensesPoisha),
    totalSpentPoisha: totalExpensesPoisha,
    totalSpent: poishaToTaka(totalExpensesPoisha),
    totalPaymentsPoisha,
    totalPayments: poishaToTaka(totalPaymentsPoisha),
    totalOutstandingDebt,
    totalOutstandingReceivable,
    isAllSettled,
    allSettled: isAllSettled,
    zeroSumInvariantPassed,
    invariantError,
    memberBalances,
    memberSummaries,
    suggestedTransfers,
    meStatus
  };
}
