import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ArrowLeft,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  ArrowRightLeft,
  HandCoins,
  Receipt,
  Plus,
  Info,
  Zap,
  Link2,
  Clock
} from 'lucide-react';
import {
  PaymentMethod,
  PersonRecord,
  IncomeSource,
  ExpenseType,
  PeerFeeTreatment,
  EcOConnection
} from '../domain/types';
import { getTodayDateString, calculateRecurringEndDate } from '../domain/dates';
import { calculateTransferCharge } from '../domain/calculations';
import { formatTaka } from '../domain/money';
import { getDefaultCashMethodId } from '../domain/paymentMethods';

export type ActivityKind = 'expense' | 'earning' | 'transfer' | 'give' | 'take';

interface GlobalAddModalProps {
  isOpen: boolean;
  initialKind?: ActivityKind;
  onClose: () => void;
  paymentMethods: PaymentMethod[];
  people: PersonRecord[];
  connections?: EcOConnection[];
  sources: IncomeSource[];
  categories: string[];
  tags: string[];
  defaultChargeRate: number;
  onSaveExpense: (data: {
    reason: string;
    category: string;
    description: string;
    amount: number;
    type: ExpenseType;
    payMethodId: string;
    date: string;
  }) => void;
  onSaveRecurringExpense: (data: {
    reason: string;
    category: string;
    amount: number;
    days: number;
    startDate: string;
    endDate: string;
    payMethodId: string;
  }) => void;
  onSaveEarning: (data: {
    source: string;
    description: string;
    amount: number;
    payMethodId: string;
    date: string;
  }) => void;
  onSaveTransfer: (data: {
    fromMethodId: string;
    toMethodId: string;
    requestedAmount: number;
    chargeApplied: boolean;
    chargeAmount: number;
    chargeRate: number;
    sourceDeducted: number;
    note: string;
    date: string;
  }) => void;
  onSavePeerTransaction: (data: {
    personId: string;
    type: 'give' | 'take';
    amount: number;
    payMethodId: string;
    tag: string;
    description: string;
    date: string;
    chargeApplied?: boolean;
    chargeRate?: number;
    chargeAmount?: number;
    feeTreatment?: PeerFeeTreatment;
  }) => void;
  onSaveConnectedProposal?: (data: {
    recipientCode: string;
    recipientName: string;
    type: 'give' | 'take';
    amount: number;
    date: string;
    note?: string;
    isRepayment?: boolean;
    payMethodId?: string;
  }) => void;
  onCreatePersonInline: (name: string, phone?: string) => string; // returns new personId
  onCreateSourceInline: (name: string) => void;
  onCreateTagInline: (tag: string) => void;
}

export const GlobalAddModal: React.FC<GlobalAddModalProps> = ({
  isOpen,
  initialKind,
  onClose,
  paymentMethods,
  people,
  connections = [],
  sources,
  categories,
  tags,
  defaultChargeRate,
  onSaveExpense,
  onSaveRecurringExpense,
  onSaveEarning,
  onSaveTransfer,
  onSavePeerTransaction,
  onSaveConnectedProposal,
  onCreatePersonInline,
  onCreateSourceInline,
  onCreateTagInline
}) => {
  // Selected kind: null = Step 1 picker
  const [selectedKind, setSelectedKind] = useState<ActivityKind | null>(initialKind || null);
  const [step, setStep] = useState<number>(initialKind ? 2 : 1);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Expense sub-type
  const [expenseKind, setExpenseKind] = useState<'daily' | 'recurring'>('daily');
  const [recurringDays, setRecurringDays] = useState<number>(30);

  // Common fields
  const [date, setDate] = useState<string>(getTodayDateString());
  const [amountStr, setAmountStr] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [payMethodId, setPayMethodId] = useState<string>(() => getDefaultCashMethodId(paymentMethods));

  // Expense specific
  const [category, setCategory] = useState<string>(categories[0] || 'Food');
  const [expenseType, setExpenseType] = useState<ExpenseType>('regular');

  // Earning specific
  const [sourceName, setSourceName] = useState<string>(sources[0]?.name || 'Salary');

  // Transfer specific
  const [fromMethodId, setFromMethodId] = useState<string>(() => getDefaultCashMethodId(paymentMethods));
  const [toMethodId, setToMethodId] = useState<string>(() => {
    const cashId = getDefaultCashMethodId(paymentMethods);
    const alt = paymentMethods.find((m) => m.id !== cashId && m.isActive) || paymentMethods.find((m) => m.id !== cashId) || paymentMethods[0];
    return alt?.id || cashId;
  });
  const [applyCharge, setApplyCharge] = useState<boolean>(false);
  const [chargeRate, setChargeRate] = useState<number>(1.85);
  const [transferPreset, setTransferPreset] = useState<'none' | 'bkash' | 'bkash_priyo' | 'nagad' | 'custom'>('none');

  // Combine local people with any connected EcO contacts from connections
  const combinedPeopleList = useMemo(() => {
    const list = [...people];
    (connections || []).forEach((conn) => {
      const alreadyInList = list.some(
        (p) => (p.connectionCode && p.connectionCode === conn.peerCode) ||
               (conn.peerUserId && p.connectedUserId === conn.peerUserId) ||
               p.name.toLowerCase() === conn.peerName.toLowerCase()
      );
      if (!alreadyInList) {
        list.push({
          id: `person_conn_${conn.id}`,
          name: conn.peerName,
          isConnected: true,
          connectionCode: conn.peerCode,
          connectedUserId: conn.peerUserId,
          createdAt: new Date(conn.createdAt || Date.now()).toISOString()
        });
      }
    });
    return list;
  }, [people, connections]);

  const getPersonConnectedInfo = (p?: PersonRecord | null) => {
    if (!p) return { isConnected: false, code: '' };
    if (p.isConnected && p.connectionCode) {
      return { isConnected: true, code: p.connectionCode };
    }
    const matchingConn = (connections || []).find(
      (c) => (p.connectionCode && c.peerCode === p.connectionCode) ||
             (p.connectedUserId && c.peerUserId === p.connectedUserId) ||
             (c.status === 'connected' && c.peerName.toLowerCase() === p.name.toLowerCase())
    );
    if (matchingConn) {
      return { isConnected: true, code: matchingConn.peerCode };
    }
    return { isConnected: false, code: '' };
  };

  // Peer transaction specific
  const [personId, setPersonId] = useState<string>(() => people[0]?.id || (connections[0] ? `person_conn_${connections[0].id}` : ''));
  const [tag, setTag] = useState<string>(tags[0] || 'Personal');
  const [peerApplyCharge, setPeerApplyCharge] = useState<boolean>(false);
  const [peerChargeRate, setPeerChargeRate] = useState<number>(1.85);
  const [peerPreset, setPeerPreset] = useState<'none' | 'bkash' | 'bkash_priyo' | 'nagad' | 'custom'>('none');
  const [peerFeeTreatment, setPeerFeeTreatment] = useState<PeerFeeTreatment>('separate');

  const selectedPersonObj = useMemo(() => {
    return combinedPeopleList.find((p) => p.id === personId) || combinedPeopleList[0] || null;
  }, [combinedPeopleList, personId]);

  const selectedPersonConnInfo = useMemo(() => {
    return getPersonConnectedInfo(selectedPersonObj);
  }, [selectedPersonObj, connections]);

  // Synchronize personId if empty and combined list becomes available
  useEffect(() => {
    if (!personId && combinedPeopleList.length > 0) {
      setPersonId(combinedPeopleList[0].id);
    }
  }, [combinedPeopleList, personId]);

  // Inline creation mini-dialogs
  const [showInlinePerson, setShowInlinePerson] = useState<boolean>(false);
  const [inlinePersonName, setInlinePersonName] = useState<string>('');
  const [inlinePersonPhone, setInlinePersonPhone] = useState<string>('');

  const [showInlineSource, setShowInlineSource] = useState<boolean>(false);
  const [inlineSourceName, setInlineSourceName] = useState<string>('');

  const [showInlineTag, setShowInlineTag] = useState<boolean>(false);
  const [inlineTagName, setInlineTagName] = useState<string>('');

  // Synchronize state whenever modal is opened or initialKind changes
  useEffect(() => {
    if (isOpen) {
      setSelectedKind(initialKind || null);
      setStep(initialKind ? 2 : 1);
      setValidationError(null);
      setAmountStr('');
      setDescription('');
      setIsSubmitting(false);
      setShowInlinePerson(false);
      setShowInlineSource(false);
      setShowInlineTag(false);
      setDate(getTodayDateString());
      setTransferPreset('none');
      setApplyCharge(false);
      setChargeRate(1.85);
      setPeerPreset('none');
      setPeerApplyCharge(false);
      setPeerChargeRate(1.85);
      setPeerFeeTreatment('separate');
      if (paymentMethods.length > 0) {
        const cashId = getDefaultCashMethodId(paymentMethods);
        setPayMethodId(cashId);
        setFromMethodId(cashId);
        const secondMethod = paymentMethods.find((m) => m.id !== cashId && m.isActive) || paymentMethods.find((m) => m.id !== cashId) || paymentMethods[0];
        setToMethodId(secondMethod?.id || cashId);
      }
      if (combinedPeopleList.length > 0 && (!personId || !combinedPeopleList.some((p) => p.id === personId))) {
        setPersonId(combinedPeopleList[0].id);
      }
    }
  }, [isOpen, initialKind, paymentMethods, combinedPeopleList]);

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
  };

  const handleNext = () => {
    setValidationError(null);

    if (step === 2) {
      // Validate step 2
      if (selectedKind === 'transfer') {
        if (!fromMethodId || !toMethodId) {
          setValidationError('Please select both From and To payment methods.');
          return;
        }
        if (fromMethodId === toMethodId) {
          setValidationError('From and To payment methods must be different.');
          return;
        }
      }

      if ((selectedKind === 'give' || selectedKind === 'take') && !personId) {
        setValidationError('Please select or add a person.');
        return;
      }

      setStep(3);
    }
  };

  const handleBack = () => {
    setValidationError(null);
    if (step === 3) {
      setStep(2);
    } else if (step === 2) {
      setSelectedKind(null);
      setStep(1);
    } else {
      handleClose();
    }
  };

  const handleSubmit = () => {
    setValidationError(null);
    const parsedAmount = parseFloat(amountStr);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setValidationError('Please enter a valid amount greater than 0.');
      return;
    }

    if (!payMethodId && selectedKind !== 'transfer') {
      setValidationError('Please select a payment method.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (selectedKind === 'expense') {
        if (expenseKind === 'daily') {
          onSaveExpense({
            reason: description.trim() || category,
            category,
            description: description.trim(),
            amount: parsedAmount,
            type: expenseType,
            payMethodId,
            date
          });
        } else {
          const endDate = calculateRecurringEndDate(date, recurringDays);
          onSaveRecurringExpense({
            reason: description.trim() || `${category} (Recurring)`,
            category,
            amount: parsedAmount,
            days: recurringDays,
            startDate: date,
            endDate,
            payMethodId
          });
        }
      } else if (selectedKind === 'earning') {
        onSaveEarning({
          source: sourceName,
          description: description.trim(),
          amount: parsedAmount,
          payMethodId,
          date
        });
      } else if (selectedKind === 'transfer') {
        const feeCalc = calculateTransferCharge(parsedAmount, chargeRate, applyCharge);
        onSaveTransfer({
          fromMethodId,
          toMethodId,
          requestedAmount: parsedAmount,
          chargeApplied: applyCharge,
          chargeAmount: feeCalc.chargeAmount,
          chargeRate,
          sourceDeducted: feeCalc.totalSourceDeduction,
          note: description.trim(),
          date
        });
      } else if (selectedKind === 'give' || selectedKind === 'take') {
        if (selectedPersonConnInfo.isConnected && selectedPersonConnInfo.code) {
          if (onSaveConnectedProposal) {
            onSaveConnectedProposal({
              recipientCode: selectedPersonConnInfo.code,
              recipientName: selectedPersonObj?.name || 'Contact',
              type: selectedKind,
              amount: parsedAmount,
              date,
              note: description.trim() || undefined,
              isRepayment: tag.toLowerCase() === 'repayment',
              payMethodId
            });
          } else {
            onSavePeerTransaction({
              personId: selectedPersonObj?.id || personId,
              type: selectedKind,
              amount: parsedAmount,
              payMethodId,
              tag,
              description: description.trim(),
              date
            });
          }
        } else {
          const feeAmount = peerApplyCharge && peerChargeRate > 0 ? (parsedAmount * peerChargeRate) / 100 : 0;
          onSavePeerTransaction({
            personId,
            type: selectedKind,
            amount: parsedAmount,
            payMethodId,
            tag,
            description: description.trim(),
            date,
            chargeApplied: peerApplyCharge,
            chargeRate: peerApplyCharge ? peerChargeRate : 0,
            chargeAmount: feeAmount,
            feeTreatment: peerApplyCharge ? peerFeeTreatment : 'none'
          });
        }
      }

      onClose();
    } catch (err: any) {
      setValidationError(err.message || 'Failed to record entry.');
      setIsSubmitting(false);
    }
  };

  // Keyboard Enter navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      // Don't submit if inside inline creator
      if (showInlinePerson || showInlineSource || showInlineTag) return;
      e.preventDefault();
      if (step === 2) handleNext();
      else if (step === 3) handleSubmit();
    }
  };

  // Global Escape key listener and body overflow lock
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      onKeyDown={handleKeyDown}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg bg-[#1A1C20] border border-[#3D4943]/60 rounded-lg shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#3D4943]/40 bg-[#1E2024]">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                aria-label="Previous step"
                className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <h2 className="text-sm font-semibold text-[#E2E2E8]">
                {step === 1 ? 'New Financial Activity' : `Record ${selectedKind?.toUpperCase()}`}
              </h2>
              {step > 1 && (
                <div className="text-[11px] text-[#BCCAC1]">Step {step} of 3</div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {validationError && (
            <div className="p-2.5 rounded bg-[#FFB4AB]/10 border border-[#FFB4AB]/30 text-[#FFB4AB] text-xs">
              {validationError}
            </div>
          )}

          {/* STEP 1: Choose activity kind */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs text-[#BCCAC1]">What would you like to record?</p>
              <div className="grid grid-cols-1 gap-2">
                {[
                  {
                    id: 'expense' as ActivityKind,
                    title: 'Expense',
                    desc: 'Daily spending or recurring schedule',
                    icon: TrendingDown,
                    color: 'text-[#FFB4AB]'
                  },
                  {
                    id: 'earning' as ActivityKind,
                    title: 'Income / Earning',
                    desc: 'Salary, freelance milestone, or returns',
                    icon: TrendingUp,
                    color: 'text-[#73E3B4]'
                  },
                  {
                    id: 'transfer' as ActivityKind,
                    title: 'Transfer',
                    desc: 'Move funds between your accounts (Cash, bKash, Banks)',
                    icon: ArrowRightLeft,
                    color: 'text-[#BEC7D5]'
                  },
                  {
                    id: 'give' as ActivityKind,
                    title: 'Give Money (Lend)',
                    desc: 'I lent money to someone (Receivable debt)',
                    icon: HandCoins,
                    color: 'text-[#73E3B4]'
                  },
                  {
                    id: 'take' as ActivityKind,
                    title: 'Take Money (Borrow)',
                    desc: 'I borrowed money from someone (Payable debt)',
                    icon: Receipt,
                    color: 'text-[#FFB4AB]'
                  }
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setSelectedKind(item.id);
                        setStep(2);
                        const cashId = getDefaultCashMethodId(paymentMethods);
                        setPayMethodId(cashId);
                        setFromMethodId(cashId);
                        const secondMethod = paymentMethods.find((m) => m.id !== cashId && m.isActive) || paymentMethods.find((m) => m.id !== cashId) || paymentMethods[0];
                        setToMethodId(secondMethod?.id || cashId);
                      }}
                      className="flex items-center gap-3.5 p-3 rounded bg-[#0C0E12] border border-[#3D4943]/40 hover:border-[#73E3B4]/50 hover:bg-[#1E2024] text-left transition-all group"
                    >
                      <div className={`p-2 rounded bg-[#1A1C20] ${item.color}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <div className="text-xs font-semibold text-[#E2E2E8] group-hover:text-[#73E3B4]">
                          {item.title}
                        </div>
                        <div className="text-[11px] text-[#BCCAC1]">{item.desc}</div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-[#87948C] group-hover:text-[#73E3B4]" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 2: Context / Schedule / Selection */}
          {step === 2 && (
            <div className="space-y-4">
              {/* Date */}
              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Date</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] font-mono text-xs focus:outline-none focus:border-[#73E3B4]"
                />
              </div>

              {/* Expense specific step 2 */}
              {selectedKind === 'expense' && (
                <>
                  <div>
                    <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1.5">Expense Schedule</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setExpenseKind('daily')}
                        className={`py-2 px-3 rounded text-xs font-medium border text-center transition-colors ${
                          expenseKind === 'daily'
                            ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                            : 'bg-[#0C0E12] border-[#3D4943]/40 text-[#BCCAC1]'
                        }`}
                      >
                        Daily Expense
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpenseKind('recurring')}
                        className={`py-2 px-3 rounded text-xs font-medium border text-center transition-colors ${
                          expenseKind === 'recurring'
                            ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                            : 'bg-[#0C0E12] border-[#3D4943]/40 text-[#BCCAC1]'
                        }`}
                      >
                        Recurring Schedule
                      </button>
                    </div>
                  </div>

                  {expenseKind === 'recurring' && (
                    <div className="p-3 rounded bg-[#0C0E12] border border-[#3D4943]/30 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] text-[#BCCAC1]">Duration (Days)</label>
                        <input
                          type="number"
                          min="1"
                          max="365"
                          value={recurringDays}
                          onChange={(e) => setRecurringDays(Math.max(1, parseInt(e.target.value) || 1))}
                          className="w-20 px-2 py-1 rounded bg-[#1A1C20] border border-[#3D4943]/50 text-right font-mono text-xs text-[#E2E2E8]"
                        />
                      </div>
                      <div className="text-[11px] text-[#87948C] flex items-center justify-between pt-1 border-t border-[#3D4943]/20">
                        <span>End Date Preview:</span>
                        <span className="font-mono text-[#73E3B4]">
                          {calculateRecurringEndDate(date, recurringDays)}
                        </span>
                      </div>
                      {parseFloat(amountStr) > 0 && (
                        <div className="text-[11px] text-[#87948C] flex items-center justify-between pt-1 border-t border-[#3D4943]/20">
                          <span>Daily Rate:</span>
                          <span className="font-mono text-[#73E3B4] font-semibold">
                            {formatTaka(parseFloat(amountStr) / recurringDays)} / day
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Category</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] text-xs focus:outline-none focus:border-[#73E3B4]"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">Expense Type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['regular', 'fixed', 'emergency'] as ExpenseType[]).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setExpenseType(t)}
                          className={`py-1.5 rounded text-[11px] capitalize border text-center transition-colors ${
                            expenseType === t
                              ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                              : 'bg-[#0C0E12] border-[#3D4943]/40 text-[#BCCAC1]'
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Earning specific step 2 */}
              {selectedKind === 'earning' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[11px] font-medium text-[#BCCAC1]">Income Source</label>
                    <button
                      type="button"
                      onClick={() => setShowInlineSource(true)}
                      className="text-[11px] text-[#73E3B4] hover:underline flex items-center gap-1"
                    >
                      <Plus className="w-3 h-3" />
                      <span>New Source</span>
                    </button>
                  </div>
                  {showInlineSource ? (
                    <div className="flex gap-2 mb-2 p-2 rounded bg-[#0C0E12] border border-[#3D4943]/50">
                      <input
                        type="text"
                        placeholder="Source name..."
                        value={inlineSourceName}
                        onChange={(e) => setInlineSourceName(e.target.value)}
                        className="flex-1 px-2 py-1 rounded bg-[#1A1C20] text-xs text-[#E2E2E8] border border-[#3D4943]/40"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (inlineSourceName.trim()) {
                            onCreateSourceInline(inlineSourceName.trim());
                            setSourceName(inlineSourceName.trim());
                            setInlineSourceName('');
                            setShowInlineSource(false);
                          }
                        }}
                        className="px-2.5 py-1 bg-[#55C79A] text-[#003826] rounded text-xs font-semibold"
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowInlineSource(false)}
                        className="px-2 py-1 text-[#87948C]"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : null}
                  <select
                    value={sourceName}
                    onChange={(e) => setSourceName(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] text-xs focus:outline-none focus:border-[#73E3B4]"
                  >
                    {sources.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Transfer specific step 2 */}
              {selectedKind === 'transfer' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">From Account</label>
                    <select
                      value={fromMethodId}
                      onChange={(e) => setFromMethodId(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] text-xs focus:outline-none focus:border-[#73E3B4]"
                    >
                      {paymentMethods.filter((m) => m.isActive).map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">To Account</label>
                    <select
                      value={toMethodId}
                      onChange={(e) => setToMethodId(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] text-xs focus:outline-none focus:border-[#73E3B4]"
                    >
                      {paymentMethods.filter((m) => m.isActive).map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Give / Take peer transaction specific step 2 */}
              {(selectedKind === 'give' || selectedKind === 'take') && (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-[#BCCAC1]">Person</label>
                      <button
                        type="button"
                        onClick={() => setShowInlinePerson(true)}
                        className="text-[11px] text-[#73E3B4] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Person</span>
                      </button>
                    </div>

                    {showInlinePerson && (
                      <div className="space-y-2 mb-2 p-2.5 rounded bg-[#0C0E12] border border-[#3D4943]/50">
                        <input
                          type="text"
                          placeholder="Person name..."
                          value={inlinePersonName}
                          onChange={(e) => setInlinePersonName(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-[#1A1C20] text-xs text-[#E2E2E8] border border-[#3D4943]/40"
                        />
                        <input
                          type="text"
                          placeholder="WhatsApp / Phone (optional, e.g. +88017...)"
                          value={inlinePersonPhone}
                          onChange={(e) => setInlinePersonPhone(e.target.value)}
                          className="w-full px-2 py-1 rounded bg-[#1A1C20] text-xs text-[#E2E2E8] border border-[#3D4943]/40"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              if (inlinePersonName.trim()) {
                                const newId = onCreatePersonInline(inlinePersonName.trim(), inlinePersonPhone.trim());
                                setPersonId(newId);
                                setInlinePersonName('');
                                setInlinePersonPhone('');
                                setShowInlinePerson(false);
                              }
                            }}
                            className="px-3 py-1 bg-[#55C79A] text-[#003826] rounded text-xs font-semibold"
                          >
                            Save Person
                          </button>
                          <button
                            type="button"
                            onClick={() => setShowInlinePerson(false)}
                            className="px-2 py-1 text-[#87948C]"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <select
                      value={personId}
                      onChange={(e) => setPersonId(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] text-xs focus:outline-none focus:border-[#73E3B4]"
                    >
                      {combinedPeopleList.map((p) => {
                        const connInfo = getPersonConnectedInfo(p);
                        return (
                          <option key={p.id} value={p.id}>
                            {p.name} {connInfo.isConnected ? `⚡ [EcO Connected • ${connInfo.code}]` : ''}
                          </option>
                        );
                      })}
                    </select>

                    {/* Prominent Connected EcO Account indicator */}
                    {selectedPersonConnInfo.isConnected && (
                      <div className="mt-2.5 p-3 rounded-xl bg-[#0C0E12] border border-[#73E3B4]/50 flex items-start gap-3 animate-in fade-in duration-150">
                        <div className="w-7 h-7 rounded-lg bg-[#73E3B4]/15 border border-[#73E3B4]/30 flex items-center justify-center text-[#73E3B4] shrink-0 mt-0.5 shadow-sm">
                          <Zap className="w-4 h-4 fill-[#73E3B4]/20 stroke-[2.2]" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-xs text-[#E2E2E8]">{selectedPersonObj?.name}</span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#73E3B4]/20 text-[#73E3B4] border border-[#73E3B4]/30 flex items-center gap-1">
                              <Zap className="w-2.5 h-2.5" />
                              EcO Connected Contact
                            </span>
                            <span className="text-[10px] font-mono text-[#87948C]">
                              {selectedPersonConnInfo.code}
                            </span>
                          </div>
                          <p className="text-[11px] text-[#BCCAC1] mt-1 leading-relaxed">
                            Two-party synchronized account. Adding this will send an official EcO proposal directly to {selectedPersonObj?.name} for confirmation.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-medium text-[#BCCAC1]">Tag</label>
                      <button
                        type="button"
                        onClick={() => setShowInlineTag(true)}
                        className="text-[11px] text-[#73E3B4] hover:underline flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Tag</span>
                      </button>
                    </div>

                    {showInlineTag && (
                      <div className="flex gap-2 mb-2 p-2 rounded bg-[#0C0E12] border border-[#3D4943]/50">
                        <input
                          type="text"
                          placeholder="Tag label..."
                          value={inlineTagName}
                          onChange={(e) => setInlineTagName(e.target.value)}
                          className="flex-1 px-2 py-1 rounded bg-[#1A1C20] text-xs text-[#E2E2E8] border border-[#3D4943]/40"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (inlineTagName.trim()) {
                              onCreateTagInline(inlineTagName.trim());
                              setTag(inlineTagName.trim());
                              setInlineTagName('');
                              setShowInlineTag(false);
                            }
                          }}
                          className="px-2.5 py-1 bg-[#55C79A] text-[#003826] rounded text-xs font-semibold"
                        >
                          Add
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowInlineTag(false)}
                          className="px-2 py-1 text-[#87948C]"
                        >
                          Cancel
                        </button>
                      </div>
                    )}

                    <select
                      value={tag}
                      onChange={(e) => setTag(e.target.value)}
                      className="w-full px-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] text-xs focus:outline-none focus:border-[#73E3B4]"
                    >
                      {tags.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: Details, Amount, Method & Final Action */}
          {step === 3 && (
            <div className="space-y-4">
              {/* Amount input with big mono presentation */}
              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                  Amount (৳)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-base font-mono text-[#73E3B4]">৳</span>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    autoFocus
                    value={amountStr}
                    onChange={(e) => setAmountStr(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/60 text-lg font-mono text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
                  />
                </div>

                {/* Daily Spending Rate for Recurring Expenses */}
                {selectedKind === 'expense' && expenseKind === 'recurring' && (
                  <div className="mt-2 p-3 rounded-lg bg-[#0C0E12] border border-[#73E3B4]/40 shadow-sm animate-in fade-in duration-150">
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
                        <div className="text-sm sm:text-base font-mono font-bold text-[#73E3B4]">
                          {parseFloat(amountStr) > 0
                            ? `${formatTaka(parseFloat(amountStr) / recurringDays)} / day`
                            : '৳ 0.00 / day'}
                        </div>
                      </div>
                    </div>
                    {parseFloat(amountStr) > 0 && (
                      <div className="mt-2 pt-1.5 border-t border-[#3D4943]/30 text-[11px] text-[#BCCAC1] flex items-center justify-between">
                        <span>Daily budget load:</span>
                        <span className="font-mono text-[#FFB4AB]">-{formatTaka(parseFloat(amountStr) / recurringDays)} every day</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Method selector (unless transfer which has From/To) */}
              {selectedKind !== 'transfer' ? (
                <div>
                  <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                    {selectedKind === 'earning'
                      ? 'Deposit Into Account'
                      : selectedKind === 'give'
                      ? 'Lend Money From Account'
                      : selectedKind === 'take'
                      ? 'Receive Borrowed Funds In'
                      : 'Payment Account'}
                  </label>
                  <select
                    value={payMethodId}
                    onChange={(e) => setPayMethodId(e.target.value)}
                    className="w-full px-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] text-xs focus:outline-none focus:border-[#73E3B4]"
                  >
                    {paymentMethods.filter((m) => m.isActive).map((m) => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                /* Transfer fee options */
                <div className="p-3.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[#BCCAC1]">Transfer & Cash-out Fee</span>
                    <span className="text-[11px] font-mono text-[#73E3B4]">
                      {applyCharge ? `${chargeRate}%` : '0% (No extra charge)'}
                    </span>
                  </div>

                  {/* Transfer Presets */}
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                    {[
                      { id: 'none', label: 'No Fee (0%)', rate: 0, active: !applyCharge },
                      { id: 'bkash', label: 'bKash (1.85%)', rate: 1.85, active: applyCharge && chargeRate === 1.85 },
                      { id: 'bkash_priyo', label: 'bKash Priyo (1.395%)', rate: 1.395, active: applyCharge && chargeRate === 1.395 },
                      { id: 'nagad', label: 'Nagad (1.49%)', rate: 1.49, active: applyCharge && chargeRate === 1.49 },
                      { id: 'custom', label: 'Custom %', rate: chargeRate, active: applyCharge && ![1.85, 1.395, 1.49].includes(chargeRate) }
                    ].map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          if (preset.id === 'none') {
                            setApplyCharge(false);
                            setTransferPreset('none');
                          } else if (preset.id === 'custom') {
                            setApplyCharge(true);
                            setTransferPreset('custom');
                          } else {
                            setApplyCharge(true);
                            setChargeRate(preset.rate);
                            setTransferPreset(preset.id as any);
                          }
                        }}
                        className={`px-2 py-1.5 rounded text-[10px] font-medium border text-center transition-all ${
                          preset.active
                            ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                            : 'bg-[#1A1C20] border-[#3D4943]/40 text-[#87948C] hover:text-[#E2E2E8]'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  {applyCharge && (transferPreset === 'custom' || ![1.85, 1.395, 1.49].includes(chargeRate)) && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-[11px] text-[#87948C]">Custom Rate:</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        value={chargeRate}
                        onChange={(e) => setChargeRate(parseFloat(e.target.value) || 0)}
                        className="w-20 px-2 py-1 rounded bg-[#1A1C20] border border-[#3D4943]/50 text-right font-mono text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                      />
                      <span className="text-xs font-mono text-[#87948C]">%</span>
                    </div>
                  )}

                  {applyCharge && parseFloat(amountStr) > 0 && (
                    <div className="pt-2 border-t border-[#3D4943]/20 space-y-1 font-mono text-[11px]">
                      <div className="flex justify-between text-[#87948C]">
                        <span>Credited to {paymentMethods.find((m) => m.id === toMethodId)?.name}:</span>
                        <span className="text-[#E2E2E8] font-semibold">{formatTaka(parseFloat(amountStr))}</span>
                      </div>
                      <div className="flex justify-between text-[#87948C]">
                        <span>Fee deducted ({chargeRate}%):</span>
                        <span className="text-[#FFB4AB]">{formatTaka((parseFloat(amountStr) * chargeRate) / 100)}</span>
                      </div>
                      <div className="flex justify-between text-[#BCCAC1] pt-1 border-t border-[#3D4943]/30 font-bold">
                        <span>Total debited from {paymentMethods.find((m) => m.id === fromMethodId)?.name}:</span>
                        <span className="text-[#FFB4AB]">
                          {formatTaka(parseFloat(amountStr) + (parseFloat(amountStr) * chargeRate) / 100)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Peer lending & borrowing cashout fee options */}
              {(selectedKind === 'give' || selectedKind === 'take') && (
                <div className="p-3.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-medium text-[#BCCAC1] flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={peerApplyCharge}
                        onChange={(e) => {
                          setPeerApplyCharge(e.target.checked);
                          if (e.target.checked && peerPreset === 'none') {
                            setPeerPreset('bkash');
                            setPeerChargeRate(1.85);
                            setPeerFeeTreatment('separate');
                          }
                        }}
                        className="rounded border-[#3D4943] text-[#73E3B4] focus:ring-0"
                      />
                      <span>Apply Cash-Out Fee to this {selectedKind === 'give' ? 'Loan' : 'Borrowing'}</span>
                    </label>
                    {peerApplyCharge && (
                      <span className="text-[11px] font-mono text-[#73E3B4]">{peerChargeRate}%</span>
                    )}
                  </div>

                  {peerApplyCharge && (
                    <div className="space-y-3 pt-1">
                      {/* Presets */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                        {[
                          { id: 'bkash', label: 'bKash (1.85%)', rate: 1.85 },
                          { id: 'bkash_priyo', label: 'bKash Priyo (1.395%)', rate: 1.395 },
                          { id: 'nagad', label: 'Nagad (1.49%)', rate: 1.49 },
                          { id: 'custom', label: 'Custom %', rate: peerChargeRate }
                        ].map((preset) => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => {
                              if (preset.id === 'custom') {
                                setPeerPreset('custom');
                              } else {
                                setPeerPreset(preset.id as any);
                                setPeerChargeRate(preset.rate);
                              }
                            }}
                            className={`px-2 py-1.5 rounded text-[10px] font-medium border text-center transition-all ${
                              (preset.id === 'custom' && peerPreset === 'custom') ||
                              (preset.id !== 'custom' && peerChargeRate === preset.rate && peerPreset !== 'custom')
                                ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                                : 'bg-[#1A1C20] border-[#3D4943]/40 text-[#87948C] hover:text-[#E2E2E8]'
                            }`}
                          >
                            {preset.label}
                          </button>
                        ))}
                      </div>

                      {peerPreset === 'custom' && (
                        <div className="flex items-center gap-2 pt-1">
                          <span className="text-[11px] text-[#87948C]">Custom Rate:</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            max="100"
                            value={peerChargeRate}
                            onChange={(e) => setPeerChargeRate(parseFloat(e.target.value) || 0)}
                            className="w-20 px-2 py-1 rounded bg-[#1A1C20] border border-[#3D4943]/50 text-right font-mono text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                          />
                          <span className="text-xs font-mono text-[#87948C]">%</span>
                        </div>
                      )}

                      {/* Fee Treatment Selector */}
                      <div className="pt-2 border-t border-[#3D4943]/30 space-y-1.5">
                        <label className="block text-[11px] font-medium text-[#BCCAC1]">
                          Fee Accounting Choice:
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPeerFeeTreatment('separate')}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              peerFeeTreatment === 'separate'
                                ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                                : 'bg-[#1A1C20] border-[#3D4943]/40 text-[#87948C] hover:text-[#E2E2E8]'
                            }`}
                          >
                            <div className="font-semibold text-xs text-[#E2E2E8]">Fee covered separately</div>
                            <div className="text-[10px] text-[#87948C] mt-0.5">
                              Wallet pays fee; debt ledger records only principal.
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setPeerFeeTreatment('included')}
                            className={`p-2.5 rounded-lg border text-left transition-all ${
                              peerFeeTreatment === 'included'
                                ? 'bg-[#1E2024] border-[#73E3B4] text-[#73E3B4]'
                                : 'bg-[#1A1C20] border-[#3D4943]/40 text-[#87948C] hover:text-[#E2E2E8]'
                            }`}
                          >
                            <div className="font-semibold text-xs text-[#E2E2E8]">Fee included in agreed debt</div>
                            <div className="text-[10px] text-[#87948C] mt-0.5">
                              Fee is rolled into debt; borrower owes principal + fee.
                            </div>
                          </button>
                        </div>
                      </div>

                      {parseFloat(amountStr) > 0 && (
                        <div className="pt-2 border-t border-[#3D4943]/20 space-y-1 font-mono text-[11px]">
                          {(() => {
                            const pAmt = parseFloat(amountStr);
                            const feeAmt = (pAmt * peerChargeRate) / 100;
                            const personObj = people.find((p) => p.id === personId);
                            const personName = personObj?.name || 'Contact';
                            const payName = paymentMethods.find((m) => m.id === payMethodId)?.name || 'Wallet';

                            return (
                              <>
                                <div className="flex justify-between text-[#87948C]">
                                  <span>Principal Transfer:</span>
                                  <span className="text-[#E2E2E8]">{formatTaka(pAmt)}</span>
                                </div>
                                <div className="flex justify-between text-[#87948C]">
                                  <span>MFS Fee ({peerChargeRate}%):</span>
                                  <span className="text-[#FFB4AB]">{formatTaka(feeAmt)}</span>
                                </div>
                                <div className="flex justify-between text-[#87948C] pt-1 border-t border-[#3D4943]/20">
                                  <span>Total deduction from {payName}:</span>
                                  <span className="font-bold text-[#FFB4AB]">{formatTaka(pAmt + feeAmt)}</span>
                                </div>
                                <div className="flex justify-between text-[#BCCAC1] font-bold">
                                  <span>Debt balance for {personName}:</span>
                                  <span className={selectedKind === 'give' ? 'text-[#73E3B4]' : 'text-[#FFB4AB]'}>
                                    {formatTaka(peerFeeTreatment === 'included' ? pAmt + feeAmt : pAmt)}
                                  </span>
                                </div>
                              </>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Description / Note */}
              <div>
                <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                  Description / Note (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Office lunch, Groceries, Project fee"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] text-xs focus:outline-none focus:border-[#73E3B4]"
                />
              </div>

              {/* Plain language semantic confirmation */}
              {(selectedKind === 'give' || selectedKind === 'take') && (
                <div className="p-3 rounded-xl bg-[#1E2024] border border-[#3D4943]/40 text-xs space-y-2 text-[#BCCAC1]">
                  {selectedPersonConnInfo.isConnected ? (
                    <div className="flex items-start gap-2.5">
                      <Zap className="w-4 h-4 text-[#73E3B4] shrink-0 mt-0.5 fill-[#73E3B4]/20" />
                      <div>
                        <div className="font-semibold text-[#E2E2E8]">
                          Two-Party EcO Connected Synchronization
                        </div>
                        <div className="text-[11px] text-[#BCCAC1] mt-0.5 leading-relaxed">
                          You are submitting an official proposal to{' '}
                          <span className="text-[#73E3B4] font-medium">
                            {selectedPersonObj?.name} ({selectedPersonConnInfo.code})
                          </span>{' '}
                          to {selectedKind === 'give' ? 'lend' : 'borrow'}{' '}
                          <strong className="text-[#E2E2E8]">
                            ৳{formatTaka(parseFloat(amountStr) || 0)}
                          </strong>
                          . Once they confirm via their notification bar, this entry will automatically record in both ledgers.
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-[#73E3B4] shrink-0 mt-0.5" />
                      <div>
                        {selectedKind === 'give' ? (
                          <span>
                            You are recording that you <strong>lent</strong> money.{' '}
                            {selectedPersonObj?.name || 'This person'} will owe you{' '}
                            <strong className="text-[#73E3B4]">
                              {formatTaka(
                                peerApplyCharge && peerFeeTreatment === 'included'
                                  ? (parseFloat(amountStr) || 0) + ((parseFloat(amountStr) || 0) * peerChargeRate) / 100
                                  : parseFloat(amountStr) || 0
                              )}
                            </strong>.
                          </span>
                        ) : (
                          <span>
                            You are recording that you <strong>borrowed</strong> money. You will owe{' '}
                            {selectedPersonObj?.name || 'this person'}{' '}
                            <strong className="text-[#FFB4AB]">
                              {formatTaka(
                                peerApplyCharge && peerFeeTreatment === 'included'
                                  ? (parseFloat(amountStr) || 0) + ((parseFloat(amountStr) || 0) * peerChargeRate) / 100
                                  : parseFloat(amountStr) || 0
                              )}
                            </strong>.
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#3D4943]/40 bg-[#1E2024]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 rounded text-xs text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] transition-colors"
            >
              Cancel
            </button>
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                className="px-3 py-1.5 rounded text-xs text-[#BCCAC1] hover:text-[#E2E2E8] hover:bg-[#282A2E] transition-colors"
              >
                Back
              </button>
            )}
          </div>

          {step < 3 && step > 1 ? (
            <button
              type="button"
              onClick={handleNext}
              className="px-4 py-1.5 rounded bg-[#282A2E] hover:bg-[#333539] text-xs font-semibold text-[#E2E2E8] flex items-center gap-1.5 transition-colors"
            >
              <span>Next</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : step === 3 ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleSubmit}
              className="px-5 py-2 rounded bg-[#55C79A] hover:bg-[#73E3B4] disabled:opacity-50 text-xs font-semibold text-[#003826] transition-all shadow-sm active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? (
                'Saving...'
              ) : (selectedKind === 'give' || selectedKind === 'take') && selectedPersonConnInfo.isConnected ? (
                <>
                  <Zap className="w-3.5 h-3.5 fill-[#003826]" />
                  <span>Send EcO Proposal</span>
                </>
              ) : (
                'Confirm & Save'
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
