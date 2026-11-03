import React, { useState, useEffect } from 'react';
import {
  X,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  HandCoins,
  Receipt,
  Clock,
  Check,
  Calendar,
  Wallet,
  Tag,
  AlertCircle
} from 'lucide-react';
import {
  UnifiedActivityItem,
  PaymentMethod,
  PersonRecord,
  ExpenseRecord,
  RecurringExpenseRecord,
  EarningRecord,
  TransferRecord,
  PeerTransactionRecord,
  ExpenseType
} from '../domain/types';
import { formatTaka } from '../domain/money';
import { calculateRecurringEndDate } from '../domain/dates';
import { calculateTransferCharge } from '../domain/calculations';

interface EditActivityModalProps {
  isOpen: boolean;
  item: UnifiedActivityItem | null;
  paymentMethods: PaymentMethod[];
  people: PersonRecord[];
  categories: string[];
  sources?: { id: string; name: string }[];
  tags?: string[];
  onClose: () => void;
  onSaveExpense: (expense: ExpenseRecord) => void;
  onSaveRecurringExpense: (rec: RecurringExpenseRecord) => void;
  onSaveEarning: (earning: EarningRecord) => void;
  onSaveTransfer: (transfer: TransferRecord) => void;
  onSaveTransaction: (tx: PeerTransactionRecord) => void;
}

export const EditActivityModal: React.FC<EditActivityModalProps> = ({
  isOpen,
  item,
  paymentMethods,
  people,
  categories,
  sources = [],
  tags = ['Personal', 'Repayment', 'Emergency', 'Business', 'Family'],
  onClose,
  onSaveExpense,
  onSaveRecurringExpense,
  onSaveEarning,
  onSaveTransfer,
  onSaveTransaction
}) => {
  if (!isOpen || !item) return null;

  const raw = item.rawRecord;

  // Common editable fields
  const [amountStr, setAmountStr] = useState<string>(String(item.amount || ''));
  const [date, setDate] = useState<string>(item.date || '');
  const [title, setTitle] = useState<string>(item.title || '');
  const [description, setDescription] = useState<string>(item.description || '');
  const [payMethodId, setPayMethodId] = useState<string>(
    item.payMethodId || paymentMethods[0]?.id || ''
  );
  const [validationError, setValidationError] = useState<string | null>(null);

  // Expense specific
  const [category, setCategory] = useState<string>(
    item.activityType === 'expense' || item.activityType === 'recurring'
      ? (raw as ExpenseRecord)?.category || categories[0] || 'Food'
      : categories[0] || 'Food'
  );
  const [expenseType, setExpenseType] = useState<ExpenseType>(
    (raw as ExpenseRecord)?.type || 'regular'
  );

  // Recurring specific
  const [recurringDays, setRecurringDays] = useState<number>(
    (raw as RecurringExpenseRecord)?.days || 30
  );

  // Earning specific
  const [sourceName, setSourceName] = useState<string>(
    (raw as EarningRecord)?.source || item.categoryOrSourceOrPerson || 'Salary'
  );

  // Transfer specific
  const [fromMethodId, setFromMethodId] = useState<string>(
    item.fromMethodId || (raw as TransferRecord)?.fromMethodId || paymentMethods[0]?.id || ''
  );
  const [toMethodId, setToMethodId] = useState<string>(
    item.toMethodId || (raw as TransferRecord)?.toMethodId || paymentMethods[1]?.id || paymentMethods[0]?.id || ''
  );
  const [applyCharge, setApplyCharge] = useState<boolean>(
    Boolean((raw as TransferRecord)?.chargeApplied)
  );
  const [chargeRate, setChargeRate] = useState<number>(
    (raw as TransferRecord)?.chargeRate || 1.85
  );

  // Transaction (Peer) specific
  const [personId, setPersonId] = useState<string>(
    (raw as PeerTransactionRecord)?.personId || people[0]?.id || ''
  );
  const [direction, setDirection] = useState<'give' | 'take'>(
    (raw as PeerTransactionRecord)?.type || (item.direction as 'give' | 'take') || 'give'
  );
  const [tag, setTag] = useState<string>(
    (raw as PeerTransactionRecord)?.tag || 'Personal'
  );

  // Initialize/reset form whenever item changes
  useEffect(() => {
    if (item && item.rawRecord) {
      setAmountStr(String(item.amount || ''));
      setDate(item.date || '');
      setTitle(item.title || '');
      setDescription(item.description || '');
      setPayMethodId(item.payMethodId || paymentMethods[0]?.id || '');
      setValidationError(null);

      if (item.activityType === 'expense') {
        const e = item.rawRecord as ExpenseRecord;
        setCategory(e.category || categories[0] || 'Food');
        setExpenseType(e.type || 'regular');
        setTitle(e.reason || '');
      } else if (item.activityType === 'recurring') {
        const r = item.rawRecord as RecurringExpenseRecord;
        setCategory(r.category || categories[0] || 'Food');
        setRecurringDays(r.days || 30);
        setTitle(r.reason || '');
      } else if (item.activityType === 'earning') {
        const ea = item.rawRecord as EarningRecord;
        setSourceName(ea.source || 'Salary');
      } else if (item.activityType === 'transfer') {
        const tr = item.rawRecord as TransferRecord;
        setFromMethodId(tr.fromMethodId);
        setToMethodId(tr.toMethodId);
        setApplyCharge(Boolean(tr.chargeApplied));
        setChargeRate(tr.chargeRate || 1.85);
      } else if (item.activityType === 'transaction') {
        const tx = item.rawRecord as PeerTransactionRecord;
        setPersonId(tx.personId);
        setDirection(tx.type);
        setTag(tx.tag || 'Personal');
      }
    }
  }, [item, paymentMethods, categories, people]);

  const parsedAmount = parseFloat(amountStr) || 0;
  const activeMethods = paymentMethods.filter((m) => m.isActive);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError('Please enter a valid amount greater than 0.');
      return;
    }

    if (!date) {
      setValidationError('Please specify a valid date.');
      return;
    }

    try {
      if (item.activityType === 'expense') {
        const orig = item.rawRecord as ExpenseRecord;
        const updatedExpense: ExpenseRecord = {
          ...orig,
          amount: parsedAmount,
          reason: title.trim() || category,
          category,
          type: expenseType,
          description: description.trim(),
          payMethodId,
          date
        };
        onSaveExpense(updatedExpense);
      } else if (item.activityType === 'recurring') {
        const orig = item.rawRecord as RecurringExpenseRecord;
        const calculatedEndDate = calculateRecurringEndDate(date, recurringDays);
        const updatedRecurring: RecurringExpenseRecord = {
          ...orig,
          amount: parsedAmount,
          reason: title.trim() || `${category} (Recurring)`,
          category,
          days: recurringDays,
          startDate: date,
          endDate: calculatedEndDate,
          payMethodId
        };
        onSaveRecurringExpense(updatedRecurring);
      } else if (item.activityType === 'earning') {
        const orig = item.rawRecord as EarningRecord;
        const updatedEarning: EarningRecord = {
          ...orig,
          amount: parsedAmount,
          source: sourceName.trim() || 'Salary',
          description: description.trim(),
          payMethodId,
          date
        };
        onSaveEarning(updatedEarning);
      } else if (item.activityType === 'transfer') {
        if (!fromMethodId || !toMethodId) {
          setValidationError('Please select both From and To payment methods.');
          return;
        }
        if (fromMethodId === toMethodId) {
          setValidationError('From and To payment methods must be different.');
          return;
        }
        const orig = item.rawRecord as TransferRecord;
        const feeCalc = calculateTransferCharge(parsedAmount, chargeRate, applyCharge);
        const updatedTransfer: TransferRecord = {
          ...orig,
          requestedAmount: parsedAmount,
          fromMethodId,
          toMethodId,
          chargeApplied: applyCharge,
          chargeRate,
          chargeAmount: feeCalc.chargeAmount,
          sourceDeducted: feeCalc.totalSourceDeduction,
          note: description.trim(),
          date
        };
        onSaveTransfer(updatedTransfer);
      } else if (item.activityType === 'transaction') {
        if (!personId) {
          setValidationError('Please select a person.');
          return;
        }
        const orig = item.rawRecord as PeerTransactionRecord;
        const updatedTx: PeerTransactionRecord = {
          ...orig,
          personId,
          type: direction,
          amount: parsedAmount,
          totalAmount: parsedAmount,
          tag,
          description: description.trim(),
          payMethodId,
          date
        };
        onSaveTransaction(updatedTx);
      }

      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to update record.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg bg-[#1A1C20] border border-[#3D4943]/60 rounded-xl p-5 sm:p-6 shadow-2xl flex flex-col space-y-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30">
              {item.activityType === 'expense' && <TrendingDown className="w-4 h-4 text-[#FFB4AB]" />}
              {item.activityType === 'recurring' && <Clock className="w-4 h-4 text-[#FFB4AB]" />}
              {item.activityType === 'earning' && <TrendingUp className="w-4 h-4 text-[#73E3B4]" />}
              {item.activityType === 'transfer' && <ArrowRightLeft className="w-4 h-4 text-[#BEC7D5]" />}
              {item.activityType === 'transaction' && (
                direction === 'give' ? <HandCoins className="w-4 h-4 text-[#73E3B4]" /> : <Receipt className="w-4 h-4 text-[#FFB4AB]" />
              )}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-[#E2E2E8]">
                Edit {item.activityType === 'expense'
                  ? 'Expense'
                  : item.activityType === 'recurring'
                  ? 'Recurring Schedule'
                  : item.activityType === 'earning'
                  ? 'Earning'
                  : item.activityType === 'transfer'
                  ? 'Transfer'
                  : 'Loan / Debt'}
              </h3>
              <p className="text-[11px] text-[#87948C]">
                Update values directly; your balances will immediately recalculate
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Validation Error Banner */}
        {validationError && (
          <div className="p-3 rounded-lg bg-[#FFB4AB]/10 border border-[#FFB4AB]/30 text-xs text-[#FFB4AB] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{validationError}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Amount input */}
          <div>
            <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
              Amount (৳) *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-base font-mono text-[#73E3B4]">৳</span>
              <input
                type="number"
                step="0.01"
                required
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value)}
                className="w-full pl-8 pr-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/60 text-lg font-mono text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
              />
            </div>
          </div>

          {/* Live Daily Impact Card for Recurring Expenses */}
          {item.activityType === 'recurring' && (
            <div className="p-3 rounded-lg bg-[#0C0E12] border border-[#73E3B4]/40 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-[#73E3B4]/15 text-[#73E3B4]">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-[#E2E2E8]">Daily Spending Impact</div>
                    <div className="text-[10px] text-[#87948C]">
                      Amortized over {recurringDays} days ({date} to {calculateRecurringEndDate(date, recurringDays)})
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-base font-mono font-bold text-[#73E3B4]">
                    {parsedAmount > 0 && recurringDays > 0
                      ? `${formatTaka(parsedAmount / recurringDays)} / day`
                      : '৳ 0.00 / day'}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-[#3D4943]/20">
                <label className="text-[11px] text-[#BCCAC1]">Schedule Duration (Days):</label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={recurringDays}
                  onChange={(e) => setRecurringDays(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 px-2 py-1 rounded bg-[#1A1C20] border border-[#3D4943]/50 text-right font-mono text-xs text-[#E2E2E8]"
                />
              </div>
            </div>
          )}

          {/* Date & Title Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Date</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
              />
            </div>

            {/* Title / Reason (for Expense, Recurring) */}
            {(item.activityType === 'expense' || item.activityType === 'recurring') && (
              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Title / Reason</label>
                <input
                  type="text"
                  placeholder="e.g. Grocery, WiFi bill"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
                />
              </div>
            )}

            {/* Earning Source */}
            {item.activityType === 'earning' && (
              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Income Source</label>
                <input
                  type="text"
                  placeholder="e.g. Salary, Client project"
                  value={sourceName}
                  onChange={(e) => setSourceName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
                />
              </div>
            )}

            {/* Person for Peer Transaction */}
            {item.activityType === 'transaction' && (
              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Person</label>
                <select
                  value={personId}
                  onChange={(e) => setPersonId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
                >
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Expense Category & Type */}
          {item.activityType === 'expense' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
                >
                  {categories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Budget Type</label>
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setExpenseType('regular')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-colors ${
                      expenseType === 'regular'
                        ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                        : 'bg-[#0C0E12] border-[#3D4943]/40 text-[#BCCAC1]'
                    }`}
                  >
                    Daily
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpenseType('fixed')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-colors ${
                      expenseType === 'fixed'
                        ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                        : 'bg-[#0C0E12] border-[#3D4943]/40 text-[#BCCAC1]'
                    }`}
                  >
                    Fixed / Monthly
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Recurring Category */}
          {item.activityType === 'recurring' && (
            <div>
              <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          )}

          {/* Transfer Specific: From & To Wallet accounts + Fee */}
          {item.activityType === 'transfer' && (
            <div className="space-y-3 p-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">From Wallet</label>
                  <select
                    value={fromMethodId}
                    onChange={(e) => setFromMethodId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
                  >
                    {activeMethods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">To Wallet</label>
                  <select
                    value={toMethodId}
                    onChange={(e) => setToMethodId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
                  >
                    {activeMethods.map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Transfer Charge */}
              <div className="pt-2 border-t border-[#3D4943]/30 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-[#BCCAC1] flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={applyCharge}
                      onChange={(e) => setApplyCharge(e.target.checked)}
                      className="rounded accent-[#73E3B4]"
                    />
                    <span>Apply Transfer / Cash-out Fee</span>
                  </label>
                  {applyCharge && (
                    <span className="text-xs font-mono text-[#73E3B4]">
                      {chargeRate}% ({formatTaka((parsedAmount * chargeRate) / 100)})
                    </span>
                  )}
                </div>

                {applyCharge && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {[
                      { label: 'bKash (1.85%)', rate: 1.85 },
                      { label: 'bKash Priyo (1.395%)', rate: 1.395 },
                      { label: 'Nagad (1.49%)', rate: 1.49 }
                    ].map((p) => (
                      <button
                        key={p.rate}
                        type="button"
                        onClick={() => setChargeRate(p.rate)}
                        className={`px-2 py-1 rounded text-[11px] border ${
                          chargeRate === p.rate
                            ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                            : 'bg-[#1A1C20] border-[#3D4943]/40 text-[#87948C]'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment Method Selector (for Expense, Recurring, Earning, Transaction) */}
          {item.activityType !== 'transfer' && (
            <div>
              <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                {item.activityType === 'earning'
                  ? 'Deposit Account'
                  : item.activityType === 'transaction' && direction === 'take'
                  ? 'Deposit Borrowed Funds In'
                  : 'Payment Wallet'}
              </label>
              <select
                value={payMethodId}
                onChange={(e) => setPayMethodId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
              >
                {activeMethods.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({formatTaka(m.balance || 0)})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Transaction (Peer) Direction and Tag */}
          {item.activityType === 'transaction' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Direction</label>
                <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setDirection('give')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-colors ${
                      direction === 'give'
                        ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                        : 'bg-[#0C0E12] border-[#3D4943]/40 text-[#BCCAC1]'
                    }`}
                  >
                    Lent (I Gave)
                  </button>
                  <button
                    type="button"
                    onClick={() => setDirection('take')}
                    className={`py-1.5 px-2 rounded-lg text-xs font-medium border text-center transition-colors ${
                      direction === 'take'
                        ? 'bg-[#1E2024] border-[#FFB4AB] text-[#FFB4AB]'
                        : 'bg-[#0C0E12] border-[#3D4943]/40 text-[#BCCAC1]'
                    }`}
                  >
                    Borrowed (I Took)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Tag</label>
                <select
                  value={tag}
                  onChange={(e) => setTag(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
                >
                  {tags.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Description / Note */}
          <div>
            <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
              Description / Notes (Optional)
            </label>
            <input
              type="text"
              placeholder="Add details, receipt notes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
            />
          </div>

          {/* Action buttons */}
          <div className="pt-3 border-t border-[#3D4943]/30 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-[#282A2E] hover:bg-[#333539] text-xs text-[#E2E2E8] font-medium cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] text-xs font-semibold flex items-center gap-1.5 shadow-sm cursor-pointer transition-all active:scale-[0.98]"
            >
              <Check className="w-4 h-4" />
              <span>Save Changes</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
