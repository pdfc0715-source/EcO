import React, { useState, useEffect } from 'react';
import { ShieldCheck, ArrowLeft, ArrowUpRight, ArrowDownRight, User, FileText, AlertCircle, Loader2 } from 'lucide-react';
import { PersonRecord, PeerTransactionRecord } from '../domain/types';
import { formatTaka } from '../domain/money';
import { formatExactDate } from '../domain/dates';
import { repository } from '../data/repository';

interface PublicShareViewProps {
  shareToken?: string;
  person?: PersonRecord;
  transactions?: PeerTransactionRecord[];
  onExit: () => void;
  onOpenBrandedStatement?: (person: PersonRecord, transactions: PeerTransactionRecord[]) => void;
}

export const PublicShareView: React.FC<PublicShareViewProps> = ({
  shareToken,
  person: initialPerson,
  transactions: initialTransactions,
  onExit,
  onOpenBrandedStatement
}) => {
  const [person, setPerson] = useState<PersonRecord | null>(initialPerson || null);
  const [transactions, setTransactions] = useState<PeerTransactionRecord[]>(initialTransactions || []);
  const [isLoading, setIsLoading] = useState<boolean>(!initialPerson && Boolean(shareToken));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPerson) {
      setPerson(initialPerson);
      setTransactions(initialTransactions || []);
      setIsLoading(false);
      return;
    }

    if (!shareToken) {
      setError('No share token provided.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    repository
      .getPublicPersonByToken(shareToken)
      .then((data) => {
        if (data && data.person) {
          setPerson(data.person);
          setTransactions(data.transactions || []);
        } else {
          setError('This shared ledger could not be found or may have expired.');
        }
      })
      .catch((err) => {
        console.error('Error fetching shared ledger:', err);
        setError('Failed to load shared ledger details.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [shareToken, initialPerson, initialTransactions]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#111317] text-[#E2E2E8] p-4 flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-[#73E3B4] animate-spin" />
          <span className="text-xs text-[#BCCAC1]">Loading shared ledger...</span>
        </div>
      </div>
    );
  }

  if (error || !person) {
    return (
      <div className="min-h-screen bg-[#111317] text-[#E2E2E8] p-4 sm:p-6 flex flex-col items-center justify-center">
        <div className="w-full max-w-md bg-[#1A1C20] border border-[#3D4943]/40 rounded-2xl p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-400 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#E2E2E8]">Shared Ledger Unavailable</h3>
            <p className="text-xs text-[#87948C] mt-1.5">{error || 'This ledger could not be found.'}</p>
          </div>
          <button
            onClick={onExit}
            className="px-4 py-2 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-semibold text-xs transition-colors cursor-pointer"
          >
            Go to EcO App
          </button>
        </div>
      </div>
    );
  }

  // Calculate balance from counterparty perspective
  // For owner: 'give' = owner gave to person (person owes owner +amount)
  // For counterparty: person received from owner (counterparty owes owner +amount)
  let balance = 0;
  transactions.forEach((tx) => {
    if (tx.type === 'give') {
      balance += tx.amount;
    } else {
      balance -= tx.amount;
    }
  });

  return (
    <div className="min-h-screen bg-[#111317] text-[#E2E2E8] p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-start animate-in fade-in duration-150">
      <div className="w-full max-w-xl space-y-6">
        {/* Top bar */}
        <div className="flex items-center justify-between pb-4 border-b border-[#3D4943]/40">
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-xs text-[#BCCAC1] hover:text-[#73E3B4] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return to EcO App</span>
          </button>
          <div className="flex items-center gap-1.5 text-xs text-[#73E3B4] font-medium">
            <ShieldCheck className="w-4 h-4" />
            <span>Verified Shared Ledger</span>
          </div>
        </div>

        {/* Hero Card */}
        <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl p-6 text-center space-y-3 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-[#0C0E12] border border-[#3D4943]/50 flex items-center justify-center text-[#73E3B4] font-bold text-lg mx-auto">
            {person.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-[#BCCAC1]">
              Shared Ledger for {person.name}
            </div>
            <div className="text-3xl font-mono font-bold text-[#E2E2E8] tabular-nums mt-1">
              {formatTaka(Math.abs(balance))}
            </div>
          </div>
          <div className="text-xs">
            {balance > 0 ? (
              <span className="px-3 py-1 rounded-full bg-[#FFB4AB]/10 border border-[#FFB4AB]/30 text-[#FFB4AB] font-medium inline-block">
                Outstanding balance: You owe this amount
              </span>
            ) : balance < 0 ? (
              <span className="px-3 py-1 rounded-full bg-[#73E3B4]/10 border border-[#73E3B4]/30 text-[#73E3B4] font-medium inline-block">
                Credit balance: You are owed this amount
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-[#0C0E12] border border-[#3D4943]/40 text-[#87948C] font-medium inline-block">
                All accounts settled (৳0.00)
              </span>
            )}
          </div>

          {onOpenBrandedStatement && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => onOpenBrandedStatement(person, transactions)}
                className="px-3.5 py-1.5 rounded-lg bg-[#0C0E12] hover:bg-[#1E2024] text-[#73E3B4] border border-[#73E3B4]/40 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs active:scale-95"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Export Statement (PDF & Image)</span>
              </button>
            </div>
          )}
        </div>

        {/* Chronological Activity Log */}
        <div className="bg-[#1A1C20] border border-[#3D4943]/40 rounded-xl overflow-hidden divide-y divide-[#3D4943]/20 shadow-sm">
          <div className="px-5 py-3.5 bg-[#1E2024]/80 text-xs font-medium text-[#BCCAC1] flex items-center justify-between">
            <span>Transaction History</span>
            <span className="font-mono text-[11px] text-[#87948C]">{transactions.length} entries</span>
          </div>

          {transactions.length === 0 ? (
            <div className="p-10 text-center text-xs text-[#87948C]">
              No transactions recorded for this ledger.
            </div>
          ) : (
            transactions.map((tx) => {
              // Counterparty perspective
              const counterpartyReceived = tx.type === 'give'; // Owner gave, so person received
              return (
                <div key={tx.id} className="p-4 flex items-center justify-between text-xs hover:bg-[#1E2024]/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-[#0C0E12] border border-[#3D4943]/30">
                      {counterpartyReceived ? (
                        <ArrowDownRight className="w-4 h-4 text-[#FFB4AB]" />
                      ) : (
                        <ArrowUpRight className="w-4 h-4 text-[#73E3B4]" />
                      )}
                    </div>
                    <div>
                      <div className="font-semibold text-[#E2E2E8]">
                        {counterpartyReceived ? 'Received Funds' : 'Returned / Sent Funds'}
                      </div>
                      <div className="text-[11px] text-[#87948C] mt-0.5">
                        {formatExactDate(tx.date)} {tx.description ? `· ${tx.description}` : ''}
                      </div>
                    </div>
                  </div>

                  <div className="text-right font-mono font-bold text-xs text-[#E2E2E8] tabular-nums">
                    {formatTaka(tx.amount)}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Privacy notice footer */}
        <div className="text-center text-[11px] text-[#87948C] leading-relaxed pt-2">
          This read-only link exposes solely transactions recorded between you and this ledger account. No other wallets or account data are accessible.
        </div>
      </div>
    </div>
  );
};
