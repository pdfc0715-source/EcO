/**
 * EcO — Branded Document & Share Card Studio
 * Domain model and canvas/print generators for official EcO Vouchers, Statements, and Story Cards.
 */

import { formatTaka } from './money';
import { formatDisplayDate } from './dates';
import {
  UnifiedActivityItem,
  PersonRecord,
  PeerTransactionRecord,
  PaymentMethod,
  ExpenseRecord,
  EarningRecord,
  TransferRecord
} from './types';

export type BrandedStudioMode = 'voucher' | 'person-statement' | 'monthly-card';
export type StudioTheme = 'dark' | 'light';
export type StudioPalette = 'green' | 'blue' | 'orange';

export interface BrandedVoucherData {
  referenceId: string;
  timestamp: string;
  date: string;
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
  const method = paymentMethods.find((m) => m.id === item.payMethodId);
  const fromMethod = paymentMethods.find((m) => m.id === item.fromMethodId);
  const toMethod = paymentMethods.find((m) => m.id === item.toMethodId);

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

  return {
    referenceId: generateVerificationReference('TX', item.id),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: item.date,
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
    const method = paymentMethods.find((m) => m.id === t.payMethodId);
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
