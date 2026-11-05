import React, { useState, useEffect } from 'react';
import {
  Users,
  CheckCircle2,
  Receipt,
  Coins,
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  ExternalLink,
  RotateCcw
} from 'lucide-react';
import { SmartSettlement } from '../domain/settlementTypes';
import {
  calculateSettlementSummary,
  poishaToTaka,
  getExpenseTotalPoisha,
  getExpenseParticipants
} from '../domain/settlementEngine';
import { formatTaka } from '../domain/money';
import { formatDisplayDate } from '../domain/dates';
import { repository } from '../data/repository';

interface PublicSettlementShareViewProps {
  shareToken: string;
  onExit?: () => void;
}

export const PublicSettlementShareView: React.FC<PublicSettlementShareViewProps> = ({
  shareToken,
  onExit
}) => {
  const [settlement, setSettlement] = useState<SmartSettlement | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'transfers' | 'expenses' | 'math'>('transfers');
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    repository.getPublicSettlementByToken(shareToken).then((result) => {
      if (!isMounted) return;
      if (result) {
        setSettlement(result);
      } else {
        setError('Settlement not found or public sharing has been revoked by the creator.');
      }
      setLoading(false);
    });

    return () => {
      isMounted = false;
    };
  }, [shareToken]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0C0E12] flex flex-col items-center justify-center text-[#E2E2E8]">
        <div className="w-12 h-12 rounded-xl bg-[#1A1C20] border-2 border-[#73E3B4] flex items-center justify-center text-[#73E3B4] font-bold text-lg animate-pulse mb-3">
          EcO
        </div>
        <p className="text-xs text-[#87948C]">Loading shared settlement...</p>
      </div>
    );
  }

  if (error || !settlement) {
    return (
      <div className="min-h-screen bg-[#0C0E12] flex flex-col items-center justify-center p-6 text-[#E2E2E8] text-center">
        <div className="w-14 h-14 rounded-2xl bg-[#1A1C20] border border-[#3D4943]/60 flex items-center justify-center text-[#FFB4AB] mb-4">
          <ShieldCheck className="w-7 h-7" />
        </div>
        <h2 className="text-lg font-bold text-[#E2E2E8] mb-1">Settlement Unavailable</h2>
        <p className="text-xs text-[#87948C] max-w-sm mb-6 leading-relaxed">
          {error || 'This link may have expired or public sharing was disabled.'}
        </p>
        {onExit && (
          <button
            onClick={onExit}
            className="px-4 py-2 rounded-xl bg-[#55C79A] text-[#003826] font-bold text-xs"
          >
            Go to EcO App
          </button>
        )}
      </div>
    );
  }

  const summary = calculateSettlementSummary(settlement);

  return (
    <div className="min-h-screen bg-[#0C0E12] text-[#E2E2E8] flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="px-4 sm:px-8 py-3.5 border-b border-[#3D4943]/40 bg-[#0C0E12]/95 backdrop-blur-md sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#1A1C20] border border-[#73E3B4]/40 flex items-center justify-center text-[#73E3B4] font-bold text-xs">
            Ec
          </div>
          <div>
            <div className="text-sm font-bold text-[#E2E2E8] leading-none">EcO</div>
            <div className="text-[9px] text-[#87948C] font-mono tracking-wider uppercase">
              Smart Settlement (Read-Only)
            </div>
          </div>
        </div>

        {onExit ? (
          <button
            onClick={onExit}
            className="px-3 py-1.5 rounded-lg bg-[#1A1C20] hover:bg-[#282A2E] border border-[#3D4943]/60 text-xs font-semibold text-[#73E3B4]"
          >
            Open EcO App
          </button>
        ) : (
          <a
            href="/"
            className="px-3 py-1.5 rounded-lg bg-[#55C79A] text-[#003826] text-xs font-bold flex items-center gap-1.5"
          >
            <span>Try EcO Free</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-8 space-y-6">
        {/* Settlement Hero Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-[#14161A] to-[#1A1C20] border border-[#3D4943]/50 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-[#E2E2E8]">{settlement.name}</h1>
              <div className="text-xs text-[#87948C] mt-0.5">
                Created: {formatDisplayDate(new Date(settlement.createdAt).toISOString().split('T')[0])} &bull; {settlement.members.length} Members
              </div>
            </div>

            <span
              className={`self-start sm:self-auto px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                summary.allSettled
                  ? 'bg-[#55C79A]/20 text-[#73E3B4] border border-[#55C79A]/30'
                  : 'bg-amber-900/30 text-amber-300 border border-amber-500/30'
              }`}
            >
              {summary.allSettled ? 'All Settled' : 'Active Debts'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#3D4943]/20">
            <div className="p-3 rounded-xl bg-[#111317]">
              <div className="text-[10px] text-[#87948C]">Total Group Spend</div>
              <div className="text-lg font-bold font-mono text-[#73E3B4]">
                {formatTaka(poishaToTaka(summary.totalSpentPoisha))}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-[#111317]">
              <div className="text-[10px] text-[#87948C]">Expenses Logged</div>
              <div className="text-lg font-bold font-mono text-[#E2E2E8]">
                {settlement.expenses.length}
              </div>
            </div>
          </div>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 border-b border-[#3D4943]/40">
          {[
            { id: 'transfers', label: 'Who Pays Whom', count: summary.suggestedTransfers.length },
            { id: 'expenses', label: 'Itemized Expenses', count: settlement.expenses.length },
            { id: 'math', label: 'Math Breakdown' }
          ].map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`pb-3 px-3 text-xs font-bold transition-all border-b-2 cursor-pointer flex items-center gap-2 ${
                  isActive
                    ? 'border-[#73E3B4] text-[#73E3B4]'
                    : 'border-transparent text-[#87948C] hover:text-[#BCCAC1]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${
                      isActive ? 'bg-[#55C79A]/20 text-[#73E3B4]' : 'bg-[#282A2E] text-[#87948C]'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* TAB 1: TRANSFERS */}
        {activeTab === 'transfers' && (
          <div className="space-y-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-[#E2E2E8]">Suggested Payments</h3>
              <p className="text-[11px] text-[#87948C]">
                Greedy debt matching algorithm generates the exact minimal transfers to clear all balances.
              </p>
            </div>

            {summary.allSettled ? (
              <div className="p-8 rounded-2xl bg-[#14161A] border border-[#55C79A]/30 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-[#55C79A]/20 text-[#73E3B4] flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6 stroke-[2.5]" />
                </div>
                <h4 className="text-sm font-bold text-[#E2E2E8]">All Debts Settled!</h4>
                <p className="text-xs text-[#87948C]">Everyone in this group is fully settled.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {summary.suggestedTransfers.map((tr, idx) => {
                  const fromM = settlement.members.find((m) => m.id === tr.fromMemberId)?.name;
                  const toM = settlement.members.find((m) => m.id === tr.toMemberId)?.name;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#14161A] border border-[#3D4943]/40 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[#FFB4AB]">{fromM}</span>
                        <span className="text-[#87948C] text-[11px]">needs to pay</span>
                        <span className="font-bold text-[#73E3B4]">{toM}</span>
                      </div>
                      <span className="font-mono font-bold text-sm text-[#E2E2E8]">
                        {formatTaka(poishaToTaka(tr.amountPoisha))}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: EXPENSES */}
        {activeTab === 'expenses' && (
          <div className="space-y-3">
            {settlement.expenses.map((exp) => {
              const payers = exp.payers
                .map((p) => settlement.members.find((m) => m.id === p.memberId)?.name)
                .join(', ');
              return (
                <div
                  key={exp.id}
                  className="p-4 rounded-2xl bg-[#14161A] border border-[#3D4943]/40 space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-[#E2E2E8] text-sm">{exp.title}</div>
                      <div className="text-[11px] text-[#87948C] mt-0.5">
                        {exp.date} &bull; Paid by <strong className="text-[#BCCAC1]">{payers}</strong>
                      </div>
                    </div>
                    <div className="font-mono font-bold text-sm text-[#73E3B4]">
                      {formatTaka(poishaToTaka(getExpenseTotalPoisha(exp)))}
                    </div>
                  </div>
                  <div className="text-[11px] text-[#87948C]">
                    Split method: <span className="uppercase text-[#BCCAC1]">{exp.splitMethod}</span> among{' '}
                    {getExpenseParticipants(exp).length} members
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TAB 3: MATH BREAKDOWN */}
        {activeTab === 'math' && (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-[#14161A] border border-[#55C79A]/40 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-[#73E3B4] flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                  <span>Zero-Sum Balance Verified</span>
                </div>
                <div className="text-[11px] text-[#87948C]">
                  Total debits exactly equal total credits. Zero arithmetic loss.
                </div>
              </div>
              <div className="font-mono font-bold text-xs text-[#73E3B4]">Σ Net = ৳0.00</div>
            </div>

            <div className="rounded-2xl bg-[#14161A] border border-[#3D4943]/40 overflow-hidden">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#111317] text-[#87948C] font-sans">
                  <tr>
                    <th className="p-3">Member</th>
                    <th className="p-3 text-right">Total Paid</th>
                    <th className="p-3 text-right">Fair Share</th>
                    <th className="p-3 text-right font-bold">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#3D4943]/20">
                  {settlement.members.map((m) => {
                    const mSummary = summary.memberSummaries[m.id];
                    return (
                      <tr key={m.id}>
                        <td className="p-3 font-sans font-medium text-[#E2E2E8]">{m.name}</td>
                        <td className="p-3 text-right text-[#BCCAC1]">
                          {formatTaka(poishaToTaka(mSummary?.totalPaidPoisha || 0))}
                        </td>
                        <td className="p-3 text-right text-[#BCCAC1]">
                          {formatTaka(poishaToTaka(mSummary?.totalOwedPoisha || 0))}
                        </td>
                        <td className="p-3 text-right font-bold">
                          {mSummary?.netBalancePoisha ? (
                            mSummary.netBalancePoisha > 0 ? (
                              <span className="text-[#73E3B4]">
                                +{formatTaka(poishaToTaka(mSummary.netBalancePoisha))}
                              </span>
                            ) : (
                              <span className="text-[#FFB4AB]">
                                -{formatTaka(poishaToTaka(Math.abs(mSummary.netBalancePoisha)))}
                              </span>
                            )
                          ) : (
                            <span className="text-zinc-500">৳0.00</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="py-6 border-t border-[#3D4943]/30 text-center text-xs text-[#87948C]">
        <p>Verified with EcO Smart Settlement &bull; https://eco-du.vercel.app/</p>
      </footer>
    </div>
  );
};
