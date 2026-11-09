import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { Response } from "express";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";
import sharp from "sharp";
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
    lang?: "ar" | "en";
}

// ==========================================
// Label Dictionaries & Translations
// ==========================================
export const ORDER_TYPE_LABELS: Record<string, { en: string; ar: string }> = {
    delivery: { en: "Delivery", ar: "ديليفري" },
    takeaway: { en: "Takeaway", ar: "تيك اواي" },
    dine_in: { en: "Dine-in", ar: "صال" },
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
    online_order_web: { en: "Website", ar: "الموقع الإلكتروني" },
    online_order_app: { en: "Mobile App", ar: "تطبيق الموبايل" },
    food_aggregator: { en: "Aggregator", ar: "تطبيق توصيل" },
    my_keeto: { en: "My Keeto", ar: "ماي كيتو" },
    pos: { en: "POS Cashier", ar: "كاشير" },
};

const COMMON_PM_AR: Record<string, string> = {
    cash: "كاش (نقداً)",
    visa: "فيزا / بطاقة",
    mastercard: "ماستركارد",
    credit_card: "بطاقة بنكية",
    card: "بطاقة",
    wallet: "محفظة إلكترونية",
    instapay: "إنستاباي",
    fawry: "فوري",
    cod: "الدفع عند الاستلام",
    online: "دفع إلكتروني",
};

function formatNum(val: number): string {
    return val.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Robust logo loader: handles remote URLs, local /uploads files, base64 data URIs,
 * and converts to a standardized PNG buffer using sharp.
 */
async function loadLogoBuffer(logoPathOrUrl?: string | null): Promise<Buffer | null> {
    if (!logoPathOrUrl || typeof logoPathOrUrl !== "string") return null;
    const trimmed = logoPathOrUrl.trim();
    if (!trimmed) return null;

    try {
        let rawBuffer: Buffer | null = null;

        // 1. Base64 Data URI
        if (trimmed.startsWith("data:image/")) {
            const base64Data = trimmed.split(",")[1];
            if (base64Data) rawBuffer = Buffer.from(base64Data, "base64");
        }
        // 2. HTTP / HTTPS URL
        else if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            // Check if it corresponds to a local file in uploads/
            try {
                const u = new URL(trimmed);
                const p = decodeURIComponent(u.pathname);
                if (p.includes("uploads/")) {
                    const rel = p.substring(p.indexOf("uploads/"));
                    const localP = path.resolve(process.cwd(), rel);
                    if (fs.existsSync(localP)) {
                        rawBuffer = await fs.promises.readFile(localP);
                    }
                }
            } catch {}

            if (!rawBuffer) {
                const response = await axios.get(trimmed, {
                    responseType: "arraybuffer",
                    timeout: 4000,
                    headers: { "User-Agent": "Keeto-PDF-Report/1.0" },
                });
                if (response.data) {
                    rawBuffer = Buffer.from(response.data);
                }
            }
        }
        // 3. Local disk path
        else {
            const candidates = [
                trimmed,
                path.resolve(process.cwd(), trimmed),
                path.resolve(process.cwd(), "uploads", trimmed.replace(/^\/?uploads\/?/, "")),
                path.resolve(process.cwd(), "uploads", trimmed),
            ];
            for (const c of candidates) {
                if (fs.existsSync(c)) {
                    rawBuffer = await fs.promises.readFile(c);
                    break;
                }
            }
        }

        if (rawBuffer && rawBuffer.length > 0) {
            // Convert to clean PNG format with max bounding box of 160x160 for sharpness
            return await sharp(rawBuffer)
                .resize(160, 160, { fit: "inside", withoutEnlargement: true })
                .png()
                .toBuffer();
        }
    } catch (err) {
        console.warn("⚠️ [PDF Report] Could not load or convert logo:", (err as any)?.message || err);
    }
    return null;
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
    const { res, restaurant, filters, orders, generatedBy = "Admin", lang = "ar" } = options;
    const isAr = lang === "ar";
    const currency = isAr ? "ج.م" : "EGP";

    // ─── 1. Load Restaurant Logo ─────────────────────────────
    const logoBuffer = await loadLogoBuffer(restaurant.logo);

    // ─── 2. Compute Aggregates ───────────────────────────────
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

        // Payment Method
        const pmKey = ord.paymentMethodName || ord.paymentMethod || "Cash";
        let pmNameAr = ord.paymentMethodNameAr || pmKey;
        if ((!ord.paymentMethodNameAr || ord.paymentMethodNameAr === pmKey) && COMMON_PM_AR[pmKey.toLowerCase()]) {
            pmNameAr = COMMON_PM_AR[pmKey.toLowerCase()];
        }

        const overallPm = overallPaymentMethods.get(pmKey) || { name: pmKey, nameAr: pmNameAr, count: 0, total: 0 };
        overallPm.count += 1;
        overallPm.total += total;
        overallPaymentMethods.set(pmKey, overallPm);

        // Order Types
        const typeKey = ord.orderType || "delivery";
        const overallType = overallOrderTypes.get(typeKey) || { count: 0, total: 0 };
        overallType.count += 1;
        overallType.total += total;
        overallOrderTypes.set(typeKey, overallType);

        // Per-Branch
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

        const bPm = bEntry.paymentMethods.get(pmKey) || { name: pmKey, nameAr: pmNameAr, count: 0, total: 0 };
        bPm.count += 1;
        bPm.total += total;
        bEntry.paymentMethods.set(pmKey, bPm);

        const bType = bEntry.orderTypes.get(typeKey) || { count: 0, total: 0 };
        bType.count += 1;
        bType.total += total;
        bEntry.orderTypes.set(typeKey, bType);
    }

    const totalOrdersCount = orders.length;
    const branchesList = Array.from(branchMap.values()).sort((a, b) => b.totalAmount - a.totalAmount);

    // ─── 3. Accurate Dynamic Height Calculation ───────────────
    // Standard thermal POS roll receipt width: 280 pt (approx 80mm)
    const receiptWidth = 280;
    const margin = 14;
    const printableWidth = receiptWidth - margin * 2; // 252 pt

    let estimatedHeight = 220; // Base header + titles + padding
    if (logoBuffer) estimatedHeight += 70;
    estimatedHeight += 120; // Metadata rows
    estimatedHeight += 160; // Overall totals + grand total box
    estimatedHeight += 35 + overallPaymentMethods.size * 18;
    estimatedHeight += 35 + overallOrderTypes.size * 18;

    for (const b of branchesList) {
        estimatedHeight += 75; // Branch header + totals
        if (b.paymentMethods.size > 0) estimatedHeight += 25 + b.paymentMethods.size * 18;
        if (b.orderTypes.size > 0) estimatedHeight += 25 + b.orderTypes.size * 18;
        estimatedHeight += 15; // divider
    }
    estimatedHeight += 90; // Footer + buffer

    const receiptHeight = Math.max(520, Math.ceil(estimatedHeight));

    const doc = new PDFDocument({
        margin,
        size: [receiptWidth, receiptHeight],
        info: {
            Title: `Orders Report - ${isAr ? (restaurant.nameAr || restaurant.name) : (restaurant.name || restaurant.nameAr)}`,
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
    const drawDashedDivider = (space = 0.3) => {
        doc.moveDown(space);
        doc.moveTo(margin, doc.y)
            .lineTo(receiptWidth - margin, doc.y)
            .dash(3, { space: 2.5 })
            .strokeColor("#9ca3af")
            .lineWidth(0.8)
            .stroke();
        doc.undash();
        doc.moveDown(space + 0.1);
    };

    const drawSolidDivider = (space = 0.3) => {
        doc.moveDown(space);
        doc.moveTo(margin, doc.y)
            .lineTo(receiptWidth - margin, doc.y)
            .strokeColor("#111827")
            .lineWidth(0.9)
            .stroke();
        doc.moveDown(space + 0.1);
    };

    /**
     * Renders a key-value row.
     * In Arabic: Label on the RIGHT, Value on the LEFT.
     * In English: Label on the LEFT, Value on the RIGHT.
     */
    const drawRow = (label: string, value: string, isBold = false, fontSize = 9, isDim = false) => {
        const curY = doc.y;
        const fontName = isBold ? "Cairo-Bold" : "Cairo";
        const color = isDim ? "#4b5563" : "#111827";
        doc.font(fontName).fontSize(fontSize).fillColor(color);

        if (isAr) {
            // Arabic Layout: Label (Right), Value (Left)
            const valWidth = 105;
            const lblWidth = printableWidth - valWidth;

            const fixedLabel = fixArabicText(label);
            const fixedValue = fixArabicText(value);

            doc.text(fixedLabel, margin + valWidth, curY, { width: lblWidth, align: "right" });
            doc.text(fixedValue, margin, curY, { width: valWidth, align: "left" });

            const h1 = doc.heightOfString(fixedLabel, { width: lblWidth });
            const h2 = doc.heightOfString(fixedValue, { width: valWidth });
            doc.y = curY + Math.max(h1, h2) + 2.5;
        } else {
            // English Layout: Label (Left), Value (Right)
            const lblWidth = 145;
            const valWidth = printableWidth - lblWidth;

            doc.text(label, margin, curY, { width: lblWidth, align: "left" });
            doc.text(value, margin + lblWidth, curY, { width: valWidth, align: "right" });

            const h1 = doc.heightOfString(label, { width: lblWidth });
            const h2 = doc.heightOfString(value, { width: valWidth });
            doc.y = curY + Math.max(h1, h2) + 2.5;
        }
    };

    const drawSectionHeader = (title: string) => {
        doc.moveDown(0.35);
        doc.font("Cairo-Bold").fontSize(9.5).fillColor("#111827");
        if (isAr) {
            doc.text(fixArabicText(title), margin, doc.y, { width: printableWidth, align: "right" });
        } else {
            doc.text(title, margin, doc.y, { width: printableWidth, align: "left" });
        }
        doc.moveDown(0.25);
    };

    const drawReportBadge = (title: string) => {
        doc.moveDown(0.25);
        const badgeW = Math.min(230, printableWidth);
        const badgeH = 22;
        const badgeX = margin + (printableWidth - badgeW) / 2;
        const badgeY = doc.y;

        doc.roundedRect(badgeX, badgeY, badgeW, badgeH, 3).fillAndStroke("#f3f4f6", "#d1d5db");
        doc.font("Cairo-Bold").fontSize(10).fillColor("#111827");
        doc.text(isAr ? fixArabicText(title) : title, badgeX, badgeY + 4.5, { width: badgeW, align: "center" });
        doc.y = badgeY + badgeH + 6;
    };

    const drawGrandTotalBox = (label: string, value: string) => {
        doc.moveDown(0.25);
        const boxY = doc.y;
        const boxH = 30;
        doc.roundedRect(margin, boxY, printableWidth, boxH, 4).fillAndStroke("#f3f4f6", "#111827");

        const valWidth = 110;
        const lblWidth = printableWidth - valWidth - 16;

        if (isAr) {
            doc.font("Cairo-Bold").fontSize(10.5).fillColor("#111827");
            doc.text(fixArabicText(label), margin + valWidth + 8, boxY + 8, { width: lblWidth, align: "right" });
            doc.font("Cairo-Bold").fontSize(11.5).fillColor("#111827");
            doc.text(fixArabicText(value), margin + 8, boxY + 7, { width: valWidth, align: "left" });
        } else {
            doc.font("Cairo-Bold").fontSize(10.5).fillColor("#111827");
            doc.text(label, margin + 8, boxY + 8, { width: lblWidth, align: "left" });
            doc.font("Cairo-Bold").fontSize(11.5).fillColor("#111827");
            doc.text(value, margin + lblWidth + 8, boxY + 7, { width: valWidth, align: "right" });
        }

        doc.y = boxY + boxH + 6;
    };

    const drawBranchHeader = (branchTitle: string) => {
        doc.moveDown(0.3);
        const headerY = doc.y;
        const headerH = 22;
        doc.roundedRect(margin, headerY, printableWidth, headerH, 3).fill("#e5e7eb");
        doc.font("Cairo-Bold").fontSize(9.5).fillColor("#111827");
        doc.text(isAr ? fixArabicText(branchTitle) : branchTitle, margin, headerY + 4.5, {
            width: printableWidth,
            align: "center",
        });
        doc.y = headerY + headerH + 5;
    };

    // ==========================================
    // 1. Restaurant Header & Logo
    // ==========================================
    doc.moveDown(0.3);

    // Render Logo if loaded
    if (logoBuffer) {
        const logoSize = 58;
        const logoX = margin + (printableWidth - logoSize) / 2;
        doc.image(logoBuffer, logoX, doc.y, { fit: [logoSize, logoSize], align: "center" });
        doc.y += logoSize + 6;
    }

    // Restaurant Name
    const restaurantDisplayName = (isAr
        ? (restaurant.nameAr || restaurant.name)
        : (restaurant.name || restaurant.nameAr)) || "Restaurant";

    doc.font("Cairo-Bold").fontSize(14).fillColor("#111827");
    doc.text(isAr ? fixArabicText(restaurantDisplayName) : restaurantDisplayName, { align: "center" });

    // Phone / Contact
    if (restaurant.ownerPhone) {
        doc.font("Cairo").fontSize(8.5).fillColor("#4b5563");
        const phoneLabel = isAr ? `هاتف: ${restaurant.ownerPhone}` : `Tel: ${restaurant.ownerPhone}`;
        doc.text(isAr ? fixArabicText(phoneLabel) : phoneLabel, { align: "center" });
    }

    // Report Title Banner Badge
    const reportTitleText = isAr ? "تقرير مبيعات وفواتير الطلبات" : "SALES & ORDERS REPORT";
    drawReportBadge(reportTitleText);

    drawDashedDivider();

    // ==========================================
    // 2. Metadata & Active Filters
    // ==========================================
    const nowCairo = dayjs().tz(TIMEZONE);

    if (isAr) {
        drawRow("التاريخ:", nowCairo.format("YYYY-MM-DD"));
        drawRow("الوقت:", nowCairo.format("hh:mm:ss A"));
        drawRow("المسؤول:", generatedBy);
        drawRow("الفرع:", filters.branchLabelAr || filters.branchLabel);
        drawRow("الفترة:", filters.dateRangeLabelAr || filters.dateRangeLabel);

        if (filters.statusLabel && filters.statusLabel !== "All Statuses") {
            drawRow("الحالة:", filters.statusLabelAr || filters.statusLabel);
        }
        if (filters.paymentMethodLabel && filters.paymentMethodLabel !== "All Payment Methods") {
            drawRow("طريقة الدفع:", filters.paymentMethodLabelAr || filters.paymentMethodLabel);
        }
        if (filters.orderTypeLabel && filters.orderTypeLabel !== "All Order Types") {
            drawRow("نوع الطلب:", filters.orderTypeLabelAr || filters.orderTypeLabel);
        }
        if (filters.orderSourceLabel && filters.orderSourceLabel !== "All Sources") {
            drawRow("المصدر:", filters.orderSourceLabelAr || filters.orderSourceLabel);
        }
    } else {
        drawRow("Date:", nowCairo.format("YYYY-MM-DD"));
        drawRow("Time:", nowCairo.format("hh:mm:ss A"));
        drawRow("Generated By:", generatedBy);
        drawRow("Branch:", filters.branchLabel);
        drawRow("Period:", filters.dateRangeLabel);

        if (filters.statusLabel && filters.statusLabel !== "All Statuses") {
            drawRow("Status:", filters.statusLabel);
        }
        if (filters.paymentMethodLabel && filters.paymentMethodLabel !== "All Payment Methods") {
            drawRow("Payment Method:", filters.paymentMethodLabel);
        }
        if (filters.orderTypeLabel && filters.orderTypeLabel !== "All Order Types") {
            drawRow("Order Type:", filters.orderTypeLabel);
        }
        if (filters.orderSourceLabel && filters.orderSourceLabel !== "All Sources") {
            drawRow("Source:", filters.orderSourceLabel);
        }
    }

    drawDashedDivider();

    // ==========================================
    // 3. Overall Totals
    // ==========================================
    drawSectionHeader(isAr ? "■ ملخص الإجمالي العام" : "■ OVERALL TOTALS SUMMARY");

    if (isAr) {
        drawRow("إجمالي الطلبات:", `${totalOrdersCount} طلب`, true, 9.5);
        drawRow("قيمة الأصناف:", `${formatNum(grandSubtotal)} ${currency}`);
        if (grandDeliveryFee > 0) {
            drawRow("رسوم التوصيل:", `${formatNum(grandDeliveryFee)} ${currency}`);
        }
        if (grandServiceFee > 0) {
            drawRow("رسوم الخدمة:", `${formatNum(grandServiceFee)} ${currency}`);
        }
        if (grandDiscount > 0) {
            drawRow("إجمالي الخصومات:", `-${formatNum(grandDiscount)} ${currency}`);
        }
        drawGrandTotalBox("صافي المبيعات:", `${formatNum(grandTotal)} ${currency}`);
    } else {
        drawRow("Total Orders:", `${totalOrdersCount}`, true, 9.5);
        drawRow("Products Amount:", `${formatNum(grandSubtotal)} ${currency}`);
        if (grandDeliveryFee > 0) {
            drawRow("Delivery Fees:", `${formatNum(grandDeliveryFee)} ${currency}`);
        }
        if (grandServiceFee > 0) {
            drawRow("Service Fees:", `${formatNum(grandServiceFee)} ${currency}`);
        }
        if (grandDiscount > 0) {
            drawRow("Total Discount:", `-${formatNum(grandDiscount)} ${currency}`);
        }
        drawGrandTotalBox("GRAND TOTAL:", `${formatNum(grandTotal)} ${currency}`);
    }

    drawDashedDivider();

    // ==========================================
    // 4. Payment Methods Breakdown
    // ==========================================
    drawSectionHeader(isAr ? "■ طرق الدفع الإجمالية" : "■ PAYMENT METHODS BREAKDOWN");

    for (const [, pm] of overallPaymentMethods) {
        const pct = grandTotal > 0 ? ((pm.total / grandTotal) * 100).toFixed(1) : "0";
        if (isAr) {
            const pmLabel = `• ${pm.nameAr || pm.name} (${pm.count} طلب):`;
            drawRow(pmLabel, `${formatNum(pm.total)} ${currency} (${pct}%)`);
        } else {
            const pmLabel = `• ${pm.name || pm.nameAr} (${pm.count} orders):`;
            drawRow(pmLabel, `${formatNum(pm.total)} ${currency} (${pct}%)`);
        }
    }

    drawDashedDivider();

    // ==========================================
    // 5. Order Types Breakdown
    // ==========================================
    drawSectionHeader(isAr ? "■ أنواع الطلبات الإجمالية" : "■ ORDER TYPES BREAKDOWN");

    for (const [tKey, tVal] of overallOrderTypes) {
        const typeInfo = ORDER_TYPE_LABELS[tKey] || { en: tKey, ar: tKey };
        if (isAr) {
            const typeLabel = `• ${typeInfo.ar} (${tVal.count} طلب):`;
            drawRow(typeLabel, `${formatNum(tVal.total)} ${currency}`);
        } else {
            const typeLabel = `• ${typeInfo.en} (${tVal.count} orders):`;
            drawRow(typeLabel, `${formatNum(tVal.total)} ${currency}`);
        }
    }

    drawSolidDivider();

    // ==========================================
    // 6. Branch by Branch Breakdown
    // ==========================================
    const branchSectionTitle = isAr
        ? `■ تفاصيل كل فرع (${branchesList.length} فرع)`
        : `■ PER BRANCH BREAKDOWN (${branchesList.length} Branches)`;
    drawSectionHeader(branchSectionTitle);

    for (let i = 0; i < branchesList.length; i++) {
        const b = branchesList[i];
        const bPct = grandTotal > 0 ? ((b.totalAmount / grandTotal) * 100).toFixed(1) : "0";
        const bName = isAr ? (b.nameAr || b.name) : (b.name || b.nameAr);

        // Branch Badge Header
        drawBranchHeader(`[ ${bName} ]`);

        if (isAr) {
            drawRow("عدد الطلبات:", `${b.totalOrders} طلب`, true, 9);
            drawRow("إجمالي مبيعات الفرع:", `${formatNum(b.totalAmount)} ${currency} (${bPct}%)`, true, 9.5);

            // Branch Payment Methods
            if (b.paymentMethods.size > 0) {
                doc.moveDown(0.15);
                doc.font("Cairo-Bold").fontSize(8.5).fillColor("#4b5563");
                doc.text(fixArabicText("طرق الدفع في هذا الفرع:"), margin + 4, doc.y, {
                    width: printableWidth - 8,
                    align: "right",
                });
                doc.moveDown(0.15);

                for (const [, bPm] of b.paymentMethods) {
                    const pmShare = b.totalAmount > 0 ? ((bPm.total / b.totalAmount) * 100).toFixed(0) : "0";
                    const pmTitle = bPm.nameAr || bPm.name;
                    drawRow(`  • ${pmTitle}:`, `${bPm.count} طلب | ${formatNum(bPm.total)} ${currency} (${pmShare}%)`, false, 8.5, true);
                }
            }

            // Branch Order Types
            if (b.orderTypes.size > 0) {
                doc.moveDown(0.15);
                doc.font("Cairo-Bold").fontSize(8.5).fillColor("#4b5563");
                doc.text(fixArabicText("أنواع الطلبات في هذا الفرع:"), margin + 4, doc.y, {
                    width: printableWidth - 8,
                    align: "right",
                });
                doc.moveDown(0.15);

                for (const [otKey, otVal] of b.orderTypes) {
                    const otInfo = ORDER_TYPE_LABELS[otKey] || { en: otKey, ar: otKey };
                    drawRow(`  • ${otInfo.ar}:`, `${otVal.count} طلب | ${formatNum(otVal.total)} ${currency}`, false, 8.5, true);
                }
            }
        } else {
            drawRow("Total Orders:", `${b.totalOrders}`, true, 9);
            drawRow("Branch Total:", `${formatNum(b.totalAmount)} ${currency} (${bPct}%)`, true, 9.5);

            // Branch Payment Methods
            if (b.paymentMethods.size > 0) {
                doc.moveDown(0.15);
                doc.font("Cairo-Bold").fontSize(8.5).fillColor("#4b5563");
                doc.text("Payment Methods in this Branch:", margin + 4, doc.y, {
                    width: printableWidth - 8,
                    align: "left",
                });
                doc.moveDown(0.15);

                for (const [, bPm] of b.paymentMethods) {
                    const pmShare = b.totalAmount > 0 ? ((bPm.total / b.totalAmount) * 100).toFixed(0) : "0";
                    drawRow(`  • ${bPm.name || bPm.nameAr}:`, `${bPm.count} orders | ${formatNum(bPm.total)} ${currency} (${pmShare}%)`, false, 8.5, true);
                }
            }

            // Branch Order Types
            if (b.orderTypes.size > 0) {
                doc.moveDown(0.15);
                doc.font("Cairo-Bold").fontSize(8.5).fillColor("#4b5563");
                doc.text("Order Types in this Branch:", margin + 4, doc.y, {
                    width: printableWidth - 8,
                    align: "left",
                });
                doc.moveDown(0.15);

                for (const [otKey, otVal] of b.orderTypes) {
                    const otInfo = ORDER_TYPE_LABELS[otKey] || { en: otKey, ar: otKey };
                    drawRow(`  • ${otInfo.en}:`, `${otVal.count} orders | ${formatNum(otVal.total)} ${currency}`, false, 8.5, true);
                }
            }
        }

        if (i < branchesList.length - 1) {
            drawDashedDivider(0.2);
        }
    }

    drawSolidDivider();

    // ==========================================
    // 7. Receipt Footer
    // ==========================================
    doc.moveDown(0.3);
    doc.font("Cairo-Bold").fontSize(9).fillColor("#111827");
    const footerEndText = isAr ? "نهاية تقرير الفواتير" : "END OF REPORT";
    doc.text(isAr ? fixArabicText(footerEndText) : footerEndText, { align: "center" });

    doc.font("Cairo").fontSize(7.5).fillColor("#6b7280");
    doc.moveDown(0.2);
    const poweredByText = isAr ? "نظام كيتو لإدارة المطاعم" : "Powered by Keeto System";
    doc.text(isAr ? fixArabicText(poweredByText) : poweredByText, { align: "center" });
    doc.text(nowCairo.format("YYYY-MM-DD HH:mm:ss"), { align: "center" });

    doc.end();
}
