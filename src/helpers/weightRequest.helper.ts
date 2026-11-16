// Shared bits of the weight-request flow (restaurant side).
// Mirrors Keeto_SuperAdmin_User/src/helpers/weightCart.helper.ts where both projects need the same rule.

/** Statuses during which a request owns the customer's weighted cart rows. */
export const ACTIVE_WEIGHT_REQUEST_STATUSES = ["awaiting_weighing", "awaiting_customer_approval"] as const;

const parseMaybeJson = (raw: any): any => {
    let v = raw;
    for (let i = 0; i < 3 && typeof v === "string"; i++) {
        try { v = JSON.parse(v); } catch { break; }
    }
    return v;
};

/** cart_items.variations is stored as {variations:[...]} (customer rows) or a bare array (restaurant rows). */
export const parseVariationSnapshot = (raw: any): any[] => {
    const v = parseMaybeJson(raw);
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object" && Array.isArray(v.variations)) return v.variations;
    return [];
};

export const parseAddonSnapshot = (raw: any): any[] => {
    const v = parseMaybeJson(raw);
    return Array.isArray(v) ? v : [];
};

/** Parses request.weighingLog which may be a raw JSON string from MySQL or already an array. */
export const parseWeighingLog = (raw: any): any[] => {
    const v = parseMaybeJson(raw);
    return Array.isArray(v) ? v : [];
};

/** A cart row that needs weighing (weight-sold food or a stored weight). */
export const isWeighedRow = (row: { weight?: unknown; offerId?: string | null }, foodSoldBy?: string | null): boolean =>
    !row.offerId && (foodSoldBy === "weight" || (row.weight !== undefined && row.weight !== null));

/** Statuses during which the request still owns cart rows (active + Visa checkout in progress). */
export const CART_OWNING_STATUSES = ["awaiting_weighing", "awaiting_customer_approval", "checking_out"] as const;

// ─── Expiry cron windows (mirror Keeto_SuperAdmin_User/src/helpers/weightCart.helper.ts) ───
/** A checking_out claim without an order older than this is stale → back to awaiting_customer_approval. */
export const CHECKOUT_NO_ORDER_MINUTES = 5;
/** A weighted Visa order still pending_payment after this is abandoned → treated as a failed payment. */
export const PAYMENT_ABANDON_MINUTES = 30;
/** Failed / abandoned payment attempts after which the request expires. */
export const MAX_PAYMENT_ATTEMPTS = 3;
/** Same as the restaurant_settings column defaults (migration 0013: 10 / 15). */
export const DEFAULT_WEIGHT_RESTAURANT_TIMEOUT_MIN = 10;
/** Fallback when restaurant_settings has no row: the agreed 15 minutes. */
export const DEFAULT_WEIGHT_CUSTOMER_TIMEOUT_MIN = 15;

export const EXPIRE_REASON_RESTAURANT = "restaurant did not respond";
export const EXPIRE_REASON_CUSTOMER = "customer did not respond";
export const EXPIRE_REASON_PAYMENTS = `payment failed ${MAX_PAYMENT_ATTEMPTS} times`;

export type CronAction =
    /** awaiting_* past expires_at → expired with the normal cleanup; notify the other side */
    | { kind: "expire"; reason: string; notify: "customer" | "restaurant" }
    /** checking_out without an order for longer than CHECKOUT_NO_ORDER_MINUTES */
    | { kind: "revert_claim" }
    /** checking_out whose order is still pending_payment after PAYMENT_ABANDON_MINUTES (A5 path) */
    | { kind: "fail_abandoned" }
    /** checking_out whose order is already paid → approved + cart cleanup */
    | { kind: "approve_paid" }
    /** checking_out whose order was failed / cancelled elsewhere → back to awaiting_customer_approval */
    | { kind: "revert_failed" }
    | { kind: "none" };

const ageMinutes = (from: Date | string | null | undefined, now: Date) =>
    from ? (now.getTime() - new Date(from).getTime()) / 60000 : Number.POSITIVE_INFINITY;

/**
 * Pure decision for one weight request (and its order, if any). The cron calls it twice:
 * once to pick candidates and again on the rows locked FOR UPDATE, so a request approved /
 * cancelled / changed in the meantime gets "none" and is skipped.
 */
export const decideCronAction = (
    request: { status: string; expiresAt: Date | string; checkoutStartedAt?: Date | string | null; orderId?: string | null },
    order: { paymentStatus: string | null; status: string | null; createdAt: Date | string | null } | null,
    now: Date
): CronAction => {
    if (request.status === "awaiting_weighing" || request.status === "awaiting_customer_approval") {
        if (new Date(request.expiresAt) >= now) return { kind: "none" };
        return request.status === "awaiting_weighing"
            ? { kind: "expire", reason: EXPIRE_REASON_RESTAURANT, notify: "customer" }
            : { kind: "expire", reason: EXPIRE_REASON_CUSTOMER, notify: "restaurant" };
    }
    if (request.status !== "checking_out") return { kind: "none" };

    if (!request.orderId || !order) {
        return ageMinutes(request.checkoutStartedAt, now) >= CHECKOUT_NO_ORDER_MINUTES ? { kind: "revert_claim" } : { kind: "none" };
    }
    if (order.paymentStatus === "paid") return { kind: "approve_paid" };
    if (order.paymentStatus === "payment_failed" || order.status === "failed" || order.status === "cancelled") {
        return { kind: "revert_failed" };
    }
    if (order.status && order.status !== "pending") return { kind: "approve_paid" }; // accepted & beyond = confirmed
    return ageMinutes(order.createdAt, now) >= PAYMENT_ABANDON_MINUTES ? { kind: "fail_abandoned" } : { kind: "none" };
};

/** Outcome of an abandoned payment: revert (attempts + 1) or expire at the limit. */
export const abandonedPaymentOutcome = (paymentAttempts: number): "revert" | "expire" =>
    paymentAttempts + 1 >= MAX_PAYMENT_ATTEMPTS ? "expire" : "revert";

/** mysql2 update result → affected rows. */
export const affectedRows = (result: any): number =>
    Number((Array.isArray(result) ? result[0]?.affectedRows : result?.affectedRows) ?? 0);

// ─── Confirm (restaurant sends the weights to the customer) ───
/** Fallback when restaurant_settings has no row: same as the column default. */
export const DEFAULT_WEIGHT_MAX_INCREASE_PERCENT = 10;

export interface ConfirmItem {
    id: string;
    foodId: string | null;
    foodName: string | null;
    addedBy: string | null;
    sold_by: string | null;
    orderedWeight: string | number | null;
    finalWeight: string | number | null;
    isUnavailable: boolean | null;
    weightUnit: string | null;
    foodWeightUnit?: string | null;
    unitPrice: string | number | null;
    variations: unknown;
    addons: unknown;
}

export type ConfirmLogAction = "confirmed_as_ordered" | "weighed" | "marked_unavailable" | "added_by_restaurant";

export type ConfirmPlan =
    | { kind: "reject"; message: string }
    | { kind: "cancel" }
    | {
        kind: "confirm";
        /** weighted customer rows without a final weight: final_weight = ordered weight */
        defaults: Array<{ id: string; finalWeight: string; totalPrice: string }>;
        log: Array<{ item: ConfirmItem; action: ConfirmLogAction; finalWeight: string | number | null }>;
    };

/**
 * Pure plan for POST /admin/weight-requests/:id/confirm (the caller holds the locked transaction).
 * - Default: every weighted customer row that is not unavailable and has no final weight is confirmed
 *   at the ordered weight (line total recomputed with computeWeightedLineTotal for consistency).
 * - strict: such a row is rejected instead (the old behaviour).
 * - Then every weighted customer row (incl. defaulted ones) must be > 0, within the max increase and sane;
 *   weighted restaurant-added rows must be sane.
 * - No weighted customer rows at all → reject. All unavailable and nothing added → cancel.
 */
export const planConfirmation = (
    items: ConfirmItem[],
    opts: { strict: boolean; maxIncreasePercent: number },
    computeLineTotal: (weight: number, unitPrice: number, extras: Array<{ price: number | string; priceMode?: string | null }>) => string,
    checks: {
        isWeightWithinLimit: (ordered: number | string, final: number | string, pct: number) => boolean;
        isSaneWeight: (weight: number, unit?: string | null) => boolean;
    }
): ConfirmPlan => {
    const name = (i: ConfirmItem) => `"${i.foodName ?? i.foodId ?? i.id}"`;
    const weightedCustomer = items.filter((i) => i.addedBy === "customer" && isWeighedRow({ weight: i.orderedWeight }, i.sold_by));
    const restaurantRows = items.filter((i) => i.addedBy === "restaurant");

    if (weightedCustomer.length === 0) {
        return { kind: "reject", message: "This request has no weight-based items to confirm." };
    }

    if (weightedCustomer.every((i) => i.isUnavailable) && restaurantRows.length === 0) {
        return { kind: "cancel" };
    }

    const defaults: Array<{ id: string; finalWeight: string; totalPrice: string }> = [];
    const log: Array<{ item: ConfirmItem; action: ConfirmLogAction; finalWeight: string | number | null }> = [];

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
        } catch {
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
        } else {
            const extras = [
                ...parseVariationSnapshot(item.variations).map((v: any) => ({ price: v.price ?? v.additionalPrice ?? 0, priceMode: v.priceMode || "fixed" })),
                ...parseAddonSnapshot(item.addons).map((a: any) => ({ price: a.price ?? 0, priceMode: "fixed" })),
            ];
            const fw = finalWeight.toFixed(3);
            defaults.push({ id: item.id, finalWeight: fw, totalPrice: computeLineTotal(finalWeight, Number(item.unitPrice ?? 0), extras) });
            log.push({ item, action: "confirmed_as_ordered", finalWeight: fw });
        }
    }

    for (const item of restaurantRows) {
        if (isWeighedRow({ weight: item.orderedWeight }, item.sold_by)) {
            const w = Number(item.finalWeight ?? item.orderedWeight);
            if (!(w > 0) || !checks.isSaneWeight(w, item.weightUnit || item.foodWeightUnit)) {
                return { kind: "reject", message: `Restaurant-added item ${name(item)} has no valid weight.` };
            }
        }
        log.push({ item, action: "added_by_restaurant", finalWeight: item.finalWeight });
    }

    return { kind: "confirm", defaults, log };
};

// ─── Restaurant-added items: same branch / channel pricing as the customer cart ───
export type ServiceModuleValue = "takeaway" | "dine_in" | "delivery";

/**
 * Which branch / service module prices a restaurant-added item. The request has a branch
 * (weight_requests.branch_id) but no service module; the service module is read from the
 * customer's own cart rows (cart_items.service_module, set when the customer added items with
 * a channel). Missing service module → undefined: branch-level / base pricing only, which is what
 * the customer's cart uses for rows without a service module. Missing branch → the customer rows'
 * branch, else the restaurant's first active branch (getCart's fallback), else "" (no branch overrides).
 */
export const resolveRestaurantItemPricingContext = (p: {
    requestBranchId: string | null | undefined;
    customerRows: Array<{ branchId?: string | null; serviceModule?: string | null }>;
    activeBranchIds: string[];
}): { branchId: string; serviceModule: ServiceModuleValue | undefined; branchSource: string; serviceModuleSource: string } => {
    const rowBranch = p.customerRows.find((r) => r.branchId)?.branchId || null;
    const branchId = p.requestBranchId || rowBranch || p.activeBranchIds[0] || "";
    const branchSource = p.requestBranchId ? "request" : rowBranch ? "customer_cart" : p.activeBranchIds[0] ? "first_active_branch" : "none";
    const module = p.customerRows.find((r) => r.serviceModule)?.serviceModule as ServiceModuleValue | undefined;
    return { branchId, serviceModule: module || undefined, branchSource, serviceModuleSource: module ? "customer_cart" : "none" };
};

/**
 * Price of a restaurant-added row from calculateCalculatedPrice's result (channel-resolved base and
 * option prices) plus addon prices. `ownerUnitPrice` (owner only) replaces the resolved base price.
 * Weighted: unit_price = base per weight unit; unit rows: unit_price = base + options + addons.
 */
export const buildRestaurantItemPrice = (p: {
    isWeighted: boolean;
    weight: number | null;
    quantity: number;
    resolvedBasePrice: number;
    options: Array<{ price: number; priceMode?: string | null }>;
    addonPrices: number[];
    ownerUnitPrice?: number;
}, computeLineTotal: (w: number, base: number, extras: Array<{ price: number; priceMode?: string | null }>) => string) => {
    const base = p.ownerUnitPrice !== undefined ? p.ownerUnitPrice : p.resolvedBasePrice;
    if (p.isWeighted) {
        const extras = [...p.options, ...p.addonPrices.map((price) => ({ price, priceMode: "fixed" }))];
        return { unitPrice: base.toFixed(2), totalPrice: computeLineTotal(Number(p.weight), base, extras), basePrice: base };
    }
    const cents = (n: number) => Math.round(n * 100);
    const unitCents = cents(base) + p.options.reduce((s, o) => s + cents(Number(o.price)), 0) + p.addonPrices.reduce((s, a) => s + cents(a), 0);
    return { unitPrice: (unitCents / 100).toFixed(2), totalPrice: ((unitCents * p.quantity) / 100).toFixed(2), basePrice: base };
};

/** A price set by the restaurant owner instead of the menu price, kept in weighing_log. */
export const priceChangeLogEntry = (p: {
    cartItemId: string | null; foodId: string | null; foodName?: string | null;
    oldPrice: string | number | null; newPrice: string | number; by: string | null; now: Date;
}) => ({
    action: "price_changed" as const,
    cartItemId: p.cartItemId,
    foodId: p.foodId,
    foodName: p.foodName ?? null,
    oldPrice: p.oldPrice === null ? null : Number(p.oldPrice).toFixed(2),
    newPrice: Number(p.newPrice).toFixed(2),
    changedBy: p.by,
    timestamp: p.now.toISOString(),
});
