import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Download,
  Copy,
  Printer,
  Check,
  Share2,
  ExternalLink,
  ShieldCheck,
  Maximize2,
  Users
} from 'lucide-react';
import { SmartSettlement } from '../../domain/settlementTypes';
import { calculateSettlementSummary, poishaToTaka, getExpenseTotalPoisha } from '../../domain/settlementEngine';
import { formatTaka } from '../../domain/money';
import { formatDisplayDate } from '../../domain/dates';
import { downloadCanvasAsPng, openPrintPdfWindow } from '../../domain/exportBrandedDocument';

interface SettlementShareModalProps {
  isOpen: boolean;
  settlement: SmartSettlement;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

export const SettlementShareModal: React.FC<SettlementShareModalProps> = ({
  isOpen,
  settlement,
  onClose,
  showToast
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isFullscreenScreenshot, setIsFullscreenScreenshot] = useState<boolean>(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const summary = calculateSettlementSummary(settlement);

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${window.location.pathname}?settlement=${settlement.shareToken || ''}`
    : `https://eco-du.vercel.app/?settlement=${settlement.shareToken || ''}`;

  // Generate QR code pointing to public share link
  useEffect(() => {
    if (settlement.shareToken) {
      QRCode.toDataURL(shareUrl, {
        width: 256,
        margin: 1,
        color: {
          dark: '#111317',
          light: '#FFFFFF'
        }
      })
        .then((url) => setQrDataUrl(url))
        .catch((err) => console.warn('QR generation error:', err));
    }
  }, [settlement.shareToken, shareUrl]);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (!settlement.shareToken) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    showToast?.('Share link copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  // Render to canvas for crisp PNG download
  const handleDownloadPng = async () => {
    const card = cardRef.current;
    if (!card) return;

    // Use pure HTML5 2D Canvas rendering for crisp, pixel-perfect EcO share card
    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = 800;
    const padding = 40;
    const height = 980;

    canvas.width = width;
    canvas.height = height;

    // Background gradient
    const bgGradient = ctx.createLinearGradient(0, 0, 0, height);
    bgGradient.addColorStop(0, '#0C0E12');
    bgGradient.addColorStop(1, '#1A1C20');
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, width, height);

    // Subtle border
    ctx.strokeStyle = '#3D4943';
    ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, width - 20, height - 20);

    // Brand Header
    ctx.fillStyle = '#73E3B4';
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText('EcO', padding, padding + 30);

    ctx.fillStyle = '#87948C';
    ctx.font = '500 14px sans-serif';
    ctx.fillText('SMART SETTLEMENT SUMMARY', padding + 70, padding + 26);

    // Divider
    ctx.strokeStyle = '#282A2E';
    ctx.beginPath();
    ctx.moveTo(padding, padding + 55);
    ctx.lineTo(width - padding, padding + 55);
    ctx.stroke();

    // Settlement Title
    ctx.fillStyle = '#E2E2E8';
    ctx.font = 'bold 32px sans-serif';
    ctx.fillText(settlement.name, padding, padding + 105);

    // Date & Members
    ctx.fillStyle = '#87948C';
    ctx.font = '16px sans-serif';
    ctx.fillText(
      `Created: ${formatDisplayDate(new Date(settlement.createdAt).toISOString().split('T')[0])}  •  ${settlement.members.length} Members  •  ${settlement.expenses.length} Expenses`,
      padding,
      padding + 135
    );

    // KPI Cards: Total Spent
    ctx.fillStyle = '#111317';
    ctx.fillRect(padding, padding + 160, width - 2 * padding, 90);
    ctx.strokeStyle = '#3D4943';
    ctx.strokeRect(padding, padding + 160, width - 2 * padding, 90);

    ctx.fillStyle = '#87948C';
    ctx.font = '14px sans-serif';
    ctx.fillText('TOTAL GROUP SPEND', padding + 20, padding + 195);

    ctx.fillStyle = '#73E3B4';
    ctx.font = 'bold 36px monospace';
    ctx.fillText(formatTaka(poishaToTaka(summary.totalSpentPoisha)), padding + 20, padding + 235);

    // Suggested Transfers Section
    ctx.fillStyle = '#E2E2E8';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('Settlement Transfers (Optimal Greedy Clearing)', padding, padding + 290);

    let yOffset = padding + 325;
    if (summary.suggestedTransfers.length === 0) {
      ctx.fillStyle = '#73E3B4';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('✓ All debts are settled! No payments required.', padding + 10, yOffset);
      yOffset += 40;
    } else {
      summary.suggestedTransfers.slice(0, 6).forEach((tr) => {
        const fromM = settlement.members.find((m) => m.id === tr.fromMemberId)?.name || 'Member';
        const toM = settlement.members.find((m) => m.id === tr.toMemberId)?.name || 'Member';

        ctx.fillStyle = '#14161A';
        ctx.fillRect(padding, yOffset, width - 2 * padding, 50);
        ctx.strokeStyle = '#282A2E';
        ctx.strokeRect(padding, yOffset, width - 2 * padding, 50);

        ctx.fillStyle = '#FFB4AB';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(fromM, padding + 20, yOffset + 32);

        ctx.fillStyle = '#87948C';
        ctx.font = '14px sans-serif';
        ctx.fillText('needs to pay', padding + 180, yOffset + 32);

        ctx.fillStyle = '#73E3B4';
        ctx.font = 'bold 16px sans-serif';
        ctx.fillText(toM, padding + 280, yOffset + 32);

        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 18px monospace';
        const amtStr = formatTaka(poishaToTaka(tr.amountPoisha));
        ctx.fillText(amtStr, width - padding - 180, yOffset + 32);

        yOffset += 60;
      });
    }

    // QR Code & Verification footer
    if (qrDataUrl) {
      const img = new Image();
      img.src = qrDataUrl;
      await new Promise((resolve) => {
        img.onload = resolve;
      });
      ctx.drawImage(img, width - padding - 110, height - padding - 120, 110, 110);
    }

    ctx.fillStyle = '#87948C';
    ctx.font = '12px sans-serif';
    ctx.fillText('Tracked & Verified with EcO Smart Settlement', padding, height - padding - 35);
    ctx.fillText('Scan QR code to view live calculation & itemized expenses', padding, height - padding - 15);

    downloadCanvasAsPng(canvas, `${settlement.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_Settlement_Card.png`);
    showToast?.('Settlement card downloaded as PNG!');
  };

  const handlePrintPdf = () => {
    openPrintPdfWindow(
      `
      <div style="font-family: system-ui, sans-serif; padding: 24px; color: #111;">
        <h1 style="margin: 0 0 8px 0; color: #003826;">EcO Smart Settlement</h1>
        <h2 style="margin: 0 0 16px 0; font-size: 20px;">${settlement.name}</h2>
        <p style="color: #666; font-size: 13px; margin: 0 0 24px 0;">
          Date: ${formatDisplayDate(new Date(settlement.createdAt).toISOString().split('T')[0])} | Total Spent: <strong>${formatTaka(poishaToTaka(summary.totalSpentPoisha))}</strong>
        </p>

        <h3 style="border-bottom: 2px solid #ddd; padding-bottom: 6px;">Settlement Payments</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background: #f4f4f4; text-align: left;">
              <th style="padding: 8px; border: 1px solid #ddd;">From</th>
              <th style="padding: 8px; border: 1px solid #ddd;">To</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${summary.suggestedTransfers
              .map((tr) => {
                const fromM = settlement.members.find((m) => m.id === tr.fromMemberId)?.name || 'Member';
                const toM = settlement.members.find((m) => m.id === tr.toMemberId)?.name || 'Member';
                return `
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>${fromM}</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd;"><strong>${toM}</strong></td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace; font-weight: bold;">${formatTaka(poishaToTaka(tr.amountPoisha))}</td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>

        <h3 style="border-bottom: 2px solid #ddd; padding-bottom: 6px;">Itemized Expenses</h3>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f4f4f4; text-align: left;">
              <th style="padding: 8px; border: 1px solid #ddd;">Date</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Expense</th>
              <th style="padding: 8px; border: 1px solid #ddd;">Paid By</th>
              <th style="padding: 8px; border: 1px solid #ddd; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${settlement.expenses
              .map((exp) => {
                const payers = exp.payers
                  .map((p) => settlement.members.find((m) => m.id === p.memberId)?.name)
                  .join(', ');
                return `
                <tr>
                  <td style="padding: 8px; border: 1px solid #ddd;">${exp.date}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${exp.title}</td>
                  <td style="padding: 8px; border: 1px solid #ddd;">${payers}</td>
                  <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-family: monospace;">${formatTaka(poishaToTaka(getExpenseTotalPoisha(exp)))}</td>
                </tr>
              `;
              })
              .join('')}
          </tbody>
        </table>

        <div style="margin-top: 32px; font-size: 11px; color: #888; border-top: 1px solid #ddd; padding-top: 12px;">
          Generated with EcO &bull; https://eco-du.vercel.app/
        </div>
      </div>
      `,
      `${settlement.name}_Summary`
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-[#1A1C20] border border-[#3D4943]/60 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#3D4943]/40 bg-[#14161A]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#55C79A]/20 border border-[#55C79A]/40 flex items-center justify-center text-[#73E3B4]">
              <Share2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#E2E2E8]">Share Settlement</h2>
              <p className="text-[11px] text-[#87948C]">
                Shareable card, QR code, and public read-only link
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

        {/* Modal Body */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
          {/* Public Link Box */}
          <div className="p-3.5 rounded-xl bg-[#14161A] border border-[#3D4943]/40 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#BCCAC1]">Public Web Link</span>
              <span className="text-[10px] text-[#73E3B4] flex items-center gap-1">
                <ShieldCheck className="w-3 h-3" /> Read-only & unguessable
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="flex-1 px-3 py-2 rounded-xl bg-[#111317] border border-[#3D4943]/60 text-xs font-mono text-[#87948C] focus:outline-none"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-3.5 py-2 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-semibold text-xs flex items-center gap-1.5 cursor-pointer transition-colors shrink-0"
              >
                {copied ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Visual Branded Share Card Preview */}
          <div
            ref={cardRef}
            className="rounded-2xl bg-gradient-to-br from-[#0C0E12] to-[#1A1C20] border-2 border-[#3D4943]/60 p-5 sm:p-6 shadow-xl space-y-4"
          >
            {/* Brand top row */}
            <div className="flex items-center justify-between border-b border-[#3D4943]/30 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded bg-[#1A1C20] border border-[#73E3B4]/40 flex items-center justify-center text-[#73E3B4] font-bold text-xs">
                  Ec
                </div>
                <div>
                  <div className="text-sm font-bold text-[#E2E2E8] leading-none">EcO</div>
                  <div className="text-[9px] text-[#87948C] font-mono tracking-wider uppercase">
                    Smart Settlement
                  </div>
                </div>
              </div>
              <div className="text-[11px] text-[#87948C] font-mono">
                {formatDisplayDate(new Date(settlement.createdAt).toISOString().split('T')[0])}
              </div>
            </div>

            {/* Title & Total Spend */}
            <div>
              <h3 className="text-xl font-bold text-[#E2E2E8]">{settlement.name}</h3>
              <div className="mt-2 p-3 rounded-xl bg-[#111317] border border-[#3D4943]/40 flex items-center justify-between">
                <span className="text-xs text-[#87948C]">Total Group Spend</span>
                <span className="text-xl font-bold font-mono text-[#73E3B4]">
                  {formatTaka(poishaToTaka(summary.totalSpentPoisha))}
                </span>
              </div>
            </div>

            {/* Suggested Transfers */}
            <div className="space-y-2">
              <div className="text-xs font-semibold text-[#BCCAC1]">
                Who Pays Whom ({summary.suggestedTransfers.length} payments)
              </div>
              {summary.suggestedTransfers.length === 0 ? (
                <div className="p-3 rounded-xl bg-[#55C79A]/10 border border-[#55C79A]/30 text-xs font-semibold text-[#73E3B4] text-center">
                  ✓ All debts are settled! Everyone is even.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {summary.suggestedTransfers.map((tr, idx) => {
                    const fromM = settlement.members.find((m) => m.id === tr.fromMemberId)?.name;
                    const toM = settlement.members.find((m) => m.id === tr.toMemberId)?.name;
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#14161A] border border-[#3D4943]/40 text-xs"
                      >
                        <div className="flex items-center gap-1.5 font-medium">
                          <span className="text-[#FFB4AB] font-bold">{fromM}</span>
                          <span className="text-[#87948C] text-[11px]">pays</span>
                          <span className="text-[#73E3B4] font-bold">{toM}</span>
                        </div>
                        <span className="font-mono font-bold text-[#E2E2E8]">
                          {formatTaka(poishaToTaka(tr.amountPoisha))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* QR Code footer */}
            <div className="flex items-center justify-between pt-2 border-t border-[#3D4943]/30">
              <div className="text-[11px] text-[#87948C] space-y-0.5">
                <p className="font-semibold text-[#BCCAC1]">Scan to view full audit breakdown</p>
                <p>Transparent poisha calculation & expense history</p>
              </div>
              {qrDataUrl && (
                <div className="p-1 rounded-lg bg-white shrink-0">
                  <img src={qrDataUrl} alt="QR Code" className="w-16 h-16" />
                </div>
              )}
            </div>
          </div>

          {/* Export Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleDownloadPng}
              className="py-2.5 px-3 rounded-xl bg-[#282A2E] hover:bg-[#3D4943]/60 text-xs font-semibold text-[#73E3B4] flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Download PNG</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="py-2.5 px-3 rounded-xl bg-[#282A2E] hover:bg-[#3D4943]/60 text-xs font-semibold text-[#E2E2E8] flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Printer className="w-4 h-4" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFullscreenScreenshot(true)}
              className="py-2.5 px-3 rounded-xl bg-[#282A2E] hover:bg-[#3D4943]/60 text-xs font-semibold text-[#BCCAC1] flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <Maximize2 className="w-4 h-4" />
              <span>Screenshot Mode</span>
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Screenshot-Friendly View */}
      {isFullscreenScreenshot && (
        <div
          className="fixed inset-0 z-60 bg-[#0C0E12] p-6 flex flex-col items-center justify-center overflow-auto"
          onClick={() => setIsFullscreenScreenshot(false)}
        >
          <div className="w-full max-w-md p-6 rounded-2xl bg-[#14161A] border-2 border-[#55C79A]/40 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#3D4943]/40 pb-2">
              <div className="font-bold text-[#73E3B4]">EcO Smart Settlement</div>
              <button
                onClick={() => setIsFullscreenScreenshot(false)}
                className="text-xs text-[#87948C] hover:text-white"
              >
                Close (ESC)
              </button>
            </div>
            <h2 className="text-xl font-bold text-white">{settlement.name}</h2>
            <div className="text-xs text-[#73E3B4] font-mono">
              Total Spend: {formatTaka(poishaToTaka(summary.totalSpentPoisha))}
            </div>
            <div className="space-y-1.5 pt-2">
              {summary.suggestedTransfers.map((tr, i) => {
                const fromM = settlement.members.find((m) => m.id === tr.fromMemberId)?.name;
                const toM = settlement.members.find((m) => m.id === tr.toMemberId)?.name;
                return (
                  <div key={i} className="flex justify-between text-xs py-1.5 border-b border-[#282A2E]">
                    <span>
                      <strong className="text-red-300">{fromM}</strong> → <strong className="text-emerald-300">{toM}</strong>
                    </span>
                    <span className="font-mono font-bold text-white">
                      {formatTaka(poishaToTaka(tr.amountPoisha))}
                    </span>
                  </div>
                );
              })}
            </div>
            {qrDataUrl && (
              <div className="flex justify-center pt-2">
                <div className="p-1.5 bg-white rounded-lg">
                  <img src={qrDataUrl} alt="QR" className="w-24 h-24" />
                </div>
              </div>
            )}
            <p className="text-[10px] text-center text-[#87948C]">
              Tap anywhere to return &bull; Ready for mobile screenshot
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
