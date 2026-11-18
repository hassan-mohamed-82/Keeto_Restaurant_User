"use strict";
// Shared bits of the weight-request flow (restaurant side).
// Mirrors Keeto_SuperAdmin_User/src/helpers/weightCart.helper.ts where both projects need the same rule.
Object.defineProperty(exports, "__esModule", { value: true });
exports.priceChangeLogEntry = exports.buildRestaurantItemPrice = exports.resolveRestaurantItemPricingContext = exports.planConfirmation = exports.DEFAULT_WEIGHT_MAX_INCREASE_PERCENT = exports.affectedRows = exports.abandonedPaymentOutcome = exports.decideCronAction = exports.EXPIRE_REASON_PAYMENTS = exports.EXPIRE_REASON_CUSTOMER = exports.EXPIRE_REASON_RESTAURANT = exports.DEFAULT_WEIGHT_CUSTOMER_TIMEOUT_MIN = exports.DEFAULT_WEIGHT_RESTAURANT_TIMEOUT_MIN = exports.MAX_PAYMENT_ATTEMPTS = exports.PAYMENT_ABANDON_MINUTES = exports.CHECKOUT_NO_ORDER_MINUTES = exports.CART_OWNING_STATUSES = exports.isWeighedRow = exports.parseWeighingLog = exports.parseAddonSnapshot = exports.parseVariationSnapshot = exports.ACTIVE_WEIGHT_REQUEST_STATUSES = void 0;
/** Statuses during which a request owns the customer's weighted cart rows. */
exports.ACTIVE_WEIGHT_REQUEST_STATUSES = ["awaiting_weighing", "awaiting_customer_approval"];
const parseMaybeJson = (raw) => {
    let v = raw;
    for (let i = 0; i < 3 && typeof v === "string"; i++) {
        try {
            v = JSON.parse(v);
        }
        catch {
            break;
        }
    }
    return v;
};
/** cart_items.variations is stored as {variations:[...]} (customer rows) or a bare array (restaurant rows). */
const parseVariationSnapshot = (raw) => {
    const v = parseMaybeJson(raw);
    if (Array.isArray(v))
        return v;
    if (v && typeof v === "object" && Array.isArray(v.variations))
        return v.variations;
    return [];
};
exports.parseVariationSnapshot = parseVariationSnapshot;
const parseAddonSnapshot = (raw) => {
    const v = parseMaybeJson(raw);
    return Array.isArray(v) ? v : [];
};
exports.parseAddonSnapshot = parseAddonSnapshot;
/** Parses request.weighingLog which may be a raw JSON string from MySQL or already an array. */
const parseWeighingLog = (raw) => {
    const v = parseMaybeJson(raw);
    return Array.isArray(v) ? v : [];
};
exports.parseWeighingLog = parseWeighingLog;
/** A cart row that needs weighing (weight-sold food or a stored weight). */
const isWeighedRow = (row, foodSoldBy) => !row.offerId && (foodSoldBy === "weight" || (row.weight !== undefined && row.weight !== null));
exports.isWeighedRow = isWeighedRow;
/** Statuses during which the request still owns cart rows (active + Visa checkout in progress). */
exports.CART_OWNING_STATUSES = ["awaiting_weighing", "awaiting_customer_approval", "checking_out"];
// ─── Expiry cron windows (mirror Keeto_SuperAdmin_User/src/helpers/weightCart.helper.ts) ───
/** A checking_out claim without an order older than this is stale → back to awaiting_customer_approval. */
exports.CHECKOUT_NO_ORDER_MINUTES = 5;
/** A weighted Visa order still pending_payment after this is abandoned → treated as a failed payment. */
exports.PAYMENT_ABANDON_MINUTES = 30;
/** Failed / abandoned payment attempts after which the request expires. */
exports.MAX_PAYMENT_ATTEMPTS = 3;
/** Same as the restaurant_settings column defaults (migration 0013: 10 / 15). */
exports.DEFAULT_WEIGHT_RESTAURANT_TIMEOUT_MIN = 10;
/** Fallback when restaurant_settings has no row: the agreed 15 minutes. */
exports.DEFAULT_WEIGHT_CUSTOMER_TIMEOUT_MIN = 15;
exports.EXPIRE_REASON_RESTAURANT = "restaurant did not respond";
exports.EXPIRE_REASON_CUSTOMER = "customer did not respond";
exports.EXPIRE_REASON_PAYMENTS = `payment failed ${exports.MAX_PAYMENT_ATTEMPTS} times`;
const ageMinutes = (from, now) => from ? (now.getTime() - new Date(from).getTime()) / 60000 : Number.POSITIVE_INFINITY;
/**
 * Pure decision for one weight request (and its order, if any). The cron calls it twice:
 * once to pick candidates and again on the rows locked FOR UPDATE, so a request approved /
 * cancelled / changed in the meantime gets "none" and is skipped.
 */
const decideCronAction = (request, order, now) => {
    if (request.status === "awaiting_weighing" || request.status === "awaiting_customer_approval") {
        if (new Date(request.expiresAt) >= now)
            return { kind: "none" };
        return request.status === "awaiting_weighing"
            ? { kind: "expire", reason: exports.EXPIRE_REASON_RESTAURANT, notify: "customer" }
            : { kind: "expire", reason: exports.EXPIRE_REASON_CUSTOMER, notify: "restaurant" };
    }
    if (request.status !== "checking_out")
        return { kind: "none" };
    if (!request.orderId || !order) {
        return ageMinutes(request.checkoutStartedAt, now) >= exports.CHECKOUT_NO_ORDER_MINUTES ? { kind: "revert_claim" } : { kind: "none" };
    }
    if (order.paymentStatus === "paid")
        return { kind: "approve_paid" };
    if (order.paymentStatus === "payment_failed" || order.status === "failed" || order.status === "cancelled") {
        return { kind: "revert_failed" };
    }
    if (order.status && order.status !== "pending")
        return { kind: "approve_paid" }; // accepted & beyond = confirmed
    return ageMinutes(order.createdAt, now) >= exports.PAYMENT_ABANDON_MINUTES ? { kind: "fail_abandoned" } : { kind: "none" };
};
exports.decideCronAction = decideCronAction;
/** Outcome of an abandoned payment: revert (attempts + 1) or expire at the limit. */
const abandonedPaymentOutcome = (paymentAttempts) => paymentAttempts + 1 >= exports.MAX_PAYMENT_ATTEMPTS ? "expire" : "revert";
exports.abandonedPaymentOutcome = abandonedPaymentOutcome;
/** mysql2 update result → affected rows. */
const affectedRows = (result) => Number((Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows) ?? 0);
exports.affectedRows = affectedRows;
// ─── Confirm (restaurant sends the weights to the customer) ───
/** Fallback when restaurant_settings has no row: same as the column default. */
exports.DEFAULT_WEIGHT_MAX_INCREASE_PERCENT = 10;
/**
 * Pure plan for POST /admin/weight-requests/:id/confirm (the caller holds the locked transaction).
 * - Default: every weighted customer row that is not unavailable and has no final weight is confirmed
 *   at the ordered weight (line total recomputed with computeWeightedLineTotal for consistency).
 * - strict: such a row is rejected instead (the old behaviour).
 * - Then every weighted customer row (incl. defaulted ones) must be > 0, within the max increase and sane;
 *   weighted restaurant-added rows must be sane.
 * - No weighted customer rows at all → reject. All unavailable and nothing added → cancel.
 */
const planConfirmation = (items, opts, computeLineTotal, checks) => {
    const name = (i) => `"${i.foodName ?? i.foodId ?? i.id}"`;
    const weightedCustomer = items.filter((i) => i.addedBy === "customer" && (0, exports.isWeighedRow)({ weight: i.orderedWeight }, i.sold_by));
    const restaurantRows = items.filter((i) => i.addedBy === "restaurant");
    if (weightedCustomer.length === 0) {
        return { kind: "reject", message: "This request has no weight-based items to confirm." };
    }
    if (weightedCustomer.every((i) => i.isUnavailable) && restaurantRows.length === 0) {
        return { kind: "cancel" };
    }
    const defaults = [];
    const log = [];
    for (const item of weightedCustomer) {
        if (item.isUnavailable) {
            log.push({ item, action: "marked_unavailable", finalWeight: item.finalWeight });
            continue;
        }
        const unit = item.weightUnit || item.foodWeightUnit || "kg";
        const hasFinal = item.finalWeight !== null && item.finalWeight !== undefined && Number(item.finalWeight) > 0;
        if (!hasFinal && opts.strict) {
            return { kind: "reject", message: `Item ${name(item)} has not been weighed yet. Please set its final weight or mark it as unavailable.` };
        }
        const finalWeight = hasFinal ? Number(item.finalWeight) : Number(item.orderedWeight);
        if (!(finalWeight > 0)) {
            return { kind: "reject", message: `Item ${name(item)} has no valid weight.` };
        }
        if (!checks.isSaneWeight(finalWeight, unit)) {
            return { kind: "reject", message: `Item ${name(item)}: the weight ${finalWeight} ${unit} exceeds the maximum allowed.` };
        }
        let withinLimit = false;
        try {
            withinLimit = checks.isWeightWithinLimit(item.orderedWeight ?? 0, finalWeight, opts.maxIncreasePercent);
        }
        catch {
            withinLimit = false;
        }
        if (!withinLimit) {
            return {
                kind: "reject",
                message: `Item ${name(item)}: the weight ${finalWeight} ${unit} is more than ${opts.maxIncreasePercent}% above the ordered ${item.orderedWeight} ${unit}.`,
            };
        }
        if (hasFinal) {
            log.push({ item, action: "weighed", finalWeight: item.finalWeight });
        }
        else {
            const extras = [
                ...(0, exports.parseVariationSnapshot)(item.variations).map((v) => ({ price: v.price ?? v.additionalPrice ?? 0, priceMode: v.priceMode || "fixed" })),
                ...(0, exports.parseAddonSnapshot)(item.addons).map((a) => ({ price: a.price ?? 0, priceMode: "fixed" })),
            ];
            const fw = finalWeight.toFixed(3);
            const qty = Math.max(1, Math.round(Number(item.quantity) || 1));
            defaults.push({ id: item.id, finalWeight: fw, totalPrice: computeLineTotal(finalWeight, Number(item.unitPrice ?? 0), extras, qty) });
            log.push({ item, action: "confirmed_as_ordered", finalWeight: fw });
        }
    }
    for (const item of restaurantRows) {
        if ((0, exports.isWeighedRow)({ weight: item.orderedWeight }, item.sold_by)) {
            const w = Number(item.finalWeight ?? item.orderedWeight);
            if (!(w > 0) || !checks.isSaneWeight(w, item.weightUnit || item.foodWeightUnit)) {
                return { kind: "reject", message: `Restaurant-added item ${name(item)} has no valid weight.` };
            }
        }
        log.push({ item, action: "added_by_restaurant", finalWeight: item.finalWeight });
    }
    return { kind: "confirm", defaults, log };
};
exports.planConfirmation = planConfirmation;
/**
 * Which branch / service module prices a restaurant-added item. The request has a branch
 * (weight_requests.branch_id) but no service module; the service module is read from the
 * customer's own cart rows (cart_items.service_module, set when the customer added items with
 * a channel). Missing service module → undefined: branch-level / base pricing only, which is what
 * the customer's cart uses for rows without a service module. Missing branch → the customer rows'
 * branch, else the restaurant's first active branch (getCart's fallback), else "" (no branch overrides).
 */
const resolveRestaurantItemPricingContext = (p) => {
    const rowBranch = p.customerRows.find((r) => r.branchId)?.branchId || null;
    const branchId = p.requestBranchId || rowBranch || p.activeBranchIds[0] || "";
    const branchSource = p.requestBranchId ? "request" : rowBranch ? "customer_cart" : p.activeBranchIds[0] ? "first_active_branch" : "none";
    const module = p.customerRows.find((r) => r.serviceModule)?.serviceModule;
    return { branchId, serviceModule: module || undefined, branchSource, serviceModuleSource: module ? "customer_cart" : "none" };
};
exports.resolveRestaurantItemPricingContext = resolveRestaurantItemPricingContext;
/**
 * Price of a restaurant-added row from calculateCalculatedPrice's result (channel-resolved base and
 * option prices) plus addon prices. `ownerUnitPrice` (owner only) replaces the resolved base price.
 * Weighted: unit_price = base per weight unit; unit rows: unit_price = base + options + addons.
 */
const buildRestaurantItemPrice = (p, computeLineTotal) => {
    const base = p.ownerUnitPrice !== undefined ? p.ownerUnitPrice : p.resolvedBasePrice;
    if (p.isWeighted) {
        const extras = [...p.options, ...p.addonPrices.map((price) => ({ price, priceMode: "fixed" }))];
        return { unitPrice: base.toFixed(2), totalPrice: computeLineTotal(Number(p.weight), base, extras, p.quantity), basePrice: base };
    }
    const cents = (n) => Math.round(n * 100);
    const unitCents = cents(base) + p.options.reduce((s, o) => s + cents(Number(o.price)), 0) + p.addonPrices.reduce((s, a) => s + cents(a), 0);
    return { unitPrice: (unitCents / 100).toFixed(2), totalPrice: ((unitCents * p.quantity) / 100).toFixed(2), basePrice: base };
};
exports.buildRestaurantItemPrice = buildRestaurantItemPrice;
/** A price set by the restaurant owner instead of the menu price, kept in weighing_log. */
const priceChangeLogEntry = (p) => ({
    action: "price_changed",
    cartItemId: p.cartItemId,
    foodId: p.foodId,
    foodName: p.foodName ?? null,
    oldPrice: p.oldPrice === null ? null : Number(p.oldPrice).toFixed(2),
    newPrice: Number(p.newPrice).toFixed(2),
    changedBy: p.by,
    timestamp: p.now.toISOString(),
});
exports.priceChangeLogEntry = priceChangeLogEntry;
