import { BadRequest } from "../Errors/BadRequest";

// ==========================================
// Weight Setting Hard Limits (Server-enforced)
// ==========================================
export const WEIGHT_SETTING_LIMITS = {
    maxIncreasePercent:   { min: 0, max: 20 },
    restaurantTimeoutMin: { min: 5, max: 60 },
    customerTimeoutMin:   { min: 5, max: 60 },
} as const;

/**
 * Validates restaurant weight settings against system-wide bounds.
 * Throws BadRequest if any value is out of range.
 */
export const validateWeightSettings = (settings: {
    weightMaxIncreasePercent?: number;
    weightRestaurantTimeoutMin?: number;
    weightCustomerTimeoutMin?: number;
}): void => {
    if (settings.weightMaxIncreasePercent !== undefined) {
        const { min, max } = WEIGHT_SETTING_LIMITS.maxIncreasePercent;
        if (settings.weightMaxIncreasePercent < min || settings.weightMaxIncreasePercent > max) {
            throw new BadRequest(`weight_max_increase_percent must be between ${min} and ${max}`);
        }
    }
    if (settings.weightRestaurantTimeoutMin !== undefined) {
        const { min, max } = WEIGHT_SETTING_LIMITS.restaurantTimeoutMin;
        if (settings.weightRestaurantTimeoutMin < min || settings.weightRestaurantTimeoutMin > max) {
            throw new BadRequest(`weight_restaurant_timeout_min must be between ${min} and ${max}`);
        }
    }
    if (settings.weightCustomerTimeoutMin !== undefined) {
        const { min, max } = WEIGHT_SETTING_LIMITS.customerTimeoutMin;
        if (settings.weightCustomerTimeoutMin < min || settings.weightCustomerTimeoutMin > max) {
            throw new BadRequest(`weight_customer_timeout_min must be between ${min} and ${max}`);
        }
    }
};

export interface WeightedOptionExtra {
    price: number | string;
    priceMode?: "fixed" | "per_weight" | string | null;
}

/**
 * Validates whether an option's priceMode and additionalPrice are valid for a given food's sold_by.
 * - Additional price must be >= 0.
 * - per_weight is only allowed for foods sold by weight.
 */
export const validateOptionPriceMode = (
    soldBy: "unit" | "weight" | string | null | undefined,
    priceMode?: "fixed" | "per_weight" | string | null,
    additionalPrice?: number | string | null
): void => {
    if (additionalPrice !== undefined && additionalPrice !== null) {
        const p = typeof additionalPrice === "number" ? additionalPrice : parseFloat(additionalPrice.toString());
        if (isNaN(p) || p < 0) {
            throw new BadRequest("Option additional price must be greater than or equal to 0");
        }
    }
    const mode = priceMode || "fixed";
    if (mode === "per_weight" && soldBy !== "weight") {
        throw new BadRequest("per_weight price_mode is only allowed on weight-based products");
    }
};

/**
 * Computes line total for a weighted item using exact integer arithmetic:
 * line_total = weight * food_unit_price + sum(fixed extras) + sum(weight * per_weight extras)
 *
 * Avoids IEEE-754 floating point drift by scaling weight to thousandths (milligrams/grams)
 * and unitPrice to hundredths (cents/piastres).
 *
 * @param weight customer or restaurant weight (in food's weight_unit)
 * @param foodUnitPrice price per weight_unit of the food
 * @param options optional array of option/addon extras with price and priceMode
 * @returns string formatted with 2 decimal places (e.g. "190.00")
 */
export const computeWeightedLineTotal = (
    weight: number | string,
    foodUnitPrice: number | string,
    options: WeightedOptionExtra[] = []
): string => {
    const w = typeof weight === "number" ? weight : parseFloat(weight);
    const baseP = typeof foodUnitPrice === "number" ? foodUnitPrice : parseFloat(foodUnitPrice);

    if (isNaN(w) || isNaN(baseP) || w < 0 || baseP < 0) {
        throw new BadRequest("Invalid weight or unit price");
    }

    // w * 1000 to thousandths; baseP * 100 to hundredths
    const weightScaled = Math.round(w * 1000);
    let totalPerWeightCents = Math.round(baseP * 100);
    let fixedCents = 0;

    for (const opt of options) {
        const optPrice = typeof opt.price === "number" ? opt.price : parseFloat(opt.price || "0");
        if (isNaN(optPrice) || optPrice < 0) {
            throw new BadRequest("Option additional price must be >= 0");
        }
        const optCents = Math.round(optPrice * 100);
        if (opt.priceMode === "per_weight") {
            totalPerWeightCents += optCents;
        } else {
            fixedCents += optCents;
        }
    }

    // weightScaled * totalPerWeightCents has scale 100,000
    // To get cents (scale 100), divide by 1000 and round
    const perWeightCents = Math.round((weightScaled * totalPerWeightCents) / 1000);
    const finalCents = perWeightCents + fixedCents;

    return (finalCents / 100).toFixed(2);
};

/**
 * Calculates the maximum allowed weight for a restaurant submission.
 * final_weight <= ordered_weight * (1 + maxIncreasePercent / 100)
 */
export const calcMaxAllowedWeight = (
    orderedWeight: number | string,
    maxIncreasePercent: number
): number => {
    const ow = typeof orderedWeight === "number" ? orderedWeight : parseFloat(orderedWeight);
    if (isNaN(ow) || ow <= 0) {
        throw new BadRequest("Invalid ordered weight");
    }
    const owScaled = Math.round(ow * 1000);
    const maxScaled = Math.floor((owScaled * (100 + maxIncreasePercent)) / 100);
    return maxScaled / 1000;
};

/**
 * Validates whether finalWeight is valid given orderedWeight and maxIncreasePercent:
 * - Must be > 0
 * - Must be <= calcMaxAllowedWeight(orderedWeight, maxIncreasePercent)
 */
export const isWeightWithinLimit = (
    orderedWeight: number | string,
    finalWeight: number | string,
    maxIncreasePercent: number
): boolean => {
    const fw = typeof finalWeight === "number" ? finalWeight : parseFloat(finalWeight);
    if (isNaN(fw) || fw <= 0) return false;

    const maxAllowed = calcMaxAllowedWeight(orderedWeight, maxIncreasePercent);
    // 0.0001 epsilon for floating point comparison safety
    return fw <= maxAllowed + 0.0001;
};

export const SANE_MAX_WEIGHT = {
    kg: 100,
    gm: 100000,
} as const;

export const isSaneWeight = (weight: number, unit?: "kg" | "gm" | string | null): boolean => {
    if (weight <= 0) return false;
    const max = unit === "gm" ? SANE_MAX_WEIGHT.gm : SANE_MAX_WEIGHT.kg;
    return weight <= max;
};
