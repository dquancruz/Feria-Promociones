import { splitAttendAt, type ConfirmedItem, type RegistrationConfirmation } from '@feria/shared';
import type { jsPDF } from 'jspdf';
import { formatAmount, formatCents } from './currency';
import { formatDayLong } from './eventFormat';

const PAGE_WIDTH = 210;
const MARGIN = 18;
const RIGHT = PAGE_WIDTH - MARGIN;
const PAGE_BOTTOM = 280;

const FIELD: [number, number, number] = [0x1f, 0x5b, 0x3a];
const TAG: [number, number, number] = [0xf4, 0xc4, 0x30];
const INK: [number, number, number] = [0x15, 0x20, 0x1a];
const MUTED: [number, number, number] = [0x4b, 0x5b, 0x51];
const LINE: [number, number, number] = [0xd5, 0xdb, 0xd0];

export function confirmationShortCode(confirmation: RegistrationConfirmation): string {
  return confirmation.confirmationId.slice(0, 8).toUpperCase();
}

export function confirmationFileName(confirmation: RegistrationConfirmation): string {
  return `confirmacion-${confirmationShortCode(confirmation)}.pdf`;
}

/** Draws the confirmation on a new page whenever the current one runs out of room. */
function drawConfirmation(doc: jsPDF, confirmation: RegistrationConfirmation, eventName: string): void {
  let y = 0;

  const ensureSpace = (needed: number) => {
    if (y + needed <= PAGE_BOTTOM) return;
    doc.addPage();
    y = MARGIN;
  };

  const row = (label: string, value: string, options: { bold?: boolean } = {}) => {
    ensureSpace(7);
    doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
    doc.setFontSize(options.bold ? 12 : 10.5);
    doc.setTextColor(...INK);
    doc.text(label, MARGIN, y);
    doc.text(value, RIGHT, y, { align: 'right' });
    y += 6.5;
  };

  const group = (title: string, items: ConfirmedItem[]) => {
    if (items.length === 0) return;
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...FIELD);
    doc.text(title, MARGIN, y);
    y += 6;
    for (const item of items) {
      row(item.name, formatCents(item.priceCents));
    }
    y += 3;
  };

  // Header band.
  doc.setFillColor(...FIELD);
  doc.rect(0, 0, PAGE_WIDTH, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Disagro', MARGIN, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(eventName, RIGHT, 16, { align: 'right' });
  y = 40;

  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Asistencia confirmada', MARGIN, y);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(12);
  doc.text(`${confirmation.nombre} ${confirmation.apellidos}`, MARGIN, y);
  y += 6.5;
  if (confirmation.attendAt) {
    const visit = splitAttendAt(confirmation.attendAt);
    doc.text(`Visita: ${formatDayLong(visit.day)}, ${visit.time}`, MARGIN, y);
    y += 6.5;
  }
  doc.setTextColor(...MUTED);
  doc.setFontSize(10.5);
  doc.text(`Código de confirmación: ${confirmationShortCode(confirmation)}`, MARGIN, y);
  y += 12;

  // The discount tag: both percentages, like the fertilizer grade on a sack.
  doc.setFillColor(...TAG);
  doc.roundedRect(MARGIN, y, 62, 30, 3, 3, 'F');
  doc.setFillColor(255, 255, 255);
  doc.circle(MARGIN + 6, y + 6, 1.6, 'F');
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(`${confirmation.serviceDiscountPct} - ${confirmation.productDiscountPct}`, MARGIN + 31, y + 17, {
    align: 'center',
  });
  doc.setFontSize(9);
  doc.text('Servicios', MARGIN + 16, y + 26, { align: 'center' });
  doc.text('Productos', MARGIN + 46, y + 26, { align: 'center' });
  y += 42;

  group('Servicios', confirmation.items.filter((item) => item.type === 'service'));
  group('Productos', confirmation.items.filter((item) => item.type === 'product'));

  ensureSpace(50);
  doc.setDrawColor(...LINE);
  doc.line(MARGIN, y - 3, RIGHT, y - 3);
  y += 3;
  row(`Descuento en servicios (${confirmation.serviceDiscountPct}%)`, `ahorras ${formatAmount(confirmation.servicesSavings)}`);
  row(`Descuento en productos (${confirmation.productDiscountPct}%)`, `ahorras ${formatAmount(confirmation.productsSavings)}`);
  row('Tu selección', formatAmount(confirmation.subtotal));
  row('Ahorro total', formatAmount(confirmation.savings));
  y += 2;
  row('Valor con descuento', formatAmount(confirmation.grandTotal), { bold: true });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text('Atención al cliente: 2223-2425', MARGIN, 288);
}

/** Saves the confirmation as a PDF. The PDF library is only fetched when someone asks for the file. */
export async function downloadConfirmationPdf(
  confirmation: RegistrationConfirmation,
  eventName: string,
): Promise<void> {
  const { jsPDF: JsPdf } = await import('jspdf');
  const doc = new JsPdf({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: `Confirmación ${confirmationShortCode(confirmation)}` });
  drawConfirmation(doc, confirmation, eventName);
  doc.save(confirmationFileName(confirmation));
}
