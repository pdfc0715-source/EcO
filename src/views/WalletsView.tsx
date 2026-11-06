import React, { useState } from 'react';
import {
  WalletCards,
  Plus,
  ArrowRightLeft,
  Archive,
  Edit2,
  X,
  Wallet,
  Building,
  CreditCard,
  Smartphone,
  Layers,
  HelpCircle
} from 'lucide-react';
import {
  PaymentMethod,
  PaymentMethodType
} from '../domain/types';
import {
  FinancialSummary
} from '../domain/calculations';
import {
  resolveDuplicateMethodName,
  MAX_TOTAL_METHODS
} from '../domain/paymentMethods';
import { formatTaka } from '../domain/money';
import { ConfirmModal } from '../components/ui/ConfirmModal';

interface WalletsViewProps {
  paymentMethods: PaymentMethod[];
  summary: FinancialSummary;
  onSaveMethod: (method: PaymentMethod) => void;
  onArchiveMethod: (methodId: string) => void;
  onOpenAddTransfer: (preselectedFromId?: string) => void;
}

export const WalletsView: React.FC<WalletsViewProps> = ({
  paymentMethods,
  summary,
  onSaveMethod,
  onArchiveMethod,
  onOpenAddTransfer
}) => {
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingMethod, setEditingMethod] = useState<PaymentMethod | null>(null);
  const [methodToArchive, setMethodToArchive] = useState<PaymentMethod | null>(null);
  const [selectedWalletForBreakdown, setSelectedWalletForBreakdown] = useState<typeof summary.walletBalances[0] | null>(null);

  // New method form state
  const [nameInput, setNameInput] = useState<string>('');
  const [typeInput, setTypeInput] = useState<PaymentMethodType>('bank');
  const [openingBalanceStr, setOpeningBalanceStr] = useState<string>('0');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const activeMethods = paymentMethods.filter((m) => m.isActive);

  const handleOpenAdd = () => {
    setErrorMsg(null);
    setNameInput('');
    setTypeInput('bank');
    setOpeningBalanceStr('0');
    setEditingMethod(null);
    setShowAddModal(true);
  };

  const handleOpenEdit = (m: PaymentMethod) => {
    setErrorMsg(null);
    setNameInput(m.name);
    setTypeInput(m.type);
    setOpeningBalanceStr(String(m.openingBalance || 0));
    setEditingMethod(m);
    setShowAddModal(true);
  };

  const handleSaveMethod = () => {
    setErrorMsg(null);
    const trimmed = nameInput.trim();
    if (!trimmed) {
      setErrorMsg('Please enter a wallet or account name.');
      return;
    }

    if (!editingMethod && activeMethods.length >= MAX_TOTAL_METHODS) {
      setErrorMsg(`Maximum limit of ${MAX_TOTAL_METHODS} payment methods reached.`);
      return;
    }

    const opening = parseFloat(openingBalanceStr) || 0;

    if (editingMethod) {
      // Editing existing method
      const resolvedName = resolveDuplicateMethodName(trimmed, paymentMethods, editingMethod.id);
      onSaveMethod({
        ...editingMethod,
        name: resolvedName,
        type: typeInput,
        openingBalance: opening,
        updatedAt: new Date().toISOString()
      });
    } else {
      // Creating new method
      const resolvedName = resolveDuplicateMethodName(trimmed, paymentMethods);
      const newMethod: PaymentMethod = {
        id: `method_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: resolvedName,
        type: typeInput,
        isBuiltIn: false,
        isActive: true,
        balance: opening,
        openingBalance: opening,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        legacyNames: [resolvedName]
      };
      onSaveMethod(newMethod);
    }

    setShowAddModal(false);
  };

  const getWalletIcon = (type: PaymentMethodType) => {
    switch (type) {
      case 'cash':
        return <Wallet className="w-4 h-4 text-[#73E3B4]" />;
      case 'mobile_money':
        return <Smartphone className="w-4 h-4 text-[#73E3B4]" />;
      case 'bank':
        return <Building className="w-4 h-4 text-[#73E3B4]" />;
      case 'credit_card':
        return <CreditCard className="w-4 h-4 text-[#73E3B4]" />;
      default:
        return <WalletCards className="w-4 h-4 text-[#73E3B4]" />;
    }
  };

  return (
    <div className="space-y-6 pb-28 lg:pb-12 animate-in fade-in duration-150">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[#E2E2E8]">Wallets & Accounts</h2>
          <p className="text-xs text-[#BCCAC1]">
            Manage liquid balances across Cash, mobile wallets, and banks
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onOpenAddTransfer()}
            className="px-3.5 py-2 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] text-xs font-medium text-[#BEC7D5] border border-[#3D4943]/50 flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>Transfer Funds</span>
          </button>
          <button
            type="button"
            onClick={handleOpenAdd}
            className="px-4 py-2 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] text-xs font-semibold text-[#003826] flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Wallet</span>
          </button>
        </div>
      </div>

      {/* Overview Totals Card */}
      <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-[#BCCAC1]">
            Total Liquid Funds in Wallets
          </div>
          <div className="text-2xl sm:text-3xl font-mono tabular-nums font-bold text-[#73E3B4] mt-1 tracking-tight">
            {formatTaka(summary.liquidWalletTotal)}
          </div>
          <div className="text-[11px] text-[#87948C] mt-1">
            Physical cash and active digital accounts (excluding debt receivables)
          </div>
        </div>

        <div className="p-3.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30 text-xs space-y-1 md:text-right">
          <div className="text-[#87948C]">Overall Net Position:</div>
          <div className="font-mono tabular-nums text-base font-bold text-[#E2E2E8]">
            {formatTaka(summary.netTotal)}
          </div>
        </div>
      </div>

      {/* Grid of Neutral Payment Method Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {summary.walletBalances.map((item) => {
          const methodObj = paymentMethods.find((m) => m.id === item.methodId);
          if (!methodObj?.isActive) return null;

          return (
            <div
              key={item.methodId}
              onClick={() => setSelectedWalletForBreakdown(item)}
              className="bg-[#1A1C20] border border-[#3D4943]/40 hover:border-[#73E3B4]/60 rounded-xl p-5 flex flex-col justify-between transition-all space-y-4 shadow-sm group cursor-pointer"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30 shrink-0">
                      {getWalletIcon(methodObj.type)}
                    </div>
                    <div className="min-w-0">
                      <span className="text-sm font-semibold text-[#E2E2E8] block truncate">
                        {item.name}
                      </span>
                      <span className="text-[10px] text-[#87948C] uppercase tracking-wider capitalize">
                        {methodObj.type.replace('_', ' ')}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(methodObj)}
                      className="p-1.5 rounded-lg text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] transition-colors cursor-pointer"
                      title="Edit wallet"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    {!methodObj.isBuiltIn && (
                      <button
                        type="button"
                        onClick={() => setMethodToArchive(methodObj)}
                        className="p-1.5 rounded-lg text-[#87948C] hover:text-[#FFB4AB] hover:bg-[#282A2E] transition-colors cursor-pointer"
                        title="Archive wallet"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Clean Balance Amount */}
                <div className="mt-4">
                  <div className="text-[10px] text-[#87948C] uppercase tracking-wider font-medium">
                    Current Balance
                  </div>
                  <div className="text-2xl font-mono tabular-nums font-bold text-[#E2E2E8] mt-0.5">
                    {formatTaka(item.currentBalance)}
                  </div>
                </div>
              </div>

              {/* Clean interactive footer */}
              <div className="pt-3 border-t border-[#3D4943]/30 flex items-center justify-between text-xs text-[#87948C] group-hover:text-[#73E3B4] transition-colors">
                <span className="text-[11px] font-medium">View Breakdown</span>
                <span className="text-sm">→</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Wallet Breakdown Modal */}
      {selectedWalletForBreakdown && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedWalletForBreakdown(null);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#1A1C20] border border-[#3D4943]/60 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40">
                  <Wallet className="w-4 h-4 text-[#73E3B4]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[#E2E2E8]">
                    {selectedWalletForBreakdown.name}
                  </h3>
                  <span className="text-[10px] text-[#87948C] uppercase tracking-wider">
                    Account Ledger Breakdown
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedWalletForBreakdown(null)}
                className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Current Balance Hero */}
            <div className="p-4 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-[#87948C] uppercase tracking-wider font-medium">
                  Current Balance
                </span>
                <div className="text-2xl font-mono font-bold text-[#73E3B4] mt-0.5">
                  {formatTaka(selectedWalletForBreakdown.currentBalance)}
                </div>
              </div>
              <div className="text-right">
                <span className="text-[11px] text-[#87948C] uppercase tracking-wider font-medium">
                  Opening Balance
                </span>
                <div className="text-sm font-mono text-[#BCCAC1] mt-0.5">
                  {formatTaka(selectedWalletForBreakdown.openingBalance)}
                </div>
              </div>
            </div>

            {/* Inflows & Outflows stats */}
            <div className="space-y-1.5 text-xs max-h-72 overflow-y-auto pr-1">
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0C0E12]/60 border border-[#3D4943]/30">
                <span className="text-[#BCCAC1]">Earnings / Inflow (+):</span>
                <span className="font-mono font-semibold text-[#73E3B4]">
                  +{formatTaka(selectedWalletForBreakdown.earnings)}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0C0E12]/60 border border-[#3D4943]/30">
                <span className="text-[#BCCAC1]">Expenses (−):</span>
                <span className="font-mono font-semibold text-[#FFB4AB]">
                  -{formatTaka(selectedWalletForBreakdown.expenses)}
                </span>
              </div>

              {selectedWalletForBreakdown.recurringExpenses > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0C0E12]/60 border border-[#3D4943]/30">
                  <span className="text-[#BCCAC1]">Recurring Expenses (−):</span>
                  <span className="font-mono font-semibold text-[#FFB4AB]">
                    -{formatTaka(selectedWalletForBreakdown.recurringExpenses)}
                  </span>
                </div>
              )}

              {selectedWalletForBreakdown.transfersIn > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0C0E12]/60 border border-[#3D4943]/30">
                  <span className="text-[#BCCAC1]">Transfers Received (+):</span>
                  <span className="font-mono font-semibold text-[#73E3B4]">
                    +{formatTaka(selectedWalletForBreakdown.transfersIn)}
                  </span>
                </div>
              )}

              {selectedWalletForBreakdown.transfersOut > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0C0E12]/60 border border-[#3D4943]/30">
                  <span className="text-[#BCCAC1]">Transfers Sent (−):</span>
                  <span className="font-mono font-semibold text-[#FFB4AB]">
                    -{formatTaka(selectedWalletForBreakdown.transfersOut)}
                  </span>
                </div>
              )}

              {selectedWalletForBreakdown.peerTakenIn > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0C0E12]/60 border border-[#3D4943]/30">
                  <span className="text-[#BCCAC1]">Person Ledger (Received / Repaid) (+):</span>
                  <span className="font-mono font-semibold text-[#73E3B4]">
                    +{formatTaka(selectedWalletForBreakdown.peerTakenIn)}
                  </span>
                </div>
              )}

              {selectedWalletForBreakdown.peerGivenOut > 0 && (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#0C0E12]/60 border border-[#3D4943]/30">
                  <span className="text-[#BCCAC1]">Person Ledger (Lent Out) (−):</span>
                  <span className="font-mono font-semibold text-[#FFB4AB]">
                    -{formatTaka(selectedWalletForBreakdown.peerGivenOut)}
                  </span>
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-between gap-2 border-t border-[#3D4943]/30">
              <button
                type="button"
                onClick={() => {
                  const mId = selectedWalletForBreakdown.methodId;
                  setSelectedWalletForBreakdown(null);
                  onOpenAddTransfer(mId);
                }}
                className="btn-sm bg-[#0C0E12] hover:bg-[#1E2024] text-[#73E3B4] border border-[#3D4943]/40 gap-1.5 cursor-pointer text-xs"
              >
                <ArrowRightLeft className="w-3.5 h-3.5" />
                <span>Transfer from this Wallet</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedWalletForBreakdown(null)}
                className="px-4 py-2 rounded-lg bg-[#282A2E] text-xs font-semibold text-[#E2E2E8] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Wallet Modal */}
      {showAddModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowAddModal(false);
          }}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md bg-[#1A1C20] border border-[#3D4943]/60 rounded-xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-3">
              <h3 className="text-sm font-semibold text-[#E2E2E8]">
                {editingMethod ? `Edit ${editingMethod.name}` : 'Add Payment Method'}
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded text-[#87948C] hover:text-[#E2E2E8] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-lg bg-[#FFB4AB]/10 border border-[#FFB4AB]/30 text-xs text-[#FFB4AB]">
                {errorMsg}
              </div>
            )}

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] text-[#BCCAC1] uppercase tracking-wider mb-1">
                  Account / Wallet Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. City Bank, Nagad, Cash"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full py-2 px-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] placeholder-[#87948C] outline-none focus:border-[#73E3B4]"
                />
              </div>

              <div>
                <label className="block text-[11px] text-[#BCCAC1] uppercase tracking-wider mb-1">
                  Wallet Type
                </label>
                <select
                  value={typeInput}
                  onChange={(e) => setTypeInput(e.target.value as PaymentMethodType)}
                  className="w-full py-2 px-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4] cursor-pointer"
                >
                  <option value="cash">Cash (Physical)</option>
                  <option value="mobile_money">Mobile Financial Service (bKash, Nagad, Rocket)</option>
                  <option value="bank">Bank Account</option>
                  <option value="credit_card">Credit Card</option>
                  <option value="other">Other Account</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-[#BCCAC1] uppercase tracking-wider mb-1">
                  Opening Balance (৳)
                </label>
                <input
                  type="number"
                  step="any"
                  value={openingBalanceStr}
                  onChange={(e) => setOpeningBalanceStr(e.target.value)}
                  className="w-full py-2 px-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8] font-mono tabular-nums outline-none focus:border-[#73E3B4]"
                />
                <span className="text-[10px] text-[#87948C] mt-1 block">
                  Starting funds present in this account before logging transactions.
                </span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-[#3D4943]/30">
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="px-3.5 py-1.5 rounded-lg bg-[#282A2E] text-xs text-[#BCCAC1] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveMethod}
                className="px-4 py-1.5 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-semibold text-xs transition-colors cursor-pointer"
              >
                Save Wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Archive Confirmation Modal */}
      {methodToArchive && (
        <ConfirmModal
          isOpen={true}
          title={`Archive ${methodToArchive.name}?`}
          message={`Are you sure you want to archive "${methodToArchive.name}"? It will no longer appear in everyday quick selectors, but historical records will be preserved.`}
          confirmLabel="Archive Wallet"
          cancelLabel="Keep Wallet"
          isDestructive={false}
          onConfirm={() => {
            onArchiveMethod(methodToArchive.id);
            setMethodToArchive(null);
          }}
          onCancel={() => setMethodToArchive(null)}
        />
      )}
    </div>
  );
};
