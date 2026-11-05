import React, { useState, useMemo } from 'react';
import { X, ArrowRight, Check, Wallet, AlertCircle, Coins } from 'lucide-react';
import { SmartSettlement, SettlementPayment } from '../../domain/settlementTypes';
import { takaToPoisha, poishaToTaka } from '../../domain/settlementEngine';
import { repository } from '../../data/repository';
import { PaymentMethod } from '../../domain/types';

interface RecordSettlementPaymentModalProps {
  isOpen: boolean;
  settlement: SmartSettlement;
  defaultFromMemberId?: string;
  defaultToMemberId?: string;
  defaultAmountPoisha?: number;
  onClose: () => void;
  onSaved: () => void;
  wallets: PaymentMethod[];
}

export const RecordSettlementPaymentModal: React.FC<RecordSettlementPaymentModalProps> = ({
  isOpen,
  settlement,
  defaultFromMemberId,
  defaultToMemberId,
  defaultAmountPoisha = 0,
  onClose,
  onSaved,
  wallets
}) => {
  const meMember = useMemo(() => settlement.members.find((m) => m.isMe), [settlement.members]);

  const [fromMemberId, setFromMemberId] = useState<string>(
    defaultFromMemberId || settlement.members[0]?.id || ''
  );
  const [toMemberId, setToMemberId] = useState<string>(
    defaultToMemberId || settlement.members[1]?.id || ''
  );
  const [amountTaka, setAmountTaka] = useState<string>(
    defaultAmountPoisha > 0 ? String(poishaToTaka(defaultAmountPoisha)) : ''
  );
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState<string>('');

  const [syncWallet, setSyncWallet] = useState<boolean>(true);
  const [selectedWalletId, setSelectedWalletId] = useState<string>(wallets[0]?.id || '');
  const [error, setError] = useState<string>('');

  if (!isOpen) return null;

  const isMeInvolved = fromMemberId === meMember?.id || toMemberId === meMember?.id;
  const isMePayer = fromMemberId === meMember?.id;
  const isMeReceiver = toMemberId === meMember?.id;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(amountTaka);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid transfer amount.');
      return;
    }
    if (fromMemberId === toMemberId) {
      setError('Payer and recipient cannot be the same person.');
      return;
    }

    const paymentPoisha = takaToPoisha(parsedAmount);

    const payment: SettlementPayment = {
      id: `pmt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      fromMemberId,
      toMemberId,
      amountPoisha: paymentPoisha,
      date,
      note: note.trim() || undefined,
      createdAt: Date.now()
    };

    const walletSyncConfig =
      syncWallet && isMeInvolved && selectedWalletId
        ? { walletId: selectedWalletId }
        : undefined;

    await repository.recordSettlementPayment(settlement.id, payment, walletSyncConfig);
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
              <Coins className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#E2E2E8]">Record Payment</h2>
              <p className="text-[11px] text-[#87948C]">Transfer real money between members to clear debt</p>
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

          {/* From & To Member */}
          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#BCCAC1]">Who Paid?</label>
              <select
                value={fromMemberId}
                onChange={(e) => setFromMemberId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer"
              >
                {settlement.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.isMe ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#BCCAC1]">To Whom?</label>
              <select
                value={toMemberId}
                onChange={(e) => setToMemberId(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer"
              >
                {settlement.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.isMe ? '(You)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Amount and Date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#BCCAC1]">Amount (৳)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={amountTaka}
                onChange={(e) => setAmountTaka(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-sm font-mono text-[#73E3B4] font-semibold placeholder-[#5A645E] focus:outline-none focus:border-[#73E3B4]"
                autoFocus
              />
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

          {/* Optional Note */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#BCCAC1]">Note (Optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. bKash transfer, Cash handed over"
              className="w-full px-3 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] placeholder-[#5A645E] focus:outline-none focus:border-[#73E3B4]"
            />
          </div>

          {/* Wallet Integration Sync Option */}
          {isMeInvolved && wallets.length > 0 && (
            <div className="p-3.5 rounded-xl bg-[#14161A] border border-[#55C79A]/30 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#73E3B4]">
                  <Wallet className="w-3.5 h-3.5" />
                  <span>
                    {isMePayer ? 'Deduct from EcO Wallet?' : 'Deposit into EcO Wallet?'}
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={syncWallet}
                  onChange={(e) => setSyncWallet(e.target.checked)}
                  className="rounded border-[#3D4943] text-[#55C79A] focus:ring-0"
                />
              </div>

              {syncWallet && (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-[#87948C]">
                    {isMePayer
                      ? 'Deduct this debt payment from your chosen wallet:'
                      : 'Record this incoming debt payment into your chosen wallet:'}
                  </p>
                  <select
                    value={selectedWalletId}
                    onChange={(e) => setSelectedWalletId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

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
              Record Payment
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
