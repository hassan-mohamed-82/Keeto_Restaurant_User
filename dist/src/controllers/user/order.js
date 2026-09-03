"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserCancelReasons = exports.cancelOrder = exports.getOrderPrerequisites = exports.getOrderDetails = exports.getOrderHistory = exports.getActiveOrders = exports.checkout = void 0;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const NotFound_1 = require("../../Errors/NotFound");
const uuid_1 = require("uuid");
const Errors_1 = require("../../Errors");
const notifications_1 = require("../../utils/notifications");
const geo_1 = require("../../utils/geo");
const discount_1 = require("../../utils/discount");
const userBlockCheck_1 = require("../../utils/userBlockCheck");
const restaurantFeatures_1 = require("./restaurantFeatures");
// 👇 1. دالة تظبيط الوقت لتوقيت مصر عشان نص الإشعار
const formatToEgyptTime = (date) => {
    return new Intl.DateTimeFormat("ar-EG", {
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
const roundMoney = (amount) => Math.round(amount * 100) / 100;
const checkout = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { orderSource, paymentMethod, orderType, idempotencyKey, zoneId, branchId, addressId, note, couponCode } = req.body;
    // ==========================================
    // 🛡️ 1. Validation
    // ==========================================
    const validOrderSources = ["online_order_app", "online_order_web", "food_aggregator", "mykeeto", "pos"];
    if (!validOrderSources.includes(orderSource)) {
        throw new BadRequest_1.BadRequest("Invalid order source");
    }
    const [selectedPayment] = await connection_1.db.select().from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.id, paymentMethod)).limit(1);
    if (!selectedPayment || !selectedPayment.isActive) {
        throw new BadRequest_1.BadRequest("Invalid or inactive payment method");
    }
    const paymentMethodName = selectedPayment.name;
    const paymentMethodNameAr = selectedPayment.nameAr;
    const isWalletPayment = paymentMethodName === "wallet" || paymentMethodNameAr === "محفظتى";
    const isCashPayment = paymentMethodName === "cash_on_delivery" || paymentMethodNameAr === "الدفع عند الاستلام" || paymentMethodName === "cash";
    // ==========================================
    // 2. Idempotency Check
    // ==========================================
    if (idempotencyKey) {
        const [existing] = await connection_1.db.select().from(schema_1.orders).where((0, drizzle_orm_1.eq)(schema_1.orders.idempotencyKey, idempotencyKey)).limit(1);
        if (existing)
            return (0, response_1.SuccessResponse)(res, { message: "Order already processed", data: existing });
    }
    // ==========================================
    // 3. Get Cart Items
    // ==========================================
    const userCart = await connection_1.db.select().from(schema_1.cartItems).where((0, drizzle_orm_1.eq)(schema_1.cartItems.userId, userId));
    if (!userCart.length)
        throw new BadRequest_1.BadRequest("Your cart is empty");
    const restaurantId = userCart[0].restaurantId;
    // 🛡️ Block check: Verify user is not blocked globally or by this restaurant
    await (0, userBlockCheck_1.validateUserNotBlocked)(userId, restaurantId);
    // ==========================================
    // 4. Get Restaurant & Business Plan
    // ==========================================
    const [restaurant] = await connection_1.db.select().from(schema_1.restaurants).where((0, drizzle_orm_1.eq)(schema_1.restaurants.id, restaurantId)).limit(1);
    if (!restaurant)
        throw new BadRequest_1.BadRequest("Restaurant not found");
    const [plan] = await connection_1.db.select()
        .from(schema_1.restaurantBusinessPlans)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.restaurantBusinessPlans.platformType, orderSource)))
        .limit(1);
    if (!plan) {
        throw new BadRequest_1.BadRequest(`Order failed. This restaurant has no active business plan for ${orderSource}.`);
    }
    // ==========================================
    // 🛡️ 4.5 فحص مواعيد المطعم وإعدادات التشغيل
    // ==========================================
    const schedulesList = await connection_1.db.select().from(schema_1.restaurantSchedules).where((0, drizzle_orm_1.eq)(schema_1.restaurantSchedules.restaurantId, restaurantId));
    const [settings] = await connection_1.db.select().from(schema_1.restaurantSettings).where((0, drizzle_orm_1.eq)(schema_1.restaurantSettings.restaurantId, restaurantId)).limit(1);
    const validOrderTypes = ["delivery", "takeaway", "dine_in"];
    if (!orderType || !validOrderTypes.includes(orderType)) {
        throw new BadRequest_1.BadRequest("orderType is required and must be one of: delivery, takeaway, dine_in");
    }
    const resolvedOrderType = orderType;
    const status = (0, restaurantFeatures_1.calculateCurrentStatus)(settings, schedulesList);
    if (!status.isOpenNow)
        throw new BadRequest_1.BadRequest(`Order failed. ${status.reason}`);
    if (resolvedOrderType === "delivery" && !status.canDeliveryNow)
        throw new BadRequest_1.BadRequest("Order failed. Delivery service is currently disabled for this restaurant.");
    if (resolvedOrderType === "takeaway" && !status.canTakeawayNow)
        throw new BadRequest_1.BadRequest("Order failed. Takeaway service is currently disabled for this restaurant.");
    const defaultPreparingDuration = settings?.maxDeliveryTime ?? 30;
    // ==========================================
    // ⚡ 5. Batch Fetching
    // ==========================================
    const foodIds = [...new Set(userCart.map(item => item.foodId))];
    const allOptionIds = [];
    const allAddonIds = [];
    userCart.forEach(item => {
        let safeVars = typeof item.variations === 'string' ? JSON.parse(item.variations) : item.variations;
        if (typeof safeVars === 'string')
            safeVars = JSON.parse(safeVars);
        let parsedVars = [];
        let parsedAddons = [];
        if (Array.isArray(safeVars)) {
            parsedVars = safeVars;
        }
        else if (safeVars && typeof safeVars === 'object') {
            parsedVars = Array.isArray(safeVars.variations) ? safeVars.variations : [];
            parsedAddons = Array.isArray(safeVars.addons) ? safeVars.addons : [];
        }
        let safeAddons = typeof item.addons === 'string' ? JSON.parse(item.addons) : item.addons;
        if (typeof safeAddons === 'string')
            safeAddons = JSON.parse(safeAddons);
        if (Array.isArray(safeAddons)) {
            parsedAddons = [...parsedAddons, ...safeAddons];
        }
        parsedVars.forEach((v) => { if (v.optionId)
            allOptionIds.push(v.optionId); });
        parsedAddons.forEach((a) => { if (a.addonId || a.id)
            allAddonIds.push(a.addonId || a.id); });
    });
    const [foodList, optionsList, addonsListDb] = await Promise.all([
        connection_1.db.select().from(schema_1.food).where((0, drizzle_orm_1.inArray)(schema_1.food.id, foodIds)),
        allOptionIds.length > 0
            ? connection_1.db.select().from(schema_1.variationOptions).where((0, drizzle_orm_1.inArray)(schema_1.variationOptions.id, [...new Set(allOptionIds)]))
            : [],
        allAddonIds.length > 0
            ? connection_1.db.select().from(schema_1.addons).where((0, drizzle_orm_1.inArray)(schema_1.addons.id, [...new Set(allAddonIds)]))
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
        if (!foodItem)
            throw new BadRequest_1.BadRequest(`Food item with ID ${item.foodId} not found`);
        const originalBasePrice = parseFloat(foodItem.price || "0");
        let safeVars = typeof item.variations === 'string' ? JSON.parse(item.variations) : item.variations;
        if (typeof safeVars === 'string')
            safeVars = JSON.parse(safeVars);
        let parsedVariations = [];
        let parsedAddons = [];
        if (Array.isArray(safeVars)) {
            parsedVariations = safeVars;
        }
        else if (safeVars && typeof safeVars === 'object') {
            parsedVariations = Array.isArray(safeVars.variations) ? safeVars.variations : [];
            parsedAddons = Array.isArray(safeVars.addons) ? safeVars.addons : [];
        }
        let safeAddons = typeof item.addons === 'string' ? JSON.parse(item.addons) : item.addons;
        if (typeof safeAddons === 'string')
            safeAddons = JSON.parse(safeAddons);
        if (Array.isArray(safeAddons)) {
            parsedAddons = [...parsedAddons, ...safeAddons];
        }
        let varPrice = 0;
        let addonPrice = 0;
        for (const v of parsedVariations) {
            if (v.optionId) {
                const dbOption = optionsMap.get(v.optionId);
                if (dbOption) {
                    const dbOptionPrice = parseFloat((dbOption.additionalPrice || "0"));
                    varPrice += dbOptionPrice;
                    v.additionalPrice = dbOptionPrice.toString();
                }
            }
            else {
                varPrice += parseFloat(v.additionalPrice || v.price || v.amount || "0");
            }
        }
        for (const a of parsedAddons) {
            const addonId = a.addonId || a.id;
            const dbAddon = addonsMap.get(addonId);
            if (dbAddon) {
                const dbAddonPrice = parseFloat((dbAddon.price || "0"));
                addonPrice += dbAddonPrice;
                a.price = dbAddonPrice.toString();
            }
            else {
                addonPrice += parseFloat(a.price || "0");
            }
        }
        let initialDiscountPrice = originalBasePrice;
        if (foodItem.discount_value && Number(foodItem.discount_value) > 0) {
            if (foodItem.discount_type === "percentage") {
                initialDiscountPrice = Math.max(0, originalBasePrice - (originalBasePrice * Number(foodItem.discount_value) / 100));
            }
            else if (foodItem.discount_type === "amount" || foodItem.discount_type === "fixed") {
                initialDiscountPrice = Math.max(0, originalBasePrice - Number(foodItem.discount_value));
            }
        }
        initialSubtotal += (initialDiscountPrice + varPrice + addonPrice) * item.quantity;
        itemsWithData.push({ cartItem: item, foodItem, originalBasePrice, varPrice, addonPrice, vars: parsedVariations, addonsList: parsedAddons });
    }
    const availableDiscounts = await (0, discount_1.getAvailableDiscounts)(restaurantId);
    const discountState = { remainingMaxDiscounts: new Map(), appliedDiscounts: new Set() };
    const itemsToInsert = [];
    for (const data of itemsWithData) {
        const { cartItem, foodItem, originalBasePrice, varPrice, addonPrice, vars, addonsList } = data;
        const { price: discountedBasePrice } = (0, discount_1.applyPriorityDiscount)({ id: foodItem.id, discountType: foodItem.discount_type, discountValue: foodItem.discount_value }, originalBasePrice, initialSubtotal, availableDiscounts, discountState, true);
        const itemTotal = roundMoney((discountedBasePrice + varPrice + addonPrice) * cartItem.quantity);
        subtotal += itemTotal;
        itemsToInsert.push({
            id: (0, uuid_1.v4)(),
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
    const serviceFee = parseFloat(plan.serviceFee || "0");
    const commissionRate = parseFloat(plan.commissionRate || "0");
    const appCommission = roundMoney(subtotal * (commissionRate / 100));
    // ==========================================
    // 5.5 Check Coupons
    // ==========================================
    const nowTemp = new Date();
    let totalDiscount = 0;
    let appliedCoupon = null;
    let isFreeDelivery = false;
    if (couponCode) {
        const [coupon] = await connection_1.db.select().from(schema_1.coupons).where((0, drizzle_orm_1.eq)(schema_1.coupons.code, couponCode)).limit(1);
        if (!coupon || !coupon.isActive)
            throw new BadRequest_1.BadRequest("Invalid or inactive coupon");
        if (coupon.startDate && new Date(coupon.startDate) > nowTemp)
            throw new BadRequest_1.BadRequest("Coupon not yet active");
        if (coupon.endDate && new Date(coupon.endDate) < nowTemp)
            throw new BadRequest_1.BadRequest("Coupon expired");
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit)
            throw new BadRequest_1.BadRequest("Coupon usage limit reached");
        if (parseFloat(coupon.minOrderAmount || "0") > subtotal)
            throw new BadRequest_1.BadRequest(`Minimum order amount of ${coupon.minOrderAmount} required for this coupon`);
        if (!coupon.isGlobal) {
            const [coupRest] = await connection_1.db.select().from(schema_1.couponRestaurants)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.couponRestaurants.couponId, coupon.id), (0, drizzle_orm_1.eq)(schema_1.couponRestaurants.restaurantId, restaurantId))).limit(1);
            if (!coupRest)
                throw new BadRequest_1.BadRequest("Coupon is not applicable to this restaurant");
        }
        if (coupon.perUserLimit) {
            const usages = await connection_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(schema_1.couponUsages)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.couponUsages.couponId, coupon.id), (0, drizzle_orm_1.eq)(schema_1.couponUsages.userId, userId)));
            if (usages[0].count >= coupon.perUserLimit)
                throw new BadRequest_1.BadRequest("You have reached the usage limit for this coupon");
        }
        const value = parseFloat(coupon.discountValue);
        if (coupon.discountType === "free_delivery") {
            isFreeDelivery = true;
        }
        else if (coupon.discountType === "fixed_amount") {
            totalDiscount += value;
        }
        else if (coupon.discountType === "percentage") {
            let pDiscount = subtotal * (value / 100);
            if (coupon.maxDiscount) {
                const max = parseFloat(coupon.maxDiscount);
                if (pDiscount > max)
                    pDiscount = max;
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
    let resolvedZoneId = zoneId || null;
    let resolvedBranchId = branchId || null;
    if (resolvedOrderType === "delivery") {
        if (!addressId)
            throw new BadRequest_1.BadRequest("Delivery address is required");
        const [userAddress] = await connection_1.db.select().from(schema_1.addresses)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.addresses.id, addressId), (0, drizzle_orm_1.eq)(schema_1.addresses.userId, userId))).limit(1);
        if (!userAddress)
            throw new BadRequest_1.BadRequest("Invalid delivery address");
        const lat = parseFloat(userAddress.lat || "0");
        const lng = parseFloat(userAddress.lng || "0");
        if (!lat || !lng) {
            throw new BadRequest_1.BadRequest("Delivery address requires valid latitude and longitude coordinates.");
        }
        // Fetch all active delivery fees for this restaurant (including branchId)
        const restaurantFees = await connection_1.db.select({
            id: schema_1.restaurantZoneDeliveryFees.id,
            zoneId: schema_1.restaurantZoneDeliveryFees.zoneId,
            branchId: schema_1.restaurantZoneDeliveryFees.branchId,
            deliveryFee: schema_1.restaurantZoneDeliveryFees.deliveryFee,
            coverageType: schema_1.restaurantZoneDeliveryFees.coverageType,
            customCoordinates: schema_1.restaurantZoneDeliveryFees.customCoordinates,
            customRadiusKm: schema_1.restaurantZoneDeliveryFees.customRadiusKm,
            defaultCoordinates: schema_1.zones.coordinates,
            defaultRadiusKm: schema_1.zones.coverageAreaRadiusKm
        })
            .from(schema_1.restaurantZoneDeliveryFees)
            .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.status, "active"), branchId ? (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.branchId, branchId) : undefined));
        let applicableFee = null;
        let maxDeliveryFee = -1;
        for (const fee of restaurantFees) {
            if ((0, geo_1.isLocationInZone)(lat, lng, fee.zoneId, fee)) {
                const currentFee = parseFloat(fee.deliveryFee || "0");
                if (currentFee > maxDeliveryFee) {
                    maxDeliveryFee = currentFee;
                    applicableFee = fee;
                }
            }
        }
        if (!applicableFee) {
            throw new BadRequest_1.BadRequest("Your delivery address is outside our covered delivery zones.");
        }
        resolvedZoneId = applicableFee.id || applicableFee.zoneId;
        if (!resolvedZoneId) {
            throw new BadRequest_1.BadRequest("No delivery zone found for this address.");
        }
        deliveryFee = parseFloat(applicableFee.deliveryFee || "0");
        // 🏪 تحديد/التحقق من الفرع المخصص للـ Delivery
        if (applicableFee.branchId) {
            resolvedBranchId = applicableFee.branchId;
        }
        else if (branchId) {
            const [selectedBranch] = await connection_1.db.select({ id: schema_1.branches.id })
                .from(schema_1.branches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
                .limit(1);
            if (!selectedBranch) {
                throw new BadRequest_1.BadRequest("Selected branch not found or inactive.");
            }
            resolvedBranchId = selectedBranch.id;
        }
        else {
            const [matchedBranch] = await connection_1.db.select({ id: schema_1.branches.id })
                .from(schema_1.branches)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.zoneId, resolvedZoneId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
                .limit(1);
            if (!matchedBranch) {
                throw new BadRequest_1.BadRequest("No active branch found serving your delivery zone.");
            }
            resolvedBranchId = matchedBranch.id;
        }
    }
    else {
        // For takeaway or dine_in: branchId is required
        if (!branchId)
            throw new BadRequest_1.BadRequest("Branch is required for takeaway or dine-in orders.");
        const [branch] = await connection_1.db.select({ id: schema_1.branches.id, zoneId: schema_1.branches.zoneId })
            .from(schema_1.branches)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.branches.id, branchId), (0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.branches.status, "active")))
            .limit(1);
        if (!branch)
            throw new BadRequest_1.BadRequest("Invalid or inactive branch selected.");
        resolvedBranchId = branch.id;
        // zoneId is only meaningful for delivery orders
        // resolvedZoneId = branch.zoneId;
    }
    if (isFreeDelivery)
        deliveryFee = 0;
    // ==========================================
    // 6.5 Free Delivery Offer Check (schema-based)
    // ==========================================
    if (!isFreeDelivery && resolvedOrderType === "delivery") {
        const nowForOffer = new Date();
        const [freeDeliveryOffer] = await connection_1.db
            .select()
            .from(schema_1.freeDeliveryOffers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.freeDeliveryOffers.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.freeDeliveryOffers.status, "active")))
            .limit(1);
        if (freeDeliveryOffer) {
            const startOk = !freeDeliveryOffer.startDate || new Date(freeDeliveryOffer.startDate) <= nowForOffer;
            const endOk = !freeDeliveryOffer.endDate || new Date(freeDeliveryOffer.endDate) >= nowForOffer;
            const minAmount = parseFloat(freeDeliveryOffer.minOrderAmount || "0");
            if (startOk && endOk && subtotal >= minAmount) {
                isFreeDelivery = true;
                deliveryFee = 0;
            }
        }
    }
    let totalAmount = roundMoney(subtotal + deliveryFee + serviceFee - totalDiscount);
    if (totalAmount < 0)
        totalAmount = 0;
    const orderId = (0, uuid_1.v4)();
    const orderNumber = `ORD-${Date.now()}`;
    const [userInfo] = await connection_1.db.select({ id: schema_1.users.id, name: schema_1.users.name, phone: schema_1.users.phone, email: schema_1.users.email })
        .from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId)).limit(1);
    // ==========================================
    // 🛡️ 10. Execute Order (Transaction)
    // ==========================================
    const now = new Date();
    // ⏰ حساب بداية دورة الترقيم اليومي للطلب بناءً على وقت إعادة تعيين المطعم (Restart Daily Order Number Time)
    const resetTimeStr = settings?.resetDailyOrderNumberTime || "00:00";
    const [resetHour, resetMinute] = resetTimeStr.split(":").map(Number);
    const dailyOrderResetStart = new Date(now);
    dailyOrderResetStart.setHours(isNaN(resetHour) ? 0 : resetHour, isNaN(resetMinute) ? 0 : resetMinute, 0, 0);
    if (now.getTime() < dailyOrderResetStart.getTime()) {
        dailyOrderResetStart.setDate(dailyOrderResetStart.getDate() - 1);
    }
    let createdDailyOrderNumber = 1;
    await connection_1.db.transaction(async (tx) => {
        // 🔒 1. Wallet deduction with FOR UPDATE
        if (isWalletPayment) {
            const [userWallet] = await tx.select()
                .from(schema_1.userWallets)
                .where((0, drizzle_orm_1.eq)(schema_1.userWallets.userId, userId))
                .for("update");
            const currentBalance = parseFloat(userWallet?.balance || "0");
            if (!userWallet || currentBalance < totalAmount) {
                throw new BadRequest_1.BadRequest("Insufficient wallet balance");
            }
            const newBalance = roundMoney(currentBalance - totalAmount);
            await tx.update(schema_1.userWallets)
                .set({ balance: newBalance.toFixed(2) })
                .where((0, drizzle_orm_1.eq)(schema_1.userWallets.userId, userId));
            await tx.insert(schema_1.userWalletTransactions).values({
                id: (0, uuid_1.v4)(),
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
            .select({ count: (0, drizzle_orm_1.sql) `count(${schema_1.orders.id})` })
            .from(schema_1.orders)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, restaurantId), (0, drizzle_orm_1.gte)(schema_1.orders.createdAt, dailyOrderResetStart)));
        createdDailyOrderNumber = Number(ordersCountResult?.count || 0) + 1;
        // 3. Create order record
        await tx.insert(schema_1.orders).values({
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
        await tx.insert(schema_1.orderItems).values(itemsToInsert.map(i => ({ ...i, orderId })));
        await tx.delete(schema_1.cartItems).where((0, drizzle_orm_1.eq)(schema_1.cartItems.userId, userId));
        // Superadmin notification
        await tx.insert(schema_1.notifications).values({
            recipientType: "superadmin",
            recipientId: "superadmin",
            title: "New Order",
            body: `Order #${createdDailyOrderNumber} has been placed at ${restaurant?.name}.`,
            data: { orderId, orderNumber, createdDailyOrderNumber, restaurantName: restaurant?.name }
        });
        // 4. Coupons and Discounts tracking
        if (appliedCoupon) {
            await tx.insert(schema_1.couponUsages).values({
                id: (0, uuid_1.v4)(),
                couponId: appliedCoupon.id,
                userId,
                orderId,
                discountAmount: appliedCoupon.discountType === "free_delivery"
                    ? deliveryFee.toFixed(2)
                    : appliedCoupon.discountType === "fixed_amount"
                        ? appliedCoupon.discountValue.toString()
                        : totalDiscount.toFixed(2)
            });
            await tx.update(schema_1.coupons)
                .set({ usedCount: (0, drizzle_orm_1.sql) `used_count + 1` })
                .where((0, drizzle_orm_1.eq)(schema_1.coupons.id, appliedCoupon.id));
        }
        if (discountState.appliedDiscounts.size > 0) {
            for (const dId of Array.from(discountState.appliedDiscounts)) {
                await tx.update(schema_1.discounts)
                    .set({ usedCount: (0, drizzle_orm_1.sql) `used_count + 1` })
                    .where((0, drizzle_orm_1.eq)(schema_1.discounts.id, dId));
            }
        }
        // 5. Restaurant wallet calculations
        let [restaurantWallet] = await tx.select().from(schema_1.restaurantWallets).where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId)).for("update");
        if (!restaurantWallet) {
            await tx.insert(schema_1.restaurantWallets).values({
                id: (0, uuid_1.v4)(),
                restaurantId: restaurantId,
                balance: "0.00",
                collectedCash: "0.00",
                totalEarning: "0.00"
            });
            restaurantWallet = { balance: "0.00", collectedCash: "0.00", totalEarning: "0.00" };
        }
        const currentRestBalance = parseFloat(restaurantWallet.balance);
        const currentCollectedCash = parseFloat(restaurantWallet.collectedCash);
        const currentTotalEarning = parseFloat(restaurantWallet.totalEarning);
        const restaurantEarning = roundMoney(subtotal + deliveryFee - appCommission);
        const appDues = roundMoney(appCommission + serviceFee);
        let newRestBalance = currentRestBalance;
        let newCollectedCash = currentCollectedCash;
        if (isCashPayment) {
            newRestBalance = roundMoney(newRestBalance - appDues);
            newCollectedCash = roundMoney(newCollectedCash + totalAmount);
        }
        else {
            newRestBalance = roundMoney(newRestBalance + restaurantEarning);
        }
        await tx.update(schema_1.restaurantWallets)
            .set({
            balance: newRestBalance.toFixed(2),
            collectedCash: newCollectedCash.toFixed(2),
            totalEarning: roundMoney(currentTotalEarning + restaurantEarning).toFixed(2)
        })
            .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, restaurantId));
        await tx.insert(schema_1.restaurantWalletTransactions).values({
            id: (0, uuid_1.v4)(),
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
    await (0, notifications_1.sendPushNotification)({
        recipientType: "restaurant",
        recipientId: restaurantId,
        branchId: resolvedBranchId || null,
        title: "طلب جديد! 🛒",
        body: `تم استلام طلب جديد #${createdDailyOrderNumber} بقيمة ${totalAmount} ج.م الساعة ${cairoTimeFormatted}.`,
        data: {
            restaurantId,
            orderId,
            orderNumber,
            branchId: resolvedBranchId || null,
            type: "new_order",
            createdAt: now.toISOString(),
            dailyOrderNumber: createdDailyOrderNumber
        }
    });
    return (0, response_1.SuccessResponse)(res, {
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
exports.checkout = checkout;
// ==========================================
// 2. جلب الطلبات النشطة (الحالية)
// ==========================================
const getActiveOrders = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { restaurantId } = req.query;
    const activeOrders = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        restaurantId: schema_1.orders.restaurantId,
        branchId: schema_1.orders.branchId,
        addressId: schema_1.orders.addressId,
        restaurantName: schema_1.restaurants.name,
        restaurantImage: schema_1.restaurants.logo,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        paymentMethod: schema_1.orders.paymentMethod,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        discountAmount: schema_1.orders.discountAmount,
        couponCode: schema_1.orders.couponCode,
        totalAmount: schema_1.orders.totalAmount,
        status: schema_1.orders.status,
        durationOrderPreparing: schema_1.orders.durationOrderPreparing,
        note: schema_1.orders.note,
        cancelReasonId: schema_1.orders.cancelReasonId,
        cancelReason: schema_1.orders.cancelReason,
        cancelReasonType: schema_1.orders.cancelReasonType,
        deliveryMan: {
            id: schema_1.deliveryMen.id,
            name: schema_1.deliveryMen.name,
            phone: schema_1.deliveryMen.phone,
        },
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
        itemsCount: (0, drizzle_orm_1.sql) `(SELECT COUNT(*) FROM order_items WHERE order_items.order_id = ${schema_1.orders.id})`
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.userId, userId), restaurantId ? (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, String(restaurantId)) : undefined, 
    // 🔥 تجلب فقط الطلبات التي لم تنتهِ بعد
    (0, drizzle_orm_1.inArray)(schema_1.orders.status, ["pending", "accepted", "preparing", "out_for_delivery"])))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    return (0, response_1.SuccessResponse)(res, { data: activeOrders });
};
exports.getActiveOrders = getActiveOrders;
// ==========================================
// 3. جلب سجل الطلبات (History) - المكتملة والملغية
// ==========================================
const getOrderHistory = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { restaurantId } = req.query;
    const historyOrders = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        restaurantId: schema_1.orders.restaurantId,
        branchId: schema_1.orders.branchId,
        addressId: schema_1.orders.addressId,
        restaurantName: schema_1.restaurants.name,
        restaurantImage: schema_1.restaurants.logo,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        paymentMethod: schema_1.orders.paymentMethod,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        discountAmount: schema_1.orders.discountAmount,
        couponCode: schema_1.orders.couponCode,
        totalAmount: schema_1.orders.totalAmount,
        status: schema_1.orders.status,
        durationOrderPreparing: schema_1.orders.durationOrderPreparing,
        rating: schema_1.orders.rating,
        ratingComment: schema_1.orders.ratingComment,
        note: schema_1.orders.note,
        cancelReasonId: schema_1.orders.cancelReasonId,
        cancelReason: schema_1.orders.cancelReason,
        cancelReasonType: schema_1.orders.cancelReasonType,
        deliveryMan: {
            id: schema_1.deliveryMen.id,
            name: schema_1.deliveryMen.name,
            phone: schema_1.deliveryMen.phone,
        },
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
        itemsCount: (0, drizzle_orm_1.sql) `(SELECT COUNT(*) FROM order_items WHERE order_items.order_id = ${schema_1.orders.id})`
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.userId, userId), restaurantId ? (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, String(restaurantId)) : undefined, 
    // 🔥 تجلب فقط الطلبات التي انتهت (تم إضافة المسترجع والملغى)
    (0, drizzle_orm_1.inArray)(schema_1.orders.status, ["delivered", "cancelled", "refund"])))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.orders.createdAt));
    return (0, response_1.SuccessResponse)(res, { data: historyOrders });
};
exports.getOrderHistory = getOrderHistory;
// ==========================================
// 4. تفاصيل الطلب (Order Details)
// ==========================================
const getOrderDetails = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { orderId } = req.params;
    const orderInfo = await connection_1.db
        .select({
        orderId: schema_1.orders.id,
        id: schema_1.orders.id,
        orderNumber: schema_1.orders.orderNumber,
        dailyOrderNumber: schema_1.orders.dailyOrderNumber,
        status: schema_1.orders.status,
        createdAt: schema_1.orders.createdAt,
        updatedAt: schema_1.orders.updatedAt,
        paymentMethod: schema_1.orders.paymentMethod,
        orderType: schema_1.orders.orderType,
        orderSource: schema_1.orders.orderSource,
        subtotal: schema_1.orders.subtotal,
        deliveryFee: schema_1.orders.deliveryFee,
        serviceFee: schema_1.orders.serviceFee,
        appCommission: schema_1.orders.appCommission,
        discountAmount: schema_1.orders.discountAmount,
        couponCode: schema_1.orders.couponCode,
        totalAmount: schema_1.orders.totalAmount,
        durationOrderPreparing: schema_1.orders.durationOrderPreparing,
        cancelReasonId: schema_1.orders.cancelReasonId,
        cancelReason: schema_1.orders.cancelReason,
        cancelReasonType: schema_1.orders.cancelReasonType,
        note: schema_1.orders.note,
        rating: schema_1.orders.rating,
        ratingComment: schema_1.orders.ratingComment,
        restaurantId: schema_1.orders.restaurantId,
        branchId: schema_1.orders.branchId,
        addressId: schema_1.orders.addressId,
        restaurantName: schema_1.restaurants.name,
        restaurantImage: schema_1.restaurants.logo,
        deliveryMan: {
            id: schema_1.deliveryMen.id,
            name: schema_1.deliveryMen.name,
            phone: schema_1.deliveryMen.phone,
        },
    })
        .from(schema_1.orders)
        .leftJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.orders.restaurantId, schema_1.restaurants.id))
        .leftJoin(schema_1.deliveryMen, (0, drizzle_orm_1.eq)(schema_1.orders.deliveryManId, schema_1.deliveryMen.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId))
        .limit(1);
    if (!orderInfo.length) {
        throw new NotFound_1.NotFound("Order not found");
    }
    const items = await connection_1.db
        .select({
        foodId: schema_1.orderItems.foodId,
        foodName: schema_1.food.name,
        quantity: schema_1.orderItems.quantity,
        basePrice: schema_1.orderItems.basePrice,
        variationsPrice: schema_1.orderItems.variationsPrice,
        totalPrice: schema_1.orderItems.totalPrice,
        note: schema_1.orderItems.note
    })
        .from(schema_1.orderItems)
        .leftJoin(schema_1.food, (0, drizzle_orm_1.eq)(schema_1.orderItems.foodId, schema_1.food.id))
        .where((0, drizzle_orm_1.eq)(schema_1.orderItems.orderId, orderId));
    return (0, response_1.SuccessResponse)(res, {
        data: {
            ...orderInfo[0],
            items
        }
    });
};
exports.getOrderDetails = getOrderDetails;
// ==========================================
// 5. متطلبات الطلب المسبقة (Order Prerequisites)
// ==========================================
const getOrderPrerequisites = async (req, res) => {
    if (!req.user) {
        throw new Errors_1.UnauthorizedError("Unauthenticated: Token is missing or invalid");
    }
    const userId = req.user.id;
    const restaurantId = req.query.restaurantId;
    if (!restaurantId) {
        throw new BadRequest_1.BadRequest("restaurantId is required");
    }
    // جلب البيانات المطلوبة من الداتا بيز
    const [userAddresses, restaurantBranches] = await Promise.all([
        // أ) عناوين اليوزر 
        connection_1.db.select().from(schema_1.addresses).where((0, drizzle_orm_1.eq)(schema_1.addresses.userId, userId)),
        // ب) فروع المطعم
        connection_1.db.select().from(schema_1.branches).where((0, drizzle_orm_1.eq)(schema_1.branches.restaurantId, restaurantId)),
    ]);
    // ج) طرق الدفع 
    const activePaymentMethods = await connection_1.db.select({
        id: schema_1.paymentMethods.id,
        name: schema_1.paymentMethods.name,
        nameAr: schema_1.paymentMethods.nameAr
    }).from(schema_1.paymentMethods).where((0, drizzle_orm_1.eq)(schema_1.paymentMethods.isActive, true));
    // تجميع الداتا وإرسالها
    return (0, response_1.SuccessResponse)(res, {
        data: {
            addresses: userAddresses,
            branches: restaurantBranches,
            paymentMethods: activePaymentMethods
        }
    });
};
exports.getOrderPrerequisites = getOrderPrerequisites;
// ==========================================
// 6. إلغاء الطلب من قبل المستخدم (Cancel Order)
// ==========================================
const cancelOrder = async (req, res) => {
    if (!req.user)
        throw new Errors_1.UnauthorizedError("Unauthenticated");
    const userId = req.user.id;
    const { orderId } = req.params;
    const { cancelReasonId, customReason } = req.body;
    const inputCustomReason = customReason;
    if (!cancelReasonId && (!inputCustomReason || typeof inputCustomReason !== "string" || inputCustomReason.trim() === "")) {
        throw new BadRequest_1.BadRequest("Cancel reason or cancel reason ID is required");
    }
    // 1. جلب الطلب والتأكد أنه للمستخدم وأنه قابل للإلغاء
    const [order] = await connection_1.db.select().from(schema_1.orders).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId), (0, drizzle_orm_1.eq)(schema_1.orders.userId, userId))).limit(1);
    if (!order)
        throw new NotFound_1.NotFound("Order not found");
    if (!["pending", "accepted"].includes(order.status)) {
        throw new BadRequest_1.BadRequest("Order cannot be cancelled at this stage");
    }
    // 2. التحقق من سبب الإلغاء
    let finalReasonId = null;
    let finalReasonText = null;
    if (cancelReasonId) {
        const [reason] = await connection_1.db.select().from(schema_1.selectReasons).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.selectReasons.id, cancelReasonId), (0, drizzle_orm_1.eq)(schema_1.selectReasons.type, "user"))).limit(1);
        if (!reason)
            throw new BadRequest_1.BadRequest("Invalid cancel reason for user");
        finalReasonId = reason.id;
        finalReasonText = (inputCustomReason && inputCustomReason.trim()) ? inputCustomReason.trim() : reason.name;
    }
    else {
        finalReasonId = null;
        finalReasonText = inputCustomReason.trim();
    }
    // 3. تحديث حالة الطلب وإرجاع المبالغ المالية (إلغاء أرباح المطعم والعمولة)
    await connection_1.db.transaction(async (tx) => {
        // تحديث الطلب
        await tx.update(schema_1.orders)
            .set({
            status: "cancelled",
            cancelReasonId: finalReasonId,
            cancelReason: finalReasonText,
            cancelReasonType: "user",
            updatedAt: new Date()
        })
            .where((0, drizzle_orm_1.eq)(schema_1.orders.id, orderId));
        // حسابات المبالغ التي تم دفعها أو خصمها
        const totalAmount = parseFloat(order.totalAmount || "0");
        const appCommission = parseFloat(order.appCommission || "0");
        const serviceFee = parseFloat(order.serviceFee || "0");
        const subtotal = parseFloat(order.subtotal || "0");
        const deliveryFee = parseFloat(order.deliveryFee || "0");
        const appDues = appCommission + serviceFee;
        const restaurantEarning = subtotal + deliveryFee - appCommission;
        const isCashPayment = order.paymentMethod === "cash_on_delivery" || order.paymentMethod === "cash"; // Assuming ID handling elsewhere or this is resolved
        // إرجاع فلوس المستخدم لو دفع بالمحفظة
        // note: paymentMethod stores UUID, so we check userWalletTransactions to know if it was a wallet payment
        const [walletTx] = await tx.select().from(schema_1.userWalletTransactions).where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.userWalletTransactions.reference, order.orderNumber), (0, drizzle_orm_1.eq)(schema_1.userWalletTransactions.transactionType, "order_payment"))).limit(1);
        if (walletTx) {
            // Revert User Wallet
            const [userWallet] = await tx.select().from(schema_1.userWallets).where((0, drizzle_orm_1.eq)(schema_1.userWallets.userId, userId)).limit(1);
            if (userWallet) {
                const balanceBefore = parseFloat(userWallet.balance || "0");
                const newBalance = balanceBefore + totalAmount;
                await tx.update(schema_1.userWallets).set({ balance: newBalance.toString() }).where((0, drizzle_orm_1.eq)(schema_1.userWallets.userId, userId));
                await tx.insert(schema_1.userWalletTransactions).values({
                    id: (0, uuid_1.v4)(),
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
        const [restaurantWallet] = await tx.select().from(schema_1.restaurantWallets).where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, order.restaurantId)).limit(1);
        if (restaurantWallet) {
            let currentRestBalance = parseFloat(restaurantWallet.balance || "0");
            let currentCollectedCash = parseFloat(restaurantWallet.collectedCash || "0");
            let currentTotalEarning = parseFloat(restaurantWallet.totalEarning || "0");
            if (isCashPayment) {
                // نلغي خصم العمولة من رصيد المطعم، ونلغي الكاش المحصل
                currentRestBalance += appDues;
                currentCollectedCash -= totalAmount;
            }
            else {
                // نلغي الأرباح اللي انضافت للمطعم
                currentRestBalance -= restaurantEarning;
            }
            await tx.update(schema_1.restaurantWallets)
                .set({
                balance: currentRestBalance.toString(),
                collectedCash: currentCollectedCash.toString(),
                totalEarning: (currentTotalEarning - restaurantEarning).toString()
            })
                .where((0, drizzle_orm_1.eq)(schema_1.restaurantWallets.restaurantId, order.restaurantId));
            // تسجيل العملية
            await tx.insert(schema_1.restaurantWalletTransactions).values({
                id: (0, uuid_1.v4)(),
                restaurantId: order.restaurantId,
                type: "order_payment", // Or create a new type "refund"
                amount: isCashPayment ? `${appDues}` : `-${restaurantEarning}`,
                balanceBefore: restaurantWallet.balance,
                balanceAfter: currentRestBalance.toString(),
                method: order.paymentMethod,
                reference: order.orderNumber,
                note: "Refund/Revert due to user cancellation"
            });
        }
    });
    return (0, response_1.SuccessResponse)(res, { message: "Order cancelled successfully" });
};
exports.cancelOrder = cancelOrder;
// ==========================================
// 7. جلب أسباب الإلغاء الخاصة بالمستخدم
// ==========================================
const getUserCancelReasons = async (req, res) => {
    const reasons = await connection_1.db
        .select()
        .from(schema_1.selectReasons)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.selectReasons.status, "active"), (0, drizzle_orm_1.eq)(schema_1.selectReasons.type, "user")));
    return (0, response_1.SuccessResponse)(res, {
        message: "Active cancel reasons fetched successfully",
        data: reasons
    });
};
exports.getUserCancelReasons = getUserCancelReasons;
