import React, { useState, useMemo } from 'react';
import { X, RotateCcw, AlertCircle, Check } from 'lucide-react';
import { SmartSettlement, SettlementRefund } from '../../domain/settlementTypes';
import {
  takaToPoisha,
  poishaToTaka,
  distributePoishaRemainder,
  getExpenseTotalPoisha,
  getExpenseParticipants
} from '../../domain/settlementEngine';
import { formatTaka } from '../../domain/money';
import { repository } from '../../data/repository';

interface RecordSettlementRefundModalProps {
  isOpen: boolean;
  settlement: SmartSettlement;
  defaultExpenseId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export const RecordSettlementRefundModal: React.FC<RecordSettlementRefundModalProps> = ({
  isOpen,
  settlement,
  defaultExpenseId,
  onClose,
  onSaved
}) => {
  const [selectedExpenseId, setSelectedExpenseId] = useState<string>(
    defaultExpenseId || settlement.expenses[0]?.id || ''
  );

  const selectedExpense = useMemo(() => {
    return settlement.expenses.find((e) => e.id === selectedExpenseId);
  }, [settlement.expenses, selectedExpenseId]);

  // Max refund allowed on this expense
  const maxRefundPoisha = useMemo(() => {
    if (!selectedExpense) return 0;
    const existingRefunds = settlement.refunds
      .filter((r) => r.expenseId === selectedExpense.id)
      .reduce((acc, r) => acc + r.amountPoisha, 0);
    return Math.max(0, getExpenseTotalPoisha(selectedExpense) - existingRefunds);
  }, [selectedExpense, settlement.refunds]);

  const [refundAmountTaka, setRefundAmountTaka] = useState<string>('');
  const [receivedByMemberId, setReceivedByMemberId] = useState<string>(
    selectedExpense?.payers[0]?.memberId || settlement.members[0]?.id || ''
  );
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [reason, setReason] = useState<string>('');
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedExpense) {
      setError('Please select an expense.');
      return;
    }

    const parsedTaka = parseFloat(refundAmountTaka);
    if (isNaN(parsedTaka) || parsedTaka <= 0) {
      setError('Please enter a valid refund amount.');
      return;
    }

    const refundPoisha = takaToPoisha(parsedTaka);
    if (refundPoisha > maxRefundPoisha) {
      setError(
        `Refund cannot exceed remaining expense amount (${formatTaka(poishaToTaka(maxRefundPoisha))}).`
      );
      return;
    }

    // Default reduction split: distributed equally among original participants
    const participants = getExpenseParticipants(selectedExpense);
    const baseShare = participants.length > 0 ? Math.floor(refundPoisha / participants.length) : 0;
    const shares: Record<string, number> = {};
    participants.forEach((mId) => {
      shares[mId] = baseShare;
    });
    if (participants.length > 0) {
      distributePoishaRemainder(refundPoisha, participants, shares);
    }

    const reductionShares = participants.map((mId) => ({
      memberId: mId,
      amountPoisha: shares[mId] || 0
    }));

    const refund: SettlementRefund = {
      id: `ref_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      expenseId: selectedExpense.id,
      amountPoisha: refundPoisha,
      receivedByMemberId,
      date,
      reason: reason.trim() || undefined,
      reductionShares,
      createdAt: Date.now()
    };

    await repository.recordSettlementRefund(settlement.id, refund);
    onSaved();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#1A1C20] border border-[#3D4943]/60 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D4943]/40 bg-[#14161A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#55C79A]/20 border border-[#55C79A]/40 flex items-center justify-center text-[#73E3B4]">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#E2E2E8]">Record Expense Refund</h2>
              <p className="text-[11px] text-[#87948C]">Returned money from a merchant or vendor</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-900/30 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Pick Expense */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#BCCAC1]">Select Expense</label>
            <select
              value={selectedExpenseId}
              onChange={(e) => setSelectedExpenseId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer"
            >
              {settlement.expenses.map((exp) => (
                <option key={exp.id} value={exp.id}>
                  {exp.date} — {exp.title} ({formatTaka(poishaToTaka(getExpenseTotalPoisha(exp)))})
                </option>
              ))}
            </select>
          </div>

          {/* Refund Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#BCCAC1]">
                Refund Amount (৳)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                value={refundAmountTaka}
                onChange={(e) => setRefundAmountTaka(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-sm font-mono text-[#73E3B4] font-semibold placeholder-[#5A645E] focus:outline-none focus:border-[#73E3B4]"
                autoFocus
              />
              <span className="text-[10px] text-[#87948C]">
                Max: {formatTaka(poishaToTaka(maxRefundPoisha))}
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#BCCAC1]">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
              />
            </div>
          </div>

          {/* Who received the cash from merchant? */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#BCCAC1]">
              Who received the cash refund?
            </label>
            <select
              value={receivedByMemberId}
              onChange={(e) => setReceivedByMemberId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer"
            >
              {settlement.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.isMe ? '(You)' : ''}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-[#87948C]">
              This member physically holds the returned cash and accounts for it in the settlement.
            </p>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#BCCAC1]">Reason (Optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Overcharged, item returned"
              className="w-full px-3 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] placeholder-[#5A645E] focus:outline-none focus:border-[#73E3B4]"
            />
          </div>

          {/* Action Buttons */}
          <div className="pt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-[#282A2E] hover:bg-[#3D4943]/50 text-xs font-semibold text-[#BCCAC1] cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-2.5 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-xs font-bold text-[#003826] cursor-pointer transition-colors shadow-sm"
            >
              Record Refund
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
