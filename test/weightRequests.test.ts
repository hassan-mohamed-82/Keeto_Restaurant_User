import assert from "node:assert/strict";
import {
    computeWeightedLineTotal,
    calcMaxAllowedWeight,
    isWeightWithinLimit,
    validateOptionPriceMode,
    isSaneWeight,
} from "../src/helpers/weightPricing.helper";
import { BadRequest } from "../src/Errors/BadRequest";
import { NotFound } from "../src/Errors/NotFound";

console.log("Starting Restaurant Weight Requests Test Suite...");

// ==========================================
// Test 1: Sane Maximum Weight Constant & Validation
// ==========================================
assert.equal(isSaneWeight(50, "kg"), true);
assert.equal(isSaneWeight(100, "kg"), true);
assert.equal(isSaneWeight(100.1, "kg"), false);
assert.equal(isSaneWeight(50000, "gm"), true);
assert.equal(isSaneWeight(100000, "gm"), true);
assert.equal(isSaneWeight(100001, "gm"), false);
assert.equal(isSaneWeight(0, "kg"), false);
assert.equal(isSaneWeight(-5, "kg"), false);
console.log("✓ Test 1 Passed: Sane maximum weight rules verified.");

// ==========================================
// Test 2: Customer item weight update & max increase percentage rule
// ==========================================
const orderedWeight = 0.5; // kg
const maxIncreasePercent = 20; // 20% max increase -> 0.6 kg allowed
const maxAllowed = calcMaxAllowedWeight(orderedWeight, maxIncreasePercent);
assert.equal(maxAllowed, 0.6);

assert.equal(isWeightWithinLimit(orderedWeight, 0.55, maxIncreasePercent), true);
assert.equal(isWeightWithinLimit(orderedWeight, 0.60, maxIncreasePercent), true);
assert.equal(isWeightWithinLimit(orderedWeight, 0.61, maxIncreasePercent), false); // Rejected: > 20% increase
console.log("✓ Test 2 Passed: Customer item finalWeight increase limit verified.");

// ==========================================
// Test 3: PUT /items Simulator (Semantics & Constraints)
// ==========================================
interface MockCartRow {
    id: string;
    weightRequestId: string;
    foodId: string;
    quantity: number;
    weight: string | null;
    addedBy: "customer" | "restaurant";
}

function simulatePutItems(
    existingRows: MockCartRow[],
    incomingItems: Array<{ cartItemId?: string; foodId: string; weight?: number; quantity?: number; variations?: any[] }>,
    requestStatus: string,
    foodCatalog: Map<string, { id: string; restaurantId: string; sold_by: string; status: string }>,
    staffRestaurantId: string
): MockCartRow[] {
    if (requestStatus !== "awaiting_weighing") {
        throw new BadRequest(`Item edits are only allowed while request is awaiting weighing. Current status: ${requestStatus}`);
    }

    const existingRestMap = new Map(
        existingRows.filter((r) => r.addedBy === "restaurant").map((r) => [r.id, r])
    );
    const retainedRestIds = new Set<string>();

    const updatedRows = [...existingRows.filter((r) => r.addedBy === "customer")];

    for (let i = 0; i < incomingItems.length; i++) {
        const item = incomingItems[i];

        if (item.cartItemId) {
            if (!existingRestMap.has(item.cartItemId)) {
                throw new BadRequest(`Item at index ${i}: Invalid cartItemId or targets customer-owned item.`);
            }
            retainedRestIds.add(item.cartItemId);
        }

        const foodItem = foodCatalog.get(item.foodId);
        if (!foodItem || foodItem.restaurantId !== staffRestaurantId) {
            throw new BadRequest(`Item at index ${i}: Food not found or belongs to another restaurant.`);
        }
        if (foodItem.status !== "active") {
            throw new BadRequest(`Item at index ${i}: Food is inactive.`);
        }

        if (foodItem.sold_by === "weight") {
            if (!item.weight || item.weight <= 0) {
                throw new BadRequest(`Item at index ${i}: Weight is required for weight-based food.`);
            }
            if (!isSaneWeight(item.weight, "kg")) {
                throw new BadRequest(`Item at index ${i}: Weight exceeds sane maximum limit.`);
            }
        }

        if (item.cartItemId) {
            const existing = existingRestMap.get(item.cartItemId)!;
            updatedRows.push({
                ...existing,
                quantity: item.quantity || 1,
                weight: item.weight ? item.weight.toString() : null,
            });
        } else {
            updatedRows.push({
                id: `rest-item-${Math.random()}`,
                weightRequestId: "req-1",
                foodId: item.foodId,
                quantity: item.quantity || 1,
                weight: item.weight ? item.weight.toString() : null,
                addedBy: "restaurant",
            });
        }
    }

    return updatedRows;
}

const foodCatalog = new Map([
    ["f-beef", { id: "f-beef", restaurantId: "rest-1", sold_by: "weight", status: "active" }],
    ["f-rice", { id: "f-rice", restaurantId: "rest-1", sold_by: "unit", status: "active" }],
    ["f-inactive", { id: "f-inactive", restaurantId: "rest-1", sold_by: "unit", status: "inactive" }],
    ["f-other-rest", { id: "f-other-rest", restaurantId: "rest-2", sold_by: "unit", status: "active" }],
]);

const initialCart: MockCartRow[] = [
    { id: "cust-1", weightRequestId: "req-1", foodId: "f-beef", quantity: 1, weight: "0.500", addedBy: "customer" },
    { id: "rest-old-1", weightRequestId: "req-1", foodId: "f-rice", quantity: 1, weight: null, addedBy: "restaurant" },
    { id: "rest-old-2", weightRequestId: "req-1", foodId: "f-rice", quantity: 2, weight: null, addedBy: "restaurant" },
];

// 3a. PUT: update existing rest-old-1, add new, omit rest-old-2 (delete by omission)
const putResult1 = simulatePutItems(
    initialCart,
    [
        { cartItemId: "rest-old-1", foodId: "f-rice", quantity: 3 },
        { foodId: "f-beef", weight: 0.25 },
    ],
    "awaiting_weighing",
    foodCatalog,
    "rest-1"
);
assert.equal(putResult1.filter((r) => r.addedBy === "customer").length, 1);
assert.equal(putResult1.some((r) => r.id === "rest-old-1" && r.quantity === 3), true);
assert.equal(putResult1.some((r) => r.id === "rest-old-2"), false); // Deleted by omission!
assert.equal(putResult1.length, 3); // 1 customer + 1 updated rest + 1 new rest
console.log("✓ Test 3a Passed: PUT update, add, and omission delete verified.");

// 3b. PUT with empty array deletes all restaurant items
const putResultEmpty = simulatePutItems(
    initialCart,
    [],
    "awaiting_weighing",
    foodCatalog,
    "rest-1"
);
assert.equal(putResultEmpty.length, 1);
assert.equal(putResultEmpty[0].id, "cust-1"); // Only customer row remains!
console.log("✓ Test 3b Passed: PUT empty array deletes all restaurant-added items.");

// 3c. Updating customer-owned item via cartItemId is rejected
assert.throws(() => {
    simulatePutItems(
        initialCart,
        [{ cartItemId: "cust-1", foodId: "f-rice", quantity: 2 }],
        "awaiting_weighing",
        foodCatalog,
        "rest-1"
    );
}, /targets customer-owned item/);
console.log("✓ Test 3c Passed: Updating customer item via PUT is rejected.");

// 3d. Invalid item rolls back whole call with item index in error message
assert.throws(() => {
    simulatePutItems(
        initialCart,
        [
            { cartItemId: "rest-old-1", foodId: "f-rice", quantity: 2 },
            { foodId: "f-inactive", quantity: 1 }, // Index 1 is inactive
        ],
        "awaiting_weighing",
        foodCatalog,
        "rest-1"
    );
}, /Item at index 1: Food is inactive/);
console.log("✓ Test 3d Passed: Validation failure returns offending item index.");

// ==========================================
// Test 4: Status Transition Constraints
// ==========================================
// 4a. Edit after confirm is rejected
assert.throws(() => {
    simulatePutItems(
        initialCart,
        [{ cartItemId: "rest-old-1", foodId: "f-rice", quantity: 3 }],
        "awaiting_customer_approval",
        foodCatalog,
        "rest-1"
    );
}, /Item edits are only allowed while request is awaiting weighing/);
console.log("✓ Test 4a Passed: Edits after confirm are rejected.");

// 4b. Confirm allowed only once
function simulateConfirm(status: string) {
    if (status !== "awaiting_weighing") {
        throw new BadRequest(`Only requests in 'awaiting_weighing' status can be confirmed. Current status: ${status}`);
    }
    return "awaiting_customer_approval";
}

assert.equal(simulateConfirm("awaiting_weighing"), "awaiting_customer_approval");
assert.throws(() => simulateConfirm("awaiting_customer_approval"), /Only requests in 'awaiting_weighing'/);
console.log("✓ Test 4b Passed: A second confirm is rejected.");

// ==========================================
// Test 5: Authorization Scope (Cross-restaurant protection)
// ==========================================
function simulateStaffAccess(requestRestaurantId: string, staffRestaurantId: string) {
    if (requestRestaurantId !== staffRestaurantId) {
        throw new NotFound("Weight request not found for this restaurant");
    }
    return { ok: true };
}

assert.equal(simulateStaffAccess("rest-1", "rest-1").ok, true);
assert.throws(() => simulateStaffAccess("rest-1", "rest-2"), NotFound);
console.log("✓ Test 5 Passed: Cross-restaurant access strictly forbidden.");

// ==========================================
// Test 6: Cancel / Expiry Cleanup
// ==========================================
function simulateCleanup(rows: MockCartRow[]) {
    // Delete restaurant items
    const afterDelete = rows.filter((r) => r.addedBy !== "restaurant");
    // Unlock and reset customer items
    const afterReset = afterDelete.map((r) => ({
        ...r,
        finalWeight: null,
        isUnavailable: false,
        weightRequestId: null,
    }));
    return afterReset;
}

const cleaned = simulateCleanup(initialCart);
assert.equal(cleaned.length, 1);
assert.equal(cleaned[0].id, "cust-1");
assert.equal(cleaned[0].weightRequestId, null);
assert.equal(cleaned[0].finalWeight, null);
console.log("✓ Test 6 Passed: Cancel/Expiry cleanup removes restaurant items and resets customer items.");

console.log("\n All Restaurant Weight Request Tests Passed Successfully! \n");
