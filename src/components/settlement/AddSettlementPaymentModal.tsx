import React, { useState, useMemo, useEffect } from 'react';
import { X, Check, Wallet, AlertCircle, Percent, Hash, SlidersHorizontal, Equal, Receipt } from 'lucide-react';
import {
  SmartSettlement,
  SettlementMember,
  SettlementExpense,
  SplitMethod,
  PayerEntry
} from '../../domain/settlementTypes';
import {
  takaToPoisha,
  poishaToTaka,
  calculateExpenseSplits,
  getExpenseTotalPoisha,
  getExpenseParticipants
} from '../../domain/settlementEngine';
import { formatTaka } from '../../domain/money';
import { repository } from '../../data/repository';
import { PaymentMethod } from '../../domain/types';

interface AddSettlementExpenseModalProps {
  isOpen: boolean;
  settlement: SmartSettlement;
  editingExpense?: SettlementExpense | null;
  onClose: () => void;
  onSaved: () => void;
  wallets: PaymentMethod[];
}

export const AddSettlementExpenseModal: React.FC<AddSettlementExpenseModalProps> = ({
  isOpen,
  settlement,
  editingExpense,
  onClose,
  onSaved,
  wallets
}) => {
  const meMember = useMemo(() => settlement.members.find((m) => m.isMe), [settlement.members]);

  const [title, setTitle] = useState<string>('');
  const [totalAmountTaka, setTotalAmountTaka] = useState<string>('');
  const [date, setDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Who Paid: single payer vs multiple
  const [isMultiplePayers, setIsMultiplePayers] = useState<boolean>(false);
  const [singlePayerId, setSinglePayerId] = useState<string>(meMember?.id || settlement.members[0]?.id || '');
  const [multiPayerAmounts, setMultiPayerAmounts] = useState<Record<string, string>>({});

  // Who Participated
  const [selectedParticipants, setSelectedParticipants] = useState<string[]>(
    settlement.members.map((m) => m.id)
  );

  // Split Method
  const [splitMethod, setSplitMethod] = useState<SplitMethod>('equal');
  const [exactAmounts, setExactAmounts] = useState<Record<string, string>>({});
  const [percentages, setPercentages] = useState<Record<string, string>>({});
  const [weights, setWeights] = useState<Record<string, string>>({});
  const [customAdjustments, setCustomAdjustments] = useState<Record<string, string>>({});

  // Wallet sync prompt
  const [syncWallet, setSyncWallet] = useState<boolean>(Boolean(settlement.autoWalletSyncPreference?.enabled));
  const [selectedWalletId, setSelectedWalletId] = useState<string>(
    settlement.autoWalletSyncPreference?.walletId || wallets[0]?.id || ''
  );
  const [rememberWalletPref, setRememberWalletPref] = useState<boolean>(
    Boolean(settlement.autoWalletSyncPreference?.enabled)
  );

  const [error, setError] = useState<string>('');

  // Pre-fill when editing
  useEffect(() => {
    if (editingExpense) {
      setTitle(editingExpense.title);
      setTotalAmountTaka(String(poishaToTaka(getExpenseTotalPoisha(editingExpense))));
      setDate(editingExpense.date);
      setSelectedParticipants([...getExpenseParticipants(editingExpense)]);
      setSplitMethod(editingExpense.splitMethod);

      if (editingExpense.payers.length > 1) {
        setIsMultiplePayers(true);
        const amounts: Record<string, string> = {};
        editingExpense.payers.forEach((p) => {
          amounts[p.memberId] = String(poishaToTaka(p.amountPoisha));
        });
        setMultiPayerAmounts(amounts);
      } else if (editingExpense.payers.length === 1) {
        setIsMultiplePayers(false);
        setSinglePayerId(editingExpense.payers[0].memberId);
      }

      if (editingExpense.splitDetails?.exactAmounts) {
        const exact: Record<string, string> = {};
        Object.entries(editingExpense.splitDetails.exactAmounts).forEach(([mId, p]) => {
          exact[mId] = String(poishaToTaka(Number(p)));
        });
        setExactAmounts(exact);
      }
      if (editingExpense.splitDetails?.percentages) {
        const pct: Record<string, string> = {};
        Object.entries(editingExpense.splitDetails.percentages).forEach(([mId, p]) => {
          pct[mId] = String(p);
        });
        setPercentages(pct);
      }
      if (editingExpense.splitDetails?.weights) {
        const w: Record<string, string> = {};
        Object.entries(editingExpense.splitDetails.weights).forEach(([mId, val]) => {
          w[mId] = String(val);
        });
        setWeights(w);
      }
      if (editingExpense.splitDetails?.customAdjustments) {
        const adj: Record<string, string> = {};
        Object.entries(editingExpense.splitDetails.customAdjustments).forEach(([mId, p]) => {
          adj[mId] = String(poishaToTaka(Number(p)));
        });
        setCustomAdjustments(adj);
      }
    } else {
      // New expense defaults
      setTitle('');
      setTotalAmountTaka('');
      setDate(new Date().toISOString().split('T')[0]);
      setIsMultiplePayers(false);
      setSinglePayerId(meMember?.id || settlement.members[0]?.id || '');
      setMultiPayerAmounts({});
      setSelectedParticipants(settlement.members.map((m) => m.id));
      setSplitMethod('equal');
      setExactAmounts({});
      setPercentages({});
      setWeights({});
      setCustomAdjustments({});
      setError('');
    }
  }, [editingExpense, isOpen, meMember, settlement.members]);

  const totalPoisha = useMemo(() => {
    const val = parseFloat(totalAmountTaka);
    return isNaN(val) || val <= 0 ? 0 : takaToPoisha(val);
  }, [totalAmountTaka]);

  // Compute payers poisha
  const currentPayers: PayerEntry[] = useMemo(() => {
    if (!isMultiplePayers) {
      return [{ memberId: singlePayerId, amountPoisha: totalPoisha }];
    }
    return settlement.members
      .map((m) => {
        const raw = parseFloat(multiPayerAmounts[m.id] || '0');
        const poisha = isNaN(raw) || raw <= 0 ? 0 : takaToPoisha(raw);
        return { memberId: m.id, amountPoisha: poisha };
      })
      .filter((p) => p.amountPoisha > 0);
  }, [isMultiplePayers, singlePayerId, totalPoisha, settlement.members, multiPayerAmounts]);

  const multiPayerSumPoisha = useMemo(() => {
    return currentPayers.reduce((acc, p) => acc + p.amountPoisha, 0);
  }, [currentPayers]);

  // Format split details for engine
  const splitDetailsForEngine = useMemo(() => {
    if (splitMethod === 'exact') {
      const exactMap: Record<string, number> = {};
      selectedParticipants.forEach((mId) => {
        const raw = parseFloat(exactAmounts[mId] || '0');
        exactMap[mId] = isNaN(raw) || raw < 0 ? 0 : takaToPoisha(raw);
      });
      return { exactAmounts: exactMap };
    }
    if (splitMethod === 'percentage') {
      const pctMap: Record<string, number> = {};
      selectedParticipants.forEach((mId) => {
        const raw = parseFloat(percentages[mId] || '0');
        pctMap[mId] = isNaN(raw) || raw < 0 ? 0 : raw;
      });
      return { percentages: pctMap };
    }
    if (splitMethod === 'weighted') {
      const wMap: Record<string, number> = {};
      selectedParticipants.forEach((mId) => {
        const raw = parseFloat(weights[mId] || '1');
        wMap[mId] = isNaN(raw) || raw <= 0 ? 1 : raw;
      });
      return { weights: wMap };
    }
    if (splitMethod === 'custom') {
      const adjMap: Record<string, number> = {};
      selectedParticipants.forEach((mId) => {
        const raw = parseFloat(customAdjustments[mId] || '0');
        adjMap[mId] = isNaN(raw) ? 0 : takaToPoisha(raw);
      });
      return { customAdjustments: adjMap };
    }
    return undefined;
  }, [splitMethod, selectedParticipants, exactAmounts, percentages, weights, customAdjustments]);

  // Calculated shares preview from pure engine
  const calculatedSplits = useMemo(() => {
    if (totalPoisha <= 0 || selectedParticipants.length === 0) return [];
    try {
      const splits = calculateExpenseSplits(
        totalPoisha,
        selectedParticipants,
        splitMethod,
        splitDetailsForEngine
      );
      return splits;
    } catch {
      return [];
    }
  }, [totalPoisha, selectedParticipants, splitMethod, splitDetailsForEngine]);

  if (!isOpen) return null;

  // Toggle participant
  const toggleParticipant = (memberId: string) => {
    if (selectedParticipants.includes(memberId)) {
      if (selectedParticipants.length <= 1) {
        setError('At least one participant must be included in the expense.');
        return;
      }
      setSelectedParticipants(selectedParticipants.filter((id) => id !== memberId));
    } else {
      setSelectedParticipants([...selectedParticipants, memberId]);
    }
    setError('');
  };

  const handleSelectAllParticipants = () => {
    setSelectedParticipants(settlement.members.map((m) => m.id));
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please enter an expense title.');
      return;
    }
    if (totalPoisha <= 0) {
      setError('Total amount must be greater than 0.');
      return;
    }
    if (selectedParticipants.length === 0) {
      setError('Please select at least one participant.');
      return;
    }

    if (isMultiplePayers) {
      if (multiPayerSumPoisha !== totalPoisha) {
        setError(
          `Sum of payers (৳${poishaToTaka(multiPayerSumPoisha)}) must equal total amount (৳${poishaToTaka(totalPoisha)}). Difference: ৳${poishaToTaka(Math.abs(totalPoisha - multiPayerSumPoisha))}`
        );
        return;
      }
    }

    // Split method validation
    if (splitMethod === 'exact') {
      const exactSum = Object.values(splitDetailsForEngine?.exactAmounts || {}).reduce((a, b) => a + b, 0);
      if (exactSum !== totalPoisha) {
        setError(
          `Exact split amounts sum to ৳${poishaToTaka(exactSum)}, but expense total is ৳${poishaToTaka(totalPoisha)}.`
        );
        return;
      }
    }

    if (splitMethod === 'percentage') {
      const pctSum = Object.values(splitDetailsForEngine?.percentages || {}).reduce((a, b) => a + b, 0);
      if (Math.abs(pctSum - 100) > 0.01) {
        setError(`Percentage split must sum to exactly 100% (currently ${pctSum}%).`);
        return;
      }
    }

    const expensePayload: SettlementExpense = {
      id: editingExpense?.id || `exp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: title.trim(),
      totalAmountPoisha: totalPoisha,
      date,
      payers: currentPayers,
      participantMemberIds: selectedParticipants,
      splitMethod,
      splitDetails: splitDetailsForEngine,
      walletTransactionId: editingExpense?.walletTransactionId,
      createdAt: editingExpense?.createdAt || Date.now()
    };

    const walletSyncConfig =
      syncWallet && selectedWalletId
        ? { walletId: selectedWalletId, rememberPreference: rememberWalletPref }
        : undefined;

    if (editingExpense) {
      await repository.updateSettlementExpense(settlement.id, expensePayload, walletSyncConfig);
    } else {
      await repository.addSettlementExpense(settlement.id, expensePayload, walletSyncConfig);
    }

    onSaved();
    onClose();
  };

  const isMePayer = currentPayers.some((p) => p.memberId === meMember?.id);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-[#1A1C20] border border-[#3D4943]/60 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D4943]/40 bg-[#14161A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#55C79A]/20 border border-[#55C79A]/40 flex items-center justify-center text-[#73E3B4]">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#E2E2E8]">
                {editingExpense ? 'Edit Expense' : 'Add Expense'}
              </h2>
              <p className="text-[11px] text-[#87948C]">
                {settlement.name} &bull; No category or notes needed
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 rounded-xl bg-red-900/30 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Title and Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2 space-y-1.5">
              <label className="text-xs font-semibold text-[#BCCAC1]">Expense Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Dinner, Boat Ride, Grocery"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-sm text-[#E2E2E8] placeholder-[#5A645E] focus:outline-none focus:border-[#73E3B4]"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#BCCAC1]">Total (৳)</label>
              <input
                type="number"
                step="any"
                min="0"
                value={totalAmountTaka}
                onChange={(e) => setTotalAmountTaka(e.target.value)}
                placeholder="0.00"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-sm font-mono text-[#73E3B4] font-semibold placeholder-[#5A645E] focus:outline-none focus:border-[#73E3B4]"
              />
            </div>
          </div>

          {/* Date */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#BCCAC1]">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3.5 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
            />
          </div>

          {/* Who Paid */}
          <div className="space-y-2.5 p-3.5 rounded-xl bg-[#14161A] border border-[#3D4943]/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#BCCAC1]">Who Paid?</label>
              <button
                type="button"
                onClick={() => setIsMultiplePayers(!isMultiplePayers)}
                className="text-[11px] font-semibold text-[#73E3B4] hover:underline cursor-pointer"
              >
                {isMultiplePayers ? 'Single person paid' : 'Multiple people paid'}
              </button>
            </div>

            {!isMultiplePayers ? (
              <select
                value={singlePayerId}
                onChange={(e) => setSinglePayerId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer"
              >
                {settlement.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.isMe ? '(You)' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <div className="text-[11px] text-[#87948C] flex items-center justify-between">
                  <span>Enter amount paid by each person:</span>
                  <span
                    className={`font-mono text-xs font-semibold ${
                      multiPayerSumPoisha === totalPoisha
                        ? 'text-[#73E3B4]'
                        : 'text-[#FFB4AB]'
                    }`}
                  >
                    Allocated: ৳{poishaToTaka(multiPayerSumPoisha)} / ৳{poishaToTaka(totalPoisha)}
                  </span>
                </div>
                {settlement.members.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="text-xs text-[#E2E2E8] w-28 truncate">
                      {m.name} {m.isMe ? '(You)' : ''}
                    </span>
                    <div className="relative flex-1">
                      <span className="absolute left-2.5 top-2 text-xs text-[#87948C]">৳</span>
                      <input
                        type="number"
                        step="any"
                        placeholder="0.00"
                        value={multiPayerAmounts[m.id] || ''}
                        onChange={(e) =>
                          setMultiPayerAmounts({ ...multiPayerAmounts, [m.id]: e.target.value })
                        }
                        className="w-full pl-6 pr-3 py-1.5 rounded-lg bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] font-mono focus:outline-none focus:border-[#73E3B4]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Who Participated */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#BCCAC1]">
                Who Participated? ({selectedParticipants.length} of {settlement.members.length})
              </label>
              <button
                type="button"
                onClick={handleSelectAllParticipants}
                className="text-[11px] font-semibold text-[#73E3B4] hover:underline cursor-pointer"
              >
                Select All
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {settlement.members.map((m) => {
                const isSelected = selectedParticipants.includes(m.id);
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => toggleParticipant(m.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium border text-left transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-[#1E2024] border-[#73E3B4]/60 text-[#73E3B4]'
                        : 'bg-[#111317] border-[#3D4943]/40 text-[#87948C] hover:text-[#BCCAC1]'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] ${
                        isSelected
                          ? 'bg-[#55C79A] border-[#55C79A] text-[#003826]'
                          : 'border-[#3D4943] bg-transparent'
                      }`}
                    >
                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                    <span className="truncate">
                      {m.name} {m.isMe ? '(You)' : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Split Method Tabs */}
          <div className="space-y-3 pt-2">
            <label className="text-xs font-semibold text-[#BCCAC1]">Split Method</label>
            <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#111317] border border-[#3D4943]/40 text-xs">
              {[
                { id: 'equal', label: 'Equal', icon: Equal },
                { id: 'exact', label: 'Exact', icon: Hash },
                { id: 'percentage', label: '%', icon: Percent },
                { id: 'weighted', label: 'Shares', icon: SlidersHorizontal },
                { id: 'custom', label: 'Adjust', icon: SlidersHorizontal }
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = splitMethod === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSplitMethod(tab.id as SplitMethod)}
                    className={`py-2 px-1 rounded-lg font-medium text-[11px] flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                      isActive
                        ? 'bg-[#55C79A] text-[#003826] font-bold shadow-sm'
                        : 'text-[#87948C] hover:text-[#E2E2E8]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{tab.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Split Method Inputs */}
            {splitMethod === 'exact' && (
              <div className="space-y-2 p-3 rounded-xl bg-[#14161A] border border-[#3D4943]/40">
                <span className="text-[11px] text-[#87948C]">
                  Specify the exact taka amount each participant owes:
                </span>
                {selectedParticipants.map((mId) => {
                  const m = settlement.members.find((mem) => mem.id === mId);
                  return (
                    <div key={mId} className="flex items-center gap-2">
                      <span className="text-xs text-[#E2E2E8] w-28 truncate">{m?.name}</span>
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-2 text-xs text-[#87948C]">৳</span>
                        <input
                          type="number"
                          step="any"
                          placeholder="0.00"
                          value={exactAmounts[mId] || ''}
                          onChange={(e) =>
                            setExactAmounts({ ...exactAmounts, [mId]: e.target.value })
                          }
                          className="w-full pl-6 pr-3 py-1.5 rounded-lg bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] font-mono focus:outline-none focus:border-[#73E3B4]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {splitMethod === 'percentage' && (
              <div className="space-y-2 p-3 rounded-xl bg-[#14161A] border border-[#3D4943]/40">
                <span className="text-[11px] text-[#87948C]">
                  Specify percentage for each participant (Must sum to 100%):
                </span>
                {selectedParticipants.map((mId) => {
                  const m = settlement.members.find((mem) => mem.id === mId);
                  return (
                    <div key={mId} className="flex items-center gap-2">
                      <span className="text-xs text-[#E2E2E8] w-28 truncate">{m?.name}</span>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          step="any"
                          placeholder="0"
                          value={percentages[mId] || ''}
                          onChange={(e) =>
                            setPercentages({ ...percentages, [mId]: e.target.value })
                          }
                          className="w-full pr-8 pl-3 py-1.5 rounded-lg bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] font-mono focus:outline-none focus:border-[#73E3B4]"
                        />
                        <span className="absolute right-2.5 top-2 text-xs text-[#87948C]">%</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {splitMethod === 'weighted' && (
              <div className="space-y-2 p-3 rounded-xl bg-[#14161A] border border-[#3D4943]/40">
                <span className="text-[11px] text-[#87948C]">
                  Specify relative share weight (e.g. 1 for single, 2 for couple):
                </span>
                {selectedParticipants.map((mId) => {
                  const m = settlement.members.find((mem) => mem.id === mId);
                  return (
                    <div key={mId} className="flex items-center gap-2">
                      <span className="text-xs text-[#E2E2E8] w-28 truncate">{m?.name}</span>
                      <input
                        type="number"
                        step="any"
                        placeholder="1"
                        value={weights[mId] || '1'}
                        onChange={(e) => setWeights({ ...weights, [mId]: e.target.value })}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] font-mono focus:outline-none focus:border-[#73E3B4]"
                      />
                    </div>
                  );
                })}
              </div>
            )}

            {splitMethod === 'custom' && (
              <div className="space-y-2 p-3 rounded-xl bg-[#14161A] border border-[#3D4943]/40">
                <span className="text-[11px] text-[#87948C]">
                  Base equal split with custom adjustments (+৳ extra, -৳ discount):
                </span>
                {selectedParticipants.map((mId) => {
                  const m = settlement.members.find((mem) => mem.id === mId);
                  return (
                    <div key={mId} className="flex items-center gap-2">
                      <span className="text-xs text-[#E2E2E8] w-28 truncate">{m?.name}</span>
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-2 text-xs text-[#87948C]">৳</span>
                        <input
                          type="number"
                          step="any"
                          placeholder="±0.00"
                          value={customAdjustments[mId] || ''}
                          onChange={(e) =>
                            setCustomAdjustments({ ...customAdjustments, [mId]: e.target.value })
                          }
                          className="w-full pl-6 pr-3 py-1.5 rounded-lg bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] font-mono focus:outline-none focus:border-[#73E3B4]"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Live Calculated Split Preview */}
            {calculatedSplits.length > 0 && (
              <div className="p-3 rounded-xl bg-[#111317] border border-[#3D4943]/30 space-y-1.5">
                <div className="text-[11px] font-semibold text-[#87948C] flex items-center justify-between">
                  <span>Calculated Split per Person:</span>
                  <span className="text-[#73E3B4]">Fair remainder distributed</span>
                </div>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {calculatedSplits.map((sp) => {
                    const m = settlement.members.find((mem) => mem.id === sp.memberId);
                    return (
                      <div
                        key={sp.memberId}
                        className="flex items-center justify-between px-2.5 py-1 rounded bg-[#1A1C20] text-xs"
                      >
                        <span className="text-[#BCCAC1] truncate mr-2">{m?.name}:</span>
                        <span className="font-mono font-semibold text-[#E2E2E8]">
                          {formatTaka(poishaToTaka(sp.amountPoisha ?? sp.allocatedPoisha ?? 0))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Permission-Based EcO Wallet Sync Prompt */}
          {isMePayer && wallets.length > 0 && (
            <div className="p-4 rounded-xl bg-[#14161A] border border-[#55C79A]/30 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-[#73E3B4]">
                  <Wallet className="w-4 h-4" />
                  <span>Deduct from your EcO Wallet?</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={syncWallet}
                    onChange={(e) => setSyncWallet(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#282A2E] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#55C79A]"></div>
                </label>
              </div>

              {syncWallet && (
                <div className="space-y-2 pt-1">
                  <p className="text-[11px] text-[#87948C]">
                    Since you paid out of pocket, EcO can record this expense in your personal ledger automatically.
                  </p>
                  <select
                    value={selectedWalletId}
                    onChange={(e) => setSelectedWalletId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4] cursor-pointer"
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} (৳{w.balance.toLocaleString()})
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 pt-1 text-[11px] text-[#BCCAC1] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={rememberWalletPref}
                      onChange={(e) => setRememberWalletPref(e.target.checked)}
                      className="rounded border-[#3D4943] text-[#55C79A] focus:ring-0"
                    />
                    <span>Remember my wallet choice for this settlement</span>
                  </label>
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
              {editingExpense ? 'Save Changes' : 'Add Expense'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
