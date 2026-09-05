export type ServiceModule = "takeaway" | "dine_in" | "delivery";

export interface BranchPriceOverride {
    branchId: string;
    price?: number | string | null; // Optional: If missing/null/undefined -> default to "0.00" (inherits base food.price)
    status?: "active" | "inactive"; // Defaults to "active" if not provided
}

export interface ChannelPriceOverride {
    branchId?: string | null; // null for Global Channel Default, UUID for Branch-Specific Channel Override
    serviceModule: ServiceModule;
    price: number | string;
    status?: "active" | "inactive"; // Defaults to "active" if not provided
}

export interface VariantPriceOverride {
    variantId: string;
    branches?: BranchPriceOverride[];
    channels?: ChannelPriceOverride[];
}

export interface UpsertFoodPricingInput {
    id?: string;
    restaurantId: string;
    name: string;
    nameAr?: string;
    nameFr?: string;
    description?: string;
    descriptionAr?: string;
    descriptionFr?: string;
    image?: string;
    categoryId: string;
    subcategoryId?: string;
    mainPrice: number | string; // Base price for food.price (standard across all branches)
    branches?: BranchPriceOverride[]; // Branch-specific overrides
    channels?: ChannelPriceOverride[]; // Channel pricing (takeaway, dine_in, delivery)
    variants?: VariantPriceOverride[]; // Variant branch & channel pricing
}

export interface GetMenuQueryParams {
    branchId?: string | string[];
    branchIds?: string | string[];
    serviceModule?: ServiceModule | ServiceModule[] | "all";
    serviceModules?: ServiceModule | ServiceModule[] | "all";
    subcategoryId?: string;
    categoryId?: string;
    restaurantId?: string;
}

export interface BatchProductChannelPriceInput {
    foodId: string;
    branchId?: string | string[] | null;
    serviceModule: ServiceModule | ServiceModule[] | "all" | string | string[];
    price: number | string;
    status?: "active" | "inactive";
}

export interface BatchVariantChannelPriceInput {
    variantId: string;
    branchId?: string | string[] | null;
    serviceModule: ServiceModule | ServiceModule[] | "all" | string | string[];
    price: number | string;
    status?: "active" | "inactive";
}


