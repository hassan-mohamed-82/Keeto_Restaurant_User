import assert from "assert";
import {
    computeWeightedLineTotal,
    validateOptionPriceMode,
    isWeightWithinLimit,
    calcMaxAllowedWeight,
} from "../src/helpers/weightPricing.helper";
import { BadRequest } from "../src/Errors/BadRequest";

const foodUnitPrice = 300;
const optionGrilledPerWeight = { price: 60, priceMode: "per_weight" as const };
const optionGiftWrapFixed = { price: 10, priceMode: "fixed" as const };

// 1. 0.5 kg -> 190.00
const t1 = computeWeightedLineTotal(0.5, foodUnitPrice, [
    optionGrilledPerWeight,
    optionGiftWrapFixed,
]);
assert.strictEqual(t1, "190.00", `Expected 190.00, got ${t1}`);
console.log("✓ 0.5 kg -> 190.00 passed");

// 2. 0.25 kg -> 90.00
const t2 = computeWeightedLineTotal(0.25, foodUnitPrice, [
    optionGrilledPerWeight,
]);
assert.strictEqual(t2, "90.00", `Expected 90.00, got ${t2}`);
console.log("✓ 0.25 kg -> 90.00 passed");

// 3. 1 kg -> 360.00
const t3 = computeWeightedLineTotal(1, foodUnitPrice, [
    optionGrilledPerWeight,
]);
assert.strictEqual(t3, "360.00", `Expected 360.00, got ${t3}`);
console.log("✓ 1 kg -> 360.00 passed");

// 4. after weighing 0.45 kg -> 172.00
const t4 = computeWeightedLineTotal(0.45, foodUnitPrice, [
    optionGrilledPerWeight,
    optionGiftWrapFixed,
]);
assert.strictEqual(t4, "172.00", `Expected 172.00, got ${t4}`);
console.log("✓ after weighing 0.45 kg -> 172.00 passed");

// 5. per_weight on a unit food (rejected)
assert.throws(() => {
    validateOptionPriceMode("unit", "per_weight", 60);
}, BadRequest, "Expected per_weight on unit food to be rejected");
console.log("✓ per_weight on unit food (rejected) passed");

// 6. existing fixed-only options unchanged
const t6a = computeWeightedLineTotal(0.5, foodUnitPrice);
assert.strictEqual(t6a, "150.00", `Expected 150.00, got ${t6a}`);
const t6b = computeWeightedLineTotal(0.5, foodUnitPrice, [{ price: 10 }]);
assert.strictEqual(t6b, "160.00", `Expected 160.00, got ${t6b}`);
console.log("✓ existing fixed-only options unchanged passed");

// 7. weight limit tests
assert.strictEqual(calcMaxAllowedWeight(0.5, 10), 0.55);
assert.strictEqual(isWeightWithinLimit(0.5, 0.55, 10), true);
assert.strictEqual(isWeightWithinLimit(0.5, 0.45, 10), true);
assert.strictEqual(isWeightWithinLimit(0.5, 0.56, 10), false);
console.log("✓ weight limits passed");

console.log("\nAll weight pricing tests passed successfully!");
