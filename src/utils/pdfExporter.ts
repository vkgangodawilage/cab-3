/**
 * Client-side PDF quotation generator (jsPDF + jspdf-autotable).
 *
 * Imported dynamically from the BOM drawer so jspdf is code-split into its
 * own client chunk and never evaluated during SSR.
 */
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { BOMLine, BOMSummary } from "./costCalculator";
import { formatCurrency } from "./costCalculator";

export interface QuotationData {
  lines: BOMLine[];
  summary: BOMSummary;
  projectId: string;
  projectTitle?: string;
  companyName?: string;
  companyTagline?: string;
  date?: Date;
}

const BRAND = "#0f172a"; // slate-900
const BRAND_SOFT = "#312e81"; // indigo-900 (subtle band accent)
const ACCENT = "#0284c7"; // sky-600
const ALT_ROW = "#f1f5f9"; // slate-100
const BODY_TEXT = "#1e293b"; // slate-800
const MUTED = "#64748b"; // slate-500

export function generateQuotationPdf(data: QuotationData): void {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  /* ------------------------------ Header band ---------------------------- */
  doc.setFillColor(BRAND);
  doc.rect(0, 0, pageWidth, 24, "F");
  doc.setFillColor(BRAND_SOFT);
  doc.rect(0, 24, pageWidth, 1.2, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor("#ffffff");
  doc.text(data.companyName || "LUXE KITCHEN STUDIO", margin, 13);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor("#c7d2fe");
  doc.text(
    data.companyTagline || "Custom Cabinetry · Countertops · Installation",
    margin,
    18.5
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#e0f2fe");
  doc.text("QUOTATION", pageWidth - margin, 13, { align: "right" });

  /* ------------------------------- Title -------------------------------- */
  doc.setFont("helvetica", "bold");
  doc.setFontSize(19);
  doc.setTextColor(BRAND);
  doc.text(data.projectTitle || "3D Kitchen Remodel Quotation", margin, 39);

  doc.setDrawColor("#cbd5e1");
  doc.setLineWidth(0.3);
  doc.line(margin, 43.5, pageWidth - margin, 43.5);

  /* ------------------------------ Meta block ----------------------------- */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(MUTED);
  const now = data.date ?? new Date();
  const dateStr = now.toLocaleString("en-US", {
    dateStyle: "long",
    timeStyle: "short",
  });
  doc.text("Date:", margin, 51);
  doc.setTextColor(BODY_TEXT);
  doc.text(dateStr, margin + 12, 51);
  doc.setTextColor(MUTED);
  doc.text("Project ID:", margin, 56);
  doc.setTextColor(BODY_TEXT);
  doc.setFont("courier", "bold");
  doc.text(data.projectId, margin + 12, 56);

  /* --------------------------- Itemized table ---------------------------- */
  autoTable(doc, {
    startY: 62,
    margin: { left: margin, right: margin },
    head: [["#", "Item Description", "Dimensions / Qty", "Unit Price", "Total"]],
    body: data.lines.map((l, i) => [
      String(i + 1),
      `${l.category} — ${l.description}`,
      `${l.dimensions} (${l.unit})`,
      formatCurrency(l.unitPrice),
      formatCurrency(l.total),
    ]),
    theme: "grid",
    styles: {
      fontSize: 8.5,
      cellPadding: 2.6,
      textColor: BODY_TEXT,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
    },
    headStyles: {
      fillColor: BRAND,
      textColor: 255,
      fontStyle: "bold",
      fontSize: 9,
      halign: "left",
    },
    alternateRowStyles: { fillColor: ALT_ROW },
    columnStyles: {
      0: { cellWidth: 9, halign: "center" },
      1: { cellWidth: 92 },
      3: { halign: "right" },
      4: { halign: "right", fontStyle: "bold" },
    },
    didParseCell: (hData) => {
      if (hData.section === "body" && hData.column.index === 4) {
        hData.cell.styles.textColor = ACCENT;
      }
    },
  });

  /* ----------------------------- Summary block --------------------------- */
  const finalY = (
    doc as unknown as { lastAutoTable?: { finalY: number } }
  ).lastAutoTable?.finalY ?? 70;
  const right = pageWidth - margin;
  const sumLeft = right - 62;

  let y = finalY + 10;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(MUTED);
  doc.text("Subtotal", sumLeft, y);
  doc.text(formatCurrency(data.summary.subtotal), right, y, { align: "right" });
  y += 6;
  doc.text("Estimated Tax", sumLeft, y);
  doc.text(formatCurrency(data.summary.tax), right, y, { align: "right" });
  y += 6;
  doc.text("Installation / Labor", sumLeft, y);
  doc.text(formatCurrency(data.summary.labor), right, y, { align: "right" });
  y += 10;

  // Grand total box
  doc.setFillColor(BRAND);
  doc.roundedRect(sumLeft - 4, y - 6.5, right - sumLeft + 4, 11, 1.5, 1.5, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor("#ffffff");
  doc.text("GRAND TOTAL", sumLeft, y + 0.5);
  doc.text(formatCurrency(data.summary.grandTotal), right, y + 0.5, {
    align: "right",
  });

  /* ----------------------- Footer (all pages) ---------------------------- */
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor("#cbd5e1");
    doc.setLineWidth(0.2);
    doc.line(margin, h - 13, pageWidth - margin, h - 13);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(MUTED);
    doc.text(
      "Estimated prices subject to final site measurement.",
      margin,
      h - 8
    );
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, h - 8, {
      align: "right",
    });
    doc.text(data.projectId, margin, h - 8);
  }

  doc.save("kitchen-remodel-quotation.pdf");
}
