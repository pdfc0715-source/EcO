import {
  UserSettings,
  PaymentMethod,
  PaymentMethodType,
  ExpenseRecord,
  RecurringExpenseRecord,
  EarningRecord,
  TransferRecord,
  PersonRecord,
  PeerTransactionRecord,
  IncomeSource,
  AppNotification,
  EcOConnection,
  EcOProposal,
  IssueReport,
  encodePersonShareToken,
  decodePersonShareToken
} from '../domain/types';
import {
  SmartSettlement,
  SettlementMember,
  SettlementExpense,
  SettlementPayment,
  SettlementRefund
} from '../domain/settlementTypes';
import { poishaToTaka } from '../domain/settlementEngine';
import { createDefaultPaymentMethods, getDefaultCashMethodId, BUILTIN_CASH_ID, BUILTIN_BKASH_ID, BUILTIN_NAGAD_ID } from '../domain/paymentMethods';
import { SEVEN_DAYS_MS } from '../domain/dates';
import { EcoBackupV1, migrateBackupV1ToDomain } from '../domain/backupV1';
import {
  invertProposalDirection,
  generateDefaultConnectionCode,
  formatConnectionCode,
  validateConnectionCode
} from '../domain/connections';
import { db, isFirebaseConfigured, handleFirestoreError, OperationType, sanitizeForFirestore } from './firebase';
import {
  doc,
  collection,
  setDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  Unsubscribe,
  writeBatch,
  query,
  where
} from 'firebase/firestore';

export class HybridFirebaseRepository {
  private listeners: Set<() => void> = new Set();
  private unsubs: Unsubscribe[] = [];
  private activeUserId: string | null = null;
  private userDisplayName: string = 'EcO User';
  private userEmail: string = '';

  // In-memory user data cache
  private settings: UserSettings | null = null;
  private paymentMethods: PaymentMethod[] = [];
  private expenses: ExpenseRecord[] = [];
  private recurringExpenses: RecurringExpenseRecord[] = [];
  private earnings: EarningRecord[] = [];
  private transfers: TransferRecord[] = [];
  private people: PersonRecord[] = [];
  private transactions: PeerTransactionRecord[] = [];
  private sources: IncomeSource[] = [];
  private notifications: AppNotification[] = [];
  private connections: EcOConnection[] = [];
  private proposals: EcOProposal[] = [];
  private dismissedMilestones: Record<string, string[]> = {};
  private myConnectionCode: string = 'ECO-USER';
  private firstLaunchDone: boolean = false;
  private communityIssues: IssueReport[] = [];
  private smartSettlements: SmartSettlement[] = [];

  constructor() {
    this.loadFromLocalStorageCache();
    this.setupCommunityIssuesStream();

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (
          e.key?.startsWith('eco_shared_proposals') ||
          e.key?.startsWith('eco_shared_connections') ||
          e.key?.startsWith('eco_code_registry') ||
          e.key?.includes('proposals') ||
          e.key?.includes('connections')
        ) {
          this.loadFromLocalStorageCache();
          this.notify();
        }
      });
    }
  }

  subscribe(callback: () => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notify() {
    this.listeners.forEach((cb) => {
      try {
        cb();
      } catch (e) {
        console.error('Repository listener error:', e);
      }
    });
  }

  private getStorageKey(key: string): string {
    const userPrefix = this.activeUserId ? `eco_user_${this.activeUserId}_` : 'eco_local_';
    return `${userPrefix}${key}`;
  }

  private async setDocSafe(docRef: any, data: any, options?: { merge?: boolean }) {
    const sanitized = sanitizeForFirestore(data);
    return options ? setDoc(docRef, sanitized, options) : setDoc(docRef, sanitized);
  }

  /**
   * Initializes data streams for the logged-in user.
   */
  async initForUser(userId: string, userDisplayName?: string, userEmail?: string): Promise<boolean> {
    // Unsubscribe from previous user streams if any
    this.unsubs.forEach((unsub) => unsub());
    this.unsubs = [];
    this.activeUserId = userId;
    this.userDisplayName = userDisplayName || 'EcO User';
    this.userEmail = userEmail || '';

    // 1. Load from local cache for instant zero-latency render
    this.loadFromLocalStorageCache();

    // Determine or generate unique Connection Code for this user
    let userCode = localStorage.getItem(this.getStorageKey('connectionCode'));
    if (!userCode || userCode === 'ECO-USER') {
      userCode = generateDefaultConnectionCode(userId);
      this.myConnectionCode = userCode;
      localStorage.setItem(this.getStorageKey('connectionCode'), userCode);
    } else {
      this.myConnectionCode = userCode;
    }

    // Save in public code registry for local offline & cross-tab testing
    try {
      localStorage.setItem(
        `eco_code_registry_${this.myConnectionCode}`,
        JSON.stringify({
          code: this.myConnectionCode,
          userId: userId,
          displayName: this.userDisplayName,
          email: this.userEmail,
          updatedAt: Date.now()
        })
      );
    } catch {}

    // 2. If Firebase is active and configured, synchronize Firestore collections
    if (isFirebaseConfigured() && db) {
      try {
        const userRef = doc(db, 'users', userId);
        const userSnap = await getDoc(userRef);

        if (!userSnap.exists()) {
          // Check if there was pre-login guest data in local storage
          const guestMethodsRaw = localStorage.getItem('eco_local_paymentMethods');
          const guestSettingsRaw = localStorage.getItem('eco_local_settings');
          const guestExpensesRaw = localStorage.getItem('eco_local_expenses');
          const guestEarningsRaw = localStorage.getItem('eco_local_earnings');
          const guestTransfersRaw = localStorage.getItem('eco_local_transfers');
          const guestPeopleRaw = localStorage.getItem('eco_local_people');
          const guestTxRaw = localStorage.getItem('eco_local_transactions');
          const guestSetup =
            localStorage.getItem('eco_local_setupComplete') === 'true' ||
            localStorage.getItem('eco_onboarding_completed') === 'true';

          let initialSettings: UserSettings = {
            id: userId,
            theme: 'dark',
            colorPalette: 'green',
            setupComplete: false,
            budgetMode: 'direct',
            directDailyBudget: 500,
            monthlyIncome: 0,
            monthlyFixed: 0,
            monthlySavings: 0,
            monthlyEmergency: 0,
            bufferPct: 10,
            cashoutChargeRate: 2,
            categories: ['Food', 'Transport', 'Groceries', 'Utilities', 'Entertainment', 'Health', 'Shopping', 'Other'],
            tags: ['Personal', 'Work', 'Family', 'Loan', 'Project'],
            currencySymbol: '৳'
          };

          if (guestSettingsRaw) {
            try {
              initialSettings = { ...initialSettings, ...JSON.parse(guestSettingsRaw), id: userId };
            } catch {}
          }
          if (guestSetup) {
            initialSettings.setupComplete = true;
          }

          let initialMethods: PaymentMethod[] = createDefaultPaymentMethods();
          if (guestMethodsRaw) {
            try {
              const parsedM = JSON.parse(guestMethodsRaw);
              if (Array.isArray(parsedM) && parsedM.length > 0) {
                initialMethods = parsedM;
              }
            } catch {}
          } else if (this.paymentMethods.length > 0) {
            initialMethods = [...this.paymentMethods];
          }

          // Compute opening balances mapping
          const cashM = initialMethods.find((m) => m.type === 'cash' || m.name.toLowerCase() === 'cash');
          const bkashM = initialMethods.find((m) => m.name.toLowerCase().includes('bkash'));
          const nagadM = initialMethods.find((m) => m.name.toLowerCase().includes('nagad'));
          const openingBalancesData = {
            cash: cashM?.openingBalance || 0,
            bkash: bkashM?.openingBalance || 0,
            nagad: nagadM?.openingBalance || 0,
            updatedAt: new Date().toISOString()
          };

          await this.setDocSafe(userRef, {
            ...initialSettings,
            uid: userId,
            displayName: this.userDisplayName,
            email: this.userEmail,
            connectionCode: this.myConnectionCode,
            openingBalances: openingBalancesData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          });

          // Save openingBalances subcollection
          await this.setDocSafe(doc(db, 'users', userId, 'openingBalances', 'current'), {
            id: 'current',
            cash: openingBalancesData.cash,
            bkash: openingBalancesData.bkash,
            nagad: openingBalancesData.nagad,
            date: new Date().toISOString().split('T')[0],
            updatedAt: Date.now()
          });

          // Seed or migrate payment methods
          for (const m of initialMethods) {
            await this.setDocSafe(doc(db, 'users', userId, 'paymentMethods', m.id), m);
          }
          this.paymentMethods = initialMethods;
          this.saveToLocalStorageCache('paymentMethods', initialMethods);

          // Seed default income sources
          const defaultSources: IncomeSource[] = [
            { id: 'src_salary', name: 'Salary', description: 'Primary monthly income', createdAt: new Date().toISOString() },
            { id: 'src_freelance', name: 'Freelance', description: 'Projects and consulting', createdAt: new Date().toISOString() },
            { id: 'src_investment', name: 'Investments', description: 'Dividends and profits', createdAt: new Date().toISOString() }
          ];
          for (const s of defaultSources) {
            await this.setDocSafe(doc(db, 'users', userId, 'sources', s.id), s);
          }
          this.sources = defaultSources;
          this.saveToLocalStorageCache('sources', defaultSources);

          // Migrate any guest expenses, earnings, transfers, people, transactions
          if (guestExpensesRaw) {
            try {
              const exps: ExpenseRecord[] = JSON.parse(guestExpensesRaw);
              for (const e of exps) {
                await this.setDocSafe(doc(db, 'users', userId, 'expenses', e.id), e);
              }
              this.expenses = exps;
              this.saveToLocalStorageCache('expenses', exps);
            } catch {}
          }
          if (guestEarningsRaw) {
            try {
              const earns: EarningRecord[] = JSON.parse(guestEarningsRaw);
              for (const e of earns) {
                await this.setDocSafe(doc(db, 'users', userId, 'earnings', e.id), e);
              }
              this.earnings = earns;
              this.saveToLocalStorageCache('earnings', earns);
            } catch {}
          }
          if (guestTransfersRaw) {
            try {
              const trs: TransferRecord[] = JSON.parse(guestTransfersRaw);
              for (const t of trs) {
                await this.setDocSafe(doc(db, 'users', userId, 'transfers', t.id), t);
              }
              this.transfers = trs;
              this.saveToLocalStorageCache('transfers', trs);
            } catch {}
          }
          if (guestPeopleRaw) {
            try {
              const pps: PersonRecord[] = JSON.parse(guestPeopleRaw);
              for (const p of pps) {
                await this.setDocSafe(doc(db, 'users', userId, 'people', p.id), p);
              }
              this.people = pps;
              this.saveToLocalStorageCache('people', pps);
            } catch {}
          }
          if (guestTxRaw) {
            try {
              const txs: PeerTransactionRecord[] = JSON.parse(guestTxRaw);
              for (const tx of txs) {
                await this.setDocSafe(doc(db, 'users', userId, 'transactions', tx.id), tx);
              }
              this.transactions = txs;
              this.saveToLocalStorageCache('transactions', txs);
            } catch {}
          }

          this.settings = initialSettings;
          this.firstLaunchDone = Boolean(initialSettings.setupComplete);
        } else {
          // Existing user document found in Firestore: load profile & settings
          const data = userSnap.data();
          this.settings = {
            id: userId,
            theme: data.theme || 'dark',
            colorPalette: data.colorPalette || 'green',
            setupComplete: Boolean(data.setupComplete),
            budgetMode: data.budgetMode || 'direct',
            directDailyBudget: data.directDailyBudget ?? 500,
            monthlyIncome: data.monthlyIncome ?? 0,
            monthlyFixed: data.monthlyFixed ?? 0,
            monthlySavings: data.monthlySavings ?? 0,
            monthlyEmergency: data.monthlyEmergency ?? 0,
            bufferPct: data.bufferPct ?? 10,
            cashoutChargeRate: data.cashoutChargeRate ?? 2,
            categories: data.categories || ['Food', 'Transport', 'Utilities'],
            tags: data.tags || ['Personal'],
            currencySymbol: '৳'
          };
          this.firstLaunchDone = Boolean(data.setupComplete);
          this.saveToLocalStorageCache('settings', this.settings);

          if (data?.connectionCode && data.connectionCode !== 'ECO-USER') {
            this.myConnectionCode = data.connectionCode;
            localStorage.setItem(this.getStorageKey('connectionCode'), this.myConnectionCode);
          } else {
            await this.setDocSafe(userRef, { connectionCode: this.myConnectionCode }, { merge: true });
          }

          // AWAIT all subcollections synchronously so mobile has 100% of data before resolving!
          try {
            const fetchSafe = async (colName: string) => {
              if (!db) return null;
              try {
                return await getDocs(collection(db, 'users', userId, colName));
              } catch (e) {
                console.warn(`[EcO Firestore] Fetch error on subcollection ${colName}:`, e);
                return null;
              }
            };

            const [
              methodsSnap,
              expensesSnap,
              recurringSnap,
              earningsSnap,
              transfersSnap,
              peopleSnap,
              transactionsSnap,
              sourcesSnap,
              notifsSnap,
              settlementsSnap
            ] = await Promise.all([
              fetchSafe('paymentMethods'),
              fetchSafe('expenses'),
              fetchSafe('recurringExpenses'),
              fetchSafe('earnings'),
              fetchSafe('transfers'),
              fetchSafe('people'),
              fetchSafe('transactions'),
              fetchSafe('sources'),
              fetchSafe('notifications'),
              fetchSafe('smartSettlements')
            ]);

            let loadedMethods: PaymentMethod[] = methodsSnap
              ? (methodsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as PaymentMethod[])
              : [];

            // CRITICAL: Preserve any custom wallets currently in local memory or storage
            this.paymentMethods.forEach((localM) => {
              const exists = loadedMethods.some(
                (m) =>
                  m.id === localM.id ||
                  (m.name.toLowerCase().trim() === localM.name.toLowerCase().trim() && m.type === localM.type)
              );
              if (!exists) {
                loadedMethods.push(localM);
                if (db && userId) {
                  this.setDocSafe(doc(db, 'users', userId, 'paymentMethods', localM.id), localM).catch(() => {});
                }
              }
            });

            if (loadedMethods.length === 0) {
              loadedMethods = createDefaultPaymentMethods();
              for (const m of loadedMethods) {
                await this.setDocSafe(doc(db, 'users', userId, 'paymentMethods', m.id), m);
              }
            } else {
              // Ensure core wallets (Cash, bKash, Nagad) exist
              const coreDefaults = createDefaultPaymentMethods();
              for (const def of coreDefaults) {
                const exists = loadedMethods.find(
                  (m) =>
                    m.id === def.id ||
                    m.name.toLowerCase().trim() === def.name.toLowerCase().trim()
                );
                if (!exists) {
                  await this.setDocSafe(doc(db, 'users', userId, 'paymentMethods', def.id), def);
                  loadedMethods.push(def);
                }
              }
            }

            // Reconcile openingBalances with paymentMethods
            let ob = data.openingBalances;
            try {
              const obSnap = await getDoc(doc(db, 'users', userId, 'openingBalances', 'current'));
              if (obSnap.exists()) {
                ob = { ...(ob || {}), ...(obSnap.data() || {}) };
              }
            } catch {}

            let changed = false;
            loadedMethods = loadedMethods.map((m) => {
              const nameLower = m.name.toLowerCase().trim();
              let targetOpening = m.openingBalance || 0;

              if (ob) {
                const isCoreCash = m.id === BUILTIN_CASH_ID || (m.isBuiltIn && m.type === 'cash') || nameLower === 'cash';
                const isCoreBkash = m.id === BUILTIN_BKASH_ID || nameLower === 'bkash';
                const isCoreNagad = m.id === BUILTIN_NAGAD_ID || nameLower === 'nagad';

                if (isCoreCash && ob.cash !== undefined) {
                  const obVal = Number(ob.cash) || 0;
                  if (targetOpening === 0 && obVal > 0) targetOpening = obVal;
                  else if (targetOpening > 0 && obVal === 0) ob.cash = targetOpening;
                } else if (isCoreBkash && ob.bkash !== undefined) {
                  const obVal = Number(ob.bkash) || 0;
                  if (targetOpening === 0 && obVal > 0) targetOpening = obVal;
                  else if (targetOpening > 0 && obVal === 0) ob.bkash = targetOpening;
                } else if (isCoreNagad && ob.nagad !== undefined) {
                  const obVal = Number(ob.nagad) || 0;
                  if (targetOpening === 0 && obVal > 0) targetOpening = obVal;
                  else if (targetOpening > 0 && obVal === 0) ob.nagad = targetOpening;
                } else {
                  // Custom wallets: check cleaned name key or wallet ID
                  const cleanKey = nameLower.replace(/[^a-z0-9]/g, '');
                  if (cleanKey && ob[cleanKey] !== undefined) {
                    const obVal = Number(ob[cleanKey]) || 0;
                    if (targetOpening === 0 && obVal > 0) targetOpening = obVal;
                  } else if (ob[m.id] !== undefined) {
                    const obVal = Number(ob[m.id]) || 0;
                    if (targetOpening === 0 && obVal > 0) targetOpening = obVal;
                  }
                }
              }

              if (m.openingBalance !== targetOpening) {
                changed = true;
                return { ...m, openingBalance: targetOpening };
              }
              return m;
            });

            if (changed) {
              for (const m of loadedMethods) {
                await this.setDocSafe(doc(db, 'users', userId, 'paymentMethods', m.id), m, { merge: true });
              }
            }

            this.paymentMethods = loadedMethods;
            if (expensesSnap) this.expenses = expensesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            if (recurringSnap) this.recurringExpenses = recurringSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            if (earningsSnap) this.earnings = earningsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            if (transfersSnap) this.transfers = transfersSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            if (peopleSnap) this.people = peopleSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            if (transactionsSnap) this.transactions = transactionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            if (sourcesSnap) this.sources = sourcesSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            if (notifsSnap) this.notifications = notifsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));
            if (settlementsSnap) this.smartSettlements = settlementsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }));

            // Ensure all custom wallets and referenced payment methods are intact
            this.ensurePaymentMethodsIntegrity();

            // Save to local device cache for offline availability
            this.saveToLocalStorageCache('paymentMethods', this.paymentMethods);
            this.saveToLocalStorageCache('expenses', this.expenses);
            this.saveToLocalStorageCache('recurringExpenses', this.recurringExpenses);
            this.saveToLocalStorageCache('earnings', this.earnings);
            this.saveToLocalStorageCache('transfers', this.transfers);
            this.saveToLocalStorageCache('people', this.people);
            this.saveToLocalStorageCache('transactions', this.transactions);
            this.saveToLocalStorageCache('sources', this.sources);
            this.saveToLocalStorageCache('notifications', this.notifications);
            this.saveToLocalStorageCache('smartSettlements', this.smartSettlements);
          } catch (syncErr) {
            console.warn('[EcO Firestore] Could not pre-fetch subcollections:', syncErr);
          }
        }

        // Register connectionCode in public lookup collection
        try {
          await this.setDocSafe(doc(db, 'connectionCodes', this.myConnectionCode), {
            code: this.myConnectionCode,
            userId: userId,
            displayName: this.userDisplayName,
            email: this.userEmail,
            updatedAt: Date.now()
          }, { merge: true });
        } catch (codeRegErr) {
          console.warn('[EcO Firestore] Could not register connectionCode in directory:', codeRegErr);
        }

        // Attach real-time subcollection listeners for ongoing updates
        this.attachFirestoreListeners(userId);
      } catch (err) {
        console.warn('[EcO Firestore] Could not sync user root doc, falling back to local storage:', err);
      }
    }

    this.notify();
    return this.firstLaunchDone;
  }

  /**
   * Cleans up all data and unsubscribes when user logs out.
   */
  clearUserData() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.activeUserId = null;
    this.userDisplayName = 'EcO User';
    this.userEmail = '';
    this.myConnectionCode = 'ECO-USER';
    this.settings = null;
    this.paymentMethods = [];
    this.expenses = [];
    this.recurringExpenses = [];
    this.earnings = [];
    this.transfers = [];
    this.people = [];
    this.transactions = [];
    this.sources = [];
    this.notifications = [];
    this.connections = [];
    this.proposals = [];
    this.dismissedMilestones = {};
    this.smartSettlements = [];
    this.firstLaunchDone = false;
    this.notify();
  }

  private attachFirestoreListeners(userId: string) {
    const firestoreDb = db;
    if (!firestoreDb) return;

    // 1. Settings doc
    const userDocRef = doc(firestoreDb, 'users', userId);
    this.unsubs.push(
      onSnapshot(
        userDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data();
            this.settings = {
              id: userId,
              theme: data.theme || 'dark',
              colorPalette: data.colorPalette || 'green',
              setupComplete: Boolean(data.setupComplete),
              budgetMode: data.budgetMode || 'direct',
              directDailyBudget: data.directDailyBudget ?? 500,
              monthlyIncome: data.monthlyIncome ?? 0,
              monthlyFixed: data.monthlyFixed ?? 0,
              monthlySavings: data.monthlySavings ?? 0,
              monthlyEmergency: data.monthlyEmergency ?? 0,
              bufferPct: data.bufferPct ?? 10,
              cashoutChargeRate: data.cashoutChargeRate ?? 2,
              categories: data.categories || ['Food', 'Transport', 'Utilities'],
              tags: data.tags || ['Personal'],
              currencySymbol: '৳'
            };
            this.firstLaunchDone = Boolean(data.setupComplete);
            this.saveToLocalStorageCache('settings', this.settings);
            this.notify();
          }
        },
        (err) => handleFirestoreError(err, OperationType.GET, `users/${userId}`)
      )
    );

    // 1b. Real-time Opening Balances listener (keeps wallets in sync across Desktop and Mobile)
    const obDocRef = doc(firestoreDb, 'users', userId, 'openingBalances', 'current');
    this.unsubs.push(
      onSnapshot(
        obDocRef,
        (snapshot) => {
          if (snapshot.exists()) {
            const ob = snapshot.data();
            let changed = false;
            const updated = this.paymentMethods.map((m) => {
              const nameLower = m.name.toLowerCase().trim();
              let target = m.openingBalance || 0;
              const isCoreCash = m.id === BUILTIN_CASH_ID || (m.isBuiltIn && m.type === 'cash') || nameLower === 'cash';
              const isCoreBkash = m.id === BUILTIN_BKASH_ID || nameLower === 'bkash';
              const isCoreNagad = m.id === BUILTIN_NAGAD_ID || nameLower === 'nagad';

              if (isCoreCash && ob.cash !== undefined) {
                target = Number(ob.cash) || 0;
              } else if (isCoreBkash && ob.bkash !== undefined) {
                target = Number(ob.bkash) || 0;
              } else if (isCoreNagad && ob.nagad !== undefined) {
                target = Number(ob.nagad) || 0;
              } else {
                const cleanKey = nameLower.replace(/[^a-z0-9]/g, '');
                if (cleanKey && ob[cleanKey] !== undefined) {
                  target = Number(ob[cleanKey]) || 0;
                } else if (ob[m.id] !== undefined) {
                  target = Number(ob[m.id]) || 0;
                }
              }
              if (m.openingBalance !== target) {
                changed = true;
                return { ...m, openingBalance: target };
              }
              return m;
            });
            if (changed) {
              this.paymentMethods = updated;
              this.saveToLocalStorageCache('paymentMethods', updated);
              this.notify();
            }
          }
        },
        () => {} // Non-blocking if subdocument does not exist yet
      )
    );

    // 2. Subcollections helper
    const subcollections = [
      { name: 'paymentMethods', target: 'paymentMethods' },
      { name: 'expenses', target: 'expenses' },
      { name: 'recurringExpenses', target: 'recurringExpenses' },
      { name: 'earnings', target: 'earnings' },
      { name: 'transfers', target: 'transfers' },
      { name: 'people', target: 'people' },
      { name: 'transactions', target: 'transactions' },
      { name: 'sources', target: 'sources' },
      { name: 'notifications', target: 'notifications' },
      { name: 'smartSettlements', target: 'smartSettlements' }
    ] as const;

    subcollections.forEach(({ name, target }) => {
      const colRef = collection(firestoreDb, 'users', userId, name);
      this.unsubs.push(
        onSnapshot(
          colRef,
          (snapshot) => {
            const items = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as any[];
            if (target === 'paymentMethods' && items.length === 0 && this.paymentMethods.length > 0) {
              return; // Avoid transient empty wipe
            }
            (this as any)[target] = items;
            this.saveToLocalStorageCache(target, items);
            this.notify();
          },
          (err) => handleFirestoreError(err, OperationType.LIST, `users/${userId}/${name}`)
        )
      );
    });

    // 3. Shared EcO Connections listener
    try {
      const connQuery = query(
        collection(firestoreDb, 'connections'),
        where('participants', 'array-contains', userId)
      );
      this.unsubs.push(
        onSnapshot(
          connQuery,
          (snapshot) => {
            const items = snapshot.docs.map((d) => d.data()) as EcOConnection[];
            this.connections = items.map((c) => {
              if (c.userAId === userId) {
                return {
                  ...c,
                  peerUserId: c.userBId || c.peerUserId,
                  peerName: c.userBName || c.peerName,
                  peerCode: c.userBCode || c.peerCode
                };
              } else {
                return {
                  ...c,
                  peerUserId: c.userAId || c.peerUserId,
                  peerName: c.userAName || c.peerName,
                  peerCode: c.userACode || c.peerCode
                };
              }
            });
            this.saveToLocalStorageCache('connections', this.connections);
            this.notify();
          },
          (err) => console.warn('[EcO Firestore] Connections sync listener warning:', err)
        )
      );
    } catch (e) {
      console.warn('Failed to attach connections query listener:', e);
    }

    // 4. Shared Proposals listener
    try {
      const propQuery = query(
        collection(firestoreDb, 'proposals'),
        where('participants', 'array-contains', userId)
      );
      this.unsubs.push(
        onSnapshot(
          propQuery,
          async (snapshot) => {
            const items = snapshot.docs.map((d) => d.data()) as EcOProposal[];
            this.proposals = items;
            this.saveToLocalStorageCache('proposals', items);

            // Real-time synchronization:
            // 1. Generate notification for incoming pending proposals
            for (const p of items) {
              if (p.status === 'pending' && p.senderUserId !== userId) {
                const notifExists = this.notifications.some((n) => n.relatedId === p.id);
                if (!notifExists) {
                  const notif: AppNotification = {
                    id: `notif_prop_${p.id}`,
                    type: 'proposal_received',
                    title: `⚡ New EcO ${p.isRepayment ? 'Repayment' : 'Debt'} Request`,
                    body: `${p.senderName} (${p.senderCode || 'peer'}) requested to ${
                      p.originalSenderType === 'give' ? 'lend you' : 'borrow from you'
                    } ৳${p.amount.toLocaleString()}. Tap to accept or reject.`,
                    createdAt: p.createdAt || Date.now(),
                    readAt: null,
                    expiresAt: Date.now() + 7 * 86400000,
                    relatedType: 'proposal',
                    relatedId: p.id
                  };
                  this.addNotification(notif).catch(() => {});
                }
              }

              // 2. When sender's client observes that an outgoing proposal transitioned to 'accepted',
              // if sender doesn't have the confirmed transaction in ledger yet, record it!
              if (p.status === 'accepted' && p.senderUserId === userId) {
                const alreadyRecorded = this.transactions.some(
                  (t) => t.id === `tx_prop_${p.id}_sender` || t.proposalId === p.id
                );
                if (!alreadyRecorded) {
                  let senderPerson = this.people.find(
                    (pe) =>
                      (p.recipientCode && pe.connectionCode === p.recipientCode) ||
                      (p.recipientUserId && pe.connectedUserId === p.recipientUserId) ||
                      pe.name.toLowerCase() === p.recipientName.toLowerCase()
                  );
                  if (!senderPerson) {
                    senderPerson = {
                      id: `person_peer_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
                      name: p.recipientName,
                      isConnected: true,
                      connectionCode: p.recipientCode,
                      connectedUserId: p.recipientUserId,
                      createdAt: new Date().toISOString()
                    };
                    await this.addPerson(senderPerson);
                  }
                  const senderTx: PeerTransactionRecord = {
                    id: `tx_prop_${p.id}_sender`,
                    personId: senderPerson.id,
                    type: p.originalSenderType,
                    amount: p.amount,
                    totalAmount: p.amount,
                    payMethodId: p.payMethodId || this.getCashMethodId(),
                    tag: p.isRepayment ? 'Repayment' : 'Shared Debt',
                    description: p.note
                      ? `${p.note} (Confirmed)`
                      : p.isRepayment
                      ? `Repayment confirmed with ${p.recipientName}`
                      : `Shared loan with ${p.recipientName}`,
                    date: p.date,
                    timestamp: p.updatedAt || Date.now(),
                    status: 'accepted',
                    proposalId: p.id
                  };
                  await this.addTransaction(senderTx);
                }
              }
            }

            this.notify();
          },
          (err) => console.warn('[EcO Firestore] Proposals sync listener warning:', err)
        )
      );
    } catch (e) {
      console.warn('Failed to attach proposals query listener:', e);
    }
  }

  private loadFromLocalStorageCache() {
    try {
      const rawSettings = localStorage.getItem(this.getStorageKey('settings'));
      if (rawSettings) {
        this.settings = JSON.parse(rawSettings);
      } else {
        this.settings = {
          id: this.activeUserId || 'main',
          theme: 'dark',
          colorPalette: 'green',
          setupComplete: false,
          budgetMode: 'direct',
          directDailyBudget: 500,
          monthlyIncome: 0,
          monthlyFixed: 0,
          monthlySavings: 0,
          monthlyEmergency: 0,
          bufferPct: 10,
          cashoutChargeRate: 2,
          categories: ['Food', 'Transport', 'Groceries', 'Utilities', 'Entertainment', 'Health', 'Shopping', 'Other'],
          tags: ['Personal', 'Work', 'Family', 'Loan', 'Project'],
          currencySymbol: '৳'
        };
      }

      const rawMethods = localStorage.getItem(this.getStorageKey('paymentMethods'));
      this.paymentMethods = rawMethods ? JSON.parse(rawMethods) : createDefaultPaymentMethods();

      const rawExpenses = localStorage.getItem(this.getStorageKey('expenses'));
      this.expenses = rawExpenses ? JSON.parse(rawExpenses) : [];

      const rawRecurring = localStorage.getItem(this.getStorageKey('recurringExpenses'));
      this.recurringExpenses = rawRecurring ? JSON.parse(rawRecurring) : [];

      const rawEarnings = localStorage.getItem(this.getStorageKey('earnings'));
      this.earnings = rawEarnings ? JSON.parse(rawEarnings) : [];

      const rawTransfers = localStorage.getItem(this.getStorageKey('transfers'));
      this.transfers = rawTransfers ? JSON.parse(rawTransfers) : [];

      const rawPeople = localStorage.getItem(this.getStorageKey('people'));
      this.people = rawPeople ? JSON.parse(rawPeople) : [];

      const rawTransactions = localStorage.getItem(this.getStorageKey('transactions'));
      this.transactions = rawTransactions ? JSON.parse(rawTransactions) : [];

      const rawSources = localStorage.getItem(this.getStorageKey('sources'));
      this.sources = rawSources
        ? JSON.parse(rawSources)
        : [
            { id: 'src_salary', name: 'Salary', description: 'Primary monthly income', createdAt: new Date().toISOString() },
            { id: 'src_freelance', name: 'Freelance', description: 'Projects and consulting', createdAt: new Date().toISOString() },
            { id: 'src_investment', name: 'Investments', description: 'Dividends and profits', createdAt: new Date().toISOString() }
          ];

      const rawNotifications = localStorage.getItem(this.getStorageKey('notifications'));
      this.notifications = rawNotifications ? JSON.parse(rawNotifications) : [];

      const rawSettlements = localStorage.getItem(this.getStorageKey('smartSettlements'));
      this.smartSettlements = rawSettlements ? JSON.parse(rawSettlements) : [];

      const rawConnections = localStorage.getItem(this.getStorageKey('connections'));
      this.connections = rawConnections ? JSON.parse(rawConnections) : [];

      const rawProposals = localStorage.getItem(this.getStorageKey('proposals'));
      this.proposals = rawProposals ? JSON.parse(rawProposals) : [];

      const rawCode = localStorage.getItem(this.getStorageKey('connectionCode'));
      if (rawCode && rawCode !== 'ECO-USER') {
        this.myConnectionCode = rawCode;
      }

      const rawSetup = localStorage.getItem(this.getStorageKey('setupComplete'));
      const globalSetup = localStorage.getItem('eco_onboarding_completed');
      this.firstLaunchDone =
        rawSetup === 'true' ||
        globalSetup === 'true' ||
        this.expenses.length > 0 ||
        this.transactions.length > 0;

      // Cross-tab & multi-tab proposal sync
      try {
        const sharedProps: EcOProposal[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith('eco_shared_proposals_')) {
            try {
              const item = JSON.parse(localStorage.getItem(k) || '');
              if (item && item.id) sharedProps.push(item);
            } catch {}
          }
        }
        if (sharedProps.length > 0) {
          const map = new Map<string, EcOProposal>();
          this.proposals.forEach((p) => map.set(p.id, p));
          sharedProps.forEach((p) => map.set(p.id, p));
          this.proposals = Array.from(map.values()).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }
      } catch {}

      const rawCommunity = localStorage.getItem('eco_community_issues');
      if (rawCommunity) {
        try {
          const parsed = JSON.parse(rawCommunity);
          this.communityIssues = Array.isArray(parsed)
            ? parsed.filter((i: any) => i && i.id && !i.id.startsWith('issue_seed_'))
            : [];
        } catch {
          this.communityIssues = [];
        }
      } else {
        this.communityIssues = [];
      }

      // Automatically discover and recover any custom wallets referenced across all activities
      this.ensurePaymentMethodsIntegrity();
    } catch (e) {
      console.warn('[EcO Cache] Failed to load local cache:', e);
    }
  }

  private setupCommunityIssuesStream() {
    if (typeof window === 'undefined') return;
    if (isFirebaseConfigured() && db) {
      try {
        const unsub = onSnapshot(collection(db, 'communityIssues'), (snapshot) => {
          const list: IssueReport[] = [];
          snapshot.forEach((docSnap) => {
            if (docSnap.id.startsWith('issue_seed_')) return;
            const data = docSnap.data() as IssueReport;
            list.push({
              ...data,
              id: docSnap.id,
              likesCount: typeof data.likesCount === 'number' ? data.likesCount : (data.likedBy?.length || 0),
              dislikesCount: typeof data.dislikesCount === 'number' ? data.dislikesCount : (data.dislikedBy?.length || 0),
              likedBy: Array.isArray(data.likedBy) ? data.likedBy : [],
              dislikedBy: Array.isArray(data.dislikedBy) ? data.dislikedBy : []
            });
          });
          list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
          this.communityIssues = list;
          localStorage.setItem('eco_community_issues', JSON.stringify(list));
          this.notify();
        }, (err) => {
          console.warn('Community issues snapshot note:', err);
        });
        this.unsubs.push(unsub);
      } catch (err) {
        console.warn('Could not setup community issues stream:', err);
      }
    }
  }

  private saveToLocalStorageCache(key: string, data: any) {
    try {
      localStorage.setItem(this.getStorageKey(key), JSON.stringify(data));
    } catch (e) {
      console.warn('[EcO Cache] Quota exceeded or failed to save to localStorage:', e);
    }
  }

  // --- Getters & Synchronous Accessors ---

  isFirstLaunchDone(): boolean {
    if (this.firstLaunchDone) return true;
    if (this.settings?.setupComplete) return true;
    try {
      if (typeof window !== 'undefined') {
        const localSetup = localStorage.getItem(this.getStorageKey('setupComplete'));
        if (localSetup === 'true' || localSetup === '"true"') return true;
        const globalSetup = localStorage.getItem('eco_onboarding_completed');
        if (globalSetup === 'true') return true;
        if (this.activeUserId) {
          const userDismissed = localStorage.getItem(`eco_onboarding_dismissed_${this.activeUserId}`);
          if (userDismissed === 'true') return true;
        }
      }
    } catch {}
    if (
      this.expenses.length > 0 ||
      this.earnings.length > 0 ||
      this.transfers.length > 0 ||
      this.transactions.length > 0
    ) {
      return true;
    }
    return false;
  }

  async setFirstLaunchDone(val = true): Promise<void> {
    this.firstLaunchDone = val;
    this.saveToLocalStorageCache('setupComplete', val);
    try {
      if (val && typeof window !== 'undefined') {
        localStorage.setItem('eco_onboarding_completed', 'true');
        if (this.activeUserId) {
          localStorage.setItem(`eco_onboarding_dismissed_${this.activeUserId}`, 'true');
        }
      }
    } catch {}
    if (this.settings) {
      this.settings.setupComplete = val;
    }

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        const userRef = doc(db, 'users', this.activeUserId);
        await this.setDocSafe(userRef, { setupComplete: val, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}`);
      }
    }
    this.notify();
  }

  getSettings(): UserSettings {
    if (!this.settings) {
      return {
        id: this.activeUserId || 'main',
        theme: 'dark',
        colorPalette: 'green',
        setupComplete: this.firstLaunchDone,
        budgetMode: 'direct',
        directDailyBudget: 500,
        monthlyIncome: 0,
        monthlyFixed: 0,
        monthlySavings: 0,
        monthlyEmergency: 0,
        bufferPct: 10,
        cashoutChargeRate: 2,
        categories: ['Food', 'Transport', 'Utilities'],
        tags: ['Personal'],
        currencySymbol: '৳'
      };
    }
    return this.settings;
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    this.settings = settings;
    this.saveToLocalStorageCache('settings', settings);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        const userRef = doc(db, 'users', this.activeUserId);
        await this.setDocSafe(userRef, { ...settings, updatedAt: new Date().toISOString() }, { merge: true });
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}`);
      }
    }
    this.notify();
  }

  // --- Payment Methods ---
  getCashMethodId(): string {
    return getDefaultCashMethodId(this.paymentMethods);
  }

  ensurePaymentMethodsIntegrity(): void {
    const list = [...this.paymentMethods];
    let changed = false;

    // 1. Ensure core 3 built-in wallets exist
    const coreCash = list.find(
      (m) => m.id === BUILTIN_CASH_ID || (m.isBuiltIn && m.type === 'cash') || m.name.toLowerCase() === 'cash'
    );
    if (!coreCash) {
      list.unshift({
        id: BUILTIN_CASH_ID,
        name: 'Cash',
        type: 'cash',
        isBuiltIn: true,
        isActive: true,
        balance: 0,
        openingBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        legacyNames: ['cash', 'Cash']
      });
      changed = true;
    }

    const coreBkash = list.find((m) => m.id === BUILTIN_BKASH_ID || m.name.toLowerCase() === 'bkash');
    if (!coreBkash) {
      list.push({
        id: BUILTIN_BKASH_ID,
        name: 'bKash',
        type: 'mobile_money',
        isBuiltIn: false,
        isActive: true,
        balance: 0,
        openingBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        legacyNames: ['bkash', 'bKash']
      });
      changed = true;
    }

    const coreNagad = list.find((m) => m.id === BUILTIN_NAGAD_ID || m.name.toLowerCase() === 'nagad');
    if (!coreNagad) {
      list.push({
        id: BUILTIN_NAGAD_ID,
        name: 'Nagad',
        type: 'mobile_money',
        isBuiltIn: false,
        isActive: true,
        balance: 0,
        openingBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        legacyNames: ['nagad', 'Nagad']
      });
      changed = true;
    }

    // 2. Discover all wallet IDs in existing activities and recover missing custom wallets
    const referencedIds = new Set<string>();

    this.expenses.forEach((e) => { if (e.payMethodId) referencedIds.add(e.payMethodId); });
    this.recurringExpenses.forEach((r) => { if (r.payMethodId) referencedIds.add(r.payMethodId); });
    this.earnings.forEach((ea) => { if (ea.payMethodId) referencedIds.add(ea.payMethodId); });
    this.transfers.forEach((tr) => {
      if (tr.fromMethodId) referencedIds.add(tr.fromMethodId);
      if (tr.toMethodId) referencedIds.add(tr.toMethodId);
    });
    this.transactions.forEach((tx) => { if (tx.payMethodId) referencedIds.add(tx.payMethodId); });
    this.smartSettlements.forEach((s) => {
      if (s.autoWalletSyncPreference?.walletId) referencedIds.add(s.autoWalletSyncPreference.walletId);
    });

    // Check if there are methods in any other storage or previous cache
    try {
      const backupMethodsRaw = localStorage.getItem('eco_local_paymentMethods');
      if (backupMethodsRaw) {
        const parsed = JSON.parse(backupMethodsRaw);
        if (Array.isArray(parsed)) {
          parsed.forEach((m: PaymentMethod) => {
            if (m && m.id && !list.some((existing) => existing.id === m.id || existing.name.toLowerCase() === m.name.toLowerCase())) {
              list.push(m);
              changed = true;
            }
          });
        }
      }
    } catch {}

    // For every referenced ID, ensure it exists in paymentMethods
    referencedIds.forEach((refId) => {
      const clean = refId.trim();
      if (!clean || clean === 'cash' || clean === 'bkash' || clean === 'nagad' || clean === 'unknown') return;

      const exists = list.some((m) =>
        m.id === clean ||
        m.id.toLowerCase() === clean.toLowerCase() ||
        m.name.trim().toLowerCase() === clean.toLowerCase() ||
        (m.legacyNames && m.legacyNames.some((ln) => ln.trim().toLowerCase() === clean.toLowerCase()))
      );

      if (!exists) {
        // Auto-recover this custom wallet!
        let readableName = clean;
        if (clean.startsWith('method_')) {
          const stripped = clean
            .replace(/^method_/, '')
            .replace(/_migrated$/, '')
            .replace(/_\d+$/, '')
            .replace(/_[a-z0-9]{4,8}$/, '');
          readableName = stripped
            .split('_')
            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        }
        if (!readableName.trim()) readableName = 'Custom Wallet';

        const lower = readableName.toLowerCase();
        const type: PaymentMethodType = lower.includes('bank')
          ? 'bank'
          : lower.includes('card')
          ? 'credit_card'
          : lower.includes('cash')
          ? 'cash'
          : 'mobile_money';

        const recoveredMethod: PaymentMethod = {
          id: clean,
          name: readableName,
          type,
          isBuiltIn: false,
          isActive: true,
          balance: 0,
          openingBalance: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          legacyNames: [clean, readableName]
        };

        list.push(recoveredMethod);
        changed = true;

        if (isFirebaseConfigured() && db && this.activeUserId) {
          this.setDocSafe(doc(db, 'users', this.activeUserId, 'paymentMethods', clean), recoveredMethod).catch(() => {});
        }
      }
    });

    if (changed) {
      this.paymentMethods = list;
      this.saveToLocalStorageCache('paymentMethods', list);
    }
  }

  getPaymentMethods(): PaymentMethod[] {
    if (this.paymentMethods.length === 0) {
      this.paymentMethods = createDefaultPaymentMethods();
    }
    return this.paymentMethods;
  }

  async savePaymentMethod(method: PaymentMethod): Promise<void> {
    const list = [...this.paymentMethods];
    const index = list.findIndex((m) => m.id === method.id);
    const updated = {
      ...method,
      updatedAt: new Date().toISOString()
    };

    if (index >= 0) {
      list[index] = updated;
    } else {
      list.push(updated);
    }
    this.paymentMethods = list;
    this.saveToLocalStorageCache('paymentMethods', list);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'paymentMethods', method.id), updated);

        // Also sync openingBalances to root user document and openingBalances/current subcollection
        const cashM = list.find((m) => m.id === BUILTIN_CASH_ID || (m.isBuiltIn && m.type === 'cash') || m.name.toLowerCase() === 'cash');
        const bkashM = list.find((m) => m.id === BUILTIN_BKASH_ID || m.name.toLowerCase() === 'bkash');
        const nagadM = list.find((m) => m.id === BUILTIN_NAGAD_ID || m.name.toLowerCase() === 'nagad');
        const openingBalancesData: Record<string, any> = {
          cash: cashM?.openingBalance || 0,
          bkash: bkashM?.openingBalance || 0,
          nagad: nagadM?.openingBalance || 0,
          updatedAt: new Date().toISOString()
        };
        // Also sync any custom payment methods into openingBalancesData
        list.forEach((m) => {
          const key = m.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          if (key && !['cash', 'bkash', 'nagad'].includes(key)) {
            openingBalancesData[key] = m.openingBalance || 0;
            openingBalancesData[m.id] = m.openingBalance || 0;
          }
        });

        try {
          await this.setDocSafe(
            doc(db, 'users', this.activeUserId),
            { openingBalances: openingBalancesData, updatedAt: new Date().toISOString() },
            { merge: true }
          );

          await this.setDocSafe(
            doc(db, 'users', this.activeUserId, 'openingBalances', 'current'),
            {
              id: 'current',
              ...openingBalancesData,
              date: new Date().toISOString().split('T')[0],
              updatedAt: Date.now()
            },
            { merge: true }
          );
        } catch (obErr) {
          console.warn('[EcO openingBalances sync warning]:', obErr);
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${this.activeUserId}/paymentMethods/${method.id}`);
      }
    }
    this.notify();
  }

  async archivePaymentMethod(methodId: string): Promise<void> {
    const item = this.paymentMethods.find((m) => m.id === methodId);
    if (item && !item.isBuiltIn) {
      await this.savePaymentMethod({ ...item, isActive: false });
    }
  }

  // --- Expenses ---
  getExpenses(): ExpenseRecord[] {
    return this.expenses;
  }

  async addExpense(expense: ExpenseRecord): Promise<void> {
    this.expenses = [expense, ...this.expenses];
    this.saveToLocalStorageCache('expenses', this.expenses);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'expenses', expense.id), expense);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/expenses/${expense.id}`);
      }
    }
    this.notify();
  }

  async updateExpense(expense: ExpenseRecord): Promise<void> {
    const list = [...this.expenses];
    const index = list.findIndex((e) => e.id === expense.id);
    if (index >= 0) {
      list[index] = expense;
      this.expenses = list;
      this.saveToLocalStorageCache('expenses', list);

      if (isFirebaseConfigured() && db && this.activeUserId) {
        try {
          await this.setDocSafe(doc(db, 'users', this.activeUserId, 'expenses', expense.id), expense, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}/expenses/${expense.id}`);
        }
      }
      this.notify();
    }
  }

  async deleteExpense(expenseId: string): Promise<void> {
    this.expenses = this.expenses.filter((e) => e.id !== expenseId);
    this.saveToLocalStorageCache('expenses', this.expenses);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'expenses', expenseId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/expenses/${expenseId}`);
      }
    }
    this.notify();
  }

  // --- Recurring Expenses ---
  getRecurringExpenses(): RecurringExpenseRecord[] {
    return this.recurringExpenses;
  }

  async addRecurringExpense(rec: RecurringExpenseRecord): Promise<void> {
    this.recurringExpenses = [rec, ...this.recurringExpenses];
    this.saveToLocalStorageCache('recurringExpenses', this.recurringExpenses);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'recurringExpenses', rec.id), rec);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/recurringExpenses/${rec.id}`);
      }
    }
    this.notify();
  }

  async updateRecurringExpense(rec: RecurringExpenseRecord): Promise<void> {
    const list = [...this.recurringExpenses];
    const index = list.findIndex((r) => r.id === rec.id);
    if (index >= 0) {
      list[index] = rec;
      this.recurringExpenses = list;
      this.saveToLocalStorageCache('recurringExpenses', list);

      if (isFirebaseConfigured() && db && this.activeUserId) {
        try {
          await this.setDocSafe(doc(db, 'users', this.activeUserId, 'recurringExpenses', rec.id), rec, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}/recurringExpenses/${rec.id}`);
        }
      }
      this.notify();
    }
  }

  async deleteRecurringExpense(id: string): Promise<void> {
    this.recurringExpenses = this.recurringExpenses.filter((r) => r.id !== id);
    this.saveToLocalStorageCache('recurringExpenses', this.recurringExpenses);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'recurringExpenses', id));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/recurringExpenses/${id}`);
      }
    }
    this.notify();
  }

  // --- Earnings ---
  getEarnings(): EarningRecord[] {
    return this.earnings;
  }

  async addEarning(earning: EarningRecord): Promise<void> {
    this.earnings = [earning, ...this.earnings];
    this.saveToLocalStorageCache('earnings', this.earnings);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'earnings', earning.id), earning);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/earnings/${earning.id}`);
      }
    }
    this.notify();
  }

  async updateEarning(earning: EarningRecord): Promise<void> {
    const list = [...this.earnings];
    const index = list.findIndex((e) => e.id === earning.id);
    if (index >= 0) {
      list[index] = earning;
      this.earnings = list;
      this.saveToLocalStorageCache('earnings', list);

      if (isFirebaseConfigured() && db && this.activeUserId) {
        try {
          await this.setDocSafe(doc(db, 'users', this.activeUserId, 'earnings', earning.id), earning, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}/earnings/${earning.id}`);
        }
      }
      this.notify();
    }
  }

  async deleteEarning(earningId: string): Promise<void> {
    this.earnings = this.earnings.filter((e) => e.id !== earningId);
    this.saveToLocalStorageCache('earnings', this.earnings);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'earnings', earningId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/earnings/${earningId}`);
      }
    }
    this.notify();
  }

  // --- Transfers ---
  getTransfers(): TransferRecord[] {
    return this.transfers;
  }

  async addTransfer(transfer: TransferRecord): Promise<void> {
    this.transfers = [transfer, ...this.transfers];
    this.saveToLocalStorageCache('transfers', this.transfers);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'transfers', transfer.id), transfer);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/transfers/${transfer.id}`);
      }
    }
    this.notify();
  }

  async updateTransfer(transfer: TransferRecord): Promise<void> {
    const list = [...this.transfers];
    const index = list.findIndex((t) => t.id === transfer.id);
    if (index >= 0) {
      list[index] = transfer;
      this.transfers = list;
      this.saveToLocalStorageCache('transfers', list);

      if (isFirebaseConfigured() && db && this.activeUserId) {
        try {
          await this.setDocSafe(doc(db, 'users', this.activeUserId, 'transfers', transfer.id), transfer, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}/transfers/${transfer.id}`);
        }
      }
      this.notify();
    }
  }

  async deleteTransfer(transferId: string): Promise<void> {
    this.transfers = this.transfers.filter((t) => t.id !== transferId);
    this.saveToLocalStorageCache('transfers', this.transfers);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'transfers', transferId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/transfers/${transferId}`);
      }
    }
    this.notify();
  }

  // --- People ---
  getPeople(): PersonRecord[] {
    return this.people;
  }

  async addPerson(person: PersonRecord): Promise<void> {
    this.people = [...this.people, person];
    this.saveToLocalStorageCache('people', this.people);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'people', person.id), person);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/people/${person.id}`);
      }
    }
    this.notify();
  }

  async updatePerson(person: PersonRecord): Promise<void> {
    const list = [...this.people];
    const index = list.findIndex((p) => p.id === person.id);
    if (index >= 0) {
      list[index] = person;
      this.people = list;
      this.saveToLocalStorageCache('people', list);

      if (isFirebaseConfigured() && db && this.activeUserId) {
        try {
          await this.setDocSafe(doc(db, 'users', this.activeUserId, 'people', person.id), person, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}/people/${person.id}`);
        }
      }
      this.notify();
    }
  }

  async deletePerson(personId: string): Promise<void> {
    this.people = this.people.filter((p) => p.id !== personId);
    this.saveToLocalStorageCache('people', this.people);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'people', personId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/people/${personId}`);
      }
    }
    this.notify();
  }

  // --- Transactions (Lending & Borrowing) ---
  getTransactions(): PeerTransactionRecord[] {
    return this.transactions;
  }

  async addTransaction(tx: PeerTransactionRecord): Promise<void> {
    this.transactions = [tx, ...this.transactions];
    this.saveToLocalStorageCache('transactions', this.transactions);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'transactions', tx.id), tx);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/transactions/${tx.id}`);
      }
    }
    this.notify();
  }

  async updateTransaction(tx: PeerTransactionRecord): Promise<void> {
    const list = [...this.transactions];
    const index = list.findIndex((t) => t.id === tx.id);
    if (index >= 0) {
      list[index] = tx;
      this.transactions = list;
      this.saveToLocalStorageCache('transactions', list);

      if (isFirebaseConfigured() && db && this.activeUserId) {
        try {
          await this.setDocSafe(doc(db, 'users', this.activeUserId, 'transactions', tx.id), tx, { merge: true });
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}/transactions/${tx.id}`);
        }
      }
      this.notify();
    }
  }

  async deleteTransaction(txId: string): Promise<void> {
    this.transactions = this.transactions.filter((t) => t.id !== txId);
    this.saveToLocalStorageCache('transactions', this.transactions);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'transactions', txId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/transactions/${txId}`);
      }
    }
    this.notify();
  }

  // --- Sources ---
  getSources(): IncomeSource[] {
    return this.sources;
  }

  async addSource(source: IncomeSource): Promise<void> {
    this.sources = [...this.sources, source];
    this.saveToLocalStorageCache('sources', this.sources);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'sources', source.id), source);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/sources/${source.id}`);
      }
    }
    this.notify();
  }

  // --- Notifications ---
  getNotifications(): AppNotification[] {
    const now = Date.now();
    return this.notifications
      .filter((n) => !n.expiresAt || n.expiresAt > now)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async addNotification(notification: AppNotification): Promise<void> {
    this.notifications = [notification, ...this.notifications];
    this.saveToLocalStorageCache('notifications', this.notifications);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'notifications', notification.id), notification);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${this.activeUserId}/notifications/${notification.id}`);
      }
    }
    this.notify();
  }

  async markNotificationRead(id: string): Promise<void> {
    const now = Date.now();
    const list = this.notifications.map((n) =>
      n.id === id ? { ...n, read: true, readAt: n.readAt || now } : n
    );
    this.notifications = list;
    this.saveToLocalStorageCache('notifications', list);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(
          doc(db, 'users', this.activeUserId, 'notifications', id),
          { read: true, readAt: now },
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${this.activeUserId}/notifications/${id}`);
      }
    }
    this.notify();
  }

  async markAllNotificationsRead(): Promise<void> {
    const now = Date.now();
    const list = this.notifications.map((n) => ({
      ...n,
      read: true,
      readAt: n.readAt || now
    }));
    this.notifications = list;
    this.saveToLocalStorageCache('notifications', list);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        const batch = writeBatch(db);
        this.notifications.forEach((n) => {
          batch.update(doc(db!, 'users', this.activeUserId!, 'notifications', n.id), {
            read: true,
            readAt: now
          });
        });
        await batch.commit();
      } catch (err) {
        console.warn('Batch mark read warning:', err);
      }
    }
    this.notify();
  }

  // --- Connections & Milestones ---
  getConnections(): EcOConnection[] {
    return this.connections;
  }

  getProposals(): EcOProposal[] {
    return this.proposals;
  }

  getDismissedMilestones(): Record<string, string[]> {
    return this.dismissedMilestones;
  }

  dismissMilestone(personId: string, milestoneKey: string) {
    const curr = this.dismissedMilestones[personId] || [];
    if (!curr.includes(milestoneKey)) {
      this.dismissedMilestones = {
        ...this.dismissedMilestones,
        [personId]: [...curr, milestoneKey]
      };
      this.saveToLocalStorageCache('dismissedMilestones', this.dismissedMilestones);
      this.notify();
    }
  }

  getMyConnectionCode(): string {
    return this.myConnectionCode;
  }

  async lookupConnectionCode(rawCode: string): Promise<{ code: string; userId: string; displayName?: string; email?: string } | null> {
    const code = formatConnectionCode(rawCode);
    if (!code) return null;

    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDoc(doc(db, 'connectionCodes', code));
        if (snap.exists()) {
          return snap.data() as any;
        }
      } catch (err) {
        console.warn('Firestore code lookup warning:', err);
      }
    }

    try {
      const raw = localStorage.getItem(`eco_code_registry_${code}`);
      if (raw) return JSON.parse(raw);
    } catch {}

    return null;
  }

  async requestConnection(
    rawCode: string,
    customPeerName?: string
  ): Promise<{ success: boolean; connection?: EcOConnection; error?: string }> {
    const code = formatConnectionCode(rawCode);
    if (!validateConnectionCode(code)) {
      return { success: false, error: 'Invalid connection code format. Format: ECO-XXXXXX' };
    }
    if (code === this.myConnectionCode) {
      return { success: false, error: 'You cannot connect to your own EcO Connection Code.' };
    }

    const existing = this.connections.find((c) => c.peerCode === code);
    if (existing) {
      return { success: false, error: `You are already connected with ${existing.peerName} (${code}).` };
    }

    const found = await this.lookupConnectionCode(code);
    const peerUserId = found?.userId || `user_${code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const peerName = customPeerName?.trim() || found?.displayName || `EcO Friend (${code})`;

    const connId = `conn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newConn: EcOConnection = {
      id: connId,
      participants: [this.activeUserId || 'local_user', peerUserId],
      userAId: this.activeUserId || 'local_user',
      userAName: this.userDisplayName,
      userACode: this.myConnectionCode,
      userBId: peerUserId,
      userBName: peerName,
      userBCode: code,
      peerUserId: peerUserId,
      peerName: peerName,
      peerCode: code,
      status: 'connected',
      initiatedBy: this.activeUserId || 'local_user',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.saveConnection(newConn);

    // Automatically ensure PersonRecord exists in local People ledger
    let person = this.people.find(
      (p) =>
        (code && p.connectionCode === code) ||
        (peerUserId && p.connectedUserId === peerUserId) ||
        p.name.toLowerCase() === peerName.toLowerCase()
    );
    if (!person) {
      person = {
        id: `person_conn_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name: peerName,
        isConnected: true,
        connectionCode: code,
        connectedUserId: peerUserId,
        createdAt: new Date().toISOString()
      };
      await this.addPerson(person);
    } else if (!person.isConnected || person.connectionCode !== code) {
      await this.updatePerson({
        ...person,
        isConnected: true,
        connectionCode: code,
        connectedUserId: peerUserId
      });
    }

    return { success: true, connection: newConn };
  }

  async saveConnection(conn: EcOConnection): Promise<void> {
    this.connections = [...this.connections.filter((c) => c.id !== conn.id), conn];
    this.saveToLocalStorageCache('connections', this.connections);

    try {
      localStorage.setItem(`eco_shared_connections_${conn.id}`, JSON.stringify(conn));
    } catch {}

    if (isFirebaseConfigured() && db) {
      try {
        await this.setDocSafe(doc(db, 'connections', conn.id), conn);
      } catch (err) {
        console.warn('Firestore connection write error:', err);
      }
    }
    this.notify();
  }

  async deleteConnection(connId: string): Promise<void> {
    const conn = this.connections.find((c) => c.id === connId);
    this.connections = this.connections.filter((c) => c.id !== connId);
    this.saveToLocalStorageCache('connections', this.connections);

    if (conn) {
      try {
        localStorage.removeItem(`eco_shared_connections_${connId}`);
      } catch {}
      const person = this.people.find((p) => p.connectionCode === conn.peerCode);
      if (person) {
        await this.updatePerson({ ...person, isConnected: false });
      }
    }

    if (isFirebaseConfigured() && db) {
      try {
        await deleteDoc(doc(db, 'connections', connId));
      } catch (err) {
        console.warn('Firestore connection delete error:', err);
      }
    }
    this.notify();
  }

  async createProposal(params: {
    recipientCode: string;
    recipientName: string;
    type: 'give' | 'take';
    amount: number;
    date: string;
    note?: string;
    payMethodId?: string;
    isRepayment?: boolean;
  }): Promise<{ success: boolean; proposal?: EcOProposal; error?: string }> {
    if (params.amount <= 0) {
      return { success: false, error: 'Proposal amount must be greater than 0.' };
    }
    const code = formatConnectionCode(params.recipientCode);
    const conn = this.connections.find((c) => c.peerCode === code);
    const recipientUserId = conn?.peerUserId || code;

    const propId = `prop_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const proposal: EcOProposal = {
      id: propId,
      participants: [this.activeUserId || 'local_user', recipientUserId],
      connectionId: conn?.id,
      senderUserId: this.activeUserId || 'local_user',
      senderName: this.userDisplayName,
      senderCode: this.myConnectionCode,
      recipientUserId: recipientUserId,
      recipientName: params.recipientName,
      recipientCode: code,
      originalSenderType: params.type,
      recipientPerspectiveType: invertProposalDirection(params.type),
      amount: params.amount,
      isRepayment: Boolean(params.isRepayment),
      date: params.date,
      note: params.note || '',
      payMethodId: params.payMethodId || this.getCashMethodId(),
      status: 'pending',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    await this.addProposal(proposal);
    return { success: true, proposal };
  }

  async addProposal(proposal: EcOProposal): Promise<void> {
    this.proposals = [proposal, ...this.proposals.filter((p) => p.id !== proposal.id)];
    this.saveToLocalStorageCache('proposals', this.proposals);

    try {
      localStorage.setItem(`eco_shared_proposals_${proposal.id}`, JSON.stringify(proposal));
    } catch {}

    if (isFirebaseConfigured() && db) {
      try {
        await this.setDocSafe(doc(db, 'proposals', proposal.id), proposal);
      } catch (err) {
        console.warn('Firestore proposal write error:', err);
      }
    }
    this.notify();
  }

  async updateProposal(proposal: EcOProposal): Promise<void> {
    this.proposals = this.proposals.map((p) => (p.id === proposal.id ? proposal : p));
    this.saveToLocalStorageCache('proposals', this.proposals);

    try {
      localStorage.setItem(`eco_shared_proposals_${proposal.id}`, JSON.stringify(proposal));
    } catch {}

    if (isFirebaseConfigured() && db) {
      try {
        await this.setDocSafe(doc(db, 'proposals', proposal.id), proposal, { merge: true });
      } catch (err) {
        console.warn('Firestore proposal update error:', err);
      }
    }
    this.notify();
  }

  async acceptProposal(proposalId: string, payMethodId: string): Promise<{ success: boolean; error?: string }> {
    const prop = this.proposals.find((p) => p.id === proposalId);
    if (!prop) return { success: false, error: 'Proposal not found' };
    if (prop.status !== 'pending' && prop.status !== 'disputed') {
      return { success: false, error: `Proposal already ${prop.status}` };
    }

    const updatedProp: EcOProposal = {
      ...prop,
      status: 'accepted',
      updatedAt: Date.now()
    };

    // The other peer from current user's perspective
    const isRecipient = prop.senderUserId !== this.activeUserId;
    const peerName = isRecipient ? prop.senderName : prop.recipientName;
    const peerCode = isRecipient ? prop.senderCode : prop.recipientCode;
    const peerUid = isRecipient ? prop.senderUserId : prop.recipientUserId;

    let person = this.people.find(
      (p) =>
        (peerCode && p.connectionCode === peerCode) ||
        (peerUid && p.connectedUserId === peerUid) ||
        p.name.toLowerCase() === peerName.toLowerCase()
    );

    if (!person) {
      person = {
        id: `person_peer_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
        name: peerName,
        isConnected: true,
        connectionCode: peerCode,
        connectedUserId: peerUid,
        createdAt: new Date().toISOString()
      };
      await this.addPerson(person);
    } else if (!person.isConnected) {
      await this.updatePerson({
        ...person,
        isConnected: true,
        connectionCode: peerCode || person.connectionCode,
        connectedUserId: peerUid || person.connectedUserId
      });
    }

    // Direction: recipientPerspectiveType if accepting received proposal; originalSenderType if self-accepting
    const txType = isRecipient ? prop.recipientPerspectiveType : prop.originalSenderType;

    const txDesc = prop.note
      ? `${prop.note} (via EcO Proposal)`
      : prop.isRepayment
      ? `Repayment confirmed with ${peerName}`
      : `Shared loan with ${peerName}`;

    const newTx: PeerTransactionRecord = {
      id: `tx_prop_${prop.id}_${isRecipient ? 'rec' : 'sender'}`,
      personId: person.id,
      type: txType,
      amount: prop.amount,
      totalAmount: prop.amount,
      payMethodId: payMethodId || this.getCashMethodId(),
      tag: prop.isRepayment ? 'Repayment' : 'Shared Debt',
      description: txDesc,
      date: prop.date,
      timestamp: Date.now(),
      status: 'accepted',
      proposalId: prop.id
    };
    await this.addTransaction(newTx);

    // Update proposal document in Firestore / localStorage
    await this.updateProposal(updatedProp);
    return { success: true };
  }

  async disputeProposal(proposalId: string, reason: string): Promise<{ success: boolean; error?: string }> {
    const prop = this.proposals.find((p) => p.id === proposalId);
    if (!prop) return { success: false, error: 'Proposal not found' };

    const updated: EcOProposal = {
      ...prop,
      status: 'disputed',
      disputeReason: reason.trim() || 'Amount or terms disputed',
      updatedAt: Date.now()
    };
    await this.updateProposal(updated);
    return { success: true };
  }

  async rejectProposal(proposalId: string): Promise<void> {
    const prop = this.proposals.find((p) => p.id === proposalId);
    if (!prop) return;
    const updated: EcOProposal = {
      ...prop,
      status: 'rejected',
      updatedAt: Date.now()
    };
    await this.updateProposal(updated);
  }

  getCommunityIssues(): IssueReport[] {
    if (this.communityIssues.length === 0) {
      const raw = localStorage.getItem('eco_community_issues');
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          this.communityIssues = Array.isArray(parsed)
            ? parsed.filter((i: any) => i && i.id && !i.id.startsWith('issue_seed_'))
            : [];
        } catch {
          this.communityIssues = [];
        }
      }
    }
    return this.communityIssues.filter((i) => i && !i.id.startsWith('issue_seed_'));
  }

  async saveIssueReport(report: IssueReport): Promise<void> {
    const enrichedReport: IssueReport = {
      ...report,
      userName: report.userName || this.userDisplayName || 'Anonymous User',
      likesCount: typeof report.likesCount === 'number' ? report.likesCount : 0,
      dislikesCount: typeof report.dislikesCount === 'number' ? report.dislikesCount : 0,
      likedBy: Array.isArray(report.likedBy) ? report.likedBy : [],
      dislikedBy: Array.isArray(report.dislikedBy) ? report.dislikedBy : []
    };

    // Update in-memory list and local storage cache
    this.communityIssues = [
      enrichedReport,
      ...this.communityIssues.filter((i) => i.id !== enrichedReport.id)
    ];
    localStorage.setItem('eco_community_issues', JSON.stringify(this.communityIssues));
    this.notify();

    // Persist to user's private copy if signed in
    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(doc(db, 'users', this.activeUserId, 'issueReports', report.id), enrichedReport);
      } catch (err) {
        console.warn('Could not post private issue report:', err);
      }
    }

    // Persist to public community issues collection
    if (isFirebaseConfigured() && db) {
      try {
        await this.setDocSafe(doc(db, 'communityIssues', report.id), enrichedReport);
      } catch (err) {
        console.warn('Could not post public community issue report:', err);
      }
    }
  }

  async voteIssue(
    issueId: string,
    voteType: 'like' | 'dislike',
    voterId: string
  ): Promise<{ likes: number; dislikes: number; userVote: 'like' | 'dislike' | null }> {
    const issue = this.communityIssues.find((i) => i.id === issueId);
    if (!issue) {
      return { likes: 0, dislikes: 0, userVote: null };
    }

    const likedSet = new Set(issue.likedBy || []);
    const dislikedSet = new Set(issue.dislikedBy || []);
    let userVote: 'like' | 'dislike' | null = null;

    if (voteType === 'like') {
      if (likedSet.has(voterId)) {
        // Toggle off (unvote)
        likedSet.delete(voterId);
        userVote = null;
      } else {
        // Vote like (and cancel dislike if previously disliked)
        likedSet.add(voterId);
        dislikedSet.delete(voterId);
        userVote = 'like';
      }
    } else if (voteType === 'dislike') {
      if (dislikedSet.has(voterId)) {
        // Toggle off (unvote)
        dislikedSet.delete(voterId);
        userVote = null;
      } else {
        // Vote dislike (and cancel like if previously liked)
        dislikedSet.add(voterId);
        likedSet.delete(voterId);
        userVote = 'dislike';
      }
    }

    issue.likedBy = Array.from(likedSet);
    issue.dislikedBy = Array.from(dislikedSet);
    issue.likesCount = issue.likedBy.length;
    issue.dislikesCount = issue.dislikedBy.length;

    // Save to local cache
    localStorage.setItem('eco_community_issues', JSON.stringify(this.communityIssues));
    this.notify();

    // Persist merge update to public Firestore collection
    if (isFirebaseConfigured() && db) {
      try {
        await this.setDocSafe(doc(db, 'communityIssues', issue.id), {
          likesCount: issue.likesCount,
          dislikesCount: issue.dislikesCount,
          likedBy: issue.likedBy,
          dislikedBy: issue.dislikedBy
        }, { merge: true });
      } catch (err) {
        console.warn('Could not persist issue vote:', err);
      }
    }

    return {
      likes: issue.likesCount,
      dislikes: issue.dislikesCount,
      userVote
    };
  }

  // ============================================================================
  // SMART SETTLEMENT (GROUP EXPENSE SPLITTING & SETTLING)
  // ============================================================================

  getSmartSettlements(): SmartSettlement[] {
    return [...this.smartSettlements].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getSmartSettlementById(id: string): SmartSettlement | undefined {
    return this.smartSettlements.find((s) => s.id === id);
  }

  getNextSettlementSequentialNumber(): number {
    let maxNum = 0;
    for (const s of this.smartSettlements) {
      if (s.sequentialNumber && s.sequentialNumber > maxNum) {
        maxNum = s.sequentialNumber;
      }
      const match = s.name.match(/Settlement#(\d+)/i);
      if (match && match[1]) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > maxNum) {
          maxNum = parsed;
        }
      }
    }
    const watermarkKey = this.getStorageKey('settlement_sequence_watermark');
    const storedWatermark = parseInt(localStorage.getItem(watermarkKey) || '0', 10);
    const nextVal = Math.max(maxNum, storedWatermark) + 1;
    try {
      localStorage.setItem(watermarkKey, String(nextVal));
    } catch {}
    return nextVal;
  }

  formatSettlementDefaultName(seqNumber?: number): string {
    const num = seqNumber ?? this.getNextSettlementSequentialNumber();
    return `Settlement#${String(num).padStart(2, '0')}`;
  }

  async saveSmartSettlement(settlement: SmartSettlement): Promise<void> {
    const list = [...this.smartSettlements];
    const index = list.findIndex((s) => s.id === settlement.id);
    const updated = {
      ...settlement,
      updatedAt: Date.now()
    };

    if (index >= 0) {
      list[index] = updated;
    } else {
      list.unshift(updated);
    }

    this.smartSettlements = list;
    this.saveToLocalStorageCache('smartSettlements', list);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await this.setDocSafe(
          doc(db, 'users', this.activeUserId, 'smartSettlements', updated.id),
          updated,
          { merge: true }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, `users/${this.activeUserId}/smartSettlements/${updated.id}`);
      }
    }

    if (updated.isPublicShared && updated.shareToken) {
      await this.syncPublicSettlement(updated);
    }

    this.notify();
  }

  async deleteSmartSettlement(settlementId: string): Promise<void> {
    const target = this.smartSettlements.find((s) => s.id === settlementId);
    this.smartSettlements = this.smartSettlements.filter((s) => s.id !== settlementId);
    this.saveToLocalStorageCache('smartSettlements', this.smartSettlements);

    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        await deleteDoc(doc(db, 'users', this.activeUserId, 'smartSettlements', settlementId));
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `users/${this.activeUserId}/smartSettlements/${settlementId}`);
      }
    }

    if (target?.shareToken) {
      try {
        localStorage.removeItem(`eco_public_settlement_${target.shareToken}`);
        if (isFirebaseConfigured() && db) {
          await deleteDoc(doc(db, 'publicSettlements', target.shareToken));
        }
      } catch {}
    }

    this.notify();
  }

  async archiveSmartSettlement(settlementId: string): Promise<void> {
    const s = this.getSmartSettlementById(settlementId);
    if (!s) return;
    await this.saveSmartSettlement({ ...s, status: 'archived' });
  }

  async reopenSmartSettlement(settlementId: string): Promise<void> {
    const s = this.getSmartSettlementById(settlementId);
    if (!s) return;
    await this.saveSmartSettlement({ ...s, status: 'active' });
  }

  async addSettlementExpense(
    settlementId: string,
    expense: SettlementExpense,
    walletSync?: { walletId: string; rememberPreference?: boolean }
  ): Promise<void> {
    const settlement = this.getSmartSettlementById(settlementId);
    if (!settlement) return;

    const updatedExp = { ...expense };

    const meMember = settlement.members.find((m) => m.isMe);
    if (meMember && walletSync?.walletId) {
      const mePaidPoisha = expense.payers.find((p) => p.memberId === meMember.id)?.amountPoisha || 0;
      if (mePaidPoisha > 0) {
        const walletExpenseRecord: ExpenseRecord = {
          id: `exp_settle_${expense.id}`,
          reason: expense.title,
          category: 'Settlement',
          description: `Smart Settlement: ${settlement.name} — ${expense.title}`,
          amount: poishaToTaka(mePaidPoisha),
          type: 'regular',
          payMethodId: walletSync.walletId,
          date: expense.date,
          timestamp: Date.now()
        };
        await this.addExpense(walletExpenseRecord);
        updatedExp.walletTransactionId = walletExpenseRecord.id;
      }
    }

    const updatedSettlement: SmartSettlement = {
      ...settlement,
      expenses: [updatedExp, ...settlement.expenses],
      autoWalletSyncPreference:
        walletSync?.rememberPreference && walletSync.walletId
          ? { enabled: true, walletId: walletSync.walletId }
          : settlement.autoWalletSyncPreference
    };

    await this.saveSmartSettlement(updatedSettlement);
  }

  async updateSettlementExpense(
    settlementId: string,
    expense: SettlementExpense,
    walletSync?: { walletId: string }
  ): Promise<void> {
    const settlement = this.getSmartSettlementById(settlementId);
    if (!settlement) return;

    const updatedExp = { ...expense };
    const meMember = settlement.members.find((m) => m.isMe);

    if (expense.walletTransactionId && meMember) {
      const mePaidPoisha = expense.payers.find((p) => p.memberId === meMember.id)?.amountPoisha || 0;
      const existingWalletExp = this.expenses.find((e) => e.id === expense.walletTransactionId);
      if (existingWalletExp) {
        if (mePaidPoisha > 0) {
          await this.updateExpense({
            ...existingWalletExp,
            amount: poishaToTaka(mePaidPoisha),
            description: `Smart Settlement: ${settlement.name} — ${expense.title}`,
            date: expense.date,
            payMethodId: walletSync?.walletId || existingWalletExp.payMethodId
          });
        } else {
          await this.deleteExpense(existingWalletExp.id);
          delete updatedExp.walletTransactionId;
        }
      }
    } else if (meMember && walletSync?.walletId) {
      const mePaidPoisha = expense.payers.find((p) => p.memberId === meMember.id)?.amountPoisha || 0;
      if (mePaidPoisha > 0) {
        const walletExpenseRecord: ExpenseRecord = {
          id: `exp_settle_${expense.id}`,
          reason: expense.title,
          category: 'Settlement',
          description: `Smart Settlement: ${settlement.name} — ${expense.title}`,
          amount: poishaToTaka(mePaidPoisha),
          type: 'regular',
          payMethodId: walletSync.walletId,
          date: expense.date,
          timestamp: Date.now()
        };
        await this.addExpense(walletExpenseRecord);
        updatedExp.walletTransactionId = walletExpenseRecord.id;
      }
    }

    const expensesList = settlement.expenses.map((e) => (e.id === expense.id ? updatedExp : e));
    await this.saveSmartSettlement({ ...settlement, expenses: expensesList });
  }

  async deleteSettlementExpense(
    settlementId: string,
    expenseId: string,
    deleteLinkedWalletTx: boolean = true
  ): Promise<void> {
    const settlement = this.getSmartSettlementById(settlementId);
    if (!settlement) return;

    const targetExp = settlement.expenses.find((e) => e.id === expenseId);
    if (targetExp?.walletTransactionId && deleteLinkedWalletTx) {
      try {
        await this.deleteExpense(targetExp.walletTransactionId);
      } catch {}
    }

    const remainingRefunds = settlement.refunds.filter((r) => r.expenseId !== expenseId);
    const remainingExpenses = settlement.expenses.filter((e) => e.id !== expenseId);

    await this.saveSmartSettlement({
      ...settlement,
      expenses: remainingExpenses,
      refunds: remainingRefunds
    });
  }

  async recordSettlementPayment(
    settlementId: string,
    payment: SettlementPayment,
    walletSync?: { walletId: string }
  ): Promise<void> {
    const settlement = this.getSmartSettlementById(settlementId);
    if (!settlement) return;

    const updatedPayment = { ...payment };
    const meMember = settlement.members.find((m) => m.isMe);

    if (meMember && walletSync?.walletId) {
      const fromMember = settlement.members.find((m) => m.id === payment.fromMemberId);
      const toMember = settlement.members.find((m) => m.id === payment.toMemberId);

      if (payment.fromMemberId === meMember.id) {
        const expRecord: ExpenseRecord = {
          id: `exp_settle_pmt_${payment.id}`,
          reason: 'Settlement Debt Payment',
          category: 'Settlement',
          description: `Smart Settlement: Paid ${toMember?.name || 'Member'} (${settlement.name})`,
          amount: poishaToTaka(payment.amountPoisha),
          type: 'regular',
          payMethodId: walletSync.walletId,
          date: payment.date,
          timestamp: Date.now()
        };
        await this.addExpense(expRecord);
        updatedPayment.walletTransactionId = expRecord.id;
      } else if (payment.toMemberId === meMember.id) {
        const earnRecord: EarningRecord = {
          id: `earn_settle_pmt_${payment.id}`,
          source: 'Settlement Payment',
          description: `Smart Settlement: Received from ${fromMember?.name || 'Member'} (${settlement.name})`,
          amount: poishaToTaka(payment.amountPoisha),
          payMethodId: walletSync.walletId,
          date: payment.date,
          timestamp: Date.now()
        };
        await this.addEarning(earnRecord);
        updatedPayment.walletTransactionId = earnRecord.id;
      }
    }

    const updatedSettlement: SmartSettlement = {
      ...settlement,
      payments: [updatedPayment, ...settlement.payments]
    };
    await this.saveSmartSettlement(updatedSettlement);
  }

  async deleteSettlementPayment(
    settlementId: string,
    paymentId: string,
    deleteLinkedWalletTx: boolean = true
  ): Promise<void> {
    const settlement = this.getSmartSettlementById(settlementId);
    if (!settlement) return;

    const targetPmt = settlement.payments.find((p) => p.id === paymentId);
    if (targetPmt?.walletTransactionId && deleteLinkedWalletTx) {
      try {
        await this.deleteExpense(targetPmt.walletTransactionId);
        await this.deleteEarning(targetPmt.walletTransactionId);
      } catch {}
    }

    const remainingPayments = settlement.payments.filter((p) => p.id !== paymentId);
    await this.saveSmartSettlement({ ...settlement, payments: remainingPayments });
  }

  async recordSettlementRefund(settlementId: string, refund: SettlementRefund): Promise<void> {
    const settlement = this.getSmartSettlementById(settlementId);
    if (!settlement) return;

    const updatedSettlement: SmartSettlement = {
      ...settlement,
      refunds: [refund, ...settlement.refunds]
    };
    await this.saveSmartSettlement(updatedSettlement);
  }

  async deleteSettlementRefund(settlementId: string, refundId: string): Promise<void> {
    const settlement = this.getSmartSettlementById(settlementId);
    if (!settlement) return;

    const remainingRefunds = settlement.refunds.filter((r) => r.id !== refundId);
    await this.saveSmartSettlement({ ...settlement, refunds: remainingRefunds });
  }

  async toggleSettlementPublicShare(settlementId: string, enable: boolean): Promise<string | null> {
    const settlement = this.getSmartSettlementById(settlementId);
    if (!settlement) return null;

    if (!enable) {
      const token = settlement.shareToken;
      const updated: SmartSettlement = {
        ...settlement,
        isPublicShared: false
      };
      await this.saveSmartSettlement(updated);
      if (token) {
        try {
          localStorage.removeItem(`eco_public_settlement_${token}`);
          if (isFirebaseConfigured() && db) {
            await deleteDoc(doc(db, 'publicSettlements', token));
          }
        } catch {}
      }
      return null;
    }

    const token =
      settlement.shareToken ||
      `st_${Date.now()}_${Math.random().toString(36).substring(2, 9)}${Math.random().toString(36).substring(2, 9)}`;

    const updated: SmartSettlement = {
      ...settlement,
      isPublicShared: true,
      shareToken: token
    };

    await this.saveSmartSettlement(updated);
    return token;
  }

  private async syncPublicSettlement(settlement: SmartSettlement): Promise<void> {
    if (!settlement.shareToken || !settlement.isPublicShared) return;

    const publicProjection = {
      id: settlement.id,
      name: settlement.name,
      currencySymbol: settlement.currencySymbol || '৳',
      createdAt: settlement.createdAt,
      updatedAt: settlement.updatedAt,
      status: settlement.status,
      members: settlement.members.map((m) => ({ id: m.id, name: m.name, avatarUrl: m.avatarUrl || null })),
      expenses: settlement.expenses,
      payments: settlement.payments,
      refunds: settlement.refunds,
      shareToken: settlement.shareToken
    };

    try {
      localStorage.setItem(`eco_public_settlement_${settlement.shareToken}`, JSON.stringify(publicProjection));
    } catch {}

    if (isFirebaseConfigured() && db) {
      try {
        await this.setDocSafe(doc(db, 'publicSettlements', settlement.shareToken), publicProjection);
      } catch (err) {
        console.warn('Could not mirror public settlement to Firestore:', err);
      }
    }
  }

  async getPublicSettlementByToken(shareToken: string): Promise<SmartSettlement | null> {
    try {
      const local = localStorage.getItem(`eco_public_settlement_${shareToken}`);
      if (local) {
        return JSON.parse(local) as SmartSettlement;
      }
    } catch {}

    const existing = this.smartSettlements.find((s) => s.shareToken === shareToken && s.isPublicShared);
    if (existing) return existing;

    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDoc(doc(db, 'publicSettlements', shareToken));
        if (snap.exists()) {
          return snap.data() as SmartSettlement;
        }
      } catch (err) {
        console.warn('Could not fetch public settlement from Firestore:', err);
      }
    }

    return null;
  }

  /**
   * Generates a distinct public share token for a specific person,
   * creates an isolated public projection, and caches/mirrors it.
   */
  generateAndSyncPersonShare(personId: string, ownerName: string = 'EcO User'): string {
    const person = this.people.find((p) => p.id === personId);
    const token = person?.shareToken || encodePersonShareToken(personId);

    if (person && !person.shareToken) {
      person.shareToken = token;
      this.updatePerson(person).catch(() => {});
    }

    const txs = this.transactions.filter((t: PeerTransactionRecord) => t.personId === personId);
    const projection = {
      shareToken: token,
      person: person
        ? { id: person.id, name: person.name, phone: person.phone }
        : { id: personId, name: 'Counterparty Account' },
      transactions: txs,
      ownerName,
      updatedAt: Date.now()
    };

    try {
      localStorage.setItem(`eco_public_person_${token}`, JSON.stringify(projection));
    } catch {}

    if (isFirebaseConfigured() && db) {
      this.setDocSafe(doc(db, 'publicPersonShares', token), projection).catch((err) => {
        console.warn('Could not mirror public person share to Firestore:', err);
      });
    }

    return token;
  }

  /**
   * Fetches the read-only projection for a specific person by share token.
   */
  async getPublicPersonByToken(
    shareToken: string
  ): Promise<{ person: PersonRecord; transactions: PeerTransactionRecord[]; ownerName?: string } | null> {
    // 1. Try local storage cache
    try {
      const local = localStorage.getItem(`eco_public_person_${shareToken}`);
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed?.person) {
          return {
            person: parsed.person,
            transactions: parsed.transactions || [],
            ownerName: parsed.ownerName
          };
        }
      }
    } catch {}

    // 2. Try decoding personId directly from token
    const decodedPersonId = decodePersonShareToken(shareToken);
    const targetId = decodedPersonId || shareToken;
    const existingPerson = this.people.find(
      (p) => p.id === targetId || p.shareToken === shareToken
    );
    if (existingPerson) {
      const txs = this.transactions.filter((t: PeerTransactionRecord) => t.personId === existingPerson.id);
      return {
        person: existingPerson,
        transactions: txs
      };
    }

    // 3. Try Firestore publicPersonShares collection
    if (isFirebaseConfigured() && db) {
      try {
        const snap = await getDoc(doc(db, 'publicPersonShares', shareToken));
        if (snap.exists()) {
          const data = snap.data();
          if (data?.person) {
            return {
              person: data.person as PersonRecord,
              transactions: (data.transactions || []) as PeerTransactionRecord[],
              ownerName: data.ownerName
            };
          }
        }
      } catch (err) {
        console.warn('Could not fetch public person share from Firestore:', err);
      }
    }

    return null;
  }

  // ============================================================================
  // BACKUP IMPORT & EXPORT (WITH IDEMPOTENCY / DEDUPLICATION)
  // ============================================================================

  exportBackup(): EcoBackupV1 {
    const methods = this.getPaymentMethods();
    const cashMethod = methods.find((m) => m.type === 'cash');
    const bkashMethod = methods.find((m) => m.name.toLowerCase().includes('bkash'));
    const nagadMethod = methods.find((m) => m.name.toLowerCase().includes('nagad'));

    return {
      format: 'eco-backup',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      app: {
        name: 'EcO',
        purpose: 'Personal Finance & Expense Tracker for Bangladesh'
      },
      timestampEncoding: 'firestore-v1',
      data: {
        settings: [
          {
            id: 'main',
            fields: {
              ...this.getSettings()
            }
          }
        ],
        openingBalances: [
          {
            id: 'current',
            fields: {
              cash: cashMethod?.openingBalance || 0,
              bkash: bkashMethod?.openingBalance || 0,
              nagad: nagadMethod?.openingBalance || 0,
              date: new Date().toISOString().split('T')[0]
            }
          }
        ],
        paymentMethods: methods.map((m) => ({ id: m.id, fields: { ...m } })),
        people: this.people.map((p) => ({ id: p.id, fields: { ...p } })),
        expenses: this.expenses.map((e) => ({ id: e.id, fields: { ...e } })),
        recurringExpenses: this.recurringExpenses.map((r) => ({ id: r.id, fields: { ...r } })),
        earnings: this.earnings.map((ea) => ({ id: ea.id, fields: { ...ea } })),
        transfers: this.transfers.map((t) => ({ id: t.id, fields: { ...t } })),
        transactions: this.transactions.map((tx) => ({ id: tx.id, fields: { ...tx } })),
        sources: this.sources.map((s) => ({ id: s.id, fields: { ...s } })),
        smartSettlements: this.smartSettlements.map((s) => ({ id: s.id, fields: { ...s } }))
      },
      integrity: {
        complete: true,
        counts: {
          settings: 1,
          paymentMethods: methods.length,
          people: this.people.length,
          expenses: this.expenses.length,
          recurringExpenses: this.recurringExpenses.length,
          earnings: this.earnings.length,
          transfers: this.transfers.length,
          transactions: this.transactions.length,
          sources: this.sources.length,
          smartSettlements: this.smartSettlements.length
        }
      }
    };
  }

  async importBackup(backup: EcoBackupV1): Promise<{ importedCount: number; skippedCount: number }> {
    const domainData = migrateBackupV1ToDomain(backup);
    let importedCount = 0;
    let skippedCount = 0;

    // Deduplication Set of existing IDs
    const existingExpenseIds = new Set(this.expenses.map((e) => e.id));
    const existingEarningIds = new Set(this.earnings.map((e) => e.id));
    const existingTransferIds = new Set(this.transfers.map((t) => t.id));
    const existingPersonIds = new Set(this.people.map((p) => p.id));
    const existingTxIds = new Set(this.transactions.map((t) => t.id));

    // 1. Settings
    if (domainData.settings) {
      await this.saveSettings(domainData.settings);
    }

    // 2. Methods
    for (const m of domainData.paymentMethods) {
      const existing = this.paymentMethods.find(
        (existingM) =>
          existingM.id === m.id ||
          (existingM.name.trim().toLowerCase() === m.name.trim().toLowerCase() && existingM.type === m.type) ||
          (existingM.type === 'cash' && m.type === 'cash')
      );

      if (existing) {
        const oldId = m.id;
        const newId = existing.id;
        const updatedMethod = {
          ...existing,
          openingBalance: m.openingBalance !== undefined ? m.openingBalance : existing.openingBalance,
          isActive: true
        };
        await this.savePaymentMethod(updatedMethod);

        if (oldId !== newId) {
          domainData.expenses.forEach((e) => { if (e.payMethodId === oldId) e.payMethodId = newId; });
          domainData.recurringExpenses.forEach((r) => { if (r.payMethodId === oldId) r.payMethodId = newId; });
          domainData.earnings.forEach((ea) => { if (ea.payMethodId === oldId) ea.payMethodId = newId; });
          domainData.transfers.forEach((tr) => {
            if (tr.fromMethodId === oldId) tr.fromMethodId = newId;
            if (tr.toMethodId === oldId) tr.toMethodId = newId;
          });
          domainData.transactions.forEach((tx) => { if (tx.payMethodId === oldId) tx.payMethodId = newId; });
        }
      } else {
        await this.savePaymentMethod(m);
      }
    }

    // 3. People (Deduplicate)
    for (const p of domainData.people) {
      if (!existingPersonIds.has(p.id)) {
        await this.addPerson(p);
        existingPersonIds.add(p.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    // 4. Expenses (Deduplicate)
    for (const exp of domainData.expenses) {
      if (!existingExpenseIds.has(exp.id)) {
        await this.addExpense(exp);
        existingExpenseIds.add(exp.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    // 4b. Recurring Expenses (Deduplicate)
    const existingRecurringIds = new Set(this.recurringExpenses.map((r) => r.id));
    for (const rec of domainData.recurringExpenses) {
      if (!existingRecurringIds.has(rec.id)) {
        await this.addRecurringExpense(rec);
        existingRecurringIds.add(rec.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    // 5. Earnings (Deduplicate)
    for (const earn of domainData.earnings) {
      if (!existingEarningIds.has(earn.id)) {
        await this.addEarning(earn);
        existingEarningIds.add(earn.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    // 6. Transfers (Deduplicate)
    for (const tr of domainData.transfers) {
      if (!existingTransferIds.has(tr.id)) {
        await this.addTransfer(tr);
        existingTransferIds.add(tr.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    // 7. Transactions (Deduplicate)
    for (const tx of domainData.transactions) {
      if (!existingTxIds.has(tx.id)) {
        await this.addTransaction(tx);
        existingTxIds.add(tx.id);
        importedCount++;
      } else {
        skippedCount++;
      }
    }

    await this.setFirstLaunchDone(true);
    return { importedCount, skippedCount };
  }

  /**
   * Resets all user financial data in Firestore and local cache.
   */
  async resetAllUserData(): Promise<void> {
    if (isFirebaseConfigured() && db && this.activeUserId) {
      try {
        const collectionsToClean = [
          'expenses',
          'recurringExpenses',
          'earnings',
          'transfers',
          'people',
          'transactions',
          'sources',
          'notifications',
          'smartSettlements'
        ];
        for (const colName of collectionsToClean) {
          const snap = await getDocs(collection(db, 'users', this.activeUserId, colName));
          const batch = writeBatch(db);
          snap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }

        // Reset user root doc
        await this.setDocSafe(doc(db, 'users', this.activeUserId), {
          setupComplete: false,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      } catch (err) {
        console.warn('Firestore reset warning:', err);
      }
    }

    // Clear local lists
    this.expenses = [];
    this.recurringExpenses = [];
    this.earnings = [];
    this.transfers = [];
    this.people = [];
    this.transactions = [];
    this.notifications = [];
    this.smartSettlements = [];
    this.paymentMethods = createDefaultPaymentMethods();
    this.firstLaunchDone = false;

    // Reset local cache keys
    const keys = [
      'expenses',
      'recurringExpenses',
      'earnings',
      'transfers',
      'people',
      'transactions',
      'notifications',
      'smartSettlements',
      'setupComplete'
    ];
    keys.forEach((k) => localStorage.removeItem(this.getStorageKey(k)));
    this.saveToLocalStorageCache('paymentMethods', this.paymentMethods);

    this.notify();
  }

  /**
   * Alias for resetting all data.
   */
  async resetAllData(): Promise<void> {
    await this.resetAllUserData();
  }

  /**
   * Alias for importBackup to maintain backwards compatibility.
   */
  async importLegacyBackup(data: any): Promise<void> {
    await this.importBackup(data);
  }

  /**
   * Alias for exportBackup to maintain backwards compatibility.
   */
  exportBackupV1(): EcoBackupV1 {
    return this.exportBackup();
  }
}

export const repository = new HybridFirebaseRepository();
