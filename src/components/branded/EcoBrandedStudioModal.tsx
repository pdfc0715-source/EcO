import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  X,
  Download,
  Copy,
  Printer,
  Share2,
  Check,
  ShieldCheck,
  Moon,
  Sun,
  MessageCircle,
  CreditCard,
  Smartphone,
  Calendar
} from 'lucide-react';
import {
  BrandedStudioMode,
  StudioTheme,
  StudioPalette,
  BrandedVoucherData,
  BrandedMultiVoucherData,
  BrandedStatementData,
  BrandedMonthlyCardData,
  getPaletteColors,
  downloadCanvasAsPng,
  copyCanvasToClipboard,
  openPrintPdfWindow
} from '../../domain/exportBrandedDocument';
import { formatTaka } from '../../domain/money';
import { formatDisplayDate, formatExactDate, formatExactDateTime } from '../../domain/dates';

interface MonthOptionItem {
  key: string;
  label: string;
  year?: number;
  month?: number;
}

interface EcoBrandedStudioModalProps {
  isOpen: boolean;
  mode: BrandedStudioMode;
  voucherData?: BrandedVoucherData | null;
  multiVoucherData?: BrandedMultiVoucherData | null;
  statementData?: BrandedStatementData | null;
  monthlyCardData?: BrandedMonthlyCardData | null;
  availableMonths?: MonthOptionItem[];
  selectedMonthKey?: string;
  onMonthChange?: (monthKey: string) => void;
  initialTheme?: StudioTheme;
  initialPalette?: StudioPalette;
  onClose: () => void;
  showToast?: (msg: string) => void;
}

export const EcoBrandedStudioModal: React.FC<EcoBrandedStudioModalProps> = ({
  isOpen,
  mode,
  voucherData,
  multiVoucherData,
  statementData,
  monthlyCardData,
  availableMonths = [],
  selectedMonthKey,
  onMonthChange,
  initialTheme = 'dark',
  initialPalette = 'green',
  onClose,
  showToast
}) => {
  const [theme, setTheme] = useState<StudioTheme>(initialTheme);
  const [palette, setPalette] = useState<StudioPalette>(initialPalette);
  const [aspectRatio, setAspectRatio] = useState<'card' | 'story'>('card');
  const [copied, setCopied] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [customTitle, setCustomTitle] = useState<string>('');

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTheme(initialTheme);
      setPalette(initialPalette);
      setCopied(false);
      if (mode === 'multi-voucher' && multiVoucherData) {
        setCustomTitle(multiVoucherData.customTitle || 'Market Expense Voucher');
      } else if (mode === 'voucher' && voucherData) {
        setCustomTitle(voucherData.title || 'EcO Voucher');
      }
    }
  }, [isOpen, mode, initialTheme, initialPalette, multiVoucherData, voucherData]);

  const paletteColors = useMemo(() => getPaletteColors(palette), [palette]);

  // --------------------------------------------------------------------------
  // Canvas Rendering Pipeline
  // --------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isDark = theme === 'dark';
    const primaryColor = paletteColors.accent;

    if (mode === 'voucher' && voucherData) {
      renderVoucherCanvas(ctx, canvas, voucherData, isDark, primaryColor, customTitle);
    } else if (mode === 'multi-voucher' && multiVoucherData) {
      renderMultiVoucherCanvas(ctx, canvas, multiVoucherData, isDark, primaryColor, customTitle);
    } else if (mode === 'person-statement' && statementData) {
      renderStatementCanvas(ctx, canvas, statementData, isDark, primaryColor);
    } else if (mode === 'monthly-card' && monthlyCardData) {
      renderMonthlyCardCanvas(ctx, canvas, monthlyCardData, isDark, primaryColor, aspectRatio);
    }
  }, [isOpen, mode, voucherData, multiVoucherData, statementData, monthlyCardData, customTitle, theme, palette, aspectRatio, paletteColors]);

  // --- Real QR Code Renderer (redirects to https://eco-du.vercel.app/) ---
  function drawRealQrCode(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    size: number,
    url: string = 'https://eco-du.vercel.app/'
  ) {
    try {
      const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
      const count = qr.modules.size;
      const padding = 8;
      const qrInner = size - padding * 2;
      const cellSize = qrInner / count;

      ctx.save();
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#E2E8F0';
      ctx.lineWidth = 1.5;
      drawRoundedRect(ctx, x, y, size, size, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#111317';
      for (let r = 0; r < count; r++) {
        for (let c = 0; c < count; c++) {
          if (qr.modules.get(r, c)) {
            ctx.fillRect(
              x + padding + c * cellSize,
              y + padding + r * cellSize,
              cellSize + 0.35,
              cellSize + 0.35
            );
          }
        }
      }
      ctx.restore();
    } catch (e) {
      console.error('QR code generation error:', e);
    }
  }

  // --- 1. Voucher Canvas Renderer ---
  const renderVoucherCanvas = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: BrandedVoucherData,
    isDark: boolean,
    accent: string,
    titleToUse?: string
  ) => {
    const width = 1080;
    const height = 1460;
    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = isDark ? '#111317' : '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    // Outer subtle card
    const margin = 50;
    const cardW = width - margin * 2;
    const cardH = height - margin * 2;
    const radius = 32;

    ctx.save();
    ctx.fillStyle = isDark ? '#1A1C20' : '#FFFFFF';
    ctx.strokeStyle = isDark ? '#282A2E' : '#E2E8F0';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, margin, margin, cardW, cardH, radius);
    ctx.fill();
    ctx.stroke();

    // Top decorative bar
    ctx.fillStyle = accent;
    drawTopRoundedRect(ctx, margin, margin, cardW, 14, radius);
    ctx.fill();
    ctx.restore();

    // --- Header Section: Just 'EcO' and Ref ---
    const topY = margin + 50;
    drawEcoEmblem(ctx, margin + 50, topY + 45, 45, accent, isDark);

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 42px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('EcO', margin + 115, topY + 56);

    // Reference & Automatic Created Date (Top Right)
    ctx.textAlign = 'right';
    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.fillText(data.referenceId, width - margin - 50, topY + 40);

    ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = isDark ? '#73E3B4' : '#059669';
    ctx.fillText(`Created: ${data.createdDate || formatExactDateTime(data.date, data.timestamp)}`, width - margin - 50, topY + 68);

    ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.fillText(`Tx Date: ${formatExactDate(data.date)}`, width - margin - 50, topY + 92);

    // Horizontal Divider
    ctx.strokeStyle = isDark ? '#282A2E' : '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin + 50, topY + 115);
    ctx.lineTo(width - margin - 50, topY + 115);
    ctx.stroke();

    // --- Hero Amount Box ---
    const heroY = topY + 140;
    const heroH = 250;

    ctx.save();
    ctx.fillStyle = isDark ? '#0C0E12' : '#F1F5F9';
    ctx.strokeStyle = isDark ? '#282A2E' : '#CBD5E1';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, margin + 50, heroY, cardW - 100, heroH, 24);
    ctx.fill();
    ctx.stroke();

    const isIncome = data.activityType === 'earning' || data.activityType === 'peer_take';
    let typeText = 'EXPENSE';
    if (data.activityType === 'earning') typeText = 'EARNING';
    else if (data.activityType === 'transfer') typeText = 'TRANSFER';
    else if (data.activityType === 'peer_give') typeText = 'PEER LENT';
    else if (data.activityType === 'peer_take') typeText = 'PEER BORROWED';

    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(typeText, width / 2, heroY + 50);

    // Amount in JetBrains Mono
    ctx.fillStyle = isIncome ? '#10B981' : isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 68px "JetBrains Mono", monospace';
    ctx.fillText(formatTaka(data.amount), width / 2, heroY + 140);

    ctx.fillStyle = isDark ? '#BCCAC1' : '#475569';
    ctx.font = '500 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`${data.walletName} · ${formatExactDate(data.date)}`, width / 2, heroY + 195);
    ctx.restore();

    // --- Perforated Receipt Line ---
    const tearY = heroY + heroH + 45;
    ctx.save();
    ctx.strokeStyle = isDark ? '#3D4943' : '#CBD5E1';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(margin + 50, tearY);
    ctx.lineTo(width - margin - 50, tearY);
    ctx.stroke();
    ctx.restore();

    // --- Key Details Rows ---
    const tableY = tearY + 45;
    const rowH = 68;
    const effectiveTitle = (titleToUse || data.title).trim();
    const rows = [
      { label: 'Voucher Title', value: effectiveTitle },
      { label: 'Reference Number', value: data.referenceId, isMono: true },
      { label: 'Date & Time', value: `${formatExactDate(data.date)} · ${data.timestamp}` },
      { label: 'From', value: data.fromParty },
      { label: 'To', value: data.toParty },
      { label: 'Category', value: data.categoryOrSource || data.title },
      { label: 'Account', value: data.toWalletName ? `${data.walletName} ➔ ${data.toWalletName}` : data.walletName }
    ];

    if (data.feeAmount !== undefined && data.feeAmount > 0) {
      rows.push({ label: 'Fee', value: formatTaka(data.feeAmount), isMono: true });
    }

    if (data.note) {
      rows.push({ label: 'Note', value: data.note });
    }

    rows.forEach((r, idx) => {
      const curY = tableY + idx * rowH;

      ctx.fillStyle = isDark ? '#87948C' : '#64748B';
      ctx.font = '500 22px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(r.label, margin + 60, curY + 36);

      ctx.fillStyle = isDark ? '#E2E2E8' : '#0F172A';
      ctx.font = r.isMono ? 'bold 22px "JetBrains Mono", monospace' : 'bold 22px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'right';

      const maxTextW = cardW - 400;
      let val = r.value;
      if (ctx.measureText(val).width > maxTextW) {
        while (ctx.measureText(val + '...').width > maxTextW && val.length > 5) {
          val = val.slice(0, -1);
        }
        val += '...';
      }
      ctx.fillText(val, width - margin - 60, curY + 36);

      ctx.strokeStyle = isDark ? '#23252A' : '#F1F5F9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin + 60, curY + rowH);
      ctx.lineTo(width - margin - 60, curY + rowH);
      ctx.stroke();
    });

    // --- Footer: Real QR Code + Just 'Tracked with EcO' ---
    const footerY = height - margin - 140;
    const qrSize = 105;
    drawRealQrCode(ctx, margin + 60, footerY, qrSize, 'https://eco-du.vercel.app/');

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Tracked with EcO', margin + 60 + qrSize + 25, footerY + qrSize / 2 + 10);
  };

  // --- 1.5 Consolidated Multi-Voucher Canvas Renderer ---
  const renderMultiVoucherCanvas = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: BrandedMultiVoucherData,
    isDark: boolean,
    accent: string,
    titleToUse?: string
  ) => {
    const width = 1200;
    const itemRowH = 64;
    const minHeight = 1480;
    const calculatedHeight = 920 + data.items.length * itemRowH;
    const height = Math.max(minHeight, calculatedHeight);

    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = isDark ? '#111317' : '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    // Outer subtle card
    const margin = 50;
    const cardW = width - margin * 2;
    const cardH = height - margin * 2;
    const radius = 28;

    ctx.save();
    ctx.fillStyle = isDark ? '#1A1C20' : '#FFFFFF';
    ctx.strokeStyle = isDark ? '#282A2E' : '#E2E8F0';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, margin, margin, cardW, cardH, radius);
    ctx.fill();
    ctx.stroke();

    // Top decorative bar
    ctx.fillStyle = accent;
    drawTopRoundedRect(ctx, margin, margin, cardW, 14, radius);
    ctx.fill();
    ctx.restore();

    // Header Section: EcO emblem + Title
    const topY = margin + 50;
    drawEcoEmblem(ctx, margin + 50, topY + 45, 45, accent, isDark);

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 36px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('EcO', margin + 115, topY + 45);

    // Prominent Title Display (e.g. "Kitchen Market Bazaar", "Groceries")
    const displayTitle = (titleToUse || data.customTitle || 'Consolidated Voucher').trim();
    ctx.fillStyle = accent;
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(displayTitle, margin + 115, topY + 80);

    // Reference & Automatic Created Date (Top Right)
    ctx.textAlign = 'right';
    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.fillText(data.referenceId, width - margin - 50, topY + 38);

    ctx.font = '600 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = isDark ? '#73E3B4' : '#059669';
    ctx.fillText(`Created: ${data.createdDate}`, width - margin - 50, topY + 68);

    ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.fillText(`Date Range: ${data.dateRange}`, width - margin - 50, topY + 95);

    // Divider
    ctx.strokeStyle = isDark ? '#282A2E' : '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin + 50, topY + 125);
    ctx.lineTo(width - margin - 50, topY + 125);
    ctx.stroke();

    // Hero Consolidated Total Box
    const heroY = topY + 150;
    const heroH = 200;

    ctx.save();
    ctx.fillStyle = isDark ? '#0C0E12' : '#F1F5F9';
    ctx.strokeStyle = isDark ? '#282A2E' : '#CBD5E1';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, margin + 50, heroY, cardW - 100, heroH, 24);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`CONSOLIDATED EXPENDITURE · ${data.totalCount} ${data.totalCount === 1 ? 'ITEM' : 'ITEMS'}`, width / 2, heroY + 42);

    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 60px "JetBrains Mono", monospace';
    ctx.fillText(formatTaka(data.totalAmount), width / 2, heroY + 115);

    // Wallets breakdown line
    const walletText = data.walletBreakdown && data.walletBreakdown.length > 0
      ? data.walletBreakdown.map((w) => `${w.walletName}: ${formatTaka(w.amount)}`).join('  ·  ')
      : `Ledger by ${data.userName}`;
    ctx.fillStyle = isDark ? '#BCCAC1' : '#475569';
    ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(walletText, width / 2, heroY + 165);
    ctx.restore();

    // Perforated line
    const tearY = heroY + heroH + 30;
    ctx.save();
    ctx.strokeStyle = isDark ? '#3D4943' : '#CBD5E1';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(margin + 50, tearY);
    ctx.lineTo(width - margin - 50, tearY);
    ctx.stroke();
    ctx.restore();

    // Table Header
    const tableY = tearY + 30;
    ctx.fillStyle = isDark ? '#0C0E12' : '#F1F5F9';
    ctx.fillRect(margin + 50, tableY, cardW - 100, 48);

    ctx.fillStyle = isDark ? '#87948C' : '#475569';
    ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('#', margin + 70, tableY + 30);
    ctx.fillText('ITEM / REASON', margin + 115, tableY + 30);
    ctx.fillText('CATEGORY', margin + 490, tableY + 30);
    ctx.fillText('WALLET', margin + 720, tableY + 30);
    ctx.fillText('DATE', margin + 890, tableY + 30);
    ctx.textAlign = 'right';
    ctx.fillText('AMOUNT', width - margin - 75, tableY + 30);

    // Items list
    data.items.forEach((item, idx) => {
      const curY = tableY + 48 + idx * itemRowH;
      ctx.fillStyle = idx % 2 === 0 ? (isDark ? '#1E2024' : '#FFFFFF') : (isDark ? '#16181C' : '#F8FAFC');
      ctx.fillRect(margin + 50, curY, cardW - 100, itemRowH);

      ctx.textAlign = 'left';
      ctx.fillStyle = isDark ? '#87948C' : '#64748B';
      ctx.font = '500 16px "JetBrains Mono", monospace';
      ctx.fillText(String(idx + 1).padStart(2, '0'), margin + 70, curY + 38);

      // Item title
      ctx.fillStyle = isDark ? '#E2E2E8' : '#0F172A';
      ctx.font = 'bold 17px "Plus Jakarta Sans", sans-serif';
      let titleTxt = item.title;
      if (ctx.measureText(titleTxt).width > 350) {
        while (ctx.measureText(titleTxt + '...').width > 350 && titleTxt.length > 4) {
          titleTxt = titleTxt.slice(0, -1);
        }
        titleTxt += '...';
      }
      ctx.fillText(titleTxt, margin + 115, curY + 38);

      // Category
      ctx.fillStyle = isDark ? '#BCCAC1' : '#475569';
      ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(item.category, margin + 490, curY + 38);

      // Wallet
      ctx.fillStyle = isDark ? '#87948C' : '#64748B';
      ctx.font = '500 15px "Plus Jakarta Sans", sans-serif';
      ctx.fillText(item.walletName, margin + 720, curY + 38);

      // Date
      ctx.font = '500 14px "JetBrains Mono", monospace';
      ctx.fillText(formatExactDate(item.date), margin + 890, curY + 38);

      // Amount
      ctx.textAlign = 'right';
      ctx.fillStyle = item.activityType === 'earning' ? '#10B981' : isDark ? '#FFB4AB' : '#DC2626';
      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.fillText(formatTaka(item.amount), width - margin - 75, curY + 38);

      // Row divider line
      ctx.strokeStyle = isDark ? '#23252A' : '#F1F5F9';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(margin + 50, curY + itemRowH);
      ctx.lineTo(width - margin - 50, curY + itemRowH);
      ctx.stroke();
    });

    // Total Summary Row
    const tableBottomY = tableY + 48 + data.items.length * itemRowH;
    ctx.fillStyle = isDark ? '#0C0E12' : '#E2E8F0';
    ctx.fillRect(margin + 50, tableBottomY, cardW - 100, 54);

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#E2E2E8' : '#0F172A';
    ctx.font = 'bold 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('TOTAL EXPENDITURE', margin + 70, tableBottomY + 34);

    ctx.textAlign = 'right';
    ctx.fillStyle = accent;
    ctx.font = 'bold 22px "JetBrains Mono", monospace';
    ctx.fillText(formatTaka(data.totalAmount), width - margin - 75, tableBottomY + 34);

    // Perforated line before footer
    const finalTearY = tableBottomY + 75;
    ctx.save();
    ctx.strokeStyle = isDark ? '#3D4943' : '#CBD5E1';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(margin + 50, finalTearY);
    ctx.lineTo(width - margin - 50, finalTearY);
    ctx.stroke();
    ctx.restore();

    // Footer with Real QR code + Just 'Tracked with EcO'
    const footerY = height - margin - 135;
    const qrSize = 105;
    drawRealQrCode(ctx, margin + 60, footerY, qrSize, 'https://eco-du.vercel.app/');

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Tracked with EcO', margin + 60 + qrSize + 25, footerY + 45);

    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = '500 16px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Consolidated Expense Ledger Voucher · Created: ${data.createdDate}`, margin + 60 + qrSize + 25, footerY + 80);
  };

  // --- 2. Person Statement Canvas Renderer ---
  const renderStatementCanvas = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: BrandedStatementData,
    isDark: boolean,
    accent: string
  ) => {
    const width = 1200;
    const height = 1620;
    canvas.width = width;
    canvas.height = height;

    // Background
    ctx.fillStyle = isDark ? '#111317' : '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    const margin = 50;
    const cardW = width - margin * 2;
    const cardH = height - margin * 2;
    const radius = 28;

    ctx.save();
    ctx.fillStyle = isDark ? '#1A1C20' : '#FFFFFF';
    ctx.strokeStyle = isDark ? '#282A2E' : '#E2E8F0';
    ctx.lineWidth = 3;
    drawRoundedRect(ctx, margin, margin, cardW, cardH, radius);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accent;
    drawTopRoundedRect(ctx, margin, margin, cardW, 14, radius);
    ctx.fill();
    ctx.restore();

    // Header: Just 'EcO' and Ref
    const topY = margin + 50;
    drawEcoEmblem(ctx, margin + 50, topY + 45, 45, accent, isDark);

    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 42px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('EcO', margin + 115, topY + 56);

    ctx.textAlign = 'right';
    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = 'bold 20px "JetBrains Mono", monospace';
    ctx.fillText(`REF: ${data.referenceId}`, width - margin - 50, topY + 45);
    ctx.font = '500 18px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`DATE: ${formatDisplayDate(data.generatedDate)}`, width - margin - 50, topY + 75);

    // Divider
    ctx.strokeStyle = isDark ? '#282A2E' : '#E2E8F0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(margin + 50, topY + 110);
    ctx.lineTo(width - margin - 50, topY + 110);
    ctx.stroke();

    // --- Counterparties Box ---
    const partyY = topY + 130;
    const partyH = 100;
    ctx.save();
    ctx.fillStyle = isDark ? '#0C0E12' : '#F1F5F9';
    ctx.strokeStyle = isDark ? '#282A2E' : '#E2E8F0';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, margin + 50, partyY, cardW - 100, partyH, 18);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('FROM', margin + 80, partyY + 36);
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(data.ownerName, margin + 80, partyY + 72);

    ctx.fillStyle = accent;
    ctx.font = 'bold 30px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⇄', width / 2, partyY + 62);

    ctx.textAlign = 'right';
    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('PEER', width - margin - 80, partyY + 36);
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    const peerDisplay = data.counterpartyPhone ? `${data.counterpartyName} (${data.counterpartyPhone})` : data.counterpartyName;
    ctx.fillText(peerDisplay, width - margin - 80, partyY + 72);
    ctx.restore();

    // --- Summary KPIs ---
    const kpiY = partyY + partyH + 25;
    const kpiH = 140;
    const colW = (cardW - 100 - 40) / 3;

    drawSummaryBox(ctx, margin + 50, kpiY, colW, kpiH, 'TOTAL GIVEN', formatTaka(data.totalGiven), '#73E3B4', isDark);
    drawSummaryBox(ctx, margin + 50 + colW + 20, kpiY, colW, kpiH, 'TOTAL RECEIVED', formatTaka(data.totalTaken), '#FFB4AB', isDark);

    const netBal = data.netBalance;
    const netColor = netBal > 0 ? '#73E3B4' : netBal < 0 ? '#FFB4AB' : '#87948C';
    let netStatus = 'ALL BALANCED';
    if (netBal > 0) netStatus = 'RECEIVABLE';
    else if (netBal < 0) netStatus = 'PAYABLE';

    drawSummaryBox(ctx, margin + 50 + (colW + 20) * 2, kpiY, colW, kpiH, netStatus, formatTaka(Math.abs(netBal)), netColor, isDark);

    // --- Transaction Table Header ---
    const tableY = kpiY + kpiH + 35;
    ctx.fillStyle = isDark ? '#0C0E12' : '#F1F5F9';
    ctx.fillRect(margin + 50, tableY, cardW - 100, 48);

    ctx.fillStyle = isDark ? '#87948C' : '#475569';
    ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('DATE', margin + 70, tableY + 31);
    ctx.fillText('DESCRIPTION', margin + 220, tableY + 31);
    ctx.fillText('WALLET', margin + 630, tableY + 31);
    ctx.textAlign = 'right';
    ctx.fillText('AMOUNT', margin + 890, tableY + 31);
    ctx.fillText('BALANCE', width - margin - 70, tableY + 31);

    const rowH = 54;
    const rowsToShow = data.transactions.slice(0, 12);

    rowsToShow.forEach((tx, idx) => {
      const curY = tableY + 48 + idx * rowH;
      ctx.fillStyle = idx % 2 === 0 ? (isDark ? '#1E2024' : '#FFFFFF') : (isDark ? '#16181C' : '#F8FAFC');
      ctx.fillRect(margin + 50, curY, cardW - 100, rowH);

      ctx.textAlign = 'left';
      ctx.fillStyle = isDark ? '#BCCAC1' : '#64748B';
      ctx.font = '500 17px "JetBrains Mono", monospace';
      ctx.fillText(tx.date, margin + 70, curY + 34);

      ctx.font = 'bold 17px "Plus Jakarta Sans", sans-serif';
      if (tx.type === 'give') {
        ctx.fillStyle = '#73E3B4';
        ctx.fillText('Lent', margin + 220, curY + 34);
      } else {
        ctx.fillStyle = '#FFB4AB';
        ctx.fillText('Received', margin + 220, curY + 34);
      }

      ctx.fillStyle = isDark ? '#87948C' : '#64748B';
      ctx.font = '400 16px "Plus Jakarta Sans", sans-serif';
      const desc = tx.description ? ` · ${tx.description}` : tx.tag ? ` · ${tx.tag}` : '';
      ctx.fillText(desc, margin + 300, curY + 34);

      ctx.fillStyle = isDark ? '#BCCAC1' : '#475569';
      ctx.fillText(tx.walletName, margin + 630, curY + 34);

      ctx.textAlign = 'right';
      ctx.font = 'bold 18px "JetBrains Mono", monospace';
      ctx.fillStyle = isDark ? '#E2E2E8' : '#0F172A';
      ctx.fillText(formatTaka(tx.amount), margin + 890, curY + 34);

      ctx.fillStyle = tx.runningBalance >= 0 ? '#73E3B4' : '#FFB4AB';
      ctx.fillText(formatTaka(tx.runningBalance), width - margin - 70, curY + 34);
    });

    // --- Footer: Real QR Code + Just 'Tracked with EcO' ---
    const footerY = height - margin - 140;
    const qrSize = 105;
    drawRealQrCode(ctx, margin + 60, footerY, qrSize, 'https://eco-du.vercel.app/');

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Tracked with EcO', margin + 60 + qrSize + 25, footerY + qrSize / 2 + 10);
  };

  // --- 3. Monthly Card Canvas Renderer ---
  const renderMonthlyCardCanvas = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    data: BrandedMonthlyCardData,
    isDark: boolean,
    accent: string,
    ratio: 'card' | 'story'
  ) => {
    const isStory = ratio === 'story';
    const width = 1080;
    const height = isStory ? 1920 : 1350;
    canvas.width = width;
    canvas.height = height;

    // Background Gradient
    const bgGrad = ctx.createLinearGradient(0, 0, width, height);
    if (isDark) {
      bgGrad.addColorStop(0, '#111317');
      bgGrad.addColorStop(0.5, '#16191E');
      bgGrad.addColorStop(1, '#0C0E12');
    } else {
      bgGrad.addColorStop(0, '#F8FAFC');
      bgGrad.addColorStop(0.5, '#F1F5F9');
      bgGrad.addColorStop(1, '#E2E8F0');
    }
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, width, height);

    const margin = 60;
    const cardW = width - margin * 2;
    const topY = margin + 30;

    // Top Header: Just 'EcO' and Month
    drawEcoEmblem(ctx, margin + 40, topY + 40, 40, accent, isDark);

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 44px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('EcO', margin + 100, topY + 54);

    // Month Badge (Right)
    const badgeW = 240;
    const badgeH = 50;
    const badgeX = width - margin - badgeW;
    const badgeY = topY + 14;

    ctx.save();
    ctx.fillStyle = isDark ? '#1E2024' : '#FFFFFF';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, badgeX, badgeY, badgeW, badgeH, 25);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(data.monthTitle, badgeX + badgeW / 2, badgeY + 33);
    ctx.restore();

    // Hero Box: Net Savings
    const heroY = topY + 120;
    const heroH = isStory ? 340 : 280;

    ctx.save();
    ctx.fillStyle = isDark ? '#1A1C20' : '#FFFFFF';
    ctx.strokeStyle = isDark ? '#282A2E' : '#CBD5E1';
    ctx.lineWidth = 2.5;
    drawRoundedRect(ctx, margin, heroY, cardW, heroH, 30);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = accent;
    drawTopRoundedRect(ctx, margin, heroY, cardW, 10, 30);
    ctx.fill();

    ctx.textAlign = 'center';
    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('NET SAVINGS', width / 2, heroY + 60);

    const isSurplus = data.netSavings >= 0;
    ctx.fillStyle = isSurplus ? '#10B981' : '#EF4444';
    ctx.font = 'bold 74px "JetBrains Mono", monospace';
    ctx.fillText((isSurplus ? '+' : '') + formatTaka(data.netSavings), width / 2, heroY + 160);

    const rateBadgeW = 260;
    const rateBadgeH = 46;
    const rateBadgeX = (width - rateBadgeW) / 2;
    const rateBadgeY = heroY + 200;

    ctx.fillStyle = isDark ? '#0C0E12' : '#F1F5F9';
    drawRoundedRect(ctx, rateBadgeX, rateBadgeY, rateBadgeW, rateBadgeH, 23);
    ctx.fill();

    ctx.fillStyle = isDark ? '#E2E2E8' : '#0F172A';
    ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(`Savings Rate: ${data.savingsRate.toFixed(1)}%`, width / 2, rateBadgeY + 30);
    ctx.restore();

    // 2-Column Overview (Income vs Expenses)
    const kpiY = heroY + heroH + 25;
    const kpiH = 150;
    const halfW = (cardW - 24) / 2;

    drawSummaryBox(ctx, margin, kpiY, halfW, kpiH, 'TOTAL EARNED', formatTaka(data.totalEarnings), '#10B981', isDark);
    drawSummaryBox(ctx, margin + halfW + 24, kpiY, halfW, kpiH, 'TOTAL SPENT', formatTaka(data.totalExpenses), '#FFB4AB', isDark);

    // Top Categories Breakdown
    const catY = kpiY + kpiH + 30;
    const catH = isStory ? 540 : 380;

    ctx.save();
    ctx.fillStyle = isDark ? '#1A1C20' : '#FFFFFF';
    ctx.strokeStyle = isDark ? '#282A2E' : '#E2E8F0';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, margin, catY, cardW, catH, 26);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 24px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Top Spending Categories', margin + 35, catY + 50);

    const categories = data.topCategories.slice(0, isStory ? 5 : 4);
    const catItemH = (catH - 90) / Math.max(1, categories.length);

    categories.forEach((cat, idx) => {
      const curY = catY + 80 + idx * catItemH;

      ctx.fillStyle = isDark ? '#E2E2E8' : '#0F172A';
      ctx.font = 'bold 20px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${idx + 1}. ${cat.category}`, margin + 35, curY + 28);

      ctx.textAlign = 'right';
      ctx.font = 'bold 20px "JetBrains Mono", monospace';
      ctx.fillText(formatTaka(cat.amount), width - margin - 35, curY + 28);

      const barY = curY + 40;
      const barW = cardW - 70;
      ctx.fillStyle = isDark ? '#282A2E' : '#E2E8F0';
      drawRoundedRect(ctx, margin + 35, barY, barW, 10, 5);
      ctx.fill();

      ctx.fillStyle = accent;
      const fillW = Math.max(15, (barW * Math.min(100, cat.percentage)) / 100);
      drawRoundedRect(ctx, margin + 35, barY, fillW, 10, 5);
      ctx.fill();
    });
    ctx.restore();

    // Footer: Real QR Code + Just 'Tracked with EcO'
    const footerY = height - margin - 105;
    const qrSize = 95;
    drawRealQrCode(ctx, margin + 20, footerY, qrSize, 'https://eco-du.vercel.app/');

    ctx.textAlign = 'left';
    ctx.fillStyle = isDark ? '#FFFFFF' : '#0F172A';
    ctx.font = 'bold 28px "Plus Jakarta Sans", sans-serif';
    ctx.fillText('Tracked with EcO', margin + 20 + qrSize + 25, footerY + qrSize / 2 + 10);
  };

  // --- Drawing Helpers ---
  function drawRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
  }

  function drawTopRoundedRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height);
    ctx.lineTo(x, y + height);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function drawEcoEmblem(
    ctx: CanvasRenderingContext2D,
    cx: number,
    cy: number,
    r: number,
    accent: string,
    isDark: boolean
  ) {
    ctx.save();
    ctx.fillStyle = isDark ? '#0C0E12' : '#0F172A';
    ctx.strokeStyle = isDark ? '#3D4943' : '#CBD5E1';
    ctx.lineWidth = 2;
    drawRoundedRect(ctx, cx - r, cy - r, r * 2, r * 2, r * 0.4);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.65, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = accent;
    ctx.lineWidth = 4.5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const lx = cx - r * 0.3;
    const rx = cx + r * 0.3;
    const ty = cy - r * 0.32;
    const my = cy;
    const by = cy + r * 0.32;

    ctx.beginPath();
    ctx.moveTo(rx, ty);
    ctx.lineTo(lx, ty);
    ctx.lineTo(lx, by);
    ctx.lineTo(rx, by);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(lx, my);
    ctx.lineTo(lx + r * 0.42, my);
    ctx.stroke();

    ctx.restore();
  }

  function drawSummaryBox(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    val: string,
    valColor: string,
    isDark: boolean
  ) {
    ctx.save();
    ctx.fillStyle = isDark ? '#0C0E12' : '#F1F5F9';
    ctx.strokeStyle = isDark ? '#282A2E' : '#E2E8F0';
    ctx.lineWidth = 1.5;
    drawRoundedRect(ctx, x, y, w, h, 18);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = isDark ? '#87948C' : '#64748B';
    ctx.font = 'bold 15px "Plus Jakarta Sans", sans-serif';
    ctx.fillText(label, x + w / 2, y + 42);

    ctx.fillStyle = valColor;
    ctx.font = 'bold 28px "JetBrains Mono", monospace';
    ctx.fillText(val, x + w / 2, y + 96);
    ctx.restore();
  }

  // --------------------------------------------------------------------------
  // User Actions: PNG, PDF, Clipboard, WhatsApp
  // --------------------------------------------------------------------------

  const handleDownloadPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let filename = 'eco-export.png';
    const cleanTitle = (customTitle || 'voucher').toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');
    if (mode === 'multi-voucher' && multiVoucherData) {
      filename = `eco-consolidated-${cleanTitle}-${multiVoucherData.referenceId}.png`;
    } else if (mode === 'voucher' && voucherData) {
      filename = `eco-voucher-${cleanTitle}-${voucherData.referenceId}.png`;
    } else if (mode === 'person-statement' && statementData) {
      filename = `eco-statement-${statementData.counterpartyName.toLowerCase().replace(/\s+/g, '-')}-${statementData.referenceId}.png`;
    } else if (mode === 'monthly-card' && monthlyCardData) {
      filename = `eco-monthly-report-${monthlyCardData.monthKey}.png`;
    }

    downloadCanvasAsPng(canvas, filename);
    showToast?.('Image downloaded');
  };

  const handleCopyToClipboard = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsExporting(true);
    const success = await copyCanvasToClipboard(canvas);
    setIsExporting(false);

    if (success) {
      setCopied(true);
      showToast?.('Image copied to clipboard');
      setTimeout(() => setCopied(false), 3000);
    } else {
      handleDownloadPng();
    }
  };

  const handleExportPdf = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const imgData = canvas.toDataURL('image/png');

    let title = 'EcO Document';
    if (mode === 'multi-voucher' && multiVoucherData) {
      title = `${customTitle || multiVoucherData.customTitle} — ${multiVoucherData.referenceId}`;
    } else if (mode === 'voucher' && voucherData) {
      title = `${customTitle || voucherData.title} — ${voucherData.referenceId}`;
    } else if (mode === 'person-statement' && statementData) {
      title = `EcO — ${statementData.counterpartyName}`;
    } else if (mode === 'monthly-card' && monthlyCardData) {
      title = `EcO — ${monthlyCardData.monthTitle}`;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8" />
          <title>${title}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            body {
              margin: 0;
              padding: 0;
              background-color: #FFFFFF;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .print-container {
              width: 100%;
              max-width: 800px;
              text-align: center;
            }
            img {
              width: 100%;
              height: auto;
              max-height: 96vh;
              object-fit: contain;
              border-radius: 8px;
            }
            @media print {
              body {
                background: none;
              }
              img {
                max-width: 100%;
                box-shadow: none !important;
              }
            }
          </style>
        </head>
        <body>
          <div class="print-container">
            <img src="${imgData}" alt="${title}" />
          </div>
        </body>
      </html>
    `;

    openPrintPdfWindow(htmlContent, title);
  };

  const handleShareToWhatsApp = () => {
    let text = '';
    if (mode === 'multi-voucher' && multiVoucherData) {
      const itemsList = multiVoucherData.items.map((it, idx) => `${idx + 1}. ${it.title} — ${formatTaka(it.amount)} (${it.category})`).join('\n');
      text = `*EcO — ${customTitle || multiVoucherData.customTitle}*\n\n` +
        `• Ref: ${multiVoucherData.referenceId}\n` +
        `• Created: ${multiVoucherData.createdDate}\n` +
        `• Total Spent: ${formatTaka(multiVoucherData.totalAmount)}\n` +
        `• Total Items: ${multiVoucherData.totalCount}\n` +
        `• Date Range: ${multiVoucherData.dateRange}\n\n` +
        `*Itemized List:*\n${itemsList}\n\n` +
        `Tracked with EcO (https://eco-du.vercel.app/)`;
    } else if (mode === 'voucher' && voucherData) {
      text = `*EcO — ${customTitle || voucherData.title}*\n\n` +
        `• Ref: ${voucherData.referenceId}\n` +
        `• Created: ${voucherData.createdDate || voucherData.date}\n` +
        `• Amount: ${formatTaka(voucherData.amount)}\n` +
        `• From: ${voucherData.fromParty}\n` +
        `• To: ${voucherData.toParty}\n` +
        `• Wallet: ${voucherData.walletName}\n` +
        `• Date: ${formatExactDate(voucherData.date)} · ${voucherData.timestamp}\n` +
        (voucherData.note ? `• Note: ${voucherData.note}\n` : '') +
        `\nTracked with EcO (https://eco-du.vercel.app/)`;
    } else if (mode === 'person-statement' && statementData) {
      const net = statementData.netBalance;
      const status = net > 0
        ? `Receivable: ${formatTaka(net)}`
        : net < 0
        ? `Payable: ${formatTaka(Math.abs(net))}`
        : 'Settled (৳0.00)';

      text = `*EcO — Statement*\n\n` +
        `${statementData.ownerName} ⇄ ${statementData.counterpartyName}\n` +
        `• Total Given: ${formatTaka(statementData.totalGiven)}\n` +
        `• Total Received: ${formatTaka(statementData.totalTaken)}\n` +
        `• Net Balance: ${status}\n` +
        `• Ref: ${statementData.referenceId}\n` +
        `\nTracked with EcO (https://eco-du.vercel.app/)`;
    } else if (mode === 'monthly-card' && monthlyCardData) {
      text = `*EcO — ${monthlyCardData.monthTitle}*\n\n` +
        `• Net Savings: ${formatTaka(monthlyCardData.netSavings)}\n` +
        `• Total Income: ${formatTaka(monthlyCardData.totalEarnings)}\n` +
        `• Total Expenses: ${formatTaka(monthlyCardData.totalExpenses)}\n` +
        `• Savings Rate: ${monthlyCardData.savingsRate.toFixed(1)}%\n` +
        `\nTracked with EcO (https://eco-du.vercel.app/)`;
    }

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/80 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl bg-[#1A1C20] border border-[#3D4943]/60 rounded-2xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#3D4943]/40 bg-[#1E2024]/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#0C0E12] border border-[#73E3B4]/40 flex items-center justify-center text-[#73E3B4] font-bold text-sm">
              Ec
            </div>
            <h2 className="text-sm font-bold text-[#E2E2E8]">
              {mode === 'multi-voucher' && 'EcO Consolidated Voucher'}
              {mode === 'voucher' && 'EcO Voucher'}
              {mode === 'person-statement' && 'EcO Statement'}
              {mode === 'monthly-card' && 'EcO Monthly'}
            </h2>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#87948C] hover:text-[#E2E2E8] hover:bg-[#282A2E] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Studio Body: Preview + Controls */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Left Canvas Preview Area */}
          <div className="flex-1 bg-[#0C0E12] p-4 sm:p-6 flex items-center justify-center overflow-auto min-h-[360px] md:min-h-[460px]">
            <div className="relative max-h-full flex items-center justify-center shadow-2xl rounded-xl overflow-hidden border border-[#3D4943]/40">
              <canvas
                ref={canvasRef}
                className="max-h-[55vh] md:max-h-[68vh] w-auto h-auto object-contain select-none"
              />
            </div>
          </div>

          {/* Right Styling & Export Controls Panel */}
          <div className="w-full md:w-76 bg-[#1A1C20] border-t md:border-t-0 md:border-l border-[#3D4943]/40 p-4 sm:p-5 flex flex-col justify-between space-y-4 overflow-y-auto">
            <div className="space-y-4">
              {/* Modifiable Title Input for Vouchers */}
              {(mode === 'voucher' || mode === 'multi-voucher') && (
                <div>
                  <label className="text-xs font-semibold text-[#BCCAC1] uppercase tracking-wider block mb-1.5">
                    Voucher Title
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g. Kitchen Market Bazaar, Groceries"
                    className="w-full py-2 px-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/50 text-[#E2E2E8] text-xs font-semibold outline-none focus:border-[#73E3B4] transition-colors"
                  />
                  <span className="text-[10px] text-[#87948C] mt-1 block">
                    Created: {mode === 'multi-voucher' ? multiVoucherData?.createdDate : (voucherData?.createdDate || formatExactDateTime(voucherData?.date || '', voucherData?.timestamp))}
                  </span>
                </div>
              )}

              {/* Month Selector for Monthly Card mode */}
              {mode === 'monthly-card' && availableMonths && availableMonths.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-[#BCCAC1] uppercase tracking-wider block mb-1.5">
                    Month
                  </label>
                  <select
                    value={selectedMonthKey || monthlyCardData?.monthKey}
                    onChange={(e) => onMonthChange?.(e.target.value)}
                    className="w-full py-2 px-3 rounded-lg bg-[#0C0E12] border border-[#3D4943]/40 text-[#E2E2E8] text-xs font-semibold outline-none cursor-pointer focus:border-[#73E3B4] font-mono"
                  >
                    {availableMonths.map((m) => (
                      <option key={m.key} value={m.key} className="bg-[#1A1C20] text-[#E2E2E8]">
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Theme Toggle (Dark vs Light) */}
              <div>
                <label className="text-xs font-semibold text-[#BCCAC1] uppercase tracking-wider block mb-1.5">
                  Theme
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setTheme('dark')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      theme === 'dark'
                        ? 'bg-[#0C0E12] text-[#73E3B4] border-[#73E3B4]/60'
                        : 'bg-[#1E2024] text-[#87948C] border-[#3D4943]/30 hover:text-[#E2E2E8]'
                    }`}
                  >
                    <Moon className="w-3.5 h-3.5" />
                    <span>Dark</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setTheme('light')}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                      theme === 'light'
                        ? 'bg-[#FFFFFF] text-[#0F172A] border-gray-300'
                        : 'bg-[#1E2024] text-[#87948C] border-[#3D4943]/30 hover:text-[#E2E2E8]'
                    }`}
                  >
                    <Sun className="w-3.5 h-3.5" />
                    <span>Light</span>
                  </button>
                </div>
              </div>

              {/* Palette Selector */}
              <div>
                <label className="text-xs font-semibold text-[#BCCAC1] uppercase tracking-wider block mb-1.5">
                  Palette
                </label>
                <div className="flex items-center gap-2">
                  {(['green', 'blue', 'orange'] as StudioPalette[]).map((p) => {
                    const col = getPaletteColors(p);
                    const isActive = palette === p;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setPalette(p)}
                        className={`flex-1 py-1.5 px-2 rounded-lg border text-xs font-medium capitalize flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isActive
                            ? 'bg-[#1E2024] text-[#E2E2E8] border-[#73E3B4]'
                            : 'bg-[#0C0E12] text-[#87948C] border-[#3D4943]/30 hover:text-[#E2E2E8]'
                        }`}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: col.accent }}
                        />
                        <span>{p}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Aspect Ratio (for Monthly Card only) */}
              {mode === 'monthly-card' && (
                <div>
                  <label className="text-xs font-semibold text-[#BCCAC1] uppercase tracking-wider block mb-1.5">
                    Format
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAspectRatio('card')}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        aspectRatio === 'card'
                          ? 'bg-[#0C0E12] text-[#73E3B4] border-[#73E3B4]'
                          : 'bg-[#1E2024] text-[#87948C] border-[#3D4943]/30'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Card (4:5)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAspectRatio('story')}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                        aspectRatio === 'story'
                          ? 'bg-[#0C0E12] text-[#73E3B4] border-[#73E3B4]'
                          : 'bg-[#1E2024] text-[#87948C] border-[#3D4943]/30'
                      }`}
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>Story (9:16)</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-2 border-t border-[#3D4943]/30">
              <button
                type="button"
                onClick={handleDownloadPng}
                className="w-full py-2.5 px-4 rounded-xl bg-[#55C79A] hover:bg-[#73E3B4] text-[#003826] font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all active:scale-[0.99] cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download PNG</span>
              </button>

              <button
                type="button"
                onClick={handleCopyToClipboard}
                disabled={isExporting}
                className="w-full py-2 px-4 rounded-xl bg-[#1E2024] hover:bg-[#282A2E] text-[#E2E2E8] border border-[#3D4943]/40 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-[#73E3B4]" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy Image'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportPdf}
                className="w-full py-2 px-4 rounded-xl bg-[#0C0E12] hover:bg-[#1E2024] text-[#BCCAC1] hover:text-[#73E3B4] border border-[#3D4943]/30 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Save PDF / Print</span>
              </button>

              <button
                type="button"
                onClick={handleShareToWhatsApp}
                className="w-full py-2 px-4 rounded-xl bg-[#0C0E12] hover:bg-[#1E2024] text-[#25D366] border border-[#25D366]/30 font-semibold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <MessageCircle className="w-4 h-4" />
                <span>WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
