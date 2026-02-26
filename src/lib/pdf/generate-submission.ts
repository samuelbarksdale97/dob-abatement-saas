import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getImageDimensions } from './prepare-images';

export interface SubmissionPdfItem {
  item_number: number;
  violation_code: string;
  priority: number;
  abatement_deadline: string | null;
  fine: number | null;
  violation_description: string | null;
  specific_location: string | null;
  task_description: string | null;
  date_of_infraction: string | null;
  time_of_infraction: string | null;
  inspectorPhotoDataUrl: string | null;
  remediationPhotoDataUrl: string | null;
}

export interface SubmissionPdfData {
  // Cover letter fields
  address: string;
  respondent: string;
  noiNumber: string;
  noiDate: string;
  contactName: string;
  contactCompany: string;
  contactEmail: string;
  contactPhone: string | null;
  // Per-item data
  items: SubmissionPdfItem[];
}

// Constants (letter size in points, 72 pt/inch)
const MARGIN = 72; // 1 inch
const PAGE_WIDTH = 612; // 8.5 inches
const PAGE_HEIGHT = 792; // 11 inches
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN;

/**
 * Generate a DOB Abatement Submission PDF matching the official template format.
 * Returns a Blob of the generated PDF.
 */
export async function generateSubmissionPdf(data: SubmissionPdfData): Promise<Blob> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  renderCoverLetter(doc, data);

  for (const item of data.items) {
    doc.addPage();
    await renderItemPage(doc, item, data.address, data.noiNumber);
  }

  return doc.output('blob');
}

// ---------------------------------------------------------------------------
// Cover Letter (Page 1)
// ---------------------------------------------------------------------------
function renderCoverLetter(doc: jsPDF, data: SubmissionPdfData) {
  let y = MARGIN;

  // Date — top left
  const today = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(today, MARGIN, y);
  y += 40;

  // Recipient address block
  const recipient = [
    'Office of Administrative Hearings',
    'DOB/Office of Strategic Code Enforcement',
    'One Judiciary Square',
    '441 4th Street, N.W., Suite 450 N',
    'Washington, D.C. 20001-2714',
  ];
  doc.setFontSize(11);
  for (const line of recipient) {
    doc.text(line, MARGIN, y);
    y += 15;
  }
  y += 20;

  // Salutation
  doc.text('To Whom It May Concern:', MARGIN, y);
  y += 25;

  // Body paragraph 1
  const para1 = `My property, ${data.respondent}, located at ${data.address}, received Notice of Infraction ${data.noiNumber} on ${data.noiDate}.`;
  const lines1 = doc.splitTextToSize(para1, CONTENT_WIDTH);
  doc.text(lines1, MARGIN, y);
  y += lines1.length * 15 + 10;

  // Body paragraph 2
  const para2 =
    'We have initiated remediation efforts to resolve each of the infractions. On the following pages we have copied the infractions, with explanation, and provided photo evidence of abatement.';
  const lines2 = doc.splitTextToSize(para2, CONTENT_WIDTH);
  doc.text(lines2, MARGIN, y);
  y += lines2.length * 15 + 10;

  // Body paragraph 3
  const para3 =
    'We are requesting a significant reduction in the fines or a complete removal of those fines where appropriate as we have completed abatement.';
  const lines3 = doc.splitTextToSize(para3, CONTENT_WIDTH);
  doc.text(lines3, MARGIN, y);
  y += lines3.length * 15 + 10;

  // Contact line
  const contactParts = [`Please do not hesitate to reach out to me for additional clarity at ${data.contactEmail}`];
  if (data.contactPhone) {
    contactParts[0] += ` and ${data.contactPhone}`;
  }
  contactParts[0] += '.';
  const contactLines = doc.splitTextToSize(contactParts[0], CONTENT_WIDTH);
  doc.text(contactLines, MARGIN, y);
  y += contactLines.length * 15 + 30;

  // Closing
  doc.text('All the best,', MARGIN, y);
  y += 40;

  // Signature
  doc.setFont('helvetica', 'normal');
  doc.text(data.contactName, MARGIN, y);
  y += 15;
  doc.text(data.contactCompany, MARGIN, y);
}

// ---------------------------------------------------------------------------
// Per-Item Evidence Page (Pages 2+)
// ---------------------------------------------------------------------------
async function renderItemPage(
  doc: jsPDF,
  item: SubmissionPdfItem,
  address: string,
  noiNumber: string,
) {
  let y = MARGIN;

  // ---- Header ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(address, MARGIN, y);
  doc.text('ABATEMENT', PAGE_WIDTH - MARGIN, y, { align: 'right' });
  y += 14;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Notice of Infraction Number: ${noiNumber}`, MARGIN, y);
  y += 30;

  // ---- Item heading ----
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`Item ${item.item_number}`, MARGIN, y);
  y += 25;

  // ---- Details table ----
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  autoTable(doc, {
    startY: y,
    head: [['Item #', 'D.C. Official Code / Regulation Citation', 'Priority', 'Abate in', 'Fine for Infraction']],
    body: [
      [
        String(item.item_number),
        item.violation_code || '—',
        String(item.priority),
        item.abatement_deadline || '—',
        item.fine ? `$${item.fine.toLocaleString()}` : '—',
      ],
    ],
    margin: { left: MARGIN, right: MARGIN },
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [255, 255, 255], textColor: [0, 0, 0], lineWidth: 0.5, lineColor: [0, 0, 0], fontStyle: 'bold' },
    bodyStyles: { lineWidth: 0.5, lineColor: [0, 0, 0] },
    theme: 'grid',
  });
  y = (doc as any).lastAutoTable.finalY + 8;

  // ---- Violation description ----
  doc.setFontSize(9);
  if (item.violation_description) {
    doc.setFont('helvetica', 'bold');
    doc.text('Violation: ', MARGIN, y);
    const labelWidth = doc.getTextWidth('Violation: ');
    doc.setFont('helvetica', 'normal');
    const descLines = doc.splitTextToSize(item.violation_description, CONTENT_WIDTH - labelWidth);
    doc.text(descLines[0] || '', MARGIN + labelWidth, y);
    if (descLines.length > 1) {
      for (let i = 1; i < descLines.length; i++) {
        y += 12;
        doc.text(descLines[i], MARGIN, y);
      }
    }
    y += 14;
  }

  if (item.specific_location) {
    doc.setFont('helvetica', 'bold');
    doc.text('Location: ', MARGIN, y);
    const locLabelW = doc.getTextWidth('Location: ');
    doc.setFont('helvetica', 'normal');
    doc.text(item.specific_location, MARGIN + locLabelW, y);
    y += 14;
  }

  if (item.date_of_infraction) {
    doc.setFont('helvetica', 'bold');
    doc.text('Date of Infraction: ', MARGIN, y);
    const dateLabelW = doc.getTextWidth('Date of Infraction: ');
    doc.setFont('helvetica', 'normal');
    doc.text(item.date_of_infraction, MARGIN + dateLabelW, y);
    if (item.time_of_infraction) {
      const timeLabel = '    Time of Infraction: ';
      const dateEndX = MARGIN + dateLabelW + doc.getTextWidth(item.date_of_infraction);
      doc.setFont('helvetica', 'bold');
      doc.text(timeLabel, dateEndX, y);
      doc.setFont('helvetica', 'normal');
      doc.text(item.time_of_infraction, dateEndX + doc.getTextWidth(timeLabel), y);
    }
    y += 14;
  }

  y += 10;

  // ---- Explanation + Photo table ----
  const explanationText = item.task_description || 'Abatement completed.';

  // Draw the table border manually for the explanation + photos layout
  const tableX = MARGIN;
  const tableWidth = CONTENT_WIDTH;
  const colWidth = tableWidth / 2;

  // Explanation row
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setDrawColor(0);
  doc.setLineWidth(0.75);
  doc.rect(tableX, y, tableWidth, 18);
  doc.text(`Explanation: ${explanationText}`, tableX + 5, y + 13);
  y += 18;

  // Photo headers row
  const headerRowH = 16;
  doc.rect(tableX, y, colWidth, headerRowH);
  doc.rect(tableX + colWidth, y, colWidth, headerRowH);
  doc.setFontSize(10);
  doc.text('Violation Photo', tableX + colWidth / 2, y + 12, { align: 'center' });
  doc.text('Remediation Photo', tableX + colWidth + colWidth / 2, y + 12, { align: 'center' });
  y += headerRowH;

  // Photo cells
  const maxPhotoH = PAGE_HEIGHT - y - MARGIN - 10; // Remaining space on page
  const photoH = Math.min(maxPhotoH, 320); // Cap at ~4.4 inches

  doc.rect(tableX, y, colWidth, photoH);
  doc.rect(tableX + colWidth, y, colWidth, photoH);

  // Left: Violation/Inspector photo
  if (item.inspectorPhotoDataUrl) {
    await addFittedImage(doc, item.inspectorPhotoDataUrl, tableX + 4, y + 4, colWidth - 8, photoH - 8);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text('No violation photo available', tableX + colWidth / 2, y + photoH / 2, { align: 'center' });
    doc.setTextColor(0);
  }

  // Right: Remediation/After photo
  if (item.remediationPhotoDataUrl) {
    await addFittedImage(doc, item.remediationPhotoDataUrl, tableX + colWidth + 4, y + 4, colWidth - 8, photoH - 8);
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(150);
    doc.text('Remediation photo pending', tableX + colWidth + colWidth / 2, y + photoH / 2, { align: 'center' });
    doc.setTextColor(0);
  }
}

// ---------------------------------------------------------------------------
// Helper: Add an image fitted within a bounding box preserving aspect ratio
// ---------------------------------------------------------------------------
async function addFittedImage(
  doc: jsPDF,
  dataUrl: string,
  x: number,
  y: number,
  maxW: number,
  maxH: number,
) {
  try {
    const dims = await getImageDimensions(dataUrl);
    const aspect = dims.width / dims.height;

    let w = maxW;
    let h = w / aspect;

    if (h > maxH) {
      h = maxH;
      w = h * aspect;
    }

    // Center within bounding box
    const offsetX = x + (maxW - w) / 2;
    const offsetY = y + (maxH - h) / 2;

    doc.addImage(dataUrl, 'JPEG', offsetX, offsetY, w, h);
  } catch {
    // If image fails, just skip (placeholder text already drawn by caller)
  }
}
