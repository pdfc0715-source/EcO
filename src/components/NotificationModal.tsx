import React, { useState } from 'react';
import {
  X,
  Check,
  CheckCheck,
  Clock,
  Zap,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Wallet,
  ExternalLink
} from 'lucide-react';
import { AppNotification, EcOProposal, PaymentMethod } from '../domain/types';
import { formatDisplayDate } from '../domain/dates';
import { formatTaka } from '../domain/money';
import { getDefaultCashMethodId } from '../domain/paymentMethods';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: AppNotification[];
  incomingProposals?: EcOProposal[];
  paymentMethods: PaymentMethod[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onAcceptProposal?: (proposalId: string, payMethodId: string) => Promise<void> | void;
  onRejectProposal?: (proposalId: string) => Promise<void> | void;
  onDisputeProposal?: (proposalId: string, reason: string) => Promise<void> | void;
  onNavigateToConnections?: () => void;
}

export const NotificationModal: React.FC<NotificationModalProps> = ({
  isOpen,
  onClose,
  notifications,
  incomingProposals = [],
  paymentMethods = [],
  onMarkRead,
  onMarkAllRead,
  onAcceptProposal,
  onRejectProposal,
  onDisputeProposal,
  onNavigateToConnections
}) => {
  // Active wallet selection per proposal id
  const [selectedWallets, setSelectedWallets] = useState<Record<string, string>>({});
  // Expanded details toggle per proposal id
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});
  // Dispute input state per proposal id
  const [disputeInputs, setDisputeInputs] = useState<Record<string, string>>({});
  const [showDisputeFor, setShowDisputeFor] = useState<Record<string, boolean>>({});
  const [processingId, setProcessingId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const activeWallets = paymentMethods.filter((m) => m.isActive);
  const defaultWalletId = getDefaultCashMethodId(activeWallets.length > 0 ? activeWallets : paymentMethods);

  const handleAccept = async (propId: string) => {
    if (!onAcceptProposal) return;
    const walletId = selectedWallets[propId] || defaultWalletId;
    setProcessingId(propId);
    try {
      await onAcceptProposal(propId, walletId);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (propId: string) => {
    if (!onRejectProposal) return;
    setProcessingId(propId);
    try {
      await onRejectProposal(propId);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDispute = async (propId: string) => {
    if (!onDisputeProposal) return;
    const reason = (disputeInputs[propId] || '').trim();
    if (!reason) return;
    setProcessingId(propId);
    try {
      await onDisputeProposal(propId, reason);
      setShowDisputeFor((prev) => ({ ...prev, [propId]: false }));
    } finally {
      setProcessingId(null);
    }
  };

  const toggleDetails = (propId: string) => {
    setExpandedDetails((prev) => ({ ...prev, [propId]: !prev[propId] }));
  };

  const pendingCount = incomingProposals.length;
  const unreadNotifCount = notifications.filter((n) => !n.readAt).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-lg bg-[#1A1C20] border border-[#3D4943]/70 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-5 py-3.5 border-b border-[#3D4943]/40 bg-[#1E2024]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#0C0E12] border border-[#73E3B4]/40 flex items-center justify-center text-[#73E3B4]">
              <Zap className="w-4 h-4 fill-[#73E3B4]/20" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-[#E2E2E8]">Notification & Proposals</h3>
                {pendingCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[#55C79A] text-[#003826]">
                    {pendingCount} action{pendingCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#87948C]">
                Actionable EcO requests and recent activity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] cursor-pointer transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
          {/* =========================================================================
              SECTION 1: ACTIONABLE INCOMING ECO PROPOSALS
             ========================================================================= */}
          {pendingCount > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#73E3B4] animate-ping" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#73E3B4]">
                    Pending EcO Requests ({pendingCount})
                  </h4>
                </div>
                {onNavigateToConnections && (
                  <button
                    type="button"
                    onClick={onNavigateToConnections}
                    className="text-[11px] text-[#87948C] hover:text-[#73E3B4] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <span>View in Connections</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                )}
              </div>

              {incomingProposals.map((prop) => {
                const isProcessing = processingId === prop.id;
                const isExpanded = Boolean(expandedDetails[prop.id]);
                const isDisputing = Boolean(showDisputeFor[prop.id]);
                const chosenWallet = selectedWallets[prop.id] || defaultWalletId;

                // Semantic direction for recipient (user 2):
                // If originalSenderType === 'give': sender gave money -> recipient borrowed money (will owe sender)
                // If originalSenderType === 'take': sender borrowed money -> recipient lent money (sender owes recipient)
                const isRecipientBorrowing = prop.originalSenderType === 'give';

                return (
                  <div
                    key={prop.id}
                    className="p-3.5 sm:p-4 rounded-xl bg-[#0C0E12] border-2 border-[#73E3B4]/40 shadow-lg space-y-3 transition-all"
                  >
                    {/* Peer info & date row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-[#E2E2E8]">{prop.senderName}</span>
                        {prop.senderCode && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-[#1E2024] text-[#73E3B4] border border-[#73E3B4]/30">
                            {prop.senderCode}
                          </span>
                        )}
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[#282A2E] text-[#BCCAC1]">
                          {prop.isRepayment ? 'Repayment' : isRecipientBorrowing ? 'Incoming Loan' : 'Borrow Request'}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-[#87948C] shrink-0">
                        {formatDisplayDate(prop.date)}
                      </span>
                    </div>

                    {/* Amount & Direction Breakdown */}
                    <div className="p-3 rounded-lg bg-[#1A1C20] border border-[#3D4943]/30 flex items-center justify-between">
                      <div>
                        <div className="text-[11px] text-[#BCCAC1]">
                          {prop.isRepayment
                            ? prop.originalSenderType === 'give'
                              ? `${prop.senderName} is repaying you:`
                              : `${prop.senderName} recorded receiving repayment from you:`
                            : isRecipientBorrowing
                            ? 'Lending offer (you borrow):'
                            : 'Requesting to borrow from you:'}
                        </div>
                        <div className="text-[11px] text-[#87948C] mt-0.5">
                          {prop.isRepayment
                            ? prop.originalSenderType === 'give'
                              ? `Outstanding debt from ${prop.senderName} will be reduced upon confirmation`
                              : `Your payable to ${prop.senderName} will be reduced upon confirmation`
                            : isRecipientBorrowing
                            ? `You will owe ${prop.senderName} upon acceptance`
                            : `${prop.senderName} will owe you upon acceptance`}
                        </div>
                      </div>
                      <div className="font-mono text-base sm:text-lg font-bold text-[#73E3B4]">
                        {formatTaka(prop.amount)}
                      </div>
                    </div>

                    {/* Note if provided */}
                    {prop.note && (
                      <div className="text-xs text-[#BCCAC1] italic px-2 py-1 rounded bg-[#1A1C20]/50 border-l-2 border-[#73E3B4]/60">
                        "{prop.note}"
                      </div>
                    )}

                    {/* Quick Wallet Selector for Acceptance */}
                    <div className="pt-1">
                      <label className="block text-[11px] font-medium text-[#BCCAC1] mb-1">
                        Select your wallet to {prop.isRepayment ? (prop.originalSenderType === 'give' ? 'deposit repayment into' : 'pay repayment from') : (isRecipientBorrowing ? 'receive borrowed funds into' : 'pay / lend funds from')}:
                      </label>
                      <select
                        value={chosenWallet}
                        onChange={(e) =>
                          setSelectedWallets((prev) => ({ ...prev, [prop.id]: e.target.value }))
                        }
                        disabled={isProcessing}
                        className="w-full px-3 py-1.5 rounded-lg bg-[#1A1C20] border border-[#3D4943]/50 text-xs text-[#E2E2E8] focus:outline-none focus:border-[#73E3B4]"
                      >
                        {activeWallets.map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Action buttons: Accept, Reject, Details */}
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleAccept(prop.id)}
                        className="flex-1 min-w-[120px] py-2 px-3 rounded-lg bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm active:scale-[0.98] cursor-pointer disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                        <span>{isProcessing ? 'Processing...' : 'Accept & Record'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleReject(prop.id)}
                        className="py-2 px-3 rounded-lg border border-[#FFB4AB]/40 hover:bg-[#FFB4AB]/10 text-[#FFB4AB] font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        Reject
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleDetails(prop.id)}
                        className="py-2 px-2.5 rounded-lg text-xs text-[#BCCAC1] hover:text-[#E2E2E8] hover:bg-[#1A1C20] flex items-center gap-1 transition-colors cursor-pointer"
                      >
                        <span>Details</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    {/* Expandable Details Section */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-[#3D4943]/30 space-y-2 text-xs animate-in fade-in duration-150">
                        <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-[#1A1C20] text-[11px]">
                          <div>
                            <span className="text-[#87948C]">Proposal ID:</span>
                            <div className="font-mono text-[#E2E2E8] truncate">{prop.id}</div>
                          </div>
                          <div>
                            <span className="text-[#87948C]">Created:</span>
                            <div className="text-[#E2E2E8]">
                              {prop.createdAt ? new Date(prop.createdAt).toLocaleTimeString() : 'Recently'}
                            </div>
                          </div>
                          <div>
                            <span className="text-[#87948C]">Sender Code:</span>
                            <div className="font-mono text-[#73E3B4]">{prop.senderCode || 'Verified'}</div>
                          </div>
                          <div>
                            <span className="text-[#87948C]">Status:</span>
                            <div className="text-[#E2E2E8] capitalize">{prop.status}</div>
                          </div>
                        </div>

                        {!isDisputing ? (
                          <button
                            type="button"
                            onClick={() => setShowDisputeFor((prev) => ({ ...prev, [prop.id]: true }))}
                            className="text-[11px] text-[#FFB4AB] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <AlertTriangle className="w-3 h-3" />
                            <span>Dispute proposal terms</span>
                          </button>
                        ) : (
                          <div className="p-2.5 rounded-lg bg-[#1A1C20] border border-[#FFB4AB]/30 space-y-2">
                            <label className="block text-[11px] text-[#FFB4AB] font-medium">
                              State dispute reason:
                            </label>
                            <input
                              type="text"
                              placeholder="e.g. Wrong amount, already paid, not requested..."
                              value={disputeInputs[prop.id] || ''}
                              onChange={(e) =>
                                setDisputeInputs((prev) => ({ ...prev, [prop.id]: e.target.value }))
                              }
                              className="w-full px-2.5 py-1.5 rounded bg-[#0C0E12] border border-[#3D4943]/50 text-xs text-[#E2E2E8]"
                            />
                            <div className="flex gap-2">
                              <button
                                type="button"
                                disabled={isProcessing || !disputeInputs[prop.id]?.trim()}
                                onClick={() => handleDispute(prop.id)}
                                className="px-3 py-1 rounded bg-[#FFB4AB]/20 text-[#FFB4AB] border border-[#FFB4AB]/40 text-xs font-semibold hover:bg-[#FFB4AB]/30 cursor-pointer disabled:opacity-50"
                              >
                                Submit Dispute
                              </button>
                              <button
                                type="button"
                                onClick={() => setShowDisputeFor((prev) => ({ ...prev, [prop.id]: false }))}
                                className="px-2 py-1 text-xs text-[#87948C] hover:text-[#E2E2E8]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* =========================================================================
              SECTION 2: GENERAL NOTIFICATIONS INBOX
             ========================================================================= */}
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 text-[#BCCAC1]" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#BCCAC1]">
                  Activity Inbox {unreadNotifCount > 0 ? `(${unreadNotifCount} unread)` : ''}
                </h4>
              </div>
              {unreadNotifCount > 0 && (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="px-2.5 py-1 rounded-lg bg-[#55C79A]/15 hover:bg-[#55C79A]/25 border border-[#73E3B4]/50 text-xs font-semibold text-[#73E3B4] flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                  title="Mark all notifications as read"
                >
                  <CheckCheck className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Mark all read</span>
                </button>
              )}
            </div>

            {notifications.length === 0 && pendingCount === 0 ? (
              <div className="py-12 text-center text-[#87948C] text-xs">
                No recent notifications or pending requests.
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-4 text-center text-[#87948C] text-xs">
                No other notifications.
              </div>
            ) : (
              <div className="space-y-2.5">
                {notifications.map((notif) => {
                  const isUnread = !notif.readAt;
                  const dateStr = new Date(notif.createdAt).toISOString().split('T')[0];
                  return (
                    <div
                      key={notif.id}
                      className={`p-3.5 rounded-xl border transition-all ${
                        isUnread
                          ? 'bg-[#1E2024] border-[#73E3B4]/40 shadow-sm'
                          : 'bg-[#14161A]/60 border-[#3D4943]/20'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="text-xs font-bold text-[#E2E2E8]">
                            {notif.title}
                          </span>
                          {isUnread ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-[#73E3B4]/15 text-[#73E3B4] border border-[#73E3B4]/30 flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#73E3B4] animate-pulse" />
                              Unread
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-[#282A2E] text-[#87948C] flex items-center gap-1">
                              <Check className="w-3 h-3 text-[#73E3B4]" />
                              Read
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] font-mono text-[#87948C] shrink-0">
                          {formatDisplayDate(dateStr)}
                        </span>
                      </div>
                      <p className="text-xs text-[#BCCAC1] mt-1.5 leading-relaxed">
                        {notif.body}
                      </p>
                      {isUnread && (
                        <div className="mt-2.5 pt-2 border-t border-[#3D4943]/30 flex items-center justify-end">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onMarkRead(notif.id);
                            }}
                            className="px-3 py-1 rounded-lg bg-[#55C79A]/20 hover:bg-[#55C79A]/30 text-[#73E3B4] border border-[#73E3B4]/50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-all shadow-sm active:scale-95"
                            title="Mark this notification as read"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Mark as read</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Retention Note */}
        <div className="px-4 py-2 bg-[#0C0E12] border-t border-[#3D4943]/30 text-[10px] text-[#87948C] flex items-center justify-between">
          <span>7-day privacy retention automatically cleans old activity</span>
          <span className="font-mono text-[#73E3B4]">EcO Verified</span>
        </div>
      </div>
    </div>
  );
};
