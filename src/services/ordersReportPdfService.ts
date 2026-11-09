import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { Response } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
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

export const ORDER_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
    delivery: { en: "Delivery", ar: "توصيل" },
    takeaway: { en: "Takeaway", ar: "استلام" },
    dine_in: { en: "Dine-in", ar: "صالة" },
};

export const ORDER_STATUS_LABELS: Record<string, { en: string; ar: string }> = {
    pending: { en: "Pending", ar: "معلق" },
    accepted: { en: "Accepted", ar: "مقبول" },
    preparing: { en: "Preparing", ar: "قيد التحضير" },
    out_for_delivery: { en: "Out for Delivery", ar: "جاري التوصيل" },
    delivered: { en: "Delivered", ar: "تم التسليم" },
    cancelled: { en: "Cancelled", ar: "ملغي" },
    refund: { en: "Refunded", ar: "مسترجع" },
    failed: { en: "Failed", ar: "فشل" },
};

export const ORDER_SOURCE_LABELS: Record<string, { en: string; ar: string }> = {
    online_order_web: { en: "Web", ar: "الموقع" },
    online_order_app: { en: "Mobile App", ar: "التطبيق" },
    food_aggregator: { en: "Aggregator", ar: "تطبيق توصيل" },
    my_keeto: { en: "My Keeto", ar: "ماي كيتو" },
    pos: { en: "POS", ar: "كاشير" },
};

function formatNum(val: number): string {
    return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface BranchAggregate {
    id: string;
    name: string;
    nameAr: string;
    totalOrders: number;
    totalAmount: number;
    subtotal: number;
    deliveryFee: number;
    serviceFee: number;
    discountAmount: number;
    paymentMethods: Map<string, { name: string; nameAr: string; count: number; total: number }>;
    orderTypes: Map<string, { count: number; total: number }>;
}

// ==========================================
// Main Receipt Generator Function
// ==========================================
export async function buildOrdersReportPDF(options: GenerateOrdersReportPDFOptions): Promise<void> {
    const { res, restaurant, filters, orders, generatedBy = "Admin" } = options;

    // ─── 1. Compute Overall & Per-Branch Aggregates ───────────
    let grandTotal = 0;
    let grandSubtotal = 0;
    let grandDeliveryFee = 0;
    let grandServiceFee = 0;
    let grandDiscount = 0;

    const overallPaymentMethods = new Map<string, { name: string; nameAr: string; count: number; total: number }>();
    const overallOrderTypes = new Map<string, { count: number; total: number }>();
    const branchMap = new Map<string, BranchAggregate>();

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

        // Payment Method key & labels
        const pmKey = ord.paymentMethodName || ord.paymentMethod || "Cash";
        const pmNameAr = ord.paymentMethodNameAr || pmKey;

        // Overall Payment Methods
        const overallPm = overallPaymentMethods.get(pmKey) || { name: pmKey, nameAr: pmNameAr, count: 0, total: 0 };
        overallPm.count += 1;
        overallPm.total += total;
        overallPaymentMethods.set(pmKey, overallPm);

        // Overall Order Types
        const typeKey = ord.orderType || "delivery";
        const overallType = overallOrderTypes.get(typeKey) || { count: 0, total: 0 };
        overallType.count += 1;
        overallType.total += total;
        overallOrderTypes.set(typeKey, overallType);

        // Branch-level Aggregation
        const bKey = ord.branchId || "main_branch";
        const bName = ord.branchName || "Main Branch";
        const bNameAr = ord.branchNameAr || bName;

        let bEntry = branchMap.get(bKey);
        if (!bEntry) {
            bEntry = {
                id: bKey,
                name: bName,
                nameAr: bNameAr,
                totalOrders: 0,
                totalAmount: 0,
                subtotal: 0,
                deliveryFee: 0,
                serviceFee: 0,
                discountAmount: 0,
                paymentMethods: new Map(),
                orderTypes: new Map(),
            };
            branchMap.set(bKey, bEntry);
        }

        bEntry.totalOrders += 1;
        bEntry.totalAmount += total;
        bEntry.subtotal += sub;
        bEntry.deliveryFee += del;
        bEntry.serviceFee += srv;
        bEntry.discountAmount += disc;

        // Branch PM
        const bPm = bEntry.paymentMethods.get(pmKey) || { name: pmKey, nameAr: pmNameAr, count: 0, total: 0 };
        bPm.count += 1;
        bPm.total += total;
        bEntry.paymentMethods.set(pmKey, bPm);

        // Branch Type
        const bType = bEntry.orderTypes.get(typeKey) || { count: 0, total: 0 };
        bType.count += 1;
        bType.total += total;
        bEntry.orderTypes.set(typeKey, bType);
    }

    const totalOrdersCount = orders.length;
    const branchesList = Array.from(branchMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    // ─── 2. Calculate Dynamic Receipt Height ────────────────────
    // Standard thermal receipt width: 260 pt (80mm)
    // Height adapts to content so it renders as one continuous POS roll receipt
    let estimatedHeight = 360; // Header + Metadata + Overall Totals + Footer
    estimatedHeight += overallPaymentMethods.size * 16;
    estimatedHeight += overallOrderTypes.size * 16;

    for (const b of branchesList) {
        estimatedHeight += 70; // Branch header & totals
        estimatedHeight += b.paymentMethods.size * 16;
        estimatedHeight += b.orderTypes.size * 16;
    }

    const receiptWidth = 260;
    const receiptHeight = Math.max(500, estimatedHeight);
    const margin = 12;
    const printableWidth = receiptWidth - margin * 2; // 236 pt

    const doc = new PDFDocument({
        margin,
        size: [receiptWidth, receiptHeight],
        info: {
            Title: `Orders Receipt - ${restaurant.name}`,
            Author: "Keeto POS System",
        },
    });

    // ─── Register Fonts ─────────────────────────────────────────
    const cairoRegular = path.join(process.cwd(), "assets", "fonts", "Cairo-Regular.ttf");
    const cairoBold = path.join(process.cwd(), "assets", "fonts", "static", "Cairo-Bold.ttf");

    if (fs.existsSync(cairoRegular)) doc.registerFont("Cairo", cairoRegular);
    if (fs.existsSync(cairoBold)) doc.registerFont("Cairo-Bold", cairoBold);
    else if (fs.existsSync(cairoRegular)) doc.registerFont("Cairo-Bold", cairoRegular);

    doc.font("Cairo");

    const filename = `Receipt_Report_${dayjs().tz(TIMEZONE).format("YYYYMMDD_HHmmss")}.pdf`;
    if (typeof res?.setHeader === "function") {
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", `inline; filename="${filename}"`);
    }

    doc.pipe(res);

    // ─── Drawing Helpers ────────────────────────────────────────
    const drawDashedLine = () => {
        doc.moveDown(0.35);
        doc.moveTo(margin, doc.y).lineTo(receiptWidth - margin, doc.y).dash(2, { space: 2 }).strokeColor("#000000").stroke();
        doc.undash();
        doc.moveDown(0.45);
    };

    const drawSolidLine = () => {
        doc.moveDown(0.35);
        doc.moveTo(margin, doc.y).lineTo(receiptWidth - margin, doc.y).strokeColor("#000000").stroke();
        doc.moveDown(0.45);
    };

    const drawReceiptRow = (label: string, value: string, isBold = false, fontSize = 9) => {
        const curY = doc.y;
        doc.font(isBold ? "Cairo-Bold" : "Cairo").fontSize(fontSize).fillColor("#000000");
        doc.text(label, margin, curY, { width: 135, align: "left" });
        doc.text(value, margin + 130, curY, { width: printableWidth - 130, align: "right" });
        const h1 = doc.heightOfString(label, { width: 135 });
        const h2 = doc.heightOfString(value, { width: printableWidth - 130 });
        doc.y = curY + Math.max(h1, h2) + 2.5;
    };

    // ==========================================
    // 1. Restaurant Header (Like user's receipt)
    // ==========================================
    doc.moveDown(0.4);
    doc.font("Cairo-Bold").fontSize(15).fillColor("#000000");
    doc.text(restaurant.name, { align: "center" });

    if (restaurant.nameAr && restaurant.nameAr !== restaurant.name) {
        doc.fontSize(12);
        doc.text(fixArabicText(restaurant.nameAr), { align: "center" });
    }

    doc.font("Cairo").fontSize(9).fillColor("#444444");
    if (restaurant.ownerPhone) {
        doc.text(`Tel: ${restaurant.ownerPhone}`, { align: "center" });
    }

    doc.font("Cairo-Bold").fontSize(10.5).fillColor("#000000");
    doc.moveDown(0.2);
    doc.text(fixArabicText("تقرير الفواتير والمبيعات"), { align: "center" });
    doc.fontSize(8.5).font("Cairo");
    doc.text("SALES & ORDERS REPORT", { align: "center" });

    drawDashedLine();

    // ==========================================
    // 2. Receipt Metadata & Filter Details
    // ==========================================
    const nowCairo = dayjs().tz(TIMEZONE);
    drawReceiptRow("Date:", nowCairo.format("YYYY-MM-DD"));
    drawReceiptRow("Time:", nowCairo.format("hh:mm:ss A"));
    drawReceiptRow("Generated By:", generatedBy);

    // Filters specified by user
    drawReceiptRow(
        "Branch | الفرع:",
        filters.branchLabelAr ? fixArabicText(filters.branchLabelAr) : filters.branchLabel
    );

    drawReceiptRow(
        "Period | الفترة:",
        filters.dateRangeLabelAr ? fixArabicText(filters.dateRangeLabelAr) : filters.dateRangeLabel
    );

    if (filters.statusLabel && filters.statusLabel !== "All Statuses") {
        drawReceiptRow("Status | الحالة:", fixArabicText(filters.statusLabelAr || filters.statusLabel));
    }

    if (filters.paymentMethodLabel && filters.paymentMethodLabel !== "All Payment Methods") {
        drawReceiptRow("Payment | الدفع:", fixArabicText(filters.paymentMethodLabelAr || filters.paymentMethodLabel));
    }

    if (filters.orderTypeLabel && filters.orderTypeLabel !== "All Order Types") {
        drawReceiptRow("Type | النوع:", fixArabicText(filters.orderTypeLabelAr || filters.orderTypeLabel));
    }

    if (filters.orderSourceLabel && filters.orderSourceLabel !== "All Sources") {
        drawReceiptRow("Source | المصدر:", fixArabicText(filters.orderSourceLabelAr || filters.orderSourceLabel));
    }

    drawDashedLine();

    // ==========================================
    // 3. Overall Totals (الإجمالي العام لكل حاجة)
    // ==========================================
    doc.font("Cairo-Bold").fontSize(10).fillColor("#000000");
    doc.text(fixArabicText("الإجمالي العام للفلترة | OVERALL TOTALS"), { align: "center" });
    doc.moveDown(0.3);

    drawReceiptRow("Total Orders | إجمالي الطلبات:", `${totalOrdersCount}`, true, 9.5);
    drawReceiptRow("Products Price | قيمة الأصناف:", `${formatNum(grandSubtotal)} EGP`);
    if (grandDeliveryFee > 0) {
        drawReceiptRow("Delivery Fees | رسوم التوصيل:", `${formatNum(grandDeliveryFee)} EGP`);
    }
    if (grandServiceFee > 0) {
        drawReceiptRow("Service Fees | رسوم الخدمة:", `${formatNum(grandServiceFee)} EGP`);
    }
    if (grandDiscount > 0) {
        drawReceiptRow("Total Discount | إجمالي الخصم:", `-${formatNum(grandDiscount)} EGP`);
    }

    doc.moveDown(0.2);
    drawReceiptRow("GRAND TOTAL | الصافي:", `${formatNum(grandTotal)} EGP`, true, 11);

    drawDashedLine();

    // ==========================================
    // 4. Overall Payment Methods Breakdown
    // ==========================================
    doc.font("Cairo-Bold").fontSize(9.5).fillColor("#000000");
    doc.text(fixArabicText("طرق الدفع الإجمالية | ALL PAYMENT METHODS:"), margin, doc.y);
    doc.moveDown(0.3);

    for (const [, pm] of overallPaymentMethods) {
        const pct = grandTotal > 0 ? ((pm.total / grandTotal) * 100).toFixed(1) : "0";
        const label = pm.nameAr ? `${fixArabicText(pm.nameAr)} (${pm.count})` : `${pm.name} (${pm.count})`;
        drawReceiptRow(`• ${label}:`, `${formatNum(pm.total)} EGP (${pct}%)`);
    }

    drawDashedLine();

    // ==========================================
    // 5. Overall Order Types Breakdown
    // ==========================================
    doc.font("Cairo-Bold").fontSize(9.5).fillColor("#000000");
    doc.text(fixArabicText("أنواع الطلبات | ALL ORDER TYPES:"), margin, doc.y);
    doc.moveDown(0.3);

    for (const [tKey, tVal] of overallOrderTypes) {
        const typeInfo = ORDER_TYPE_LABELS[tKey] || { en: tKey, ar: tKey };
        const label = `${fixArabicText(typeInfo.ar)} | ${typeInfo.en} (${tVal.count})`;
        drawReceiptRow(`• ${label}:`, `${formatNum(tVal.total)} EGP`);
    }

    drawDashedLine();

    // ==========================================
    // 6. Branch by Branch Breakdown (لكل فرع)
    // ==========================================
    doc.font("Cairo-Bold").fontSize(10.5).fillColor("#000000");
    doc.text(fixArabicText(`تفاصيل كل فرع (${branchesList.length} فرع) | PER BRANCH`), { align: "center" });
    doc.moveDown(0.4);

    for (let i = 0; i < branchesList.length; i++) {
        const b = branchesList[i];
        const bPct = grandTotal > 0 ? ((b.totalAmount / grandTotal) * 100).toFixed(1) : "0";

        // Branch Header Box
        doc.font("Cairo-Bold").fontSize(10).fillColor("#000000");
        const bHeaderTitle = b.nameAr ? `${b.name} | ${fixArabicText(b.nameAr)}` : b.name;
        doc.text(`[ ${bHeaderTitle} ]`, { align: "center" });
        doc.moveDown(0.2);

        drawReceiptRow("Orders Count | عدد الطلبات:", `${b.totalOrders}`, true, 9);
        drawReceiptRow("Branch Total | إجمالي الفرع:", `${formatNum(b.totalAmount)} EGP (${bPct}%)`, true, 9.5);

        // Branch Payment Methods
        doc.font("Cairo-Bold").fontSize(8.5).fillColor("#333333");
        doc.text(fixArabicText("طرق الدفع في هذا الفرع:"), margin + 4, doc.y);
        doc.moveDown(0.2);

        for (const [, bPm] of b.paymentMethods) {
            const pmShare = b.totalAmount > 0 ? ((bPm.total / b.totalAmount) * 100).toFixed(0) : "0";
            const pmName = bPm.nameAr ? fixArabicText(bPm.nameAr) : bPm.name;
            drawReceiptRow(`  - ${pmName}: ${bPm.count} طلب`, `${formatNum(bPm.total)} EGP (${pmShare}%)`, false, 8.5);
        }

        // Branch Order Types
        if (b.orderTypes.size > 0) {
            doc.moveDown(0.15);
            doc.font("Cairo-Bold").fontSize(8.5).fillColor("#333333");
            doc.text(fixArabicText("أنواع الطلبات في هذا الفرع:"), margin + 4, doc.y);
            doc.moveDown(0.2);

            for (const [otKey, otVal] of b.orderTypes) {
                const otInfo = ORDER_TYPE_LABELS[otKey] || { en: otKey, ar: otKey };
                drawReceiptRow(`  - ${fixArabicText(otInfo.ar)}:`, `${otVal.count} طلب (${formatNum(otVal.total)} EGP)`, false, 8.5);
            }
        }

        if (i < branchesList.length - 1) {
            drawDashedLine();
        }
    }

    drawSolidLine();

    // ==========================================
    // 7. Receipt Footer
    // ==========================================
    doc.font("Cairo-Bold").fontSize(9).fillColor("#000000");
    doc.text(fixArabicText("نهاية تقرير الفواتير | END OF REPORT"), { align: "center" });
    doc.font("Cairo").fontSize(7.5).fillColor("#555555");
    doc.moveDown(0.2);
    doc.text("Powered by Keeto POS System", { align: "center" });
    doc.text(nowCairo.format("YYYY-MM-DD HH:mm:ss"), { align: "center" });

    doc.end();
}
