import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { Response } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import axios from "axios";
import { fixArabicText } from "../utils/fixArabic";

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE = "Africa/Cairo";

// ==========================================
// Types
// ==========================================
export interface ReportFilterMeta {
    branchLabel: string;
    branchLabelAr: string;
    dateRangeLabel: string;
    dateRangeLabelAr: string;
    statusLabel: string;
    statusLabelAr: string;
    paymentMethodLabel: string;
    paymentMethodLabelAr: string;
    orderTypeLabel: string;
    orderTypeLabelAr: string;
    orderSourceLabel: string;
    orderSourceLabelAr: string;
    zoneLabel?: string;
    zoneLabelAr?: string;
    cityLabel?: string;
    cityLabelAr?: string;
    discountLabel?: string;
    discountLabelAr?: string;
    searchLabel?: string;
}

export interface ReportRestaurantInfo {
    id: string;
    name: string;
    nameAr?: string | null;
    logo?: string | null;
    ownerPhone?: string | null;
    address?: string | null;
    addressAr?: string | null;
}

export interface ReportOrderItem {
    id: string;
    orderNumber: string;
    dailyOrderNumber?: number | null;
    customerName?: string | null;
    customerPhone?: string | null;
    branchId?: string | null;
    branchName?: string | null;
    branchNameAr?: string | null;
    orderType?: string | null;
    orderSource?: string | null;
    paymentMethod?: string | null;
    paymentMethodName?: string | null;
    paymentMethodNameAr?: string | null;
    subtotal?: string | number | null;
    deliveryFee?: string | number | null;
    serviceFee?: string | number | null;
    discountAmount?: string | number | null;
    totalAmount: string | number;
    status?: string | null;
    createdAt?: Date | string | null;
}

export interface GenerateOrdersReportPDFOptions {
    res: Response;
    restaurant: ReportRestaurantInfo;
    filters: ReportFilterMeta;
    orders: ReportOrderItem[];
    generatedBy?: string;
}

// ==========================================
// Label Helpers (AR & EN)
// ==========================================
export const ORDER_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
    delivery: { en: "Delivery", ar: "توصيل" },
    takeaway: { en: "Takeaway", ar: "استلام" },
    dine_in: { en: "Dine-in", ar: "صالة" },
};

export const ORDER_STATUS_LABELS: Record<string, { en: string; ar: string; color: string }> = {
    pending: { en: "Pending", ar: "معلق", color: "#64748B" },
    accepted: { en: "Accepted", ar: "مقبول", color: "#0284C7" },
    preparing: { en: "Preparing", ar: "قيد التحضير", color: "#D97706" },
    out_for_delivery: { en: "Out for Delivery", ar: "جاري التوصيل", color: "#7C3AED" },
    delivered: { en: "Delivered", ar: "تم التسليم", color: "#16A34A" },
    cancelled: { en: "Cancelled", ar: "ملغي", color: "#DC2626" },
    refund: { en: "Refunded", ar: "مسترجع", color: "#EA580C" },
    failed: { en: "Failed", ar: "فشل", color: "#991B1B" },
};

export const ORDER_SOURCE_LABELS: Record<string, { en: string; ar: string }> = {
    online_order_web: { en: "Web", ar: "الموقع" },
    online_order_app: { en: "Mobile App", ar: "التطبيق" },
    food_aggregator: { en: "Aggregator", ar: "تطبيق توصيل" },
    my_keeto: { en: "My Keeto", ar: "ماي كيتو" },
    pos: { en: "POS", ar: "كاشير" },
};

function formatCurrency(amount: number): string {
    return `${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} EGP`;
}

// Try reading local or remote logo image
async function fetchLogoBuffer(logoPathOrUrl?: string | null): Promise<Buffer | null> {
    if (!logoPathOrUrl) return null;
    try {
        let relative = logoPathOrUrl;
        if (relative.includes("/uploads/")) {
            relative = "uploads/" + relative.split("/uploads/")[1];
        }
        const fullLocalPath = path.isAbsolute(relative) ? relative : path.join(process.cwd(), relative);
        if (fs.existsSync(fullLocalPath)) {
            return fs.readFileSync(fullLocalPath);
        }

        if (logoPathOrUrl.startsWith("http://") || logoPathOrUrl.startsWith("https://")) {
            const resp = await axios.get(logoPathOrUrl, { responseType: "arraybuffer", timeout: 2500 });
            if (resp.status === 200 && resp.data) {
                return Buffer.from(resp.data);
            }
        }
    } catch {
        // Fallback silently if logo cannot be loaded
    }
    return null;
}

// ==========================================
// Main PDF Generator Function
// ==========================================
export async function buildOrdersReportPDF(options: GenerateOrdersReportPDFOptions): Promise<void> {
    const { res, restaurant, filters, orders, generatedBy = "Admin" } = options;

    const logoBuffer = await fetchLogoBuffer(restaurant.logo);

    const doc = new PDFDocument({
        size: "A4",
        margin: 35,
        bufferPages: true,
        info: {
            Title: `Orders Report - ${restaurant.name}`,
            Author: "Keeto Restaurant Management System",
            Subject: "Orders & Sales Invoices Comprehensive Report",
        },
    });

    // ─── Register Fonts ────────────────────────
    const cairoRegular = path.join(process.cwd(), "assets", "fonts", "Cairo-Regular.ttf");
    const cairoBold = path.join(process.cwd(), "assets", "fonts", "static", "Cairo-Bold.ttf");
    const cairoSemiBold = path.join(process.cwd(), "assets", "fonts", "static", "Cairo-SemiBold.ttf");

    if (fs.existsSync(cairoRegular)) doc.registerFont("Cairo", cairoRegular);
    if (fs.existsSync(cairoBold)) doc.registerFont("Cairo-Bold", cairoBold);
    else if (fs.existsSync(cairoRegular)) doc.registerFont("Cairo-Bold", cairoRegular);

    if (fs.existsSync(cairoSemiBold)) doc.registerFont("Cairo-SemiBold", cairoSemiBold);
    else if (fs.existsSync(cairoBold)) doc.registerFont("Cairo-SemiBold", cairoBold);
    else if (fs.existsSync(cairoRegular)) doc.registerFont("Cairo-SemiBold", cairoRegular);

    doc.font("Cairo");

    const filename = `Orders_Report_${dayjs().tz(TIMEZONE).format("YYYYMMDD_HHmmss")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    doc.pipe(res);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const margin = 35;
    const contentWidth = pageWidth - margin * 2; // 525.28 pt

    // ─── Calculate Aggregates ──────────────────
    let grandTotal = 0;
    let grandSubtotal = 0;
    let grandDeliveryFee = 0;
    let grandServiceFee = 0;
    let grandDiscount = 0;

    const branchMap = new Map<string, { name: string; nameAr?: string; count: number; total: number }>();
    const pmMap = new Map<string, { name: string; nameAr?: string; count: number; total: number }>();
    const typeMap = new Map<string, { count: number; total: number }>();
    const statusMap = new Map<string, { count: number; total: number }>();

    for (const ord of orders) {
        const total = parseFloat(String(ord.totalAmount || 0)) || 0;
        const sub = parseFloat(String(ord.subtotal || 0)) || 0;
        const del = parseFloat(String(ord.deliveryFee || 0)) || 0;
        const srv = parseFloat(String(ord.serviceFee || 0)) || 0;
        const disc = parseFloat(String(ord.discountAmount || 0)) || 0;

        grandTotal += total;
        grandSubtotal += sub;
        grandDeliveryFee += del;
        grandServiceFee += srv;
        grandDiscount += disc;

        // Branch breakdown
        const bKey = ord.branchId || "unknown";
        const bName = ord.branchName || "Main Branch";
        const bNameAr = ord.branchNameAr || bName;
        const bEntry = branchMap.get(bKey) || { name: bName, nameAr: bNameAr, count: 0, total: 0 };
        bEntry.count += 1;
        bEntry.total += total;
        branchMap.set(bKey, bEntry);

        // Payment Method breakdown
        const pmKey = ord.paymentMethodName || ord.paymentMethod || "Cash";
        const pmNameAr = ord.paymentMethodNameAr || pmKey;
        const pmEntry = pmMap.get(pmKey) || { name: pmKey, nameAr: pmNameAr, count: 0, total: 0 };
        pmEntry.count += 1;
        pmEntry.total += total;
        pmMap.set(pmKey, pmEntry);

        // Order Type breakdown
        const typeKey = ord.orderType || "delivery";
        const typeEntry = typeMap.get(typeKey) || { count: 0, total: 0 };
        typeEntry.count += 1;
        typeEntry.total += total;
        typeMap.set(typeKey, typeEntry);

        // Status breakdown
        const stKey = ord.status || "pending";
        const stEntry = statusMap.get(stKey) || { count: 0, total: 0 };
        stEntry.count += 1;
        stEntry.total += total;
        statusMap.set(stKey, stEntry);
    }

    const totalOrdersCount = orders.length;
    const avgOrderValue = totalOrdersCount > 0 ? grandTotal / totalOrdersCount : 0;

    // ==========================================
    // Page 1 Header
    // ==========================================
    let currentY = margin;

    // Header Background Accent Card
    doc.roundedRect(margin, currentY, contentWidth, 75, 8).fill("#0F172A");

    // Logo (if available)
    let textStartX = margin + 14;
    if (logoBuffer) {
        try {
            doc.save();
            doc.roundedRect(margin + 12, currentY + 12, 50, 50, 6).clip();
            doc.image(logoBuffer, margin + 12, currentY + 12, { fit: [50, 50], align: "center", valign: "center" });
            doc.restore();
            textStartX = margin + 72;
        } catch {
            textStartX = margin + 14;
        }
    }

    // Restaurant Name in Header (Left/Center)
    doc.fillColor("#FFFFFF");
    doc.font("Cairo-Bold").fontSize(14);
    const restNameDisplay = restaurant.nameAr
        ? `${restaurant.name} | ${fixArabicText(restaurant.nameAr)}`
        : restaurant.name;
    doc.text(restNameDisplay, textStartX, currentY + 14, { width: 260 });

    doc.font("Cairo").fontSize(9).fillColor("#94A3B8");
    const subHeader = restaurant.ownerPhone ? `Tel: ${restaurant.ownerPhone}` : "Keeto Restaurant Partner";
    doc.text(subHeader, textStartX, currentY + 34);

    const addressHeader = restaurant.addressAr ? fixArabicText(restaurant.addressAr) : restaurant.address || "";
    if (addressHeader) {
        doc.text(addressHeader, textStartX, currentY + 48, { width: 260, lineBreak: false });
    }

    // Right side: Report Title & Date
    const rightColX = margin + contentWidth - 210;
    doc.font("Cairo-Bold").fontSize(12).fillColor("#F8FAFC");
    doc.text(fixArabicText("تقرير طلبات وفواتير المطعم"), rightColX, currentY + 14, { width: 200, align: "right" });
    doc.font("Cairo-SemiBold").fontSize(10).fillColor("#38BDF8");
    doc.text("Orders & Invoices Report", rightColX, currentY + 30, { width: 200, align: "right" });

    doc.font("Cairo").fontSize(8).fillColor("#CBD5E1");
    const nowCairoStr = dayjs().tz(TIMEZONE).format("YYYY-MM-DD hh:mm A");
    doc.text(`Generated: ${nowCairoStr}`, rightColX, currentY + 46, { width: 200, align: "right" });
    doc.text(`By: ${generatedBy}`, rightColX, currentY + 58, { width: 200, align: "right" });

    currentY += 85;

    // ==========================================
    // Section 2: Applied Filter Criteria Card
    // ==========================================
    doc.font("Cairo-Bold").fontSize(11).fillColor("#0F172A");
    doc.text(fixArabicText("معايير وفلاتر البحث المطبقة | Applied Filter Parameters"), margin, currentY);
    currentY += 16;

    // Filter box
    const filterBoxY = currentY;
    const filterBoxHeight = 82;
    doc.roundedRect(margin, filterBoxY, contentWidth, filterBoxHeight, 6)
        .fillAndStroke("#F8FAFC", "#E2E8F0");

    // Grid 2 Columns for filters
    const col1X = margin + 12;
    const col2X = margin + (contentWidth / 2) + 6;
    const colWidth = (contentWidth / 2) - 18;

    const renderFilterItem = (x: number, y: number, labelAr: string, labelEn: string, valAr: string, valEn: string) => {
        doc.font("Cairo-SemiBold").fontSize(8).fillColor("#64748B");
        doc.text(`${fixArabicText(labelAr)} (${labelEn}):`, x, y, { width: colWidth });
        doc.font("Cairo-Bold").fontSize(8.5).fillColor("#0F172A");
        const valText = valAr && valAr !== valEn
            ? `${valEn} | ${fixArabicText(valAr)}`
            : valEn;
        doc.text(valText, x, y + 10, { width: colWidth, lineBreak: false });
    };

    // Row 1
    renderFilterItem(col1X, filterBoxY + 8, "الفروع", "Branches", filters.branchLabelAr, filters.branchLabel);
    renderFilterItem(col2X, filterBoxY + 8, "الفترة الزمنية", "Date Range", filters.dateRangeLabelAr, filters.dateRangeLabel);

    // Row 2
    renderFilterItem(col1X, filterBoxY + 32, "حالة الطلب", "Order Status", filters.statusLabelAr, filters.statusLabel);
    renderFilterItem(col2X, filterBoxY + 32, "طرق الدفع", "Payment Methods", filters.paymentMethodLabelAr, filters.paymentMethodLabel);

    // Row 3
    renderFilterItem(col1X, filterBoxY + 56, "نوع الطلب", "Order Types", filters.orderTypeLabelAr, filters.orderTypeLabel);
    renderFilterItem(col2X, filterBoxY + 56, "مصدر الطلب", "Order Source", filters.orderSourceLabelAr, filters.orderSourceLabel);

    currentY += filterBoxHeight + 12;

    // ==========================================
    // Section 3: Executive Financial KPI Cards
    // ==========================================
    doc.font("Cairo-Bold").fontSize(11).fillColor("#0F172A");
    doc.text(fixArabicText("ملخص المؤشرات الإجمالية للتقرير | Key Performance Indicators"), margin, currentY);
    currentY += 16;

    const kpiCount = 4;
    const kpiGap = 8;
    const kpiWidth = (contentWidth - (kpiCount - 1) * kpiGap) / kpiCount;
    const kpiHeight = 52;

    const kpiList = [
        {
            titleAr: "إجمالي الطلبات",
            titleEn: "Total Orders",
            val: `${totalOrdersCount.toLocaleString("en-US")} Orders`,
            accent: "#2563EB",
            bg: "#EFF6FF",
        },
        {
            titleAr: "إجمالي المبيعات",
            titleEn: "Total Revenue",
            val: formatCurrency(grandTotal),
            accent: "#16A34A",
            bg: "#F0FDF4",
        },
        {
            titleAr: "متوسط قيمة الطلب",
            titleEn: "Avg. Order Value",
            val: formatCurrency(avgOrderValue),
            accent: "#7C3AED",
            bg: "#F5F3FF",
        },
        {
            titleAr: "الخدمة والتوصيل",
            titleEn: "Fees & Delivery",
            val: formatCurrency(grandDeliveryFee + grandServiceFee),
            accent: "#EA580C",
            bg: "#FFF7ED",
        },
    ];

    for (let i = 0; i < kpiList.length; i++) {
        const kpi = kpiList[i];
        const kpiX = margin + i * (kpiWidth + kpiGap);

        doc.roundedRect(kpiX, currentY, kpiWidth, kpiHeight, 6)
            .fillAndStroke(kpi.bg, "#E2E8F0");

        // Accent strip on left
        doc.roundedRect(kpiX, currentY, 4, kpiHeight, 2).fill(kpi.accent);

        doc.font("Cairo-SemiBold").fontSize(7.5).fillColor("#475569");
        doc.text(`${fixArabicText(kpi.titleAr)} | ${kpi.titleEn}`, kpiX + 8, currentY + 6, { width: kpiWidth - 12 });

        doc.font("Cairo-Bold").fontSize(10.5).fillColor("#0F172A");
        doc.text(kpi.val, kpiX + 8, currentY + 24, { width: kpiWidth - 12 });
    }

    currentY += kpiHeight + 14;

    // ==========================================
    // Section 4: Breakdown Tables (Branches & Payment Methods)
    // ==========================================
    doc.font("Cairo-Bold").fontSize(11).fillColor("#0F172A");
    doc.text(fixArabicText("توزيع نتائج الفلترة (الفروع وطرق الدفع) | Detailed Breakdown"), margin, currentY);
    currentY += 16;

    const breakdownBoxWidth = (contentWidth - 10) / 2;
    const startBreakdownY = currentY;

    // ── Table 1: Branches Breakdown (Left) ──────────
    const drawTableBox = (
        x: number,
        y: number,
        width: number,
        titleAr: string,
        titleEn: string,
        headers: [string, string, string],
        rows: Array<[string, number, number]>
    ) => {
        let boxY = y;
        // Table Header Banner
        doc.roundedRect(x, boxY, width, 20, 4).fill("#1E293B");
        doc.font("Cairo-Bold").fontSize(8.5).fillColor("#FFFFFF");
        doc.text(`${fixArabicText(titleAr)} | ${titleEn}`, x + 6, boxY + 5, { width: width - 12 });
        boxY += 20;

        // Sub-header columns
        doc.rect(x, boxY, width, 16).fill("#F1F5F9");
        doc.font("Cairo-SemiBold").fontSize(7.5).fillColor("#475569");
        doc.text(headers[0], x + 6, boxY + 4, { width: width * 0.44 });
        doc.text(headers[1], x + width * 0.45, boxY + 4, { width: width * 0.22, align: "center" });
        doc.text(headers[2], x + width * 0.68, boxY + 4, { width: width * 0.30, align: "right" });
        boxY += 16;

        let totalOrders = 0;
        let totalVal = 0;

        const maxRows = Math.min(rows.length, 5); // top 5 rows
        for (let r = 0; r < maxRows; r++) {
            const [label, count, val] = rows[r];
            totalOrders += count;
            totalVal += val;

            const rowBg = r % 2 === 0 ? "#FFFFFF" : "#F8FAFC";
            doc.rect(x, boxY, width, 16).fill(rowBg);

            doc.font("Cairo").fontSize(7.5).fillColor("#1E293B");
            doc.text(fixArabicText(label), x + 6, boxY + 4, { width: width * 0.44, lineBreak: false });
            doc.font("Cairo").fontSize(7.5).fillColor("#0284C7");
            doc.text(`${count}`, x + width * 0.45, boxY + 4, { width: width * 0.22, align: "center" });
            doc.font("Cairo-SemiBold").fontSize(7.5).fillColor("#0F172A");
            doc.text(formatCurrency(val), x + width * 0.68, boxY + 4, { width: width * 0.30, align: "right" });
            boxY += 16;
        }

        // Total Row
        doc.rect(x, boxY, width, 16).fill("#E2E8F0");
        doc.font("Cairo-Bold").fontSize(7.5).fillColor("#0F172A");
        doc.text(fixArabicText("الإجمالي | Total"), x + 6, boxY + 4, { width: width * 0.44 });
        doc.text(`${totalOrders}`, x + width * 0.45, boxY + 4, { width: width * 0.22, align: "center" });
        doc.text(formatCurrency(totalVal), x + width * 0.68, boxY + 4, { width: width * 0.30, align: "right" });
        boxY += 16;

        // Draw outer border
        doc.roundedRect(x, y, width, boxY - y, 4).stroke("#CBD5E1");

        return boxY - y;
    };

    // Prepare Branch Rows
    const branchRows: Array<[string, number, number]> = Array.from(branchMap.values())
        .sort((a, b) => b.total - a.total)
        .map((b) => [b.nameAr || b.name, b.count, b.total]);

    // Prepare Payment Method Rows
    const pmRows: Array<[string, number, number]> = Array.from(pmMap.values())
        .sort((a, b) => b.total - a.total)
        .map((p) => [p.nameAr || p.name, p.count, p.total]);

    const h1 = drawTableBox(
        margin,
        startBreakdownY,
        breakdownBoxWidth,
        "توزيع الفروع",
        "Branches",
        ["Branch | الفرع", "Orders | عدد", "Total | القيمة"],
        branchRows.length > 0 ? branchRows : [["All Branches", 0, 0]]
    );

    const h2 = drawTableBox(
        margin + breakdownBoxWidth + 10,
        startBreakdownY,
        breakdownBoxWidth,
        "طرق الدفع",
        "Payment Methods",
        ["Payment | وسيلة الدفع", "Orders | عدد", "Total | القيمة"],
        pmRows.length > 0 ? pmRows : [["Cash", 0, 0]]
    );

    currentY = startBreakdownY + Math.max(h1, h2) + 14;

    // Small summary strips for Types and Statuses (if space allows on Page 1)
    const stripsBoxY = currentY;
    const stripWidth = (contentWidth - 10) / 2;

    const typeSummaryText = Array.from(typeMap.entries())
        .map(([k, v]) => `${ORDER_TYPE_LABELS[k]?.ar || k}: ${v.count} (${formatCurrency(v.total)})`)
        .join(" | ");

    const statusSummaryText = Array.from(statusMap.entries())
        .slice(0, 4)
        .map(([k, v]) => `${ORDER_STATUS_LABELS[k]?.ar || k}: ${v.count}`)
        .join(" | ");

    doc.roundedRect(margin, stripsBoxY, stripWidth, 24, 4).fillAndStroke("#F1F5F9", "#E2E8F0");
    doc.font("Cairo-Bold").fontSize(7.5).fillColor("#334155");
    doc.text(fixArabicText(`الأنواع: ${typeSummaryText}`), margin + 6, stripsBoxY + 6, {
        width: stripWidth - 12,
        lineBreak: false,
    });

    doc.roundedRect(margin + stripWidth + 10, stripsBoxY, stripWidth, 24, 4).fillAndStroke("#F1F5F9", "#E2E8F0");
    doc.text(fixArabicText(`الحالات: ${statusSummaryText}`), margin + stripWidth + 16, stripsBoxY + 6, {
        width: stripWidth - 12,
        lineBreak: false,
    });

    currentY += 34;

    // ==========================================
    // Section 5: Orders Detail Table
    // ==========================================
    // If we're too close to bottom of page 1, add a new page
    if (currentY > 640) {
        doc.addPage();
        currentY = margin;
    }

    doc.font("Cairo-Bold").fontSize(11).fillColor("#0F172A");
    doc.text(
        fixArabicText(`قائمة الطلبات المشمولة بالتقرير (${totalOrdersCount} طلب) | Filtered Orders List`),
        margin,
        currentY
    );
    currentY += 16;

    // Table Column Widths (Sum = 525 pt)
    const colWidths = {
        number: 65,
        date: 80,
        branch: 75,
        customer: 95,
        type: 55,
        payment: 55,
        status: 50,
        total: 50,
    };

    const drawTableHeader = (y: number) => {
        doc.rect(margin, y, contentWidth, 18).fill("#0F172A");
        doc.font("Cairo-Bold").fontSize(7.5).fillColor("#FFFFFF");

        let curX = margin;
        doc.text("# Order", curX + 4, y + 4, { width: colWidths.number });
        curX += colWidths.number;

        doc.text("Date & Time", curX + 2, y + 4, { width: colWidths.date });
        curX += colWidths.date;

        doc.text("Branch | الفرع", curX + 2, y + 4, { width: colWidths.branch });
        curX += colWidths.branch;

        doc.text("Client | العميل", curX + 2, y + 4, { width: colWidths.customer });
        curX += colWidths.customer;

        doc.text("Type | النوع", curX + 2, y + 4, { width: colWidths.type });
        curX += colWidths.type;

        doc.text("Payment | دفع", curX + 2, y + 4, { width: colWidths.payment });
        curX += colWidths.payment;

        doc.text("Status | حالة", curX + 2, y + 4, { width: colWidths.status });
        curX += colWidths.status;

        doc.text("Total | إجمالي", curX + 2, y + 4, { width: colWidths.total, align: "right" });
    };

    drawTableHeader(currentY);
    currentY += 18;

    const rowHeight = 18;
    for (let idx = 0; idx < orders.length; idx++) {
        const ord = orders[idx];

        // Check page overflow
        if (currentY + rowHeight > pageHeight - 55) {
            doc.addPage();
            currentY = margin;
            drawTableHeader(currentY);
            currentY += 18;
        }

        const isEven = idx % 2 === 0;
        doc.rect(margin, currentY, contentWidth, rowHeight).fill(isEven ? "#FFFFFF" : "#F8FAFC");

        let curX = margin;

        // 1. Order Number
        doc.font("Cairo-Bold").fontSize(7.5).fillColor("#2563EB");
        const orderDisplayNo = ord.dailyOrderNumber ? `#${ord.dailyOrderNumber}` : `#${ord.orderNumber.slice(-6)}`;
        doc.text(orderDisplayNo, curX + 4, currentY + 4, { width: colWidths.number, lineBreak: false });
        curX += colWidths.number;

        // 2. Date & Time (Cairo Timezone)
        doc.font("Cairo").fontSize(7).fillColor("#64748B");
        const dateStr = ord.createdAt
            ? dayjs(ord.createdAt).tz(TIMEZONE).format("YYYY-MM-DD HH:mm")
            : "-";
        doc.text(dateStr, curX + 2, currentY + 4, { width: colWidths.date, lineBreak: false });
        curX += colWidths.date;

        // 3. Branch
        doc.font("Cairo").fontSize(7).fillColor("#1E293B");
        const branchTxt = ord.branchNameAr || ord.branchName || "Main";
        doc.text(fixArabicText(branchTxt), curX + 2, currentY + 4, { width: colWidths.branch - 4, lineBreak: false });
        curX += colWidths.branch;

        // 4. Customer
        doc.font("Cairo").fontSize(7).fillColor("#0F172A");
        const custName = ord.customerName ? ord.customerName.slice(0, 18) : "Guest";
        doc.text(fixArabicText(custName), curX + 2, currentY + 4, { width: colWidths.customer - 4, lineBreak: false });
        curX += colWidths.customer;

        // 5. Order Type
        doc.font("Cairo").fontSize(7).fillColor("#475569");
        const typeLabel = ORDER_TYPE_LABELS[ord.orderType || ""]?.ar || ord.orderType || "-";
        doc.text(fixArabicText(typeLabel), curX + 2, currentY + 4, { width: colWidths.type, lineBreak: false });
        curX += colWidths.type;

        // 6. Payment Method
        doc.font("Cairo").fontSize(7).fillColor("#475569");
        const pmLabel = ord.paymentMethodNameAr || ord.paymentMethodName || ord.paymentMethod || "Cash";
        doc.text(fixArabicText(pmLabel), curX + 2, currentY + 4, { width: colWidths.payment, lineBreak: false });
        curX += colWidths.payment;

        // 7. Status
        const stInfo = ORDER_STATUS_LABELS[ord.status || ""] || { ar: ord.status || "-", color: "#0F172A" };
        doc.font("Cairo-SemiBold").fontSize(7).fillColor(stInfo.color);
        doc.text(fixArabicText(stInfo.ar), curX + 2, currentY + 4, { width: colWidths.status, lineBreak: false });
        curX += colWidths.status;

        // 8. Total Amount
        doc.font("Cairo-Bold").fontSize(7.5).fillColor("#0F172A");
        const tot = parseFloat(String(ord.totalAmount || 0)) || 0;
        doc.text(`${tot.toFixed(2)}`, curX + 2, currentY + 4, { width: colWidths.total - 6, align: "right" });

        // Thin separator line
        doc.moveTo(margin, currentY + rowHeight).lineTo(margin + contentWidth, currentY + rowHeight).stroke("#F1F5F9");

        currentY += rowHeight;
    }

    // ── Table Summary Footer ──────────────────
    if (currentY + 22 > pageHeight - 55) {
        doc.addPage();
        currentY = margin;
    }

    doc.rect(margin, currentY, contentWidth, 22).fill("#0F172A");
    doc.font("Cairo-Bold").fontSize(8.5).fillColor("#FFFFFF");
    doc.text(fixArabicText(`الإجمالي النهائي (${totalOrdersCount} طلب)`), margin + 8, currentY + 6);
    doc.text(`Total: ${formatCurrency(grandTotal)}`, margin + contentWidth - 160, currentY + 6, {
        width: 150,
        align: "right",
    });

    // ==========================================
    // Footers & Page Numbers on all pages
    // ==========================================
    const range = doc.bufferedPageRange();
    for (let p = range.start; p < range.start + range.count; p++) {
        doc.switchToPage(p);

        const footerY = pageHeight - 32;

        // Top thin rule
        doc.moveTo(margin, footerY - 4).lineTo(margin + contentWidth, footerY - 4).stroke("#E2E8F0");

        // Footer Content
        doc.font("Cairo").fontSize(7.5).fillColor("#64748B");
        doc.text(
            fixArabicText("نظام كيتو لإدارة المطاعم | Keeto Restaurant Management System"),
            margin,
            footerY,
            { width: 250 }
        );

        const pageStr = `صفحة ${p + 1} من ${range.count} | Page ${p + 1} of ${range.count}`;
        doc.text(fixArabicText(pageStr), margin + (contentWidth / 2) - 60, footerY, {
            width: 120,
            align: "center",
        });

        doc.text(
            `${dayjs().tz(TIMEZONE).format("YYYY-MM-DD HH:mm")}`,
            margin + contentWidth - 100,
            footerY,
            { width: 100, align: "right" }
        );
    }

    doc.end();
}

