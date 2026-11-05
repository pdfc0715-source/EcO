/**
 * EcO — Branded Document & Share Card Studio
 * Domain model and canvas/print generators for official EcO Vouchers, Statements, and Story Cards.
 */

import { formatTaka } from './money';
import { formatDisplayDate, formatExactDate, formatExactDateTime } from './dates';
import {
  UnifiedActivityItem,
  PersonRecord,
  PeerTransactionRecord,
  PaymentMethod,
  ExpenseRecord,
  EarningRecord,
  TransferRecord
} from './types';
import { resolvePaymentMethod } from './paymentMethods';

export type BrandedStudioMode = 'voucher' | 'person-statement' | 'monthly-card' | 'multi-voucher';
export type StudioTheme = 'dark' | 'light';
export type StudioPalette = 'green' | 'blue' | 'orange';

export interface BrandedVoucherData {
  referenceId: string;
  timestamp: string;
  date: string;
  createdDate?: string;
  activityType: 'expense' | 'earning' | 'transfer' | 'peer_give' | 'peer_take';
  title: string;
  categoryOrSource: string;
  amount: number;
  walletName: string;
  toWalletName?: string;
  feeAmount?: number;
  fromParty: string;
  toParty: string;
  note?: string;
  tag?: string;
  isRepayment?: boolean;
}

export interface BrandedMultiVoucherItem {
  id: string;
  title: string;
  category: string;
  amount: number;
  walletName: string;
  date: string;
  description?: string;
  activityType: 'expense' | 'earning' | 'transfer' | 'peer_give' | 'peer_take';
}

export interface BrandedMultiVoucherData {
  referenceId: string;
  createdDate: string; // Automatic created timestamp (e.g. "04 Nov 2026, 04:02 PM")
  customTitle: string; // User-modifiable title
  items: BrandedMultiVoucherItem[];
  totalAmount: number;
  totalCount: number;
  userName: string;
  dateRange: string;
  walletBreakdown: { walletName: string; amount: number }[];
}

export interface BrandedStatementData {
  referenceId: string;
  generatedDate: string;
  ownerName: string;
  ownerPhone?: string;
  counterpartyName: string;
  counterpartyPhone?: string;
  totalGiven: number;
  totalTaken: number;
  netBalance: number;
  transactions: {
    id: string;
    date: string;
    type: 'give' | 'take';
    amount: number;
    walletName: string;
    description?: string;
    tag?: string;
    runningBalance: number;
  }[];
}

export interface BrandedMonthlyCardData {
  referenceId: string;
  monthKey: string; // e.g. "2026-10"
  monthTitle: string; // e.g. "October 2026"
  totalEarnings: number;
  totalExpenses: number;
  netSavings: number;
  savingsRate: number; // percentage, e.g. 35.5
  topCategories: { category: string; amount: number; percentage: number }[];
  activeWalletsCount: number;
  totalNetWorth: number;
  userName: string;
}

/**
 * Generates an official EcO verification code (e.g. ECO-TX-8492-7104)
 */
export function generateVerificationReference(prefix: 'TX' | 'STM' | 'REP', id?: string): string {
  if (id && id.length >= 8) {
    const clean = id.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const p1 = clean.substring(0, 4);
    const p2 = clean.substring(Math.max(0, clean.length - 4));
    return `ECO-${prefix}-${p1}-${p2}`;
  }
  const rand1 = Math.floor(1000 + Math.random() * 9000);
  const rand2 = Math.floor(1000 + Math.random() * 9000);
  return `ECO-${prefix}-${rand1}-${rand2}`;
}

/**
 * Builds voucher data from an activity item or record
 */
export function buildVoucherData(
  item: UnifiedActivityItem,
  paymentMethods: PaymentMethod[],
  people: PersonRecord[],
  userName: string = 'Account Owner'
): BrandedVoucherData {
  const method = resolvePaymentMethod(item.payMethodId, paymentMethods);
  const fromMethod = resolvePaymentMethod(item.fromMethodId, paymentMethods);
  const toMethod = resolvePaymentMethod(item.toMethodId, paymentMethods);

  let activityType: BrandedVoucherData['activityType'] = 'expense';
  let fromParty = userName;
  let toParty = item.categoryOrSourceOrPerson;

  if (item.activityType === 'earning') {
    activityType = 'earning';
    fromParty = item.categoryOrSourceOrPerson || 'Income Source';
    toParty = userName;
  } else if (item.activityType === 'transfer') {
    activityType = 'transfer';
    fromParty = `${fromMethod?.name || 'Wallet A'} (${userName})`;
    toParty = `${toMethod?.name || 'Wallet B'} (${userName})`;
  } else if (item.activityType === 'transaction') {
    const rawTx = item.rawRecord as PeerTransactionRecord;
    const direction = item.direction || rawTx?.type || 'give';
    if (direction === 'give') {
      activityType = 'peer_give';
      fromParty = userName;
      toParty = item.categoryOrSourceOrPerson;
    } else {
      activityType = 'peer_take';
      fromParty = item.categoryOrSourceOrPerson;
      toParty = userName;
    }
  }

  const rawTx = item.rawRecord as PeerTransactionRecord;
  const isRepayment = rawTx?.tag?.toLowerCase().includes('repay') || item.title.toLowerCase().includes('repay');

  const now = new Date();
  const createdDate = formatExactDateTime(now.toISOString().split('T')[0], now.getTime());

  return {
    referenceId: generateVerificationReference('TX', item.id),
    timestamp: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: item.date,
    createdDate,
    activityType,
    title: item.title,
    categoryOrSource: item.categoryOrSourceOrPerson,
    amount: item.amount,
    walletName: method?.name || fromMethod?.name || 'Cash',
    toWalletName: toMethod?.name,
    feeAmount: item.feeAmount,
    fromParty,
    toParty,
    note: item.description,
    tag: rawTx?.tag,
    isRepayment
  };
}

/**
 * Builds consolidated multi-item voucher data from an array of selected activities
 */
export function buildMultiVoucherData(
  items: UnifiedActivityItem[],
  paymentMethods: PaymentMethod[],
  people: PersonRecord[],
  userName: string = 'EcO User',
  customTitle?: string
): BrandedMultiVoucherData {
  const now = new Date();
  const createdDate = formatExactDateTime(now.toISOString().split('T')[0], now.getTime());

  const voucherItems: BrandedMultiVoucherItem[] = items.map((item) => {
    const method = resolvePaymentMethod(item.payMethodId, paymentMethods);
    const fromMethod = resolvePaymentMethod(item.fromMethodId, paymentMethods);

    let activityType: BrandedMultiVoucherItem['activityType'] = 'expense';
    if (item.activityType === 'earning') activityType = 'earning';
    else if (item.activityType === 'transfer') activityType = 'transfer';
    else if (item.activityType === 'transaction') {
      activityType = item.direction === 'give' ? 'peer_give' : 'peer_take';
    }

    return {
      id: item.id,
      title: item.title,
      category: item.categoryOrSourceOrPerson || 'General',
      amount: item.amount,
      walletName: method?.name || fromMethod?.name || 'Cash',
      date: item.date,
      description: item.description,
      activityType
    };
  });

  const totalAmount = voucherItems.reduce((sum, it) => sum + it.amount, 0);

  // Group by wallet
  const walletMap = new Map<string, number>();
  voucherItems.forEach((it) => {
    walletMap.set(it.walletName, (walletMap.get(it.walletName) || 0) + it.amount);
  });
  const walletBreakdown = Array.from(walletMap.entries()).map(([walletName, amount]) => ({
    walletName,
    amount
  }));

  // Date range
  const dates = Array.from(new Set(voucherItems.map((it) => it.date))).sort();
  const dateRange = dates.length === 0
    ? formatExactDate(now.toISOString().split('T')[0])
    : dates.length === 1
    ? formatExactDate(dates[0])
    : `${formatExactDate(dates[0])} – ${formatExactDate(dates[dates.length - 1])}`;

  // Smart default title
  let defaultTitle = 'Market Expense Voucher';
  const categories = Array.from(new Set(voucherItems.map((it) => it.category).filter(Boolean)));
  if (categories.length === 1 && categories[0] !== 'General' && categories[0] !== 'Expense') {
    defaultTitle = `${categories[0]} Voucher`;
  }

  return {
    referenceId: generateVerificationReference('TX'),
    createdDate,
    customTitle: customTitle?.trim() || defaultTitle,
    items: voucherItems,
    totalAmount,
    totalCount: voucherItems.length,
    userName,
    dateRange,
    walletBreakdown
  };
}

/**
 * Builds peer statement data for a counterparty
 */
export function buildStatementData(
  person: PersonRecord,
  transactions: PeerTransactionRecord[],
  paymentMethods: PaymentMethod[],
  userName: string = 'Account Owner',
  userPhone?: string
): BrandedStatementData {
  let totalGiven = 0;
  let totalTaken = 0;
  let running = 0;

  // Chronological sorting (earliest first for running balance)
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date) || a.timestamp - b.timestamp);

  const txItems = sorted.map((t) => {
    const isGive = t.type === 'give';
    if (isGive) {
      totalGiven += t.amount;
      running += t.amount;
    } else {
      totalTaken += t.amount;
      running -= t.amount;
    }
    const method = resolvePaymentMethod(t.payMethodId, paymentMethods);
    return {
      id: t.id,
      date: t.date,
      type: t.type,
      amount: t.amount,
      walletName: method?.name || 'Cash',
      description: t.description,
      tag: t.tag,
      runningBalance: running
    };
  });

  return {
    referenceId: generateVerificationReference('STM', person.id),
    generatedDate: new Date().toISOString().split('T')[0],
    ownerName: userName,
    ownerPhone: userPhone,
    counterpartyName: person.name,
    counterpartyPhone: person.phone,
    totalGiven,
    totalTaken,
    netBalance: totalGiven - totalTaken,
    transactions: txItems
  };
}

/**
 * Get palette hex colors
 */
export function getPaletteColors(palette: StudioPalette) {
  switch (palette) {
    case 'blue':
      return {
        accent: '#60a5fa',
        primary: '#3b82f6',
        primaryDark: '#1d4ed8',
        container: '#2563eb',
        onPrimary: '#ffffff'
      };
    case 'orange':
      return {
        accent: '#fb923c',
        primary: '#f97316',
        primaryDark: '#c2410c',
        container: '#ea580c',
        onPrimary: '#ffffff'
      };
    case 'green':
    default:
      return {
        accent: '#73e3b4',
        primary: '#10b981',
        primaryDark: '#059669',
        container: '#55c79a',
        onPrimary: '#003826'
      };
  }
}

/**
 * Downloads a canvas element as a PNG image
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement, filename: string) {
  const dataUrl = canvas.toDataURL('image/png');
  const link = document.createElement('a');
  link.download = filename;
  link.href = dataUrl;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Copies a canvas image directly to the clipboard
 */
export async function copyCanvasToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  if (!navigator.clipboard || !window.ClipboardItem) {
    return false;
  }
  return new Promise((resolve) => {
    canvas.toBlob(async (blob) => {
      if (!blob) {
        resolve(false);
        return;
      }
      try {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        resolve(true);
      } catch (err) {
        console.warn('Clipboard write failed:', err);
        resolve(false);
      }
    }, 'image/png');
  });
}

/**
 * Opens a pristine print-optimized window to save or print as PDF
 */
export function openPrintPdfWindow(htmlContent: string, title: string) {
  const printWindow = window.open('', '_blank', 'width=900,height=1000');
  if (!printWindow) {
    // Fallback if popup blocked: print current frame
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (doc) {
      doc.open();
      doc.write(htmlContent);
      doc.close();
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    }
    setTimeout(() => document.body.removeChild(iframe), 3000);
    return;
  }

  printWindow.document.open();
  printWindow.document.write(htmlContent);
  printWindow.document.close();
  printWindow.document.title = title;
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 350);
}
