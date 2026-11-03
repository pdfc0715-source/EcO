import React from 'react';
import { X, ShieldAlert, CheckCircle2, AlertTriangle, ArrowRight, Sparkles, Calendar, TrendingDown } from 'lucide-react';
import { BudgetMetrics } from '../domain/calculations';
import { formatTaka } from '../domain/money';

interface FixedEmergencyDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: BudgetMetrics;
  onNavigateToSettings?: () => void;
}

export const FixedEmergencyDetailsModal: React.FC<FixedEmergencyDetailsModalProps> = ({
  isOpen,
  onClose,
  metrics,
  onNavigateToSettings
}) => {
  if (!isOpen) return null;

  const currentMonthName = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  // Calculation percentage bars
  const fixedPct = metrics.plannedFixed > 0
    ? Math.min(100, Math.round((metrics.actualFixed / metrics.plannedFixed) * 100))
    : metrics.actualFixed > 0 ? 100 : 0;

  const emergencyPct = metrics.plannedEmergency > 0
    ? Math.min(100, Math.round((metrics.actualEmergency / metrics.plannedEmergency) * 100))
    : metrics.actualEmergency > 0 ? 100 : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm modal-backdrop-animate"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-[#111317] border border-[#3D4943]/60 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] modal-content-animate"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-[#3D4943]/30 flex items-center justify-between bg-[#1A1C20]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#0C0E12] border border-[#73E3B4]/40 flex items-center justify-center text-[#73E3B4]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#E2E2E8]">
                Fixed & Emergency Budget Details
              </h2>
              <p className="text-[11px] text-[#87948C]">
                Adaptive tracking for {currentMonthName}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#0C0E12] transition-colors"
            aria-label="Close details"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {/* Section 1: Fixed Costs */}
          <div className="p-4 rounded-xl bg-[#1A1C20] border border-[#3D4943]/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#E2E2E8]">1. Fixed Costs (Bills & Rent)</span>
                {metrics.isFixedOver ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#93000A]/30 text-[#FFB4AB] border border-[#FFB4AB]/40 flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    Exceeded by {formatTaka(metrics.fixedOverAmount)}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#003826]/40 text-[#73E3B4] border border-[#73E3B4]/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Within Budget Limit
                  </span>
                )}
              </div>
              <span className="text-[11px] font-mono text-[#73E3B4] font-medium">
                {fixedPct}% completed
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-[#87948C]">Target / Planned: </span>
                <span className="font-mono text-[#E2E2E8] font-medium">{formatTaka(metrics.plannedFixed)}</span>
              </div>
              <div className="text-right">
                <span className="text-[#87948C]">Completed so far: </span>
                <span className={`font-mono font-medium ${metrics.isFixedOver ? 'text-[#FFB4AB]' : 'text-[#73E3B4]'}`}>
                  {formatTaka(metrics.actualFixed)}
                </span>
              </div>
            </div>

            {/* Visual progress bar */}
            <div className="w-full h-2 rounded-full bg-[#0C0E12] border border-[#3D4943]/30 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  metrics.isFixedOver ? 'bg-[#FFB4AB]' : 'bg-[#73E3B4]'
                }`}
                style={{ width: `${Math.min(100, fixedPct)}%` }}
              />
            </div>

            {metrics.isFixedOver ? (
              <p className="text-[11px] text-[#FFB4AB] leading-relaxed bg-[#93000A]/10 p-2.5 rounded-lg border border-[#FFB4AB]/20">
                ⚠️ Fixed spending exceeded your planned {formatTaka(metrics.plannedFixed)} by <strong>{formatTaka(metrics.fixedOverAmount)}</strong>. Only this exceeded amount is counted as an expense against your daily budget.
              </p>
            ) : (
              <p className="text-[11px] text-[#87948C] leading-relaxed bg-[#0C0E12]/60 p-2.5 rounded-lg border border-[#3D4943]/30">
                ✓ Spent {formatTaka(metrics.actualFixed)} of {formatTaka(metrics.plannedFixed)} ({fixedPct}% completed). This spending does <strong>not</strong> affect or reduce your daily budget because it was set aside in advance. {formatTaka(Math.max(0, metrics.plannedFixed - metrics.actualFixed))} remains before reaching the limit.
              </p>
            )}
          </div>

          {/* Section 2: Emergency Fund */}
          <div className="p-4 rounded-xl bg-[#1A1C20] border border-[#3D4943]/40 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#E2E2E8]">2. Emergency Fund Cushion</span>
                {metrics.isEmergencyOver ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#93000A]/30 text-[#FFB4AB] border border-[#FFB4AB]/40 flex items-center gap-1 animate-pulse">
                    <AlertTriangle className="w-3 h-3" />
                    Exceeded by {formatTaka(metrics.emergencyOverAmount)}
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-[#003826]/40 text-[#73E3B4] border border-[#73E3B4]/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Protected Reserve
                  </span>
                )}
              </div>
              <span className="text-[11px] font-mono text-[#73E3B4] font-medium">
                {emergencyPct}% used
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div>
                <span className="text-[#87948C]">Planned Reserve: </span>
                <span className="font-mono text-[#E2E2E8] font-medium">{formatTaka(metrics.plannedEmergency)}</span>
              </div>
              <div className="text-right">
                <span className="text-[#87948C]">Used this month: </span>
                <span className={`font-mono font-medium ${metrics.isEmergencyOver ? 'text-[#FFB4AB]' : 'text-[#73E3B4]'}`}>
                  {formatTaka(metrics.actualEmergency)}
                </span>
              </div>
            </div>

            {/* Visual progress bar */}
            <div className="w-full h-2 rounded-full bg-[#0C0E12] border border-[#3D4943]/30 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  metrics.isEmergencyOver ? 'bg-[#FFB4AB]' : 'bg-[#73E3B4]'
                }`}
                style={{ width: `${Math.min(100, emergencyPct)}%` }}
              />
            </div>

            {metrics.isEmergencyOver ? (
              <p className="text-[11px] text-[#FFB4AB] leading-relaxed bg-[#93000A]/10 p-2.5 rounded-lg border border-[#FFB4AB]/20">
                ⚠️ Emergency spending exceeded the planned reserve by <strong>{formatTaka(metrics.emergencyOverAmount)}</strong>. Only this exceeded amount is counted as an expense against your daily budget.
              </p>
            ) : (
              <p className="text-[11px] text-[#87948C] leading-relaxed bg-[#0C0E12]/60 p-2.5 rounded-lg border border-[#3D4943]/30">
                ✓ Emergency expenses do <strong>not</strong> reduce your daily budget until the planned reserve ({formatTaka(metrics.plannedEmergency)}) is exceeded. {formatTaka(Math.max(0, metrics.plannedEmergency - metrics.actualEmergency))} remains protected.
              </p>
            )}
          </div>

          {/* Section 3: Adaptive Formula Breakdown */}
          <div className="p-4 rounded-xl bg-[#0C0E12] border border-[#3D4943]/40 space-y-2.5 font-mono text-[11px]">
            <div className="flex items-center justify-between pb-1 border-b border-[#3D4943]/40">
              <span className="text-xs font-sans font-semibold text-[#73E3B4]">
                Today's Daily Budget Formula
              </span>
              <span className="text-[10px] text-[#87948C] font-mono">
                Day {metrics.dayOfMonth} of {metrics.daysInMonth}
              </span>
            </div>

            <div className="p-2.5 rounded-lg bg-[#1A1C20] border border-[#3D4943]/40 text-[10px] space-y-1 font-mono text-[#BCCAC1]">
              <div className="text-[#73E3B4] font-semibold">Formula:</div>
              <div>F = max(Planned Fixed, Actual Fixed) · E = max(Planned Emergency, Actual Emergency)</div>
              <div>A = (I − F − S − E) × (1 − b/100)</div>
              <div>Today's Budget = (A − T) ÷ (D − d + 1)</div>
            </div>

            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between py-1 border-b border-[#3D4943]/20">
                <span className="text-[#87948C]">Monthly Income (I):</span>
                <span className="font-bold text-[#E2E2E8]">{formatTaka(metrics.income)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#3D4943]/20">
                <span className="text-[#87948C]">Fixed Costs Set Aside (F):</span>
                <span className="text-[#FFB4AB]">- {formatTaka(metrics.fixedUsed)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#3D4943]/20">
                <span className="text-[#87948C]">Emergency Fund Set Aside (E):</span>
                <span className="text-[#FFB4AB]">- {formatTaka(metrics.emergencyUsed)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#3D4943]/20">
                <span className="text-[#87948C]">Savings Target (S):</span>
                <span className="text-[#FFB4AB]">- {formatTaka(metrics.plannedSavings)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#3D4943]/20">
                <span className="text-[#87948C]">Safety Buffer (b = {metrics.bufferPct}%):</span>
                <span className="text-[#FFB4AB]">- {formatTaka(metrics.bufferAmount)}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-[#3D4943]/50 text-xs font-bold bg-[#1A1C20]/50 px-2 rounded">
                <span className="text-[#BCCAC1]">Monthly Spendable (A):</span>
                <span className="text-[#73E3B4]">{formatTaka(metrics.spendable)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#3D4943]/20">
                <span className="text-[#87948C]">Regular Spend So Far (T):</span>
                <span className="text-[#FFB4AB]">- {formatTaka(metrics.priorRegularSpend)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#3D4943]/20">
                <span className="text-[#87948C]">Remaining Spendable (A − T):</span>
                <span className="text-[#E2E2E8]">{formatTaka(metrics.remainingSpendable)}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-[#3D4943]/20">
                <span className="text-[#87948C]">Days Remaining (D − d + 1):</span>
                <span className="text-[#E2E2E8]">{metrics.daysLeft} days left in month</span>
              </div>
              <div className="flex justify-between py-2 text-xs font-bold text-white bg-[#1A1C20] px-2.5 rounded-lg border border-[#73E3B4]/40 mt-1">
                <span>Today's Adaptive Budget:</span>
                <span className="text-[#73E3B4] font-mono text-sm">{formatTaka(metrics.todayLimit)} / day</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-[#3D4943]/30 bg-[#1A1C20] flex items-center justify-between">
          {onNavigateToSettings ? (
            <button
              onClick={() => {
                onClose();
                onNavigateToSettings();
              }}
              className="text-xs text-[#73E3B4] hover:underline flex items-center gap-1.5 cursor-pointer"
            >
              <span>Edit Budget in Settings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <div />
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#0C0E12] hover:bg-[#1E2024] border border-[#3D4943]/40 text-xs text-[#E2E2E8] font-medium cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
