import React, { useState } from 'react';
import {
  Sparkles,
  Upload,
  FileCheck,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Wallet,
  Play,
  X,
  Plus,
  Trash2,
  Download,
  Users2,
  DollarSign,
  Check
} from 'lucide-react';
import {
  validateEcoBackupV1,
  SAMPLE_ECO_BACKUP_V1,
  BackupValidationResult,
  EcoBackupV1
} from '../domain/backupV1';
import { formatTaka } from '../domain/money';
import { BudgetMode } from '../domain/types';

interface OpeningDebtEntry {
  id: string;
  name: string;
  type: 'give' | 'take'; // 'give' = they owe me (receivable), 'take' = I owe them (payable)
  amount: number;
}

interface OnboardingModalProps {
  isOpen: boolean;
  canDismiss?: boolean;
  onDismiss?: () => void;
  initialMode?: 'choose' | 'new_user' | 'import_flow';
  onCompleteNewUser: (data: {
    cashBalance: number;
    bkashBalance: number;
    nagadBalance: number;
    budgetMode: BudgetMode;
    directBudget: number;
    openingDebts: OpeningDebtEntry[];
  }) => void;
  onCompleteImport: (backup: EcoBackupV1) => Promise<{ importedCount: number; skippedCount: number }>;
  onSkip?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  canDismiss = false,
  onDismiss,
  initialMode = 'choose',
  onCompleteNewUser,
  onCompleteImport,
  onSkip
}) => {
  const [mode, setMode] = useState<'choose' | 'new_user' | 'import_flow'>(initialMode);
  const [step, setStep] = useState<number>(1); // For new_user flow: 1 = Wallets, 2 = Opening Debts

  // --- New User State ---
  // Wallets
  const [cashBalanceStr, setCashBalanceStr] = useState<string>('0');
  const [bkashBalanceStr, setBkashBalanceStr] = useState<string>('0');
  const [nagadBalanceStr, setNagadBalanceStr] = useState<string>('0');
  const [budgetMode, setBudgetMode] = useState<BudgetMode>('direct');
  const [directBudgetStr, setDirectBudgetStr] = useState<string>('500');

  // Opening Debts
  const [openingDebts, setOpeningDebts] = useState<OpeningDebtEntry[]>([]);
  const [debtName, setDebtName] = useState<string>('');
  const [debtType, setDebtType] = useState<'give' | 'take'>('give');
  const [debtAmountStr, setDebtAmountStr] = useState<string>('');

  // --- Import State ---
  const [validation, setValidation] = useState<BackupValidationResult | null>(null);
  const [parsedBackup, setParsedBackup] = useState<EcoBackupV1 | null>(null);
  const [importSummary, setImportSummary] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleAddOpeningDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = debtName.trim();
    const amount = parseFloat(debtAmountStr);
    if (!cleanName || isNaN(amount) || amount <= 0) return;

    setOpeningDebts([
      ...openingDebts,
      {
        id: `open_debt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: cleanName,
        type: debtType,
        amount
      }
    ]);
    setDebtName('');
    setDebtAmountStr('');
  };

  const handleRemoveOpeningDebt = (id: string) => {
    setOpeningDebts(openingDebts.filter((d) => d.id !== id));
  };

  const handleFinishNewUser = () => {
    const cash = Math.max(0, parseFloat(cashBalanceStr) || 0);
    const bkash = Math.max(0, parseFloat(bkashBalanceStr) || 0);
    const nagad = Math.max(0, parseFloat(nagadBalanceStr) || 0);
    const budget = Math.max(0, parseFloat(directBudgetStr) || 500);

    onCompleteNewUser({
      cashBalance: cash,
      bkashBalance: bkash,
      nagadBalance: nagad,
      budgetMode,
      directBudget: budget,
      openingDebts
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const { result, parsedData } = validateEcoBackupV1(content);
      setValidation(result);
      if (result.isValid && parsedData) {
        setParsedBackup(parsedData);
      } else {
        setParsedBackup(null);
      }
    };
    reader.readAsText(file);
  };

  const handleLoadSampleFixture = () => {
    const jsonStr = JSON.stringify(SAMPLE_ECO_BACKUP_V1);
    const { result, parsedData } = validateEcoBackupV1(jsonStr);
    setValidation(result);
    if (result.isValid && parsedData) {
      setParsedBackup(parsedData);
    }
  };

  const handleExecuteImport = async () => {
    if (!parsedBackup) return;
    setIsImporting(true);
    try {
      const { importedCount, skippedCount } = await onCompleteImport(parsedBackup);
      setImportSummary(
        `Import complete: ${importedCount} records safely saved into your account. ${
          skippedCount > 0 ? `(${skippedCount} duplicate records skipped)` : ''
        }`
      );
    } catch (err: any) {
      let msg = err?.message || 'Unknown error';
      try {
        const parsed = JSON.parse(msg);
        if (parsed.error) {
          msg = parsed.error;
        }
      } catch {
        // Not a JSON error
      }
      setImportSummary(`Import failed: ${msg}`);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
      onClick={(e) => {
        if (onDismiss && e.target === e.currentTarget) {
          onDismiss();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg bg-[#1A1C20] border border-[#3D4943]/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-[#3D4943]/40 bg-[#1E2024] text-center">
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="absolute right-4 top-4 p-1.5 rounded text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] transition-colors cursor-pointer"
              aria-label="Close"
              title="Close and enter ledger"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#0C0E12] border border-[#73E3B4]/50 text-[#73E3B4] font-bold text-sm mb-2 shadow-sm">
            Ec
          </div>
          <h2 className="text-lg font-bold text-[#E2E2E8]">
            {mode === 'import_flow'
              ? 'Import Previous EcO Backup'
              : mode === 'new_user'
              ? 'First-Time Account Setup'
              : 'Welcome to EcO'}
          </h2>
          <p className="text-xs text-[#BCCAC1] mt-0.5">
            Personal finance & multi-wallet ledger for Bangladesh
          </p>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs">
          {/* =========================================================================
              VIEW 1: CHOOSE PATH
             ========================================================================= */}
          {mode === 'choose' && (
            <div className="space-y-4">
              <p className="text-xs text-[#E2E2E8] font-medium text-center">
                How would you like to set up your account?
              </p>

              <div className="grid grid-cols-1 gap-3 pt-1">
                {/* Option 1: New User */}
                <button
                  type="button"
                  onClick={() => {
                    setMode('new_user');
                    setStep(1);
                  }}
                  className="p-4 rounded-xl bg-[#0C0E12] border border-[#3D4943]/50 hover:border-[#73E3B4]/60 hover:bg-[#1E2024] text-left transition-all flex items-start gap-3.5 group cursor-pointer"
                >
                  <div className="p-2.5 rounded-lg bg-[#1A1C20] text-[#73E3B4] border border-[#3D4943]/40">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[#E2E2E8] group-hover:text-[#73E3B4]">
                      I'm new to EcO
                    </div>
                    <div className="text-xs text-[#BCCAC1] mt-0.5 leading-relaxed">
                      Walk through opening balances in Cash, bKash & Nagad, plus existing debts you owe or are owed.
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#87948C] group-hover:text-[#73E3B4] self-center" />
                </button>

                {/* Option 2: Import Backup */}
                <button
                  type="button"
                  onClick={() => setMode('import_flow')}
                  className="p-4 rounded-xl bg-[#0C0E12] border border-[#3D4943]/50 hover:border-[#73E3B4]/60 hover:bg-[#1E2024] text-left transition-all flex items-start gap-3.5 group cursor-pointer"
                >
                  <div className="p-2.5 rounded-lg bg-[#1A1C20] text-[#BEC7D5] border border-[#3D4943]/40">
                    <Upload className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-semibold text-[#E2E2E8] group-hover:text-[#73E3B4]">
                      I have previous EcO data
                    </div>
                    <div className="text-xs text-[#BCCAC1] mt-0.5 leading-relaxed">
                      Upload your JSON backup file. Verified and deduplicated before saving into your private cloud space.
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-[#87948C] group-hover:text-[#73E3B4] self-center" />
                </button>
              </div>

              {/* Skip CTA */}
              <div className="pt-2 text-center">
                <button
                  type="button"
                  onClick={() => {
                    if (onSkip) onSkip();
                    else if (onDismiss) onDismiss();
                    else handleFinishNewUser();
                  }}
                  className="text-xs text-[#87948C] hover:text-[#E2E2E8] hover:underline cursor-pointer"
                >
                  Skip setup for now (Start with default zero balances)
                </button>
              </div>
            </div>
          )}

          {/* =========================================================================
              VIEW 2: NEW USER STEP-BY-STEP (WALLETS THEN OPENING DEBTS)
             ========================================================================= */}
          {mode === 'new_user' && (
            <div className="space-y-4">
              {/* Step indicator */}
              <div className="flex items-center justify-between text-xs border-b border-[#3D4943]/30 pb-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      step === 1 ? 'bg-[#73E3B4] text-[#003826]' : 'bg-[#0C0E12] text-[#87948C]'
                    }`}
                  >
                    1
                  </span>
                  <span className={step === 1 ? 'font-semibold text-[#E2E2E8]' : 'text-[#87948C]'}>
                    Opening Balances
                  </span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-[#87948C]" />
                <div className="flex items-center gap-2">
                  <span
                    className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                      step === 2 ? 'bg-[#73E3B4] text-[#003826]' : 'bg-[#0C0E12] text-[#87948C]'
                    }`}
                  >
                    2
                  </span>
                  <span className={step === 2 ? 'font-semibold text-[#E2E2E8]' : 'text-[#87948C]'}>
                    Opening Debts & Loans
                  </span>
                </div>
              </div>

              {/* STEP 1: WALLETS */}
              {step === 1 && (
                <div className="space-y-4">
                  <p className="text-xs text-[#BCCAC1] leading-relaxed">
                    Enter the current money you have right now across your physical cash and mobile wallets. These will be marked as your <strong>opening balances</strong>.
                  </p>

                  <div className="space-y-3">
                    {/* Cash */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                        Physical Cash in Pocket / Home (৳)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        value={cashBalanceStr}
                        onChange={(e) => setCashBalanceStr(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 font-mono text-sm text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                      />
                    </div>

                    {/* bKash */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                        bKash Available Balance (৳)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        value={bkashBalanceStr}
                        onChange={(e) => setBkashBalanceStr(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 font-mono text-sm text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                      />
                    </div>

                    {/* Nagad */}
                    <div>
                      <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                        Nagad Available Balance (৳)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="0.00"
                        value={nagadBalanceStr}
                        onChange={(e) => setNagadBalanceStr(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 font-mono text-sm text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setMode('choose')}
                      className="px-3 py-1.5 rounded-lg text-xs text-[#87948C] hover:text-[#E2E2E8]"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(2)}
                      className="px-4 py-2 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                      <span>Next: Existing Debts</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 2: OPENING DEBTS & LOANS */}
              {step === 2 && (
                <div className="space-y-4">
                  <p className="text-xs text-[#BCCAC1] leading-relaxed">
                    Do you have any existing money people owe you, or loans you owe to others? Add them now as <strong>opening transactions</strong>, or skip to finish.
                  </p>

                  {/* Add Debt Inline Form */}
                  <form onSubmit={handleAddOpeningDebt} className="p-3.5 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40 space-y-2.5">
                    <div className="flex rounded-lg bg-[#1A1C20] p-1 border border-[#3D4943]/30 text-xs">
                      <button
                        type="button"
                        onClick={() => setDebtType('give')}
                        className={`flex-1 py-1 rounded font-medium transition-colors ${
                          debtType === 'give' ? 'bg-[#0C0E12] text-[#73E3B4]' : 'text-[#87948C]'
                        }`}
                      >
                        They Owe Me (Receivable)
                      </button>
                      <button
                        type="button"
                        onClick={() => setDebtType('take')}
                        className={`flex-1 py-1 rounded font-medium transition-colors ${
                          debtType === 'take' ? 'bg-[#0C0E12] text-[#FFB4AB]' : 'text-[#87948C]'
                        }`}
                      >
                        I Owe Them (Payable)
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        placeholder="Person name (e.g. Emon)"
                        value={debtName}
                        onChange={(e) => setDebtName(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                      />
                      <input
                        type="number"
                        step="any"
                        min="0"
                        placeholder="Amount (৳)"
                        value={debtAmountStr}
                        onChange={(e) => setDebtAmountStr(e.target.value)}
                        className="px-3 py-1.5 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs font-mono text-[#E2E2E8] outline-none focus:border-[#73E3B4]"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={!debtName.trim() || !debtAmountStr}
                      className="w-full py-1.5 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] disabled:opacity-40 text-[#73E3B4] font-medium text-xs flex items-center justify-center gap-1 border border-[#3D4943]/40 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Opening Debt Record</span>
                    </button>
                  </form>

                  {/* List of added debts */}
                  {openingDebts.length > 0 && (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {openingDebts.map((d) => (
                        <div
                          key={d.id}
                          className="p-2.5 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-semibold text-[#E2E2E8]">{d.name}</span>
                            <span className="text-[10px] text-[#87948C] ml-2">
                              {d.type === 'give' ? '(They owe you)' : '(You owe them)'}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono font-bold ${
                                d.type === 'give' ? 'text-[#73E3B4]' : 'text-[#FFB4AB]'
                              }`}
                            >
                              {formatTaka(d.amount)}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveOpeningDebt(d.id)}
                              className="text-[#87948C] hover:text-[#FFB4AB]"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="px-3 py-1.5 rounded-lg text-xs text-[#87948C] hover:text-[#E2E2E8]"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleFinishNewUser}
                      className="px-5 py-2 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-semibold text-xs transition-colors shadow-sm"
                    >
                      Complete & Enter EcO
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =========================================================================
              VIEW 3: LEGACY BACKUP IMPORT
             ========================================================================= */}
          {mode === 'import_flow' && (
            <div className="space-y-4">
              <p className="text-xs text-[#BCCAC1] leading-relaxed">
                Upload your previous EcO JSON backup file. All entries will be verified, safely migrated, and protected against duplicates.
              </p>

              {/* Upload Dropzone */}
              <div className="space-y-3">
                <label className="flex flex-col items-center justify-center p-6 rounded-xl border-2 border-dashed border-[#3D4943]/60 bg-[#0C0E12] hover:bg-[#1E2024] cursor-pointer transition-colors">
                  <Upload className="w-6 h-6 text-[#73E3B4] mb-2" />
                  <span className="text-xs font-semibold text-[#E2E2E8]">
                    Click to select or drag JSON backup
                  </span>
                  <span className="text-[11px] text-[#87948C] mt-0.5">
                    Supports eco-backup v1 schema
                  </span>
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>

                {/* Fixture & Sample Download options */}
                <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40">
                  <a
                    href="/sample-eco-backup.json"
                    download="sample-eco-backup.json"
                    className="text-xs text-[#73E3B4] hover:underline flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Sample Backup JSON</span>
                  </a>

                  <button
                    type="button"
                    onClick={handleLoadSampleFixture}
                    className="px-3 py-1.5 rounded-lg bg-[#1E2024] hover:bg-[#282A2E] text-[#BCCAC1] hover:text-[#E2E2E8] text-xs font-medium flex items-center gap-1 transition-colors"
                  >
                    <Play className="w-3 h-3 text-[#73E3B4]" />
                    <span>Test With Sample</span>
                  </button>
                </div>
              </div>

              {/* Validation & Preview Summary */}
              {validation && (
                <div className="space-y-3 p-4 rounded-xl bg-[#0C0E12] border border-[#3D4943]/50">
                  <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-2">
                    <span className="text-xs font-semibold text-[#E2E2E8] flex items-center gap-1.5">
                      {validation.isValid ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-[#73E3B4]" />
                          <span>Valid Backup Format</span>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="w-4 h-4 text-[#FFB4AB]" />
                          <span>Invalid Backup File</span>
                        </>
                      )}
                    </span>
                    <span className="text-[10px] text-[#87948C] font-mono">
                      Exported: {validation.exportDate?.split('T')[0] || 'Unknown'}
                    </span>
                  </div>

                  {validation.isValid ? (
                    <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-[#BCCAC1]">
                        <div>Expenses: <span className="font-mono text-[#E2E2E8]">{validation.counts.expenses || 0}</span></div>
                        <div>Earnings: <span className="font-mono text-[#E2E2E8]">{validation.counts.earnings || 0}</span></div>
                        <div>Transfers: <span className="font-mono text-[#E2E2E8]">{validation.counts.transfers || 0}</span></div>
                        <div>Loans & Debts: <span className="font-mono text-[#E2E2E8]">{validation.counts.transactions || 0}</span></div>
                        <div>People: <span className="font-mono text-[#E2E2E8]">{validation.counts.people || 0}</span></div>
                        <div>Recurring: <span className="font-mono text-[#E2E2E8]">{validation.counts.recurringExpenses || 0}</span></div>
                      </div>

                      <div className="pt-2 text-[11px] text-[#73E3B4] flex items-center gap-1.5">
                        <Check className="w-3.5 h-3.5" />
                        <span>Deduplication active: Any existing record IDs will be safely skipped.</span>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1 text-xs text-[#FFB4AB]">
                      {validation.errors.map((err, i) => (
                        <div key={i}>• {err}</div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Status summary */}
              {importSummary && (
                <div className="p-3 rounded-lg bg-[#73E3B4]/10 border border-[#73E3B4]/30 text-xs text-[#73E3B4]">
                  {importSummary}
                </div>
              )}

              {/* Actions */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setMode('choose')}
                  className="px-3 py-1.5 rounded-lg text-xs text-[#87948C] hover:text-[#E2E2E8]"
                >
                  Back
                </button>

                {validation?.isValid && !importSummary && (
                  <button
                    type="button"
                    disabled={isImporting}
                    onClick={handleExecuteImport}
                    className="px-5 py-2 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] disabled:opacity-50 text-[#003826] font-semibold text-xs transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    {isImporting ? 'Importing...' : 'Confirm & Import to Account'}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
