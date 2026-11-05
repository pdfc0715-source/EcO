/**
 * EcO — Smart Settlement Domain Types
 * Group expense splitting, fractional poisha calculation, and debt resolution models.
 */

export type SplitMethod = 'equal' | 'exact' | 'percentage' | 'weighted' | 'custom';

export interface SettlementMember {
  id: string;
  name: string;
  isMe?: boolean; // True if this member represents the logged-in EcO user
  avatarUrl?: string | null;
  isActive?: boolean; // Deactivated members retain historical accounting
  joinedAt?: string;
}

export interface ExpensePayer {
  memberId: string;
  amountPoisha: number; // Stored in poisha (integer)
}

export interface PayerEntry {
  memberId: string;
  amountPoisha: number;
}

export interface ExpenseParticipantSplit {
  memberId: string;
  value?: number;
  allocatedPoisha: number;
  amountPoisha?: number;
}

export interface SettlementExpense {
  id: string;
  settlementId?: string;
  title: string;
  totalPoisha?: number; // Integer poisha (৳1.00 = 100 poisha)
  totalAmountPoisha?: number; // Stored in poisha
  date: string; // YYYY-MM-DD
  time?: string;
  payers: ExpensePayer[];
  participantIds?: string[];
  participantMemberIds?: string[];
  splitMethod: SplitMethod;
  splits?: ExpenseParticipantSplit[];
  splitDetails?: any;
  createdAt: number;
  updatedAt?: number;
  linkedWalletTxId?: string; // If synced to creator's EcO wallet
  walletTransactionId?: string;
  linkedWalletId?: string;
}

export interface SettlementRefund {
  id: string;
  settlementId?: string;
  expenseId: string;
  amountPoisha: number; // Stored in poisha (integer)
  receiverMemberId?: string; // Member who collected the cash refund
  receivedByMemberId?: string;
  participantIds?: string[]; // Participants sharing the refund reduction
  refundSplits?: { memberId: string; reductionPoisha: number }[];
  reductionShares?: { memberId: string; amountPoisha: number }[];
  date: string;
  note?: string;
  reason?: string;
  createdAt: number;
}

export interface SettlementPayment {
  id: string;
  settlementId?: string;
  fromMemberId: string; // Debtor
  toMemberId: string; // Creditor
  amountPoisha: number; // Stored in poisha
  date: string;
  note?: string;
  isAdvanceOrOverpayment?: boolean;
  createdAt: number;
  linkedWalletTxId?: string;
  walletTransactionId?: string;
  linkedWalletId?: string;
}

export interface SettlementWalletSettings {
  autoSyncWallet: boolean;
  preferredWalletId?: string;
  dontAskAgain?: boolean;
}

export interface SmartSettlement {
  id: string;
  creatorUserId?: string;
  name: string;
  sequentialNumber?: number; // Sequential per user (Settlement#01, #02...)
  currencySymbol?: string;
  members: SettlementMember[];
  expenses: SettlementExpense[];
  payments: SettlementPayment[];
  refunds: SettlementRefund[];
  status: 'active' | 'settled' | 'archived';
  autoWalletSyncPreference?: {
    enabled: boolean;
    walletId?: string;
  };
  walletSettings?: SettlementWalletSettings;
  publicShare?: {
    enabled: boolean;
    shareToken: string;
    revokedAt?: number;
  };
  shareToken?: string;
  isPublicShared?: boolean;
  createdAt: number;
  updatedAt: number;
}

// ----------------------------------------------------------------------------
// Engine Outputs & Calculations
// ----------------------------------------------------------------------------

export interface MemberExpenseBreakdownItem {
  expenseId: string;
  expenseTitle: string;
  date: string;
  totalExpenseAmount: number;
  memberPaidAmount: number;
  memberShareAmount: number;
  refundReductionAmount: number;
}

export interface MemberCalculationBreakdown {
  memberId: string;
  memberName: string;
  isMe: boolean;
  totalPaid: number; // Display decimal Taka
  totalShare: number; // Display decimal Taka
  refundsCollected: number; // Refund cash in hand
  refundReductions: number; // Expense reduction from refunds
  paymentsReceived: number; // Cash received from other members
  paymentsSent: number; // Cash paid to other members
  netBalance: number; // Net decimal: >0 receivable, <0 payable, 0 settled
  status: 'receive' | 'pay' | 'settled';
  formulaExplanation: string;
  items: MemberExpenseBreakdownItem[];
}

export interface SuggestedPaymentTransfer {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amountPoisha: number;
  amount: number; // Display decimal Taka
}

export interface SettlementCalculationSummary {
  settlementId: string;
  totalExpensesPoisha: number;
  totalExpenses: number;
  totalPaymentsPoisha: number;
  totalPayments: number;
  totalOutstandingDebt: number;
  totalOutstandingReceivable: number;
  isAllSettled: boolean;
  zeroSumInvariantPassed: boolean;
  invariantError?: string;
  memberBalances: MemberCalculationBreakdown[];
  suggestedTransfers: SuggestedPaymentTransfer[];
  meStatus?: {
    isMeDefined: boolean;
    meMemberId?: string;
    netBalance: number;
    text: string;
    actionableTransfersToPay: SuggestedPaymentTransfer[];
    actionableTransfersToReceive: SuggestedPaymentTransfer[];
  };
}
