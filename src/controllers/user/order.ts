// controllers/user/OrderController.ts
import { Request, Response } from "express";
import { db } from "../../models/connection";
import {
    restaurantWallets, restaurantWalletTransactions,
    restaurantZoneDeliveryFees, zoneDeliveryFees, restaurantSettings,
    restaurantSchedules, cartItems, users, addresses, branches,
    userWallets, userWalletTransactions, paymentMethods,
    coupons, couponUsages, couponRestaurants, discounts, discountRestaurants, discountFoods,
    selectReasons,
    orders,
    restaurants,
    orderItems,
    restaurantBusinessPlans,
    food,
    restaurant_users,
    deliveryMen,
    freeDeliveryOffers,
    variationOptions,
    notifications,
    zones,
    addons
} from "../../models/schema";
import { eq, and, inArray, sql, desc, gte } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { UnauthorizedError } from "../../Errors";
import { sendPushNotification } from "../../utils/notifications";
import { calculateDistance, isLocationInZone } from "../../utils/geo";
import { applyPriorityDiscount, getAvailableDiscounts } from "../../utils/discount";
import { validateUserNotBlocked } from "../../utils/userBlockCheck";
import { calculateCurrentStatus } from "./restaurantFeatures";

// 👇 1. دالة تظبيط الوقت لتوقيت مصر عشان نص الإشعار
const formatToEgyptTime = (date: Date) => {
    return new Intl.DateTimeFormat("ar-EG", { // غيرتها لـ ar-EG عشان تطلع بالعربي لو حابة
        timeZone: "Africa/Cairo",
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    }).format(date);
};

// ==========================================
// 1. إنشاء الطلب (Checkout)
// ==========================================
const roundMoney = (amount: number): number => Math.round(amount * 100) / 100;

export const checkout = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const userId = req.user.id;

    const {
        orderSource,
        paymentMethod,
        orderType,
        idempotencyKey,
        zoneId,
        branchId,
        addressId,
        note,
        couponCode
    } = req.body;

    // ==========================================
    // 🛡️ 1. Validation
    // ==========================================
    const validOrderSources = ["online_order_app", "online_order_web", "food_aggregator", "mykeeto", "pos"];
    if (!validOrderSources.includes(orderSource)) {
        throw new BadRequest("Invalid order source");
    }

    const [selectedPayment] = await db.select().from(paymentMethods).where(eq(paymentMethods.id, paymentMethod)).limit(1);
    if (!selectedPayment || !selectedPayment.isActive) {
        throw new BadRequest("Invalid or inactive payment method");
    }
    const paymentMethodName = selectedPayment.name;
    const paymentMethodNameAr = selectedPayment.nameAr;
    const isWalletPayment = paymentMethodName === "wallet" || paymentMethodNameAr === "محفظتى";
    const isCashPayment = paymentMethodName === "cash_on_delivery" || paymentMethodNameAr === "الدفع عند الاستلام" || paymentMethodName === "cash";

    // ==========================================
    // 2. Idempotency Check
    // ==========================================
    if (idempotencyKey) {
        const [existing] = await db.select().from(orders).where(eq(orders.idempotencyKey, idempotencyKey)).limit(1);
        if (existing) return SuccessResponse(res, { message: "Order already processed", data: existing });
    }

    // ==========================================
    // 3. Get Cart Items
    // ==========================================
    const userCart = await db.select().from(cartItems).where(eq(cartItems.userId, userId));
    if (!userCart.length) throw new BadRequest("Your cart is empty");

    const restaurantId = userCart[0].restaurantId;

    // 🛡️ Block check: Verify user is not blocked globally or by this restaurant
    await validateUserNotBlocked(userId, restaurantId);

    // ==========================================
    // 4. Get Restaurant & Business Plan
    // ==========================================
    const [restaurant] = await db.select().from(restaurants).where(eq(restaurants.id, restaurantId)).limit(1);
    if (!restaurant) throw new BadRequest("Restaurant not found");

    const [plan] = await db.select()
        .from(restaurantBusinessPlans)
        .where(
            and(
                eq(restaurantBusinessPlans.restaurantId, restaurantId),
                eq(restaurantBusinessPlans.platformType, orderSource as any)
            )
        )
        .limit(1);

    if (!plan) {
        throw new BadRequest(`Order failed. This restaurant has no active business plan for ${orderSource}.`);
    }

    // ==========================================
    // 🛡️ 4.5 فحص مواعيد المطعم وإعدادات التشغيل
    // ==========================================
    const schedulesList = await db.select().from(restaurantSchedules).where(eq(restaurantSchedules.restaurantId, restaurantId));
    const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, restaurantId)).limit(1);

    const validOrderTypes = ["delivery", "takeaway", "dine_in"];
    if (!orderType || !validOrderTypes.includes(orderType)) {
        throw new BadRequest("orderType is required and must be one of: delivery, takeaway, dine_in");
    }
    const resolvedOrderType = orderType;
    const status = calculateCurrentStatus(settings, schedulesList);

    if (!status.isOpenNow) throw new BadRequest(`Order failed. ${status.reason}`);
    if (resolvedOrderType === "delivery" && !status.canDeliveryNow) throw new BadRequest("Order failed. Delivery service is currently disabled for this restaurant.");
    if (resolvedOrderType === "takeaway" && !status.canTakeawayNow) throw new BadRequest("Order failed. Takeaway service is currently disabled for this restaurant.");

    const defaultPreparingDuration = settings?.maxDeliveryTime ?? 30;
    // ==========================================
    // ⚡ 5. Batch Fetching
    // ==========================================
    const foodIds = [...new Set(userCart.map(item => item.foodId))];

    const allOptionIds: string[] = [];
    const allAddonIds: string[] = [];

    userCart.forEach(item => {
        let safeVars = typeof item.variations === 'string' ? JSON.parse(item.variations) : item.variations;
        if (typeof safeVars === 'string') safeVars = JSON.parse(safeVars);

        let parsedVars: any[] = [];
        let parsedAddons: any[] = [];

        if (Array.isArray(safeVars)) {
            parsedVars = safeVars;
        } else if (safeVars && typeof safeVars === 'object') {
            parsedVars = Array.isArray(safeVars.variations) ? safeVars.variations : [];
            parsedAddons = Array.isArray(safeVars.addons) ? safeVars.addons : [];
        }

        let safeAddons = typeof item.addons === 'string' ? JSON.parse(item.addons) : item.addons;
        if (typeof safeAddons === 'string') safeAddons = JSON.parse(safeAddons);
        if (Array.isArray(safeAddons)) {
            parsedAddons = [...parsedAddons, ...safeAddons];
        }

        parsedVars.forEach((v: any) => { if (v.optionId) allOptionIds.push(v.optionId); });
        parsedAddons.forEach((a: any) => { if (a.addonId || a.id) allAddonIds.push(a.addonId || a.id); });
    });

    const [foodList, optionsList, addonsListDb] = await Promise.all([
        db.select().from(food).where(inArray(food.id, foodIds)),
        allOptionIds.length > 0
            ? db.select().from(variationOptions).where(inArray(variationOptions.id, [...new Set(allOptionIds)]))
            : [],
        allAddonIds.length > 0
            ? db.select().from(addons).where(inArray(addons.id, [...new Set(allAddonIds)]))
            : []
    ]);

    const foodMap = new Map(foodList.map(f => [f.id, f]));
    const optionsMap = new Map(optionsList.map(o => [o.id, o]));
    const addonsMap = new Map(addonsListDb.map(a => [a.id, a]));

    // ==========================================
    // 5.1 Calculate Subtotal, Variations & Addons
    // ==========================================
    let subtotal = 0;
    let initialSubtotal = 0;
    const itemsWithData = [];

    for (const item of userCart) {
        const foodItem = foodMap.get(item.foodId);
        if (!foodItem) throw new BadRequest(`Food item with ID ${item.foodId} not found`);

        const originalBasePrice = parseFloat(foodItem.price as string || "0");

        let safeVars = typeof item.variations === 'string' ? JSON.parse(item.variations) : item.variations;
        if (typeof safeVars === 'string') safeVars = JSON.parse(safeVars);

        let parsedVariations: any[] = [];
        let parsedAddons: any[] = [];

        if (Array.isArray(safeVars)) {
            parsedVariations = safeVars;
        } else if (safeVars && typeof safeVars === 'object') {
            parsedVariations = Array.isArray(safeVars.variations) ? safeVars.variations : [];
            parsedAddons = Array.isArray(safeVars.addons) ? safeVars.addons : [];
        }

        let safeAddons = typeof item.addons === 'string' ? JSON.parse(item.addons) : item.addons;
        if (typeof safeAddons === 'string') safeAddons = JSON.parse(safeAddons);
        if (Array.isArray(safeAddons)) {
            parsedAddons = [...parsedAddons, ...safeAddons];
        }

        let varPrice = 0;
        let addonPrice = 0;

        for (const v of parsedVariations) {
            if (v.optionId) {
                const dbOption = optionsMap.get(v.optionId);
                if (dbOption) {
                    const dbOptionPrice = parseFloat((dbOption.additionalPrice || "0") as string);
                    varPrice += dbOptionPrice;
                    v.additionalPrice = dbOptionPrice.toString();
                }
            } else {
                varPrice += parseFloat(v.additionalPrice || v.price || v.amount || "0");
            }
        }

        for (const a of parsedAddons) {
            const addonId = a.addonId || a.id;
            const dbAddon = addonsMap.get(addonId);
            if (dbAddon) {
                const dbAddonPrice = parseFloat((dbAddon.price || "0") as string);
                addonPrice += dbAddonPrice;
                a.price = dbAddonPrice.toString();
            } else {
                addonPrice += parseFloat(a.price || "0");
            }
        }

        let initialDiscountPrice = originalBasePrice;
        if (foodItem.discount_value && Number(foodItem.discount_value) > 0) {
            if (foodItem.discount_type === "percentage") {
                initialDiscountPrice = Math.max(0, originalBasePrice - (originalBasePrice * Number(foodItem.discount_value) / 100));
            } else if (foodItem.discount_type === "amount" || foodItem.discount_type === "fixed") {
                initialDiscountPrice = Math.max(0, originalBasePrice - Number(foodItem.discount_value));
            }
        }

        initialSubtotal += (initialDiscountPrice + varPrice + addonPrice) * item.quantity;
        itemsWithData.push({ cartItem: item, foodItem, originalBasePrice, varPrice, addonPrice, vars: parsedVariations, addonsList: parsedAddons });
    }

    const availableDiscounts = await getAvailableDiscounts(restaurantId);
    const discountState = { remainingMaxDiscounts: new Map<string, number>(), appliedDiscounts: new Set<string>() };
    const itemsToInsert: any[] = [];

    for (const data of itemsWithData) {
        const { cartItem, foodItem, originalBasePrice, varPrice, addonPrice, vars, addonsList } = data;

        const { price: discountedBasePrice } = applyPriorityDiscount(
            { id: foodItem.id, discountType: foodItem.discount_type, discountValue: foodItem.discount_value },
            originalBasePrice,
            initialSubtotal,
            availableDiscounts,
            discountState,
            true
        );

        const itemTotal = roundMoney((discountedBasePrice + varPrice + addonPrice) * cartItem.quantity);
        subtotal += itemTotal;

        itemsToInsert.push({
            id: uuidv4(),
            foodId: cartItem.foodId,
            quantity: cartItem.quantity,
            basePrice: discountedBasePrice.toFixed(2),
            variationsPrice: varPrice.toFixed(2),
            addonsPrice: addonPrice.toFixed(2),
            totalPrice: itemTotal.toFixed(2),
            variations: vars,
            addons: addonsList,
            note: cartItem.note || null
        });
    }

    subtotal = roundMoney(subtotal);

    // ==========================================
    // 5.2 Fees & Commission
    // ==========================================
    const serviceFee = parseFloat(plan.serviceFee as string || "0");
    const commissionRate = parseFloat(plan.commissionRate as string || "0");
    const appCommission = roundMoney(subtotal * (commissionRate / 100));

    // ==========================================
    // 5.5 Check Coupons
    // ==========================================
    const nowTemp = new Date();
    let totalDiscount = 0;
    let appliedCoupon: any = null;
    let isFreeDelivery = false;

    if (couponCode) {
        const [coupon] = await db.select().from(coupons).where(eq(coupons.code, couponCode)).limit(1);
        if (!coupon || !coupon.isActive) throw new BadRequest("Invalid or inactive coupon");

        if (coupon.startDate && new Date(coupon.startDate) > nowTemp) throw new BadRequest("Coupon not yet active");
        if (coupon.endDate && new Date(coupon.endDate) < nowTemp) throw new BadRequest("Coupon expired");

        if (coupon.usageLimit && coupon.usedCount! >= coupon.usageLimit) throw new BadRequest("Coupon usage limit reached");
        if (parseFloat(coupon.minOrderAmount as string || "0") > subtotal) throw new BadRequest(`Minimum order amount of ${coupon.minOrderAmount} required for this coupon`);

        if (!coupon.isGlobal) {
            const [coupRest] = await db.select().from(couponRestaurants)
                .where(and(eq(couponRestaurants.couponId, coupon.id), eq(couponRestaurants.restaurantId, restaurantId))).limit(1);
            if (!coupRest) throw new BadRequest("Coupon is not applicable to this restaurant");
        }

        if (coupon.perUserLimit) {
            const usages = await db.select({ count: sql<number>`count(*)` }).from(couponUsages)
                .where(and(eq(couponUsages.couponId, coupon.id), eq(couponUsages.userId, userId)));
            if (usages[0].count >= coupon.perUserLimit) throw new BadRequest("You have reached the usage limit for this coupon");
        }

        const value = parseFloat(coupon.discountValue as string);
        if (coupon.discountType === "free_delivery") {
            isFreeDelivery = true;
        } else if (coupon.discountType === "fixed_amount") {
            totalDiscount += value;
        } else if (coupon.discountType === "percentage") {
            let pDiscount = subtotal * (value / 100);
            if (coupon.maxDiscount) {
                const max = parseFloat(coupon.maxDiscount as string);
                if (pDiscount > max) pDiscount = max;
            }
            totalDiscount += pDiscount;
        }

        appliedCoupon = coupon;
    }

    totalDiscount = roundMoney(totalDiscount);

    // ==========================================
    // 6. Dynamic Delivery & Turf Zone Logic (Updated)
    // ==========================================
    let deliveryFee = 0;
    let resolvedZoneId: string | null = zoneId || null;
    let resolvedBranchId: string | null = branchId || null;

    if (resolvedOrderType === "delivery") {
        if (!addressId) throw new BadRequest("Delivery address is required");

        const [userAddress] = await db.select().from(addresses)
            .where(and(eq(addresses.id, addressId), eq(addresses.userId, userId))).limit(1);
        if (!userAddress) throw new BadRequest("Invalid delivery address");

        const lat = parseFloat(userAddress.lat as string || "0");
        const lng = parseFloat(userAddress.lng as string || "0");

        if (!lat || !lng) {
            throw new BadRequest("Delivery address requires valid latitude and longitude coordinates.");
        }

        // Fetch all active delivery fees for this restaurant (including branchId)
        const restaurantFees = await db.select({
            id: restaurantZoneDeliveryFees.id,
            zoneId: restaurantZoneDeliveryFees.zoneId,
            branchId: restaurantZoneDeliveryFees.branchId,
            deliveryFee: restaurantZoneDeliveryFees.deliveryFee,
            coverageType: restaurantZoneDeliveryFees.coverageType,
            customCoordinates: restaurantZoneDeliveryFees.customCoordinates,
            customRadiusKm: restaurantZoneDeliveryFees.customRadiusKm,
            defaultCoordinates: zones.coordinates,
            defaultRadiusKm: zones.coverageAreaRadiusKm
        })
            .from(restaurantZoneDeliveryFees)
            .leftJoin(zones, eq(restaurantZoneDeliveryFees.zoneId, zones.id))
            .where(
                and(
                    eq(restaurantZoneDeliveryFees.restaurantId, restaurantId),
                    eq(restaurantZoneDeliveryFees.status, "active"),
                    branchId ? eq(restaurantZoneDeliveryFees.branchId, branchId) : undefined
                )
            );

        let applicableFee: any = null;
        let maxDeliveryFee = -1;

        for (const fee of restaurantFees) {
            if (isLocationInZone(lat, lng, fee.zoneId, fee)) {
                const currentFee = parseFloat(fee.deliveryFee as string || "0");
                if (currentFee > maxDeliveryFee) {
                    maxDeliveryFee = currentFee;
                    applicableFee = fee;
                }
            }
        }

        if (!applicableFee) {
            throw new BadRequest("Your delivery address is outside our covered delivery zones.");
        }

        resolvedZoneId = applicableFee.zoneId;
        if (!resolvedZoneId) {
            throw new BadRequest("No delivery zone found for this address.");
        }
        deliveryFee = parseFloat(applicableFee.deliveryFee as string || "0");

        // 🏪 تحديد/التحقق من الفرع المخصص للـ Delivery
        if (applicableFee.branchId) {
            resolvedBranchId = applicableFee.branchId;
        } else if (branchId) {
            const [selectedBranch] = await db.select({ id: branches.id })
                .from(branches)
                .where(
                    and(
                        eq(branches.id, branchId),
                        eq(branches.restaurantId, restaurantId),
                        eq(branches.status, "active")
                    )
                )
                .limit(1);

            if (!selectedBranch) {
                throw new BadRequest("Selected branch not found or inactive.");
            }
            resolvedBranchId = selectedBranch.id;
        } else {
            const [matchedBranch] = await db.select({ id: branches.id })
                .from(branches)
                .where(
                    and(
                        eq(branches.restaurantId, restaurantId),
                        eq(branches.zoneId, resolvedZoneId),
                        eq(branches.status, "active")
                    )
                )
                .limit(1);

            if (!matchedBranch) {
                throw new BadRequest("No active branch found serving your delivery zone.");
            }

            resolvedBranchId = matchedBranch.id;
        }
    } else {
        // For takeaway or dine_in: branchId is required
        if (!branchId) throw new BadRequest("Branch is required for takeaway or dine-in orders.");

        const [branch] = await db.select({ id: branches.id, zoneId: branches.zoneId })
            .from(branches)
            .where(
                and(
                    eq(branches.id, branchId),
                    eq(branches.restaurantId, restaurantId),
                    eq(branches.status, "active")
                )
            )
            .limit(1);

        if (!branch) throw new BadRequest("Invalid or inactive branch selected.");

        resolvedBranchId = branch.id;
        // zoneId is only meaningful for delivery orders
        // resolvedZoneId = branch.zoneId;
    }

    if (isFreeDelivery) deliveryFee = 0;

    // ==========================================
    // 6.5 Free Delivery Offer Check (schema-based)
    // ==========================================
    if (!isFreeDelivery && resolvedOrderType === "delivery") {
        const nowForOffer = new Date();
        const [freeDeliveryOffer] = await db
            .select()
            .from(freeDeliveryOffers)
            .where(
                and(
                    eq(freeDeliveryOffers.restaurantId, restaurantId),
                    eq(freeDeliveryOffers.status, "active")
                )
            )
            .limit(1);

        if (freeDeliveryOffer) {
            const startOk = !freeDeliveryOffer.startDate || new Date(freeDeliveryOffer.startDate) <= nowForOffer;
            const endOk = !freeDeliveryOffer.endDate || new Date(freeDeliveryOffer.endDate) >= nowForOffer;
            const minAmount = parseFloat(freeDeliveryOffer.minOrderAmount as string || "0");

            if (startOk && endOk && subtotal >= minAmount) {
                isFreeDelivery = true;
                deliveryFee = 0;
            }
        }
    }

    let totalAmount = roundMoney(subtotal + deliveryFee + serviceFee - totalDiscount);
    if (totalAmount < 0) totalAmount = 0;

    const orderId = uuidv4();
    const orderNumber = `ORD-${Date.now()}`;

    const [userInfo] = await db.select({ id: users.id, name: users.name, phone: users.phone, email: users.email })
        .from(users).where(eq(users.id, userId)).limit(1);

    // ==========================================
    // 🛡️ 10. Execute Order (Transaction)
    // ==========================================
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    let createdDailyOrderNumber = 1;

    await db.transaction(async (tx) => {
        // 🔒 1. Wallet deduction with FOR UPDATE
        if (isWalletPayment) {
            const [userWallet] = await tx.select()
                .from(userWallets)
                .where(eq(userWallets.userId, userId))
                .for("update");

            const currentBalance = parseFloat(userWallet?.balance as string || "0");
            if (!userWallet || currentBalance < totalAmount) {
                throw new BadRequest("Insufficient wallet balance");
            }

            const newBalance = roundMoney(currentBalance - totalAmount);

            await tx.update(userWallets)
                .set({ balance: newBalance.toFixed(2) })
                .where(eq(userWallets.userId, userId));

            await tx.insert(userWalletTransactions).values({
                id: uuidv4(),
                userId,
                type: "debit",
                transactionType: "order_payment",
                amount: totalAmount.toFixed(2),
                balanceBefore: currentBalance.toFixed(2),
                reference: orderNumber,
                status: "approved",
                createdAt: now
            });
        }

        // 🔒 2. Daily order number calculation
        const [ordersCountResult] = await tx
            .select({ count: sql<number>`count(${orders.id})` })
            .from(orders)
            .where(
                and(
                    eq(orders.restaurantId, restaurantId),
                    gte(orders.createdAt, startOfToday)
                )
            );

        createdDailyOrderNumber = Number(ordersCountResult?.count || 0) + 1;

        // 3. Create order record
        await tx.insert(orders).values({
            id: orderId,
            orderNumber,
            idempotencyKey,
            userId,
            restaurantId,
            branchId: resolvedBranchId,
            zoneId: resolvedZoneId,
            addressId: addressId || null,
            orderSource,
            paymentMethod,
            orderType: resolvedOrderType,
            subtotal: subtotal.toFixed(2),
            deliveryFee: deliveryFee.toFixed(2),
            serviceFee: serviceFee.toFixed(2),
            appCommission: appCommission.toFixed(2),
            discountAmount: totalDiscount.toFixed(2),
            couponCode: couponCode || null,
            totalAmount: totalAmount.toFixed(2),
            note: note || null,
            status: "pending",
            dailyOrderNumber: createdDailyOrderNumber,
            durationOrderPreparing: defaultPreparingDuration,
            createdAt: now
        });

        await tx.insert(orderItems).values(itemsToInsert.map(i => ({ ...i, orderId })));
        await tx.delete(cartItems).where(eq(cartItems.userId, userId));

        // Superadmin notification
        await tx.insert(notifications).values({
            recipientType: "superadmin",
            recipientId: "superadmin",
            title: "New Order",
            body: `Order #${createdDailyOrderNumber} has been placed at ${restaurant?.name}.`,
            data: { orderId, orderNumber, createdDailyOrderNumber, restaurantName: restaurant?.name }
        });

        // 4. Coupons and Discounts tracking
        if (appliedCoupon) {
            await tx.insert(couponUsages).values({
                id: uuidv4(),
                couponId: appliedCoupon.id,
                userId,
                orderId,
                discountAmount: appliedCoupon.discountType === "free_delivery"
                    ? deliveryFee.toFixed(2)
                    : appliedCoupon.discountType === "fixed_amount"
                        ? appliedCoupon.discountValue.toString()
                        : totalDiscount.toFixed(2)
            });

            await tx.update(coupons)
                .set({ usedCount: sql`used_count + 1` })
                .where(eq(coupons.id, appliedCoupon.id));
        }

        if (discountState.appliedDiscounts.size > 0) {
            for (const dId of Array.from(discountState.appliedDiscounts)) {
                await tx.update(discounts)
                    .set({ usedCount: sql`used_count + 1` })
                    .where(eq(discounts.id, dId));
            }
        }

        // 5. Restaurant wallet calculations
        let [restaurantWallet] = await tx.select().from(restaurantWallets).where(eq(restaurantWallets.restaurantId, restaurantId)).for("update");

        if (!restaurantWallet) {
            await tx.insert(restaurantWallets).values({
                id: uuidv4(),
                restaurantId: restaurantId,
                balance: "0.00",
                collectedCash: "0.00",
                totalEarning: "0.00"
            });
            restaurantWallet = { balance: "0.00", collectedCash: "0.00", totalEarning: "0.00" } as any;
        }

        const currentRestBalance = parseFloat(restaurantWallet.balance as string);
        const currentCollectedCash = parseFloat(restaurantWallet.collectedCash as string);
        const currentTotalEarning = parseFloat(restaurantWallet.totalEarning as string);

        const restaurantEarning = roundMoney(subtotal + deliveryFee - appCommission);
        const appDues = roundMoney(appCommission + serviceFee);

        let newRestBalance = currentRestBalance;
        let newCollectedCash = currentCollectedCash;

        if (isCashPayment) {
            newRestBalance = roundMoney(newRestBalance - appDues);
            newCollectedCash = roundMoney(newCollectedCash + totalAmount);
        } else {
            newRestBalance = roundMoney(newRestBalance + restaurantEarning);
        }

        await tx.update(restaurantWallets)
            .set({
                balance: newRestBalance.toFixed(2),
                collectedCash: newCollectedCash.toFixed(2),
                totalEarning: roundMoney(currentTotalEarning + restaurantEarning).toFixed(2)
            })
            .where(eq(restaurantWallets.restaurantId, restaurantId));

        await tx.insert(restaurantWalletTransactions).values({
            id: uuidv4(),
            restaurantId,
            type: "order_payment",
            amount: isCashPayment ? `-${appDues.toFixed(2)}` : `${restaurantEarning.toFixed(2)}`,
            balanceBefore: currentRestBalance.toFixed(2),
            balanceAfter: newRestBalance.toFixed(2),
            method: paymentMethodName,
            reference: orderNumber,
            note: isCashPayment ? "Commission deducted from cash order" : "Earnings added from digital payment",
            createdAt: now
        });
    });

    // ==========================================
    // 11. Send Notification to Restaurant
    // ==========================================
    const cairoTimeFormatted = new Intl.DateTimeFormat("ar-EG", {
        timeZone: "Africa/Cairo",
        hour: "numeric",
        minute: "numeric",
        hour12: true
    }).format(now);

    await sendPushNotification({
        recipientType: "restaurant",
        recipientId: restaurantId,
        branchId: resolvedBranchId || null,
        title: "طلب جديد! 🛒",
        body: `تم استلام طلب جديد #${createdDailyOrderNumber} بقيمة ${totalAmount} ج.م الساعة ${cairoTimeFormatted}.`,
        data: {
            orderId,
            orderNumber,
            branchId: resolvedBranchId || null,
            type: "new_order",
            createdAt: now.toISOString(),
            dailyOrderNumber: createdDailyOrderNumber
        }
    });

    return SuccessResponse(res, {
        message: "Order created successfully",
        order_level: {
            orderDetails: {
                orderId,
                orderNumber,
                zoneId: resolvedZoneId,
                subtotal,
                deliveryFee,
                serviceFee,
                discountAmount: totalDiscount,
                couponCode: couponCode || null,
                totalAmount,
                createdAt: now.toISOString(),
                dailyOrderNumber: createdDailyOrderNumber,
                durationOrderPreparing: defaultPreparingDuration,
            },
            customerDetails: userInfo
        }
    });
};
// ==========================================
// 2. جلب الطلبات النشطة (الحالية)
// ==========================================
export const getActiveOrders = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { restaurantId } = req.query;

    const activeOrders = await db
        .select({
            orderId: orders.id,
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            restaurantId: orders.restaurantId,
            branchId: orders.branchId,
            addressId: orders.addressId,
            restaurantName: restaurants.name,
            restaurantImage: restaurants.logo,
            orderType: orders.orderType,
            orderSource: orders.orderSource,
            paymentMethod: orders.paymentMethod,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            serviceFee: orders.serviceFee,
            appCommission: orders.appCommission,
            discountAmount: orders.discountAmount,
            couponCode: orders.couponCode,
            totalAmount: orders.totalAmount,
            status: orders.status,
            durationOrderPreparing: orders.durationOrderPreparing,
            note: orders.note,
            cancelReasonId: orders.cancelReasonId,
            cancelReason: orders.cancelReason,
            deliveryMan: {
                id: deliveryMen.id,
                name: deliveryMen.name,
                phone: deliveryMen.phone,
            },
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
            itemsCount: sql<number>`(SELECT COUNT(*) FROM order_items WHERE order_items.order_id = ${orders.id})`
        })
        .from(orders)
        .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
        .leftJoin(deliveryMen, eq(orders.deliveryManId, deliveryMen.id))
        .where(
            and(
                eq(orders.userId, userId),
                restaurantId ? eq(orders.restaurantId, String(restaurantId)) : undefined,
                // 🔥 تجلب فقط الطلبات التي لم تنتهِ بعد
                inArray(orders.status, ["pending", "accepted", "preparing", "out_for_delivery"])
            )
        )
        .orderBy(desc(orders.createdAt));

    return SuccessResponse(res, { data: activeOrders });
};

// ==========================================
// 3. جلب سجل الطلبات (History) - المكتملة والملغية
// ==========================================
export const getOrderHistory = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { restaurantId } = req.query;

    const historyOrders = await db
        .select({
            orderId: orders.id,
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            restaurantId: orders.restaurantId,
            branchId: orders.branchId,
            addressId: orders.addressId,
            restaurantName: restaurants.name,
            restaurantImage: restaurants.logo,
            orderType: orders.orderType,
            orderSource: orders.orderSource,
            paymentMethod: orders.paymentMethod,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            serviceFee: orders.serviceFee,
            appCommission: orders.appCommission,
            discountAmount: orders.discountAmount,
            couponCode: orders.couponCode,
            totalAmount: orders.totalAmount,
            status: orders.status,
            durationOrderPreparing: orders.durationOrderPreparing,
            rating: orders.rating,
            ratingComment: orders.ratingComment,
            note: orders.note,
            cancelReasonId: orders.cancelReasonId,
            cancelReason: orders.cancelReason,
            deliveryMan: {
                id: deliveryMen.id,
                name: deliveryMen.name,
                phone: deliveryMen.phone,
            },
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
            itemsCount: sql<number>`(SELECT COUNT(*) FROM order_items WHERE order_items.order_id = ${orders.id})`
        })
        .from(orders)
        .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
        .leftJoin(deliveryMen, eq(orders.deliveryManId, deliveryMen.id))
        .where(
            and(
                eq(orders.userId, userId),
                restaurantId ? eq(orders.restaurantId, String(restaurantId)) : undefined,
                // 🔥 تجلب فقط الطلبات التي انتهت (تم إضافة المسترجع والملغى)
                inArray(orders.status, ["delivered", "cancelled", "refund"])
            )
        )
        .orderBy(desc(orders.createdAt));

    return SuccessResponse(res, { data: historyOrders });
};

// ==========================================
// 4. تفاصيل الطلب (Order Details)
// ==========================================
export const getOrderDetails = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { orderId } = req.params;

    const orderInfo = await db
        .select({
            orderId: orders.id,
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            status: orders.status,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
            paymentMethod: orders.paymentMethod,
            orderType: orders.orderType,
            orderSource: orders.orderSource,

            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            serviceFee: orders.serviceFee,
            appCommission: orders.appCommission,
            discountAmount: orders.discountAmount,
            couponCode: orders.couponCode,
            totalAmount: orders.totalAmount,

            durationOrderPreparing: orders.durationOrderPreparing,
            cancelReasonId: orders.cancelReasonId,
            cancelReason: orders.cancelReason,
            note: orders.note,
            rating: orders.rating,
            ratingComment: orders.ratingComment,

            restaurantId: orders.restaurantId,
            branchId: orders.branchId,
            addressId: orders.addressId,
            restaurantName: restaurants.name,
            restaurantImage: restaurants.logo,

            deliveryMan: {
                id: deliveryMen.id,
                name: deliveryMen.name,
                phone: deliveryMen.phone,
            },
        })
        .from(orders)
        .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
        .leftJoin(deliveryMen, eq(orders.deliveryManId, deliveryMen.id))
        .where(eq(orders.id, orderId))
        .limit(1);

    if (!orderInfo.length) {
        throw new NotFound("Order not found");
    }

    const items = await db
        .select({
            foodId: orderItems.foodId,
            foodName: food.name,
            quantity: orderItems.quantity,
            basePrice: orderItems.basePrice,
            variationsPrice: orderItems.variationsPrice,
            totalPrice: orderItems.totalPrice,
            note: orderItems.note
        })
        .from(orderItems)
        .leftJoin(food, eq(orderItems.foodId, food.id))
        .where(eq(orderItems.orderId, orderId));

    return SuccessResponse(res, {
        data: {
            ...orderInfo[0],
            items
        }
    });
};

// ==========================================
// 5. متطلبات الطلب المسبقة (Order Prerequisites)
// ==========================================
export const getOrderPrerequisites = async (req: Request | any, res: Response) => {
    if (!req.user) {
        throw new UnauthorizedError("Unauthenticated: Token is missing or invalid");
    }
    const userId = req.user.id;
    const restaurantId = req.query.restaurantId as string;

    if (!restaurantId) {
        throw new BadRequest("restaurantId is required");
    }

    // جلب البيانات المطلوبة من الداتا بيز
    const [userAddresses, restaurantBranches] = await Promise.all([
        // أ) عناوين اليوزر 
        db.select().from(addresses).where(eq(addresses.userId, userId)),

        // ب) فروع المطعم
        db.select().from(branches).where(eq(branches.restaurantId, restaurantId)),
    ]);

    // ج) طرق الدفع 
    const activePaymentMethods = await db.select({
        id: paymentMethods.id,
        name: paymentMethods.name,
        nameAr: paymentMethods.nameAr
    }).from(paymentMethods).where(eq(paymentMethods.isActive, true));

    // تجميع الداتا وإرسالها
    return SuccessResponse(res, {
        data: {
            addresses: userAddresses,
            branches: restaurantBranches,
            paymentMethods: activePaymentMethods
        }
    });
};

// ==========================================
// 6. إلغاء الطلب من قبل المستخدم (Cancel Order)
// ==========================================
export const cancelOrder = async (req: Request | any, res: Response) => {
    if (!req.user) throw new UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { orderId } = req.params;
    const { cancelReasonId } = req.body;

    if (!cancelReasonId) throw new BadRequest("Cancel reason ID is required");

    // 1. جلب الطلب والتأكد أنه للمستخدم وأنه قابل للإلغاء
    const [order] = await db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).limit(1);
    if (!order) throw new NotFound("Order not found");
    if (!["pending", "accepted"].includes(order.status as string)) {
        throw new BadRequest("Order cannot be cancelled at this stage");
    }

    // 2. التحقق من سبب الإلغاء
    const [reason] = await db.select().from(selectReasons).where(and(eq(selectReasons.id, cancelReasonId), eq(selectReasons.type, "user"))).limit(1);
    if (!reason) throw new BadRequest("Invalid cancel reason for user");

    // 3. تحديث حالة الطلب وإرجاع المبالغ المالية (إلغاء أرباح المطعم والعمولة)
    await db.transaction(async (tx) => {
        // تحديث الطلب
        await tx.update(orders)
            .set({
                status: "cancelled",
                cancelReasonId: reason.id,
                cancelReason: reason.name
            })
            .where(eq(orders.id, orderId));

        // حسابات المبالغ التي تم دفعها أو خصمها
        const totalAmount = parseFloat(order.totalAmount as string || "0");
        const appCommission = parseFloat(order.appCommission as string || "0");
        const serviceFee = parseFloat(order.serviceFee as string || "0");
        const subtotal = parseFloat(order.subtotal as string || "0");
        const deliveryFee = parseFloat(order.deliveryFee as string || "0");
        const appDues = appCommission + serviceFee;
        const restaurantEarning = subtotal + deliveryFee - appCommission;

        const isCashPayment = order.paymentMethod === "cash_on_delivery" || order.paymentMethod === "cash"; // Assuming ID handling elsewhere or this is resolved

        // إرجاع فلوس المستخدم لو دفع بالمحفظة
        // note: paymentMethod stores UUID, so we check userWalletTransactions to know if it was a wallet payment
        const [walletTx] = await tx.select().from(userWalletTransactions).where(and(eq(userWalletTransactions.reference, order.orderNumber), eq(userWalletTransactions.transactionType, "order_payment"))).limit(1);

        if (walletTx) {
            // Revert User Wallet
            const [userWallet] = await tx.select().from(userWallets).where(eq(userWallets.userId, userId)).limit(1);
            if (userWallet) {
                const balanceBefore = parseFloat(userWallet.balance as string || "0");
                const newBalance = balanceBefore + totalAmount;
                await tx.update(userWallets).set({ balance: newBalance.toString() }).where(eq(userWallets.userId, userId));
                await tx.insert(userWalletTransactions).values({
                    id: uuidv4(),
                    userId,
                    type: "credit",
                    transactionType: "refund",
                    amount: totalAmount.toString(),
                    balanceBefore: balanceBefore.toString(),
                    reference: order.orderNumber,
                    status: "approved"
                });
            }
        }

        // إرجاع الفلوس/العمولات من المطعم (حيث أن الإلغاء من المستخدم، المطعم لا يتحمل العمولة)
        const [restaurantWallet] = await tx.select().from(restaurantWallets).where(eq(restaurantWallets.restaurantId, order.restaurantId)).limit(1);
        if (restaurantWallet) {
            let currentRestBalance = parseFloat(restaurantWallet.balance as string || "0");
            let currentCollectedCash = parseFloat(restaurantWallet.collectedCash as string || "0");
            let currentTotalEarning = parseFloat(restaurantWallet.totalEarning as string || "0");

            if (isCashPayment) {
                // نلغي خصم العمولة من رصيد المطعم، ونلغي الكاش المحصل
                currentRestBalance += appDues;
                currentCollectedCash -= totalAmount;
            } else {
                // نلغي الأرباح اللي انضافت للمطعم
                currentRestBalance -= restaurantEarning;
            }

            await tx.update(restaurantWallets)
                .set({
                    balance: currentRestBalance.toString(),
                    collectedCash: currentCollectedCash.toString(),
                    totalEarning: (currentTotalEarning - restaurantEarning).toString()
                })
                .where(eq(restaurantWallets.restaurantId, order.restaurantId));

            // تسجيل العملية
            await tx.insert(restaurantWalletTransactions).values({
                id: uuidv4(),
                restaurantId: order.restaurantId,
                type: "order_payment", // Or create a new type "refund"
                amount: isCashPayment ? `${appDues}` : `-${restaurantEarning}`,
                balanceBefore: restaurantWallet.balance as string,
                balanceAfter: currentRestBalance.toString(),
                method: order.paymentMethod,
                reference: order.orderNumber,
                note: "Refund/Revert due to user cancellation"
            });
        }
    });

    return SuccessResponse(res, { message: "Order cancelled successfully" });
};