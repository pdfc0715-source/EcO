/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { repository } from './data/repository';
import {
  UserSettings,
  PaymentMethod,
  ExpenseRecord,
  RecurringExpenseRecord,
  EarningRecord,
  TransferRecord,
  PersonRecord,
  PeerTransactionRecord,
  IncomeSource,
  AppNotification,
  UnifiedActivityItem,
  BudgetMode,
  ExpenseType,
  EcOConnection,
  EcOProposal,
  IssueReport
} from './domain/types';
import { calculateFinancialSummary } from './domain/calculations';
import { BUILTIN_BKASH_ID, BUILTIN_NAGAD_ID } from './domain/paymentMethods';
import { invertProposalDirection } from './domain/connections';
import { Navigation, NavTab } from './components/Navigation';
import { Header } from './components/Header';
import { NotificationModal } from './components/NotificationModal';
import { GlobalAddModal, ActivityKind } from './components/GlobalAddModal';
import { OnboardingModal } from './components/OnboardingModal';
import { FeedbackModal } from './components/FeedbackModal';
import { SupportModal } from './components/SupportModal';
import { DashboardView } from './views/DashboardView';
import { UnifiedListView } from './views/UnifiedListView';
import { WalletsView } from './views/WalletsView';
import { PeopleView } from './views/PeopleView';
import { StatsView } from './views/StatsView';
import { SettingsView } from './views/SettingsView';
import { PublicShareView } from './views/PublicShareView';
import { LandingPageView } from './views/LandingPageView';
import { SmartSettlementView } from './views/SmartSettlementView';
import { PublicSettlementShareView } from './views/PublicSettlementShareView';
import { SmartSettlement } from './domain/settlementTypes';
import { EcoBrandedStudioModal } from './components/branded/EcoBrandedStudioModal';
import {
  BrandedStudioMode,
  BrandedVoucherData,
  BrandedMultiVoucherData,
  BrandedStatementData,
  BrandedMonthlyCardData,
  buildVoucherData,
  buildMultiVoucherData,
  buildStatementData
} from './domain/exportBrandedDocument';
import { computeStatsOverview, computeCategoryStats, getRecent24Months } from './domain/statistics';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useAuth } from './context/AuthContext';
import { EcoBackupV1 } from './domain/backupV1';
import { WifiOff, Check, X, MailCheck } from 'lucide-react';

export default function App() {
  const isOnline = useOnlineStatus();
  const {
    user,
    loading: authLoading,
    logout,
    updateName,
    updatePassword,
    requestPasswordReset,
    resendVerification,
    deleteAccount
  } = useAuth();

  const [dismissEmailBanner, setDismissEmailBanner] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);

  // Primary data states from repository
  const [settings, setSettings] = useState<UserSettings>(() => repository.getSettings());
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(() => repository.getPaymentMethods());
  const [expenses, setExpenses] = useState<ExpenseRecord[]>(() => repository.getExpenses());
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpenseRecord[]>(() => repository.getRecurringExpenses());
  const [earnings, setEarnings] = useState<EarningRecord[]>(() => repository.getEarnings());
  const [transfers, setTransfers] = useState<TransferRecord[]>(() => repository.getTransfers());
  const [people, setPeople] = useState<PersonRecord[]>(() => repository.getPeople());
  const [transactions, setTransactions] = useState<PeerTransactionRecord[]>(() => repository.getTransactions());
  const [sources, setSources] = useState<IncomeSource[]>(() => repository.getSources());
  const [notifications, setNotifications] = useState<AppNotification[]>(() => repository.getNotifications());
  const [firstLaunchDone, setFirstLaunchDone] = useState<boolean>(() => repository.isFirstLaunchDone());
  const [connections, setConnections] = useState<EcOConnection[]>(() => repository.getConnections());
  const [proposals, setProposals] = useState<EcOProposal[]>(() => repository.getProposals());
  const [dismissedMilestones, setDismissedMilestones] = useState<Record<string, string[]>>(() => repository.getDismissedMilestones());
  const [myConnectionCode, setMyConnectionCode] = useState<string>(() => repository.getMyConnectionCode());
  const [communityIssues, setCommunityIssues] = useState<IssueReport[]>(() => repository.getCommunityIssues());
  const [smartSettlements, setSmartSettlements] = useState<SmartSettlement[]>(() => repository.getSmartSettlements());

  // UI Navigation & Modals
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [initialAddKind, setInitialAddKind] = useState<ActivityKind | undefined>(undefined);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState<boolean>(false);
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState<boolean>(false);
  const [isOnboardingOpen, setIsOnboardingOpen] = useState<boolean>(false);
  const [isFeedbackOpen, setIsFeedbackOpen] = useState<boolean>(false);
  const [isSupportOpen, setIsSupportOpen] = useState<boolean>(false);

  // Branded Document & Share Card Studio state
  const availableMonths = useMemo(() => getRecent24Months(), []);
  const [selectedStudioMonthKey, setSelectedStudioMonthKey] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [isBrandedStudioOpen, setIsBrandedStudioOpen] = useState<boolean>(false);
  const [brandedStudioMode, setBrandedStudioMode] = useState<BrandedStudioMode>('voucher');
  const [brandedVoucherData, setBrandedVoucherData] = useState<BrandedVoucherData | null>(null);
  const [brandedMultiVoucherData, setBrandedMultiVoucherData] = useState<BrandedMultiVoucherData | null>(null);
  const [brandedStatementData, setBrandedStatementData] = useState<BrandedStatementData | null>(null);
  const [brandedMonthlyCardData, setBrandedMonthlyCardData] = useState<BrandedMonthlyCardData | null>(null);

  // Toast notification
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Check URL for public share parameter
  const [sharedPersonToken, setSharedPersonToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('share');
  });

  const [sharedSettlementToken, setSharedSettlementToken] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('settlement');
  });

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // Handle invitation link ?connect=ECO-XXXXXX
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const connectCode = params.get('connect');
    if (connectCode) {
      setCurrentTab('people');
      showToast(`EcO invite code detected: ${connectCode.toUpperCase()}`);
    }
  }, [showToast]);

  // Synchronize dark/light theme and color palette on document root
  useEffect(() => {
    const isLight = settings.theme === 'light';
    const palette = settings.colorPalette || 'green';

    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    document.documentElement.setAttribute('data-palette', palette);

    if (isLight) {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }

    document.documentElement.classList.remove('palette-green', 'palette-blue', 'palette-orange');
    document.documentElement.classList.add(`palette-${palette}`);
  }, [settings.theme, settings.colorPalette]);

  // Sync state when repository updates
  const refreshFromRepository = useCallback(() => {
    setSettings(repository.getSettings());
    setPaymentMethods(repository.getPaymentMethods());
    setExpenses(repository.getExpenses());
    setRecurringExpenses(repository.getRecurringExpenses());
    setEarnings(repository.getEarnings());
    setTransfers(repository.getTransfers());
    setPeople(repository.getPeople());
    setTransactions(repository.getTransactions());
    setSources(repository.getSources());
    setNotifications(repository.getNotifications());
    setFirstLaunchDone(repository.isFirstLaunchDone());
    setConnections(repository.getConnections());
    setProposals(repository.getProposals());
    setDismissedMilestones(repository.getDismissedMilestones());
    setMyConnectionCode(repository.getMyConnectionCode());
    setCommunityIssues(repository.getCommunityIssues());
    setSmartSettlements(repository.getSmartSettlements());
  }, []);

  useEffect(() => {
    const unsubscribe = repository.subscribe(() => {
      refreshFromRepository();
    });
    return unsubscribe;
  }, [refreshFromRepository]);

  // Initialize repository for authenticated user
  useEffect(() => {
    if (user?.uid) {
      repository.initForUser(user.uid, user.displayName || undefined, user.email || undefined).then(() => {
        refreshFromRepository();
        if (!repository.isFirstLaunchDone()) {
          setIsOnboardingOpen(true);
        }
      });
    }
  }, [user?.uid, user?.displayName, user?.email, refreshFromRepository]);

  const handleSignOut = async () => {
    try {
      repository.clearUserData();
      await logout();
      showToast('Signed out safely.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to sign out.');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await repository.resetAllData();
      repository.clearUserData();
      await deleteAccount();
      showToast('Your account and all data have been deleted.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete account.');
      throw err;
    }
  };

  const handleResendVerification = async () => {
    try {
      setResendingVerification(true);
      await resendVerification();
      showToast('Verification email sent! Check your inbox.');
    } catch (err: any) {
      showToast(err?.message || 'Failed to send verification email.');
    } finally {
      setResendingVerification(false);
    }
  };

  // Global keyboard shortcuts (Cmd+K for search, Esc, + for Add)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCurrentTab('list');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Recalculate dynamic financial summary
  const summary = useMemo(() => {
    return calculateFinancialSummary(
      paymentMethods,
      expenses,
      recurringExpenses,
      earnings,
      transfers,
      transactions,
      people
    );
  }, [paymentMethods, expenses, recurringExpenses, earnings, transfers, transactions, people]);

  // Today's total expenses for daily budget ring
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const todayExpenses = useMemo(() => {
    return expenses
      .filter((e) => e.date === todayStr)
      .reduce((acc, curr) => acc + curr.amount, 0);
  }, [expenses, todayStr]);

  const handleOpenVoucherStudio = useCallback((item: UnifiedActivityItem) => {
    const data = buildVoucherData(item, paymentMethods, people, user?.displayName || 'EcO User');
    setBrandedVoucherData(data);
    setBrandedStudioMode('voucher');
    setIsBrandedStudioOpen(true);
  }, [paymentMethods, people, user?.displayName]);

  const handleOpenMultiVoucherStudio = useCallback((items: UnifiedActivityItem[], title?: string) => {
    if (!items || items.length === 0) return;
    const data = buildMultiVoucherData(items, paymentMethods, people, user?.displayName || 'EcO User', title);
    setBrandedMultiVoucherData(data);
    setBrandedStudioMode('multi-voucher');
    setIsBrandedStudioOpen(true);
  }, [paymentMethods, people, user?.displayName]);

  const handleOpenStatementStudio = useCallback((person: PersonRecord, personTxs: PeerTransactionRecord[]) => {
    const data = buildStatementData(person, personTxs, paymentMethods, user?.displayName || 'EcO User', user?.email || undefined);
    setBrandedStatementData(data);
    setBrandedStudioMode('person-statement');
    setIsBrandedStudioOpen(true);
  }, [paymentMethods, user?.displayName, user?.email]);

  const handleOpenMonthlyCardStudio = useCallback((monthKey?: string) => {
    const today = new Date();
    const defaultKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
    const targetMonthKey = monthKey || selectedStudioMonthKey || defaultKey;
    setSelectedStudioMonthKey(targetMonthKey);
    const [year, month] = targetMonthKey.split('-').map(Number);
    const dateObj = new Date(year, month - 1, 1);
    const monthTitle = dateObj.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

    const overview = computeStatsOverview(year, month, expenses, recurringExpenses, earnings, paymentMethods);
    const catStats = computeCategoryStats(year, month, expenses, recurringExpenses);

    const topCats = catStats.slice(0, 5).map((c) => ({
      category: c.name,
      amount: c.amount,
      percentage: c.percentage
    }));

    const savingsRate = overview.totalEarned > 0
      ? Math.max(0, Math.min(100, (overview.netSavings / overview.totalEarned) * 100))
      : 0;

    const cardData: BrandedMonthlyCardData = {
      referenceId: `ECO-REP-${targetMonthKey.replace('-', '')}`,
      monthKey: targetMonthKey,
      monthTitle,
      totalEarnings: overview.totalEarned,
      totalExpenses: overview.totalSpent,
      netSavings: overview.netSavings,
      savingsRate,
      topCategories: topCats,
      activeWalletsCount: paymentMethods.filter((m) => m.isActive).length,
      totalNetWorth: summary.netTotal,
      userName: user?.displayName || 'EcO User'
    };

    setBrandedMonthlyCardData(cardData);
    setBrandedStudioMode('monthly-card');
    setIsBrandedStudioOpen(true);
  }, [selectedStudioMonthKey, expenses, recurringExpenses, earnings, paymentMethods, summary.netTotal, user?.displayName]);

  // Unified Activity items for the List view
  const unifiedActivities: UnifiedActivityItem[] = useMemo(() => {
    const list: UnifiedActivityItem[] = [];

    // Expenses
    expenses.forEach((e) => {
      list.push({
        id: e.id,
        activityType: 'expense',
        title: e.reason || e.category,
        categoryOrSourceOrPerson: e.category,
        description: e.description,
        amount: e.amount,
        payMethodId: e.payMethodId,
        date: e.date,
        timestamp: e.timestamp,
        rawRecord: e
      });
    });

    // Recurring schedules
    recurringExpenses.forEach((r) => {
      list.push({
        id: r.id,
        activityType: 'recurring',
        title: `${r.reason} (Schedule)`,
        categoryOrSourceOrPerson: r.category,
        description: `${r.days} days schedule: ${r.startDate} to ${r.endDate}`,
        amount: r.amount,
        payMethodId: r.payMethodId,
        date: r.startDate,
        timestamp: r.timestamp,
        rawRecord: r
      });
    });

    // Earnings
    earnings.forEach((earn) => {
      list.push({
        id: earn.id,
        activityType: 'earning',
        title: earn.source,
        categoryOrSourceOrPerson: earn.source,
        description: earn.description,
        amount: earn.amount,
        payMethodId: earn.payMethodId,
        date: earn.date,
        timestamp: earn.timestamp,
        rawRecord: earn
      });
    });

    // Transfers
    transfers.forEach((tr) => {
      const fromName = paymentMethods.find((m) => m.id === tr.fromMethodId)?.name || 'Account';
      const toName = paymentMethods.find((m) => m.id === tr.toMethodId)?.name || 'Account';
      list.push({
        id: tr.id,
        activityType: 'transfer',
        title: `Transfer: ${fromName} → ${toName}`,
        categoryOrSourceOrPerson: 'Transfer',
        description: tr.note || 'Internal movement',
        amount: tr.requestedAmount,
        fromMethodId: tr.fromMethodId,
        toMethodId: tr.toMethodId,
        date: tr.date,
        timestamp: tr.timestamp,
        feeAmount: tr.chargeApplied ? tr.chargeAmount : 0,
        rawRecord: tr
      });
    });

    // Peer transactions (Give / Take)
    transactions.forEach((tx) => {
      const personName = people.find((p) => p.id === tx.personId)?.name || 'Person';
      list.push({
        id: tx.id,
        activityType: 'transaction',
        title: tx.type === 'give' ? `Lent to ${personName}` : `Borrowed from ${personName}`,
        categoryOrSourceOrPerson: personName,
        description: tx.description || tx.tag,
        amount: tx.amount,
        direction: tx.type,
        payMethodId: tx.payMethodId,
        date: tx.date,
        timestamp: tx.timestamp,
        status: tx.status,
        rawRecord: tx
      });
    });

    // Stable, strictly chronological sort: descending by normalized date, then timestamp, then ID
    const normalizeDateStr = (d?: string): string => {
      if (!d) return '1970-01-01';
      const clean = d.split('T')[0].trim().replace(/\//g, '-');
      const parts = clean.split('-');
      if (parts.length === 3) {
        const y = parts[0].padStart(4, '0');
        const m = parts[1].padStart(2, '0');
        const day = parts[2].padStart(2, '0');
        return `${y}-${m}-${day}`;
      }
      return clean;
    };

    const getValidTimestamp = (item: UnifiedActivityItem): number => {
      if (typeof item.timestamp === 'number' && !isNaN(item.timestamp) && item.timestamp > 0) {
        return item.timestamp;
      }
      const raw: any = item.rawRecord;
      if (raw && typeof raw.timestamp === 'number' && !isNaN(raw.timestamp) && raw.timestamp > 0) {
        return raw.timestamp;
      }
      if (raw && raw.createdAt) {
        const t = new Date(raw.createdAt).getTime();
        if (!isNaN(t) && t > 0) return t;
      }
      if (item.date) {
        const t = new Date(item.date).getTime();
        if (!isNaN(t)) return t;
      }
      return 0;
    };

    return list.sort((a, b) => {
      const dateA = normalizeDateStr(a.date);
      const dateB = normalizeDateStr(b.date);
      if (dateA !== dateB) {
        return dateB.localeCompare(dateA);
      }
      const timeA = getValidTimestamp(a);
      const timeB = getValidTimestamp(b);
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return (b.id || '').localeCompare(a.id || '');
    });
  }, [expenses, recurringExpenses, earnings, transfers, transactions, people, paymentMethods]);

  // Pending incoming proposals requiring recipient confirmation (unconditionally declared before any early returns)
  const pendingIncomingProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (p.status !== 'pending' && p.status !== 'disputed') return false;
      const uid = user?.uid;
      const isRecipient =
        (uid && p.recipientUserId === uid) ||
        (myConnectionCode && p.recipientCode === myConnectionCode) ||
        (uid && p.senderUserId !== uid);
      return isRecipient;
    });
  }, [proposals, user?.uid, myConnectionCode]);

  const unreadCount = useMemo(() => {
    const unreadNotifs = notifications.filter((n) => !n.readAt).length;
    return unreadNotifs + pendingIncomingProposals.length;
  }, [notifications, pendingIncomingProposals]);

  // Handler: Delete activity from unified list
  const handleDeleteActivity = (item: UnifiedActivityItem) => {
    if (item.activityType === 'expense') {
      repository.deleteExpense(item.id);
    } else if (item.activityType === 'recurring') {
      repository.deleteRecurringExpense(item.id);
    } else if (item.activityType === 'earning') {
      repository.deleteEarning(item.id);
    } else if (item.activityType === 'transfer') {
      repository.deleteTransfer(item.id);
    } else if (item.activityType === 'transaction') {
      repository.deleteTransaction(item.id);
    }
    showToast('Record deleted.');
  };

  // Handlers: Update activities from unified list
  const handleUpdateExpense = async (expense: ExpenseRecord) => {
    await repository.updateExpense(expense);
    showToast(`Expense "${expense.reason}" updated.`);
  };

  const handleUpdateRecurringExpense = async (rec: RecurringExpenseRecord) => {
    await repository.updateRecurringExpense(rec);
    showToast(`Recurring schedule "${rec.reason}" updated.`);
  };

  const handleUpdateEarning = async (earning: EarningRecord) => {
    await repository.updateEarning(earning);
    showToast(`Income "${earning.source}" updated.`);
  };

  const handleUpdateTransfer = async (transfer: TransferRecord) => {
    await repository.updateTransfer(transfer);
    showToast('Transfer record updated.');
  };

  const handleUpdateTransaction = async (tx: PeerTransactionRecord) => {
    await repository.updateTransaction(tx);
    showToast('Loan / Debt transaction updated.');
  };

  // Handler: Complete onboarding for new user
  const handleCompleteNewUser = async (data: {
    cashBalance: number;
    bkashBalance: number;
    nagadBalance: number;
    budgetMode: BudgetMode;
    directBudget: number;
    openingDebts: { id: string; name: string; type: 'give' | 'take'; amount: number }[];
  }) => {
    // 1. Update wallets opening balances
    const currentMethods = repository.getPaymentMethods();
    const cash = currentMethods.find((m) => m.name.toLowerCase() === 'cash') || currentMethods.find((m) => m.type === 'cash');
    if (cash) {
      cash.openingBalance = data.cashBalance;
      cash.balance = data.cashBalance;
      await repository.savePaymentMethod(cash);
    }
    const bkash = currentMethods.find((m) => m.name.toLowerCase().includes('bkash'));
    if (bkash) {
      bkash.openingBalance = data.bkashBalance;
      bkash.balance = data.bkashBalance;
      await repository.savePaymentMethod(bkash);
    } else {
      await repository.savePaymentMethod({
        id: BUILTIN_BKASH_ID,
        name: 'bKash',
        type: 'mobile_money',
        isBuiltIn: false,
        isActive: true,
        balance: data.bkashBalance,
        openingBalance: data.bkashBalance,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        legacyNames: ['bkash', 'bKash']
      });
    }

    const nagad = currentMethods.find((m) => m.name.toLowerCase().includes('nagad'));
    if (nagad) {
      nagad.openingBalance = data.nagadBalance;
      nagad.balance = data.nagadBalance;
      await repository.savePaymentMethod(nagad);
    } else {
      await repository.savePaymentMethod({
        id: BUILTIN_NAGAD_ID,
        name: 'Nagad',
        type: 'mobile_money',
        isBuiltIn: false,
        isActive: true,
        balance: data.nagadBalance,
        openingBalance: data.nagadBalance,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        legacyNames: ['nagad', 'Nagad']
      });
    }

    // 2. Add opening debts / loans
    for (const debt of data.openingDebts) {
      if (!debt.name || debt.amount <= 0) continue;
      let person = repository.getPeople().find((p) => p.name.toLowerCase() === debt.name.trim().toLowerCase());
      if (!person) {
        person = {
          id: `person_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: debt.name.trim(),
          isConnected: false,
          createdAt: new Date().toISOString()
        };
        await repository.addPerson(person);
      }

      await repository.addTransaction({
        id: `tx_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        personId: person.id,
        type: debt.type,
        amount: debt.amount,
        totalAmount: debt.amount,
        payMethodId: cash?.id || 'cash',
        tag: 'Opening',
        description: debt.type === 'give' ? 'Opening receivable' : 'Opening payable',
        date: new Date().toISOString().split('T')[0],
        isOpening: true,
        timestamp: Date.now(),
        status: 'local'
      });
    }

    // 3. Save settings
    const currentSettings = repository.getSettings();
    await repository.saveSettings({
      ...currentSettings,
      setupComplete: true,
      budgetMode: data.budgetMode,
      directDailyBudget: data.directBudget
    });

    await repository.setFirstLaunchDone(true);
    setIsOnboardingOpen(false);
    showToast('Welcome to EcO! Account setup complete.');
  };

  // Handler: Complete onboarding via eco-backup import
  const handleCompleteImport = async (backup: EcoBackupV1): Promise<{ importedCount: number; skippedCount: number }> => {
    const res = await repository.importBackup(backup);
    await repository.setFirstLaunchDone(true);
    setIsOnboardingOpen(false);
    showToast(`Backup restored: ${res.importedCount} records imported${res.skippedCount > 0 ? ` (${res.skippedCount} duplicates skipped)` : ''}.`);
    return res;
  };

  const handleDismissOnboarding = async () => {
    await repository.setFirstLaunchDone(true);
    setIsOnboardingOpen(false);
  };

  // Export backup JSON trigger
  const handleExportBackup = () => {
    const backupData = repository.exportBackup();
    const jsonStr = JSON.stringify(backupData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    link.href = url;
    link.download = `eco-backup-${timestamp}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Backup JSON exported successfully.');
  };

  // Share link generator for a person
  const handleGenerateShareLink = (personId: string): string => {
    return repository.generateAndSyncPersonShare(personId, user?.displayName || 'EcO User');
  };

  // If a public share token is present in URL, render the read-only projection
  if (sharedPersonToken) {
    return (
      <>
        <PublicShareView
          shareToken={sharedPersonToken}
          onOpenBrandedStatement={handleOpenStatementStudio}
          onExit={() => {
            window.history.replaceState({}, '', window.location.pathname);
            setSharedPersonToken(null);
          }}
        />
        <EcoBrandedStudioModal
          isOpen={isBrandedStudioOpen}
          mode={brandedStudioMode}
          voucherData={brandedVoucherData}
          multiVoucherData={brandedMultiVoucherData}
          statementData={brandedStatementData}
          monthlyCardData={brandedMonthlyCardData}
          availableMonths={availableMonths}
          selectedMonthKey={selectedStudioMonthKey}
          onMonthChange={(newMonthKey) => handleOpenMonthlyCardStudio(newMonthKey)}
          initialTheme={settings.theme === 'light' ? 'light' : 'dark'}
          initialPalette={settings.colorPalette || 'green'}
          onClose={() => setIsBrandedStudioOpen(false)}
          showToast={showToast}
        />
      </>
    );
  }

  if (sharedSettlementToken) {
    return (
      <PublicSettlementShareView
        shareToken={sharedSettlementToken}
        onExit={() => {
          window.history.replaceState({}, '', window.location.pathname);
          setSharedSettlementToken(null);
        }}
      />
    );
  }

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#111317] flex flex-col items-center justify-center text-[#E2E2E8]">
        <div className="w-16 h-16 rounded-2xl bg-[#1A1C20] border-2 border-[var(--brand-accent,#73E3B4)] flex items-center justify-center text-[var(--brand-accent,#73E3B4)] font-bold text-2xl shadow-xl animate-pulse mb-4 select-none">
          EcO
        </div>
        <p className="text-sm font-medium text-[#87948C]">Opening your private ledger...</p>
      </div>
    );
  }

  // If user is logged out, render the welcoming landing page
  if (!user) {
    return (
      <>
        <LandingPageView
          currentTheme={settings.theme === 'light' ? 'light' : 'dark'}
          onToggleTheme={() => {
            const nextTheme: 'light' | 'dark' = settings.theme === 'light' ? 'dark' : 'light';
            const nextSettings = { ...settings, theme: nextTheme };
            setSettings(nextSettings);
            repository.saveSettings(nextSettings);
          }}
          onOpenSupport={() => setIsSupportOpen(true)}
        />
        <SupportModal
          isOpen={isSupportOpen}
          onClose={() => setIsSupportOpen(false)}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#111317] text-[#E2E2E8] flex flex-col font-sans">
      {/* Offline Connectivity Warning Banner */}
      {!isOnline && (
        <div className="bg-[#D97706] text-black px-4 py-1.5 text-xs font-semibold flex items-center justify-center gap-2 z-50">
          <WifiOff className="w-3.5 h-3.5" />
          <span>Offline Mode — All changes are saved safely to your local device.</span>
        </div>
      )}

      {/* Navigation: Desktop Sidebar (240px) + Mobile Bottom Nav (64px) + Mobile Slide Drawer */}
      <Navigation
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        onOpenAddModal={() => {
          setInitialAddKind(undefined);
          setIsAddModalOpen(true);
        }}
        onOpenNotifications={() => setIsNotificationsOpen(true)}
        onOpenFeedback={() => setIsFeedbackOpen(true)}
        onOpenSupport={() => setIsSupportOpen(true)}
        onSignOut={handleSignOut}
        user={user}
        unreadNotificationCount={unreadCount}
        isMobileDrawerOpen={isMobileDrawerOpen}
        onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
      />

      {/* Main content wrapper offset for sidebar and header */}
      <div className="flex-1 flex flex-col lg:pl-60 min-w-0">
        {/* Top Header */}
        <Header
          onOpenNotifications={() => setIsNotificationsOpen(true)}
          onOpenSettings={() => setCurrentTab('settings')}
          onOpenSupport={() => setIsSupportOpen(true)}
          onOpenMobileDrawer={() => setIsMobileDrawerOpen(true)}
          onSignOut={handleSignOut}
          user={user}
          unreadCount={unreadCount}
          currentTabName={
            currentTab === 'dashboard'
              ? 'Dashboard'
              : currentTab === 'list'
              ? 'Ledger History'
              : currentTab === 'wallets'
              ? 'Wallets'
              : currentTab === 'people'
              ? 'People & Debts'
              : currentTab === 'stats'
              ? 'Statistics'
              : 'Settings'
          }
        />

        {/* Unverified Email Gentle Banner */}
        {user && user.providerId === 'email' && !user.emailVerified && !dismissEmailBanner && (
          <div className="mt-14 bg-[#1A1C20] border-b border-[#3D4943]/40 px-4 py-2.5 text-xs flex items-center justify-between gap-3 text-[#BCCAC1] z-10">
            <div className="flex items-center gap-2">
              <MailCheck className="w-4 h-4 text-[var(--brand-accent,#73E3B4)] shrink-0" />
              <span>
                Please verify your email (<strong>{user.email}</strong>) for security.
              </span>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleResendVerification}
                disabled={resendingVerification}
                className="text-xs font-semibold text-[var(--brand-accent,#73E3B4)] hover:underline cursor-pointer disabled:opacity-50"
              >
                {resendingVerification ? 'Sending...' : 'Resend link'}
              </button>
              <button
                type="button"
                onClick={() => setDismissEmailBanner(true)}
                className="p-1 text-[#87948C] hover:text-[#E2E2E8] rounded cursor-pointer"
                aria-label="Dismiss banner"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* View Content Viewport */}
        <main className={`flex-1 ${user && user.providerId === 'email' && !user.emailVerified && !dismissEmailBanner ? 'pt-4' : 'pt-18'} px-4 sm:px-6 lg:px-8 max-w-7xl w-full mx-auto`}>
          {currentTab === 'dashboard' && (
            <DashboardView
              summary={summary}
              settings={settings}
              todayExpenses={todayExpenses}
              expenses={expenses}
              recurringExpenses={recurringExpenses}
              recentActivities={unifiedActivities}
              paymentMethods={paymentMethods}
              people={people}
              transactions={transactions}
              dismissedMilestones={dismissedMilestones}
              onDismissMilestone={(personId, milestoneKey) => {
                repository.dismissMilestone(personId, milestoneKey);
                showToast('Reminder acknowledged.');
              }}
              onNavigateToList={() => setCurrentTab('list')}
              onNavigateToWallets={() => setCurrentTab('wallets')}
              onNavigateToPeople={() => setCurrentTab('people')}
              onNavigateToSettlements={() => setCurrentTab('settlements')}
              onNavigateToSettings={() => setCurrentTab('settings')}
              onOpenAddModal={() => {
                setInitialAddKind(undefined);
                setIsAddModalOpen(true);
              }}
              sources={sources}
              categories={settings.categories}
              tags={settings.tags}
              onUpdateExpense={handleUpdateExpense}
              onUpdateRecurringExpense={handleUpdateRecurringExpense}
              onUpdateEarning={handleUpdateEarning}
              onUpdateTransfer={handleUpdateTransfer}
              onUpdateTransaction={handleUpdateTransaction}
              onDeleteActivity={handleDeleteActivity}
              onOpenBrandedVoucher={handleOpenVoucherStudio}
              onOpenBrandedMonthlyReport={() => handleOpenMonthlyCardStudio()}
            />
          )}

          {currentTab === 'list' && (
            <UnifiedListView
              activities={unifiedActivities}
              paymentMethods={paymentMethods}
              people={people}
              categories={settings.categories}
              sources={sources}
              tags={settings.tags}
              onDeleteActivity={handleDeleteActivity}
              onUpdateExpense={handleUpdateExpense}
              onUpdateRecurringExpense={handleUpdateRecurringExpense}
              onUpdateEarning={handleUpdateEarning}
              onUpdateTransfer={handleUpdateTransfer}
              onUpdateTransaction={handleUpdateTransaction}
              onOpenBrandedVoucher={handleOpenVoucherStudio}
              onOpenBrandedMultiVoucher={handleOpenMultiVoucherStudio}
              onOpenAddModal={() => {
                setInitialAddKind(undefined);
                setIsAddModalOpen(true);
              }}
            />
          )}

          {currentTab === 'settlements' && (
            <SmartSettlementView
              settlements={smartSettlements}
              wallets={paymentMethods}
              currentUserName={user?.displayName || 'You'}
              showToast={showToast}
            />
          )}

          {currentTab === 'wallets' && (
            <WalletsView
              paymentMethods={paymentMethods}
              summary={summary}
              onSaveMethod={(m) => {
                repository.savePaymentMethod(m);
                showToast(`Wallet "${m.name}" updated.`);
              }}
              onArchiveMethod={(id) => {
                repository.archivePaymentMethod(id);
                showToast('Wallet archived.');
              }}
              onOpenAddTransfer={(fromId) => {
                setInitialAddKind('transfer');
                setIsAddModalOpen(true);
              }}
            />
          )}

          {currentTab === 'people' && (
            <PeopleView
              people={people}
              transactions={transactions}
              paymentMethods={paymentMethods}
              personBalances={summary.personBalances}
              connections={connections}
              proposals={proposals}
              myConnectionCode={myConnectionCode}
              onAddPerson={(name, phone) => {
                const newPerson: PersonRecord = {
                  id: `person_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                  name: name.trim(),
                  isConnected: false,
                  createdAt: new Date().toISOString()
                };
                if (phone && phone.trim()) {
                  newPerson.phone = phone.trim();
                }
                repository.addPerson(newPerson);
                showToast(`Added ${name} to ledger.`);
              }}
              onUpdatePerson={(updated) => {
                repository.updatePerson(updated);
                showToast(`Updated ${updated.name}'s details.`);
              }}
              onDeletePerson={(id) => {
                repository.deletePerson(id);
                showToast('Person removed.');
              }}
              onOpenAddPeerTransaction={(personId) => {
                setInitialAddKind('give');
                setIsAddModalOpen(true);
              }}
              onGenerateShareLink={handleGenerateShareLink}
              onOpenBrandedStatement={handleOpenStatementStudio}
              onOpenBrandedVoucher={(tx, person) => {
                const unifiedItem: UnifiedActivityItem = {
                  id: tx.id,
                  activityType: 'transaction',
                  direction: tx.type,
                  amount: tx.amount,
                  title: tx.type === 'give' ? `Lent to ${person.name}` : `Borrowed from ${person.name}`,
                  categoryOrSourceOrPerson: person.name,
                  date: tx.date,
                  payMethodId: tx.payMethodId,
                  description: tx.description,
                  feeAmount: tx.chargeAmount,
                  timestamp: tx.timestamp || Date.now(),
                  rawRecord: tx
                };
                handleOpenVoucherStudio(unifiedItem);
              }}
              onCreateConnection={async (code, peerName) => {
                const res = await repository.requestConnection(code, peerName);
                if (res.success) {
                  showToast(`Connected with ${res.connection?.peerName || peerName} (${code}).`);
                } else {
                  showToast(res.error || 'Could not connect.');
                }
              }}
              onDeleteConnection={async (connId) => {
                await repository.deleteConnection(connId);
                showToast('Connection removed.');
              }}
              onCreateProposal={async (recipientCode, recipientName, type, amount, date, note, isRepayment, payMethodId) => {
                const res = await repository.createProposal({
                  recipientCode,
                  recipientName,
                  type,
                  amount,
                  date,
                  note,
                  isRepayment,
                  payMethodId
                });
                if (res.success) {
                  showToast(`${isRepayment ? 'Repayment proposal' : 'Transaction proposal'} of ৳${amount} sent to ${recipientName}.`);
                } else {
                  showToast(res.error || 'Could not create proposal.');
                }
              }}
              onAcceptProposal={async (proposalId, payMethodId) => {
                const res = await repository.acceptProposal(proposalId, payMethodId);
                if (res.success) {
                  showToast('Proposal confirmed & posted to your shared ledger!');
                } else {
                  showToast(res.error || 'Failed to accept proposal.');
                }
              }}
              onDisputeProposal={async (proposalId, reason) => {
                const res = await repository.disputeProposal(proposalId, reason);
                if (res.success) {
                  showToast('Proposal marked as disputed. No changes were made to confirmed balances.');
                } else {
                  showToast(res.error || 'Failed to dispute proposal.');
                }
              }}
              onRejectProposal={async (proposalId) => {
                await repository.rejectProposal(proposalId);
                showToast('Proposal rejected.');
              }}
            />
          )}

          {currentTab === 'stats' && (
            <StatsView
              expenses={expenses}
              recurringExpenses={recurringExpenses}
              earnings={earnings}
              transfers={transfers}
              paymentMethods={paymentMethods}
              settings={settings}
              onNavigateToSettings={() => setCurrentTab('settings')}
              onOpenBrandedMonthlyReport={handleOpenMonthlyCardStudio}
              showToast={showToast}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              settings={settings}
              user={user}
              showToast={showToast}
              onSaveSettings={(s, msg) => {
                repository.saveSettings(s);
                showToast(msg || 'Settings saved.');
              }}
              onExportBackup={handleExportBackup}
              onOpenImportModal={() => setIsOnboardingOpen(true)}
              onReRunOnboarding={() => setIsOnboardingOpen(true)}
              onResetAllData={() => {
                repository.resetAllData();
                setIsOnboardingOpen(true);
                showToast('Sandbox reset.');
              }}
              onUpdateName={updateName}
              onSendPasswordReset={async () => {
                if (user?.email) {
                  await requestPasswordReset(user.email);
                  showToast('Password reset email sent. Check your inbox.');
                }
              }}
              onChangePassword={updatePassword}
              onResendVerification={resendVerification}
              onDeleteAccount={handleDeleteAccount}
              onSignOut={handleSignOut}
            />
          )}
        </main>
      </div>

      {/* Global Add Modal (5 adaptive workflows) */}
      <GlobalAddModal
        isOpen={isAddModalOpen}
        initialKind={initialAddKind}
        onClose={() => {
          setIsAddModalOpen(false);
          setInitialAddKind(undefined);
        }}
        paymentMethods={paymentMethods}
        people={people}
        connections={connections}
        sources={sources}
        categories={settings.categories}
        tags={settings.tags}
        defaultChargeRate={settings.cashoutChargeRate || 2}
        onSaveExpense={(data) => {
          repository.addExpense({
            id: `exp_${Date.now()}`,
            ...data,
            timestamp: Date.now()
          });
          showToast(`Expense recorded (${data.category}).`);
        }}
        onSaveRecurringExpense={(data) => {
          repository.addRecurringExpense({
            id: `rec_${Date.now()}`,
            ...data,
            perDay: Math.round((data.amount / data.days) * 100) / 100,
            timestamp: Date.now()
          });
          showToast('Recurring expense schedule saved.');
        }}
        onSaveEarning={(data) => {
          repository.addEarning({
            id: `earn_${Date.now()}`,
            ...data,
            timestamp: Date.now()
          });
          showToast(`Inflow recorded (${data.source}).`);
        }}
        onSaveTransfer={(data) => {
          repository.addTransfer({
            id: `tr_${Date.now()}`,
            ...data,
            timestamp: Date.now()
          });
          showToast('Transfer completed.');
        }}
        onSavePeerTransaction={(data) => {
          repository.addTransaction({
            id: `tx_${Date.now()}`,
            ...data,
            totalAmount: data.amount,
            timestamp: Date.now(),
            status: 'local'
          });
          showToast(`Debt transaction recorded (${data.type === 'give' ? 'Lent' : 'Borrowed'}).`);
        }}
        onSaveConnectedProposal={async (data) => {
          const res = await repository.createProposal({
            recipientCode: data.recipientCode,
            recipientName: data.recipientName,
            type: data.type,
            amount: data.amount,
            date: data.date,
            note: data.note,
            isRepayment: data.isRepayment,
            payMethodId: data.payMethodId
          });
          if (res.success) {
            showToast(`${data.isRepayment ? 'Repayment proposal' : 'EcO proposal'} of ৳${data.amount} sent to ${data.recipientName} for confirmation!`);
          } else {
            showToast(res.error || 'Failed to send proposal.');
          }
        }}
        onCreatePersonInline={(name, phone) => {
          const newPerson: PersonRecord = {
            id: `person_${Date.now()}`,
            name: name.trim(),
            isConnected: false,
            createdAt: new Date().toISOString()
          };
          if (phone && phone.trim()) {
            newPerson.phone = phone.trim();
          }
          repository.addPerson(newPerson);
          return newPerson.id;
        }}
        onCreateSourceInline={(name) => {
          repository.addSource({
            id: `src_${Date.now()}`,
            name,
            createdAt: new Date().toISOString()
          });
        }}
        onCreateTagInline={(tag) => {
          const current = repository.getSettings();
          if (!current.tags.includes(tag)) {
            repository.saveSettings({
              ...current,
              tags: [...current.tags, tag]
            });
          }
        }}
      />

      {/* First-Launch Onboarding Modal with 1-Click Sample Fixture */}
      <OnboardingModal
        isOpen={isOnboardingOpen}
        canDismiss={true}
        onDismiss={handleDismissOnboarding}
        onSkip={handleDismissOnboarding}
        initialMode={firstLaunchDone ? 'import_flow' : 'choose'}
        onCompleteNewUser={handleCompleteNewUser}
        onCompleteImport={handleCompleteImport}
      />

      {/* Notification Inbox Modal (7-Day TTL + Interactive EcO Proposals) */}
      <NotificationModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        incomingProposals={pendingIncomingProposals}
        paymentMethods={paymentMethods}
        onMarkRead={(id) => repository.markNotificationRead(id)}
        onMarkAllRead={() => repository.markAllNotificationsRead()}
        onAcceptProposal={async (proposalId, payMethodId) => {
          const res = await repository.acceptProposal(proposalId, payMethodId);
          if (res.success) {
            showToast('Proposal confirmed & posted to your shared ledger!');
          } else {
            showToast(res.error || 'Failed to accept proposal.');
          }
        }}
        onRejectProposal={async (proposalId) => {
          await repository.rejectProposal(proposalId);
          showToast('Proposal rejected.');
        }}
        onDisputeProposal={async (proposalId, reason) => {
          const res = await repository.disputeProposal(proposalId, reason);
          if (res.success) {
            showToast('Proposal marked as disputed. No changes were made to confirmed balances.');
          } else {
            showToast(res.error || 'Failed to dispute proposal.');
          }
        }}
        onNavigateToConnections={() => {
          setIsNotificationsOpen(false);
          setCurrentTab('people');
        }}
      />

      {/* "অ্যাপ রে গালাবো" Feedback Modal */}
      <FeedbackModal
        isOpen={isFeedbackOpen}
        onClose={() => setIsFeedbackOpen(false)}
        currentPage={currentTab}
        userEmail={user?.email || undefined}
        userName={user?.displayName || undefined}
        userId={user?.uid || undefined}
        communityIssues={communityIssues}
        onVoteIssue={async (issueId, voteType, voterId) => {
          const res = await repository.voteIssue(issueId, voteType, voterId);
          setCommunityIssues(repository.getCommunityIssues());
          return res;
        }}
        onSubmitReport={async (report) => {
          try {
            await repository.saveIssueReport(report);
          } catch (err) {
            console.warn('saveIssueReport warning:', err);
          }
          setCommunityIssues(repository.getCommunityIssues());
        }}
        showToast={showToast}
      />

      {/* Support EcO Modal */}
      <SupportModal
        isOpen={isSupportOpen}
        onClose={() => setIsSupportOpen(false)}
      />

      {/* EcO Branded Document & Share Card Studio Modal */}
      <EcoBrandedStudioModal
        isOpen={isBrandedStudioOpen}
        mode={brandedStudioMode}
        voucherData={brandedVoucherData}
        multiVoucherData={brandedMultiVoucherData}
        statementData={brandedStatementData}
        monthlyCardData={brandedMonthlyCardData}
        availableMonths={availableMonths}
        selectedMonthKey={selectedStudioMonthKey}
        onMonthChange={(newMonthKey) => handleOpenMonthlyCardStudio(newMonthKey)}
        initialTheme={settings.theme === 'light' ? 'light' : 'dark'}
        initialPalette={settings.colorPalette || 'green'}
        onClose={() => setIsBrandedStudioOpen(false)}
        showToast={showToast}
      />

      {/* Toast Notification (Top-Right, directly below header) */}
      {toastMessage && (
        <div className="fixed top-16 right-4 sm:right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl bg-[#1A1C20] border-2 border-[var(--brand-accent,#73E3B4)] text-[#E2E2E8] shadow-2xl animate-in fade-in slide-in-from-top-2 duration-150 max-w-sm">
          <div className="w-6 h-6 rounded-lg bg-[var(--brand-accent,#73E3B4)] text-[#003826] flex items-center justify-center font-bold shrink-0">
            <Check className="w-3.5 h-3.5 stroke-[2.8]" />
          </div>
          <span className="text-xs font-semibold text-[#E2E2E8] flex-1 leading-snug">{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            className="text-[#87948C] hover:text-[#E2E2E8] p-1 rounded hover:bg-[#282A2E] transition-colors cursor-pointer"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
