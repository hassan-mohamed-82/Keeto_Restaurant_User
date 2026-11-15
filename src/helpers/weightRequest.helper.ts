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

/** A cart row that needs weighing (weight-sold food or a stored weight). */
export const isWeighedRow = (row: { weight?: unknown; offerId?: string | null }, foodSoldBy?: string | null): boolean =>
    !row.offerId && (foodSoldBy === "weight" || (row.weight !== undefined && row.weight !== null));
