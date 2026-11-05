export type BudgetMode = 'direct' | 'calculated' | 'none' | 'off';
export type ColorPalette = 'green' | 'blue' | 'orange';

export interface UserSettings {
  id: string; // usually 'main'
  theme: 'dark' | 'light';
  colorPalette?: ColorPalette;
  setupComplete: boolean;
  budgetMode: BudgetMode;
  directDailyBudget: number;
  monthlyIncome: number;
  monthlyFixed: number;
  monthlySavings: number;
  monthlyEmergency: number;
  bufferPct: number;
  cashoutChargeRate: number; // e.g. 2 for 2%
  categories: string[];
  tags: string[];
  currencySymbol: string;
}

export type PaymentMethodType = 'cash' | 'mobile_money' | 'bank' | 'credit_card' | 'other';

export interface PaymentMethod {
  id: string;
  name: string;
  type: PaymentMethodType;
  isBuiltIn: boolean; // Cash is builtIn
  isActive: boolean;
  balance: number;
  openingBalance: number;
  createdAt: string;
  updatedAt: string;
  legacyNames?: string[];
}

export type ExpenseType = 'regular' | 'fixed' | 'emergency';

export interface ExpenseRecord {
  id: string;
  reason: string;
  category: string;
  description: string;
  amount: number;
  type: ExpenseType;
  payMethodId: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
}

export interface RecurringExpenseRecord {
  id: string;
  reason: string;
  category: string;
  amount: number;
  perDay: number;
  days: number;
  startDate: string;
  endDate: string;
  payMethodId: string;
  timestamp: number;
  type?: ExpenseType;
}

export interface EarningRecord {
  id: string;
  source: string;
  description: string;
  amount: number;
  payMethodId: string;
  date: string;
  timestamp: number;
}

export interface TransferRecord {
  id: string;
  fromMethodId: string;
  toMethodId: string;
  requestedAmount: number;
  chargeApplied: boolean;
  chargeAmount: number;
  chargeRate: number;
  sourceDeducted: number;
  note: string;
  date: string;
  timestamp: number;
}

export interface PersonRecord {
  id: string;
  name: string;
  phone?: string;
  isConnected: boolean;
  connectionCode?: string;
  connectedUserId?: string;
  shareToken?: string;
  createdAt: string;
}

export type TransactionType = 'give' | 'take';
export type PeerFeeTreatment = 'separate' | 'included' | 'none';

export interface PeerTransactionRecord {
  id: string;
  personId: string;
  type: TransactionType; // 'give' (user lent) | 'take' (user borrowed)
  amount: number; // Principal debt amount
  totalAmount: number;
  payMethodId: string;
  tag: string;
  description: string;
  date: string;
  isOpening?: boolean;
  fromRequest?: boolean;
  timestamp: number;
  // Connected transaction status if EcO-to-EcO
  status?: 'local' | 'pending' | 'accepted' | 'rejected' | 'disputed' | 'cancelled' | 'expired_local_only';
  proposalId?: string;
  // Cash-out / transfer fee options
  chargeApplied?: boolean;
  chargeRate?: number;
  chargeAmount?: number;
  feeTreatment?: PeerFeeTreatment;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
  expiresAt: number;
  relatedType?: string;
  relatedId?: string;
}

export interface IncomeSource {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
}

export interface UnifiedActivityItem {
  id: string;
  activityType: 'expense' | 'earning' | 'transfer' | 'transaction' | 'recurring';
  title: string;
  categoryOrSourceOrPerson: string;
  description?: string;
  amount: number;
  netEffectText?: string;
  payMethodId?: string;
  fromMethodId?: string;
  toMethodId?: string;
  direction?: 'give' | 'take';
  date: string;
  timestamp: number;
  status?: string;
  feeAmount?: number;
  rawRecord?: ExpenseRecord | EarningRecord | TransferRecord | PeerTransactionRecord | RecurringExpenseRecord;
}

export type ConnectionStatus = 'connected' | 'pending_incoming' | 'pending_outgoing' | 'rejected' | 'disconnected';

export interface EcOConnection {
  id: string;
  participants?: string[];
  userAId?: string;
  userAName?: string;
  userACode?: string;
  userBId?: string;
  userBName?: string;
  userBCode?: string;
  peerUserId: string;
  peerName: string;
  peerCode: string;
  status: ConnectionStatus;
  initiatedBy?: string;
  createdAt: number;
  updatedAt: number;
}

export type ProposalStatus = 'pending' | 'accepted' | 'rejected' | 'disputed' | 'cancelled';

export interface EcOProposal {
  id: string;
  participants?: string[];
  connectionId?: string;
  senderUserId: string;
  senderName: string;
  senderCode?: string;
  recipientUserId: string;
  recipientName: string;
  recipientCode?: string;
  originalSenderType: 'give' | 'take'; // What sender did (give = lent money / receivable; take = borrowed / payable)
  recipientPerspectiveType: 'give' | 'take'; // Inverted for recipient
  isRepayment?: boolean; // Whether this proposal is a loan repayment
  amount: number;
  date: string;
  note?: string;
  payMethodId?: string;
  status: ProposalStatus;
  disputeReason?: string;
  createdAt: number;
  updatedAt?: number;
  settledTxId?: string;
}

export type IssueReportType = 'bug' | 'idea' | 'complaint' | 'other';
export type IssueReportStatus = 'new' | 'seen' | 'fixed';

export interface IssueReport {
  id: string;
  userId: string;
  userName?: string;
  userEmail?: string;
  title?: string;
  type: IssueReportType;
  message: string;
  page: string;
  deviceContext?: {
    browser: string;
    screen: string;
    theme: string;
    version: string;
  };
  contactPermission?: boolean;
  status: IssueReportStatus;
  likesCount?: number;
  dislikesCount?: number;
  likedBy?: string[];
  dislikedBy?: string[];
  screenshot?: string;
  createdAt: number;
}

/**
 * Encodes a personId into a distinct, URL-safe share token.
 */
export function encodePersonShareToken(personId: string): string {
  try {
    const raw = `eco:person:${personId}`;
    const base64 = typeof btoa !== 'undefined'
      ? btoa(raw)
      : Buffer.from(raw).toString('base64');
    return 'ps_' + base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  } catch {
    return 'ps_' + encodeURIComponent(personId);
  }
}

/**
 * Decodes a share token to extract the target personId.
 */
export function decodePersonShareToken(token: string): string | null {
  if (!token) return null;
  if (token.startsWith('ps_')) {
    const body = token.substring(3);
    try {
      let base64 = body.replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4 !== 0) {
        base64 += '=';
      }
      const decoded = typeof atob !== 'undefined'
        ? atob(base64)
        : Buffer.from(base64, 'base64').toString('utf8');
      if (decoded.startsWith('eco:person:')) {
        return decoded.substring('eco:person:'.length);
      }
    } catch {
      try {
        return decodeURIComponent(body);
      } catch {}
    }
  }
  return null;
}


