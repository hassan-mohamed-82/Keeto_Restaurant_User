import { Request, Response } from "express";
import PDFDocument from "pdfkit";
import { db } from "../../models/connection";
import {
    orders, orderItems, food, users, paymentMethods,
    userWallets, userWalletTransactions,
    restaurantWalletTransactions,
    restaurantWallets,
    branches,
    restaurants,
    foodVariations,
    variationOptions,
    addresses,
    zones,
    pointsProducts,
    userPointsTransactions,
    userRestaurantPoints,
} from "../../models/schema";
import { eq, and, desc, inArray, sql } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import { selectReasons } from "../../models/schema/admin/selectReasons";
import { sendPushNotification } from "../../utils/notifications";
import { UnauthorizedError } from "../../Errors";

// ==========================================
// 1. جلب كل الأوردرات الخاصة بالمطعم/الفرع
// ==========================================
export const getRestaurantOrders = async (req: Request, res: Response) => {
    // ✅ التحقق من وجود req.user أولاً
    if (!req.user) {
        throw new UnauthorizedError("Not authenticated");
    }

    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId; // لو Null يبقى ده المالك

    if (!adminRestaurantId) {
        throw new BadRequest("Restaurant ID not found");
    }

    // بناء الـ Query الأساسي
    let queryConditions = eq(orders.restaurantId, adminRestaurantId);

    // لو ده مدير فرع، نفلتر الأوردرات لفرعه هو بس بشكل إجباري
    if (adminBranchId) {
        queryConditions = and(queryConditions, eq(orders.branchId, adminBranchId)) as any;
    } 
    // لو ده المالك وبعت branchId في الـ Query عشان يفلتر بيه
    else if (req.query?.branchId) {
        queryConditions = and(queryConditions, eq(orders.branchId, req.query.branchId as string)) as any;
    }

    const restaurantOrders = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        dailyOrderNumber: orders.dailyOrderNumber, // ✅ الرقم التسلسلي اليومي
        customerName: users.name,
        customerPhone: users.phone,
        orderType: orders.orderType,
        totalAmount: orders.totalAmount,
        status: orders.status,
        note: orders.note,
        createdAt: orders.createdAt,
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(queryConditions)
        .orderBy(desc(orders.createdAt)); // ترتيب من الأحدث للأقدم

    return SuccessResponse(res, { message: "Get orders success", data: restaurantOrders });
};

// ==========================================
// Helper: جلب أوردرات بحالة معينة
// ==========================================
const getOrdersByStatus = async (req: Request, res: Response, status: "pending" | "accepted" | "preparing" | "out_for_delivery" | "delivered" | "cancelled" | "refund") => {
    // ✅ التحقق من وجود req.user أولاً
    if (!req.user) {
        throw new UnauthorizedError("Not authenticated");
    }

    const adminRestaurantId = req.user.restaurantId || req.user.id;
    const adminBranchId = req.user.branchId;

    if (!adminRestaurantId) {
        throw new BadRequest("Restaurant ID not found");
    }

    const conditions: any[] = [
        eq(orders.restaurantId, adminRestaurantId),
        eq(orders.status, status)
    ];

    // لو ده مدير فرع، نفلتر إجباري لفرعه هو بس
    if (adminBranchId) {
        conditions.push(eq(orders.branchId, adminBranchId));
    } 
    // لو ده المالك وبعت branchId يفلتر بيه
    else if (req.query?.branchId) {
        conditions.push(eq(orders.branchId, req.query.branchId as string));
    }

    const result = await db.select({
        id: orders.id,
        orderNumber: orders.orderNumber,
        dailyOrderNumber: orders.dailyOrderNumber, // ✅ الرقم التسلسلي اليومي
        customerName: users.name,
        customerPhone: users.phone,
        orderType: orders.orderType,
        orderSource: orders.orderSource,
        subtotal: orders.subtotal,
        deliveryFee: orders.deliveryFee,
        totalAmount: orders.totalAmount,
        status: orders.status,
        note: orders.note,
        branchName: branches.name,
        createdAt: orders.createdAt,
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

    return SuccessResponse(res, { message: `Get ${status} orders success`, data: result });
};

// ==========================================
// APIs لكل حالة أوردر
// ==========================================
export const getPendingOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "pending");
export const getAcceptedOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "accepted");
export const getPreparingOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "preparing");
export const getOutForDeliveryOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "out_for_delivery");
export const getDeliveredOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "delivered");
export const getCancelledOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "cancelled");
export const getRefundOrders = async (req: Request, res: Response) => getOrdersByStatus(req, res, "refund");

// ==========================================
// 2. جلب تفاصيل أوردر معين بالـ ID (كامل)
// ==========================================
export const getRestaurantOrderById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    // 1. جلب البيانات الأساسية للأوردر
    const [orderDetail] = await db.select({
        order: orders,
        customer: {
            id: users.id,
            name: users.name,
            phone: users.phone,
            email: users.email,
        },
        branch: {
            id: branches.id,
            name: branches.name,
        },
        restaurant: {
            id: restaurants.id,
            name: restaurants.name,
        },
        address: {
            id: addresses.id,
            type: addresses.type,
            title: addresses.title,
            lat: addresses.lat,
            lng: addresses.lng,
            street: addresses.street,
            number: addresses.number,
            floor: addresses.floor,
        },
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
        .leftJoin(addresses, eq(orders.addressId, addresses.id))
        .where(eq(orders.id, id))
        .limit(1);

    if (!orderDetail) throw new NotFound("Order not found");

    // 🛡️ حماية الصلاحيات
    if (orderDetail.order.restaurantId !== adminRestaurantId) {
        throw new BadRequest("Unauthorized: Order does not belong to your restaurant");
    }
    if (adminBranchId && orderDetail.order.branchId !== adminBranchId) {
        throw new BadRequest("Unauthorized: Order does not belong to your branch");
    }

    // 2. جلب أصناف الأكل (Order Items)
    const items = await db.select({
        id: orderItems.id,
        foodId: orderItems.foodId,
        quantity: orderItems.quantity,
        basePrice: orderItems.basePrice,
        variationsPrice: orderItems.variationsPrice,
        totalPrice: orderItems.totalPrice,
        note: orderItems.note,
        variations: orderItems.variations,
        foodName: food.name,
        foodNameAr: food.nameAr,
        foodNameFr: food.nameFr,
        foodImage: food.image,
        foodDescription: food.description,
    })
        .from(orderItems)
        .leftJoin(food, eq(orderItems.foodId, food.id))
        .where(eq(orderItems.orderId, id));

    // ✅ 3. تنظيف الـ Variations وجلب الأسماء وحساب السعر ديناميكياً
    const formattedItems = await Promise.all(items.map(async (item) => {
        let cleanVariations = item.variations;
        
        if (typeof cleanVariations === 'string') {
            try {
                cleanVariations = JSON.parse(cleanVariations);
                if (typeof cleanVariations === 'string') {
                    cleanVariations = JSON.parse(cleanVariations);
                }
            } catch (error) {
                console.error("Error parsing variations for item ID:", item.id);
            }
        }

        let totalCalculatedVarPrice = 0;

        if (Array.isArray(cleanVariations) && cleanVariations.length > 0) {
            cleanVariations = await Promise.all(cleanVariations.map(async (v: any) => {
                let variationName = "Unknown";
                let variationNameAr = "غير معروف";
                let optionName = "Unknown";
                let optionNameAr = "غير معروف";

                if (v.variationId) {
                    const [varDb] = await db.select().from(foodVariations).where(eq(foodVariations.id, v.variationId)).limit(1);
                    if (varDb) {
                        variationName = varDb.name || variationName;
                        variationNameAr = varDb.nameAr || variationNameAr;
                    }
                }

                if (v.optionId) {
                    const [optDb] = await db.select().from(variationOptions).where(eq(variationOptions.id, v.optionId)).limit(1);
                    if (optDb) {
                        optionName = optDb.optionName || optionName;
                        optionNameAr = optDb.optionNameAr || optionNameAr;
                        
                        // 💰 جلب سعر الفارييشن
                        const price = parseFloat((optDb as any).price || optDb.additionalPrice || "0");
                        totalCalculatedVarPrice += price;
                    }
                }

                return {
                    ...v,
                    variationName,
                    variationNameAr,
                    optionName,
                    optionNameAr
                };
            }));
        }

        const finalVarPrice = parseFloat(item.variationsPrice || "0") > 0 ? parseFloat(item.variationsPrice || "0") : totalCalculatedVarPrice;
        const finalTotalPrice = (parseFloat(item.basePrice || "0") + finalVarPrice) * item.quantity;

        return {
            ...item,
            variationsPrice: finalVarPrice.toFixed(2),
            totalPrice: finalTotalPrice.toFixed(2),
            variations: cleanVariations
        };
    }));

    // 4. جلب بيانات وسيلة الدفع من جدول payment_methods
    let pmDetails: any = null;
    const pmValue = orderDetail.order.paymentMethod;

    if (pmValue && pmValue.length === 36) {
        try {
            const [pm] = await db.select({
                id: paymentMethods.id,
                name: paymentMethods.name,
                nameAr: paymentMethods.nameAr 
            }).from(paymentMethods).where(eq(paymentMethods.id, pmValue)).limit(1);
            
            if (pm) {
                pmDetails = {
                    id: pm.id,
                    name: pm.name,
                    nameAr: pm.nameAr,
                };
            } else {
                pmDetails = { id: pmValue, name: "Unknown", nameAr: "غير معروف" };
            }
        } catch (error) {
            console.error("Error fetching payment method:", error);
            pmDetails = { id: pmValue, name: "Unknown", nameAr: "غير معروف" };
        }
    } else {
        switch (pmValue) {
            case "cash_on_delivery":
                pmDetails = { id: pmValue, name: "Cash on Delivery", nameAr: "الدفع عند الاستلام", nameFr: "Paiement à la livraison" };
                break;
            case "visa":
                pmDetails = { id: pmValue, name: "Credit Card", nameAr: "بطاقة", nameFr: "Carte de crédit" };
                break;
            case "wallet":
                pmDetails = { id: pmValue, name: "Wallet", nameAr: "محفظتي", nameFr: "Portefeuille" };
                break;
            default:
                pmDetails = { id: pmValue, name: pmValue, nameAr: pmValue };
        }
    }

    return SuccessResponse(res, {
        message: "Get order details success",
        data: {
            id: orderDetail.order.id,
            orderNumber: orderDetail.order.orderNumber,
            dailyOrderNumber: orderDetail.order.dailyOrderNumber, // ✅ الرقم التسلسلي اليومي
            orderType: orderDetail.order.orderType,
            orderSource: orderDetail.order.orderSource,
            status: orderDetail.order.status,
            cancelReason: orderDetail.order.cancelReason,
            note: orderDetail.order.note,
            subtotal: orderDetail.order.subtotal,
            deliveryFee: orderDetail.order.deliveryFee,
            serviceFee: orderDetail.order.serviceFee,
            appCommission: orderDetail.order.appCommission,
            totalAmount: orderDetail.order.totalAmount,
            createdAt: orderDetail.order.createdAt,
            updatedAt: orderDetail.order.updatedAt,
            customer: orderDetail.customer,
            
            // ✅ فصلنا الداتا عشان الرياكت ميضربش ويقرأ الـ ID زي ما هو متعود
            paymentMethod: typeof pmDetails === "object" && pmDetails !== null ? pmDetails.id : pmDetails,
            paymentMethodName: typeof pmDetails === "object" && pmDetails !== null ? pmDetails.name : pmDetails,
            paymentMethodNameAr: typeof pmDetails === "object" && pmDetails !== null ? pmDetails.nameAr : pmDetails,
            
            branch: orderDetail.branch,
            restaurant: orderDetail.restaurant,
            address: orderDetail.address,
            items: formattedItems
        }
    });
};
// ==========================================
// 3. تحديث حالة الأوردر (مع إرجاع الفلوس والعمولة لو المطعم كنسل)
// تحديث حالة الأوردر (إرجاع المحفظة + التسوية + إضافة النقاط عند delivered)
// ==========================================
export const updateOrderStatus = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const { status, cancelReasonId } = req.body;

    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    if (!status) throw new BadRequest("Status is required");

    if (status === "cancelled" && !cancelReasonId) {
        throw new BadRequest("Cancel reason ID is required when cancelling an order");
    }

    const [existingOrder] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
    if (!existingOrder) throw new NotFound("Order not found");

    if (existingOrder.restaurantId !== adminRestaurantId) throw new BadRequest("Unauthorized");
    if (adminBranchId && existingOrder.branchId !== adminBranchId) throw new BadRequest("Unauthorized");

    const currentStatus = existingOrder.status as string;

    const finalStatuses = ["delivered", "cancelled", "refund"];
    if (finalStatuses.includes(currentStatus)) {
        throw new BadRequest(`Order is already ${currentStatus} and cannot be changed`);
    }

    const statusFlowOrder: Record<string, number> = {
        "pending": 1,
        "accepted": 2,
        "preparing": 3,
        "out_for_delivery": 4,
        "delivered": 5,
    };

    if (statusFlowOrder[currentStatus] && statusFlowOrder[status]) {
        if (statusFlowOrder[status] === statusFlowOrder[currentStatus]) {
            throw new BadRequest(`Order is already ${currentStatus}`);
        }
        if (statusFlowOrder[status] < statusFlowOrder[currentStatus]) {
            throw new BadRequest(`Cannot revert status from ${currentStatus} to ${status}`);
        }
    } else if (currentStatus === status) {
        throw new BadRequest(`Order is already ${currentStatus}`);
    }

    let reason: any = null;
    if (status === "cancelled") {
        const [found] = await db.select().from(selectReasons)
            .where(and(eq(selectReasons.id, cancelReasonId), eq(selectReasons.type, "restaurant")))
            .limit(1);
        if (!found) throw new BadRequest("Invalid cancel reason for restaurant");
        reason = found;
    }

    await db.transaction(async (tx) => {
        // 1. تحديث حالة الطلب
        await tx.update(orders)
            .set({
                status: status,
                cancelReasonId: status === "cancelled" ? reason.id : null,
                cancelReason: status === "cancelled" ? reason.name : null,
                updatedAt: new Date()
            })
            .where(eq(orders.id, orderId));

        // ==========================================
        // 💰 2. الـ Refund لمحفظة العميل (User Wallet) عند الإلغاء
        // ==========================================
        if (status === "cancelled" || status === "rejected") {
            // البحث هل تم الدفع سابقاً بواسطة المحفظة
            const [walletTx] = await tx.select().from(userWalletTransactions)
                .where(and(
                    eq(userWalletTransactions.reference, existingOrder.orderNumber),
                    eq(userWalletTransactions.transactionType, "order_payment")
                )).limit(1);

            if (walletTx) {
                const [userWallet] = await tx.select().from(userWallets)
                    .where(eq(userWallets.userId, existingOrder.userId)).limit(1);

                if (userWallet) {
                    const balanceBefore = parseFloat(userWallet.balance ?? "0.00");
                    const amountToRefund = parseFloat(existingOrder.totalAmount as string || "0.00");
                    const newBalance = balanceBefore + amountToRefund;

                    // تحديث رصيد محفظة العميل
                    await tx.update(userWallets)
                        .set({
                            balance: newBalance.toFixed(2),
                            updatedAt: new Date()
                        })
                        .where(eq(userWallets.id, userWallet.id));

                    // إضافة حركة إرجاع الرصيد (Refund Transaction)
                    await tx.insert(userWalletTransactions).values({
                        id: uuidv4(),
                        userId: existingOrder.userId,
                        paymentMethodId: existingOrder.paymentMethod ?? null,
                        type: "credit",
                        transactionType: "refund",
                        amount: amountToRefund.toFixed(2),
                        balanceBefore: balanceBefore.toFixed(2),
                        reference: existingOrder.orderNumber,
                        status: "approved",
                        createdAt: new Date()
                    });
                }
            }

            // ==========================================
            // 💰 3. التسوية العكسية لمحفظة المطعم (Restaurant Wallet Reversal)
            // ==========================================
            const [payment] = await tx.select().from(paymentMethods).where(eq(paymentMethods.id, existingOrder.paymentMethod)).limit(1);
            const pmName = (payment?.name || "").toLowerCase();
            const isCashPayment = pmName.includes("cash") || pmName.includes("استلام");

            const appCommission = parseFloat(existingOrder.appCommission as string || "0");
            const serviceFee = parseFloat(existingOrder.serviceFee as string || "0");
            const totalAmount = parseFloat(existingOrder.totalAmount as string || "0");
            const subtotal = parseFloat(existingOrder.subtotal as string || "0");
            const deliveryFee = parseFloat(existingOrder.deliveryFee as string || "0");

            const appDues = appCommission + serviceFee;
            const restaurantEarning = subtotal + deliveryFee - appCommission;

            let [restWallet] = await tx.select().from(restaurantWallets)
                .where(eq(restaurantWallets.restaurantId, existingOrder.restaurantId)).limit(1);

            if (!restWallet) {
                await tx.insert(restaurantWallets).values({ id: uuidv4(), restaurantId: existingOrder.restaurantId });
                [restWallet] = await tx.select().from(restaurantWallets)
                    .where(eq(restaurantWallets.restaurantId, existingOrder.restaurantId)).limit(1);
            }

            let currentBalance = parseFloat(restWallet.balance as string || "0");
            let currentCollectedCash = parseFloat(restWallet.collectedCash as string || "0");
            let currentTotalEarning = parseFloat(restWallet.totalEarning as string || "0");

            if (isCashPayment) {
                currentBalance += appDues;
                currentCollectedCash -= totalAmount;
            } else {
                currentBalance -= restaurantEarning;
            }
            currentTotalEarning -= restaurantEarning;

            const balanceAfterPenalty = currentBalance - appDues;

            await tx.update(restaurantWallets)
                .set({
                    balance: balanceAfterPenalty.toFixed(2),
                    collectedCash: currentCollectedCash.toFixed(2),
                    totalEarning: currentTotalEarning.toFixed(2),
                    updatedAt: new Date()
                })
                .where(eq(restaurantWallets.restaurantId, existingOrder.restaurantId));

            await tx.insert(restaurantWalletTransactions).values({
                id: uuidv4(),
                restaurantId: existingOrder.restaurantId,
                type: "order_payment",
                amount: `-${appDues.toFixed(2)}`,
                balanceBefore: currentBalance.toFixed(2),
                balanceAfter: balanceAfterPenalty.toFixed(2),
                method: existingOrder.paymentMethod,
                reference: existingOrder.orderNumber,
                note: `Order Reversal & Penalty: Cancelled by restaurant. Commission deducted: ${appDues}`,
                createdAt: new Date()
            });
        }

        // ==========================================
        // ⭐ LOYALTY POINTS: إضافة نقاط المطعم عند التوصيل (DELIVERED)
        // ==========================================
        if (status === "delivered") {
            const items = await tx
                .select({ foodId: orderItems.foodId, quantity: orderItems.quantity })
                .from(orderItems)
                .where(eq(orderItems.orderId, orderId));

            if (items.length > 0) {
                const foodIds = items.map(i => i.foodId);

                const enrolledRows = await tx
                    .select({ foodId: pointsProducts.foodId, isActive: pointsProducts.isActive })
                    .from(pointsProducts)
                    .where(
                        and(
                            eq(pointsProducts.restaurantId, existingOrder.restaurantId),
                            inArray(pointsProducts.foodId, foodIds)
                        )
                    );

                const enrolledMap = new Map(
                    enrolledRows.filter(r => r.isActive).map(r => [r.foodId, true])
                );

                if (enrolledMap.size > 0) {
                    const enrolledFoodIds = foodIds.filter(id => enrolledMap.has(id));
                    const foodPoints = await tx
                        .select({ id: food.id, points: food.points })
                        .from(food)
                        .where(inArray(food.id, enrolledFoodIds));

                    const foodPointsMap = new Map(foodPoints.map(f => [f.id, f.points ?? 0]));

                    let totalPointsEarned = 0;
                    for (const item of items) {
                        if (enrolledMap.has(item.foodId)) {
                            totalPointsEarned += (foodPointsMap.get(item.foodId) ?? 0) * item.quantity;
                        }
                    }

                    if (totalPointsEarned > 0) {
                        let [userPointRecord] = await tx
                            .select()
                            .from(userRestaurantPoints)
                            .where(
                                and(
                                    eq(userRestaurantPoints.userId, existingOrder.userId),
                                    eq(userRestaurantPoints.restaurantId, existingOrder.restaurantId)
                                )
                            )
                            .limit(1);

                        if (!userPointRecord) {
                            const newPointId = uuidv4();
                            await tx.insert(userRestaurantPoints).values({
                                id: newPointId,
                                userId: existingOrder.userId,
                                restaurantId: existingOrder.restaurantId,
                                points: 0,
                            });
                            [userPointRecord] = await tx
                                .select()
                                .from(userRestaurantPoints)
                                .where(eq(userRestaurantPoints.id, newPointId))
                                .limit(1);
                        }

                        const pointsBefore = userPointRecord.points ?? 0;
                        const pointsAfter = pointsBefore + totalPointsEarned;

                        await tx
                            .update(userRestaurantPoints)
                            .set({ points: pointsAfter, updatedAt: new Date() })
                            .where(eq(userRestaurantPoints.id, userPointRecord.id));

                        await tx.insert(userPointsTransactions).values({
                            id: uuidv4(),
                            userId: existingOrder.userId,
                            restaurantId: existingOrder.restaurantId,
                            type: "earn",
                            points: totalPointsEarned,
                            balanceBefore: pointsBefore,
                            balanceAfter: pointsAfter,
                            orderId: orderId,
                            note: `Earned ${totalPointsEarned} points from order #${existingOrder.orderNumber}`,
                            createdAt: new Date(),
                        });
                    }
                }
            }
        }
    });

    // ==========================================
    // 4. إرسال الإشعارات للعميل
    // ==========================================
    let messageBody = `Your order ${existingOrder.orderNumber} is now ${status}.`;
    if (status === "cancelled") {
        messageBody = `Your order ${existingOrder.orderNumber} was cancelled. Reason: ${reason?.name || "Not specified"}`;
    }

    await sendPushNotification({
        recipientType: "user",
        recipientId: existingOrder.userId,
        title: "Order Update",
        body: messageBody,
        data: {
            orderId: existingOrder.id,
            orderNumber: existingOrder.orderNumber,
            status: status,
            type: "ORDER_STATUS_UPDATE"
        }
    });

    return SuccessResponse(res, { message: `Order status successfully updated to ${status}` });
};
// جلب أسباب الإلغاء حسب النوع (user أو restaurant)
export const getReasons = async (req: Request, res: Response) => {
    const type = req.query.type as string;

    const conditions: any[] = [eq(selectReasons.status, "active")];
    if (type === "user" || type === "restaurant") {
        conditions.push(eq(selectReasons.type, type));
    }

    const reasons = await db
        .select()
        .from(selectReasons)
        .where(and(...conditions));

    return SuccessResponse(res, {
        message: "Active reasons fetched successfully",
        data: reasons
    });
};

// ==========================================
// 5. إنشاء فاتورة (PDF) لطلب معين
// ==========================================
export const generateOrderInvoicePDF = async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    const adminBranchId = req.user?.branchId;

    // 1. جلب البيانات الأساسية للأوردر
    const [orderDetail] = await db.select({
        order: orders,
        customer: {
            id: users.id,
            name: users.name,
            phone: users.phone,
        },
        branch: {
            id: branches.id,
            name: branches.name,
        },
        restaurant: {
            id: restaurants.id,
            name: restaurants.name,
        },
        address: addresses,
        zone: {
            name: zones.name
        }
    })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(branches, eq(orders.branchId, branches.id))
        .leftJoin(restaurants, eq(orders.restaurantId, restaurants.id))
        .leftJoin(addresses, eq(orders.addressId, addresses.id))
        .leftJoin(zones, eq(addresses.zoneId, zones.id))
        .where(eq(orders.id, orderId))
        .limit(1);

    if (!orderDetail) throw new NotFound("Order not found");

    // 🛡️ حماية الصلاحيات
    if (orderDetail.order.restaurantId !== adminRestaurantId) {
        throw new BadRequest("Unauthorized: Order does not belong to your restaurant");
    }
    if (adminBranchId && orderDetail.order.branchId !== adminBranchId) {
        throw new BadRequest("Unauthorized: Order does not belong to your branch");
    }

    // 2. جلب أصناف الأكل والتفاصيل (Variations)
    const items = await db.select({
        quantity: orderItems.quantity,
        basePrice: orderItems.basePrice,
        variationsPrice: orderItems.variationsPrice,
        totalPrice: orderItems.totalPrice,
        variations: orderItems.variations,
        foodName: food.name,
        foodNameAr: food.nameAr,
    })
        .from(orderItems)
        .leftJoin(food, eq(orderItems.foodId, food.id))
        .where(eq(orderItems.orderId, orderId));

    // تجهيز تفاصيل الفارييشنز وحساب السعر وربطه بالاسم
    const formattedItems = await Promise.all(items.map(async (item) => {
        let cleanVariations = item.variations;
        if (typeof cleanVariations === 'string') {
            try {
                cleanVariations = JSON.parse(cleanVariations);
                if (typeof cleanVariations === 'string') cleanVariations = JSON.parse(cleanVariations);
            } catch (error) {}
        }

        let varDetails: { name: string, price: number }[] = [];
        let totalCalculatedVarPrice = 0;

        if (Array.isArray(cleanVariations) && cleanVariations.length > 0) {
            await Promise.all(cleanVariations.map(async (v: any) => {
                if (v.optionId) {
                    const [optDb] = await db.select().from(variationOptions).where(eq(variationOptions.id, v.optionId)).limit(1);
                    if (optDb) {
                        const name = optDb.optionName || "Extra";
                        const price = parseFloat((optDb as any).price || optDb.additionalPrice || "0");
                        varDetails.push({ name, price });
                        totalCalculatedVarPrice += price;
                    }
                }
            }));
        }

        const finalVarPrice = parseFloat(item.variationsPrice as string || "0") > 0 ? parseFloat(item.variationsPrice as string || "0") : totalCalculatedVarPrice;
        const finalTotalPrice = (parseFloat(item.basePrice as string || "0") + finalVarPrice) * item.quantity;

        return {
            ...item,
            finalTotalPrice,
            variationDetails: varDetails 
        };
    }));

    // 3. جلب اسم وسيلة الدفع بدل الـ ID
    let paymentName = "Unknown";
    const pmValue = orderDetail.order.paymentMethod;

    if (pmValue && pmValue.length === 36) {
        try {
            const [pm] = await db.select({ name: paymentMethods.name }).from(paymentMethods).where(eq(paymentMethods.id, pmValue)).limit(1);
            if (pm) paymentName = pm.name;
            else paymentName = pmValue;
        } catch (error) {
            console.error("Error fetching payment method for PDF:", error);
            paymentName = "Cash"; 
        }
    } else {
        switch (pmValue) {
            case "cash_on_delivery": paymentName = "Cash on Delivery"; break;
            case "visa": paymentName = "Credit Card"; break;
            case "wallet": paymentName = "Wallet"; break;
            default: paymentName = pmValue || "Unknown";
        }
    }

    // 4. إنشاء الـ PDF بحجم إيصال حراري
    const doc = new PDFDocument({ margin: 20, size: [250, 600] });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Receipt_${orderDetail.order.orderNumber}.pdf"`);

    doc.pipe(res);

    // Header
    doc.fontSize(16).text(orderDetail.restaurant?.name || 'Restaurant', { align: 'center' });
    if (orderDetail.branch?.name) {
        doc.fontSize(12).text(orderDetail.branch.name, { align: 'center' });
    }
    
    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.5);

    // Order Info
    doc.fontSize(10);
    doc.text(`Order #: ${orderDetail.order.dailyOrderNumber}`);
    
    const orderDate = new Date(orderDetail.order.createdAt || new Date());
    
    // ✅ تحويل الوقت والتاريخ لتوقيت القاهرة بشكل صريح
    const cairoTimeStr = orderDate.toLocaleTimeString("en-US", { timeZone: "Africa/Cairo" });
    const cairoDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(orderDate);

    doc.text(`Date: ${cairoDateStr}`);
    doc.text(`Time: ${cairoTimeStr}`);
    
    doc.text(`Branch: ${orderDetail.branch?.name || 'N/A'}`);
    doc.text(`Client: ${orderDetail.customer?.name || 'Guest'}`);
    doc.text(`Phone: ${orderDetail.customer?.phone || 'N/A'}`);
    doc.text(`Order Type: ${orderDetail.order.orderType}`);
    doc.text(`Payment: ${paymentName}`);
    
    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
    doc.undash();
    doc.moveDown(0.5);

    // Delivery Address if applicable
    if (orderDetail.order.orderType === 'delivery' && orderDetail.address) {
        doc.text('Delivery Address:', { underline: true });
        doc.text(`Zone: ${orderDetail.zone?.name || ''}`);
        doc.text(`Street: ${orderDetail.address.street || ''}`);
        let details = `Bldg: ${orderDetail.address.number || ''}`;
        if (orderDetail.address.floor) details += ` | Floor: ${orderDetail.address.floor}`;
        doc.text(details);
        
        doc.moveDown(0.5);
        doc.moveTo(10, doc.y).lineTo(240, doc.y).dash(2, { space: 2 }).stroke();
        doc.undash();
        doc.moveDown(0.5);
    }

    // Items Header
    const itemStartY = doc.y;
    doc.text('Item', 10, itemStartY, { width: 100 });
    doc.text('Qty', 110, itemStartY, { width: 30, align: 'right' });
    doc.text('Price', 140, itemStartY, { width: 45, align: 'right' });
    doc.text('Total', 185, itemStartY, { width: 55, align: 'right' });
    doc.moveDown(0.2);
    
    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);

    // Items Loop
    for (const item of formattedItems) {
        const currentY = doc.y;
        const name = item.foodName || item.foodNameAr || 'Item';
        
        doc.text(name, 10, currentY, { width: 100 });
        const nextY = doc.y;
        
        doc.text(item.quantity.toString(), 110, currentY, { width: 30, align: 'right' });
        doc.text(parseFloat(item.basePrice as string).toFixed(2), 140, currentY, { width: 45, align: 'right' });
        doc.text(item.finalTotalPrice.toFixed(2), 185, currentY, { width: 55, align: 'right' });
        
        doc.y = nextY;

        // طباعة الفارييشنز تحت الصنف مع عرض السعر
        if (item.variationDetails.length > 0) {
            doc.fontSize(8);
            for (const v of item.variationDetails) {
                const vY = doc.y;
                doc.text(`  + ${v.name}`, 10, vY, { width: 120 });
                if (v.price > 0) {
                    doc.text(v.price.toFixed(2), 140, vY, { width: 45, align: 'right' });
                }
            }
            doc.fontSize(10);
        }
        
        doc.moveDown(0.5);
    }

    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    const subtotal = parseFloat(orderDetail.order.subtotal as string).toFixed(2);
    const deliveryFee = parseFloat(orderDetail.order.deliveryFee as string).toFixed(2);
    const serviceFee = parseFloat(orderDetail.order.serviceFee as string).toFixed(2);
    const total = parseFloat(orderDetail.order.totalAmount as string).toFixed(2);

    doc.text(`Total Product Price`, 10, doc.y, { continued: true }).text(`${subtotal}`, { align: 'right' });
    doc.text(`Delivery Fee`, 10, doc.y, { continued: true }).text(`${deliveryFee}`, { align: 'right' });
    doc.text(`Service Fee`, 10, doc.y, { continued: true }).text(`${serviceFee}`, { align: 'right' }); 
    
    doc.moveDown(0.5);
    doc.moveTo(10, doc.y).lineTo(240, doc.y).stroke();
    doc.moveDown(0.5);

    doc.fontSize(14).text(`Grand Total`, 10, doc.y, { continued: true }).text(`${total}`, { align: 'right' });

    doc.moveDown(1);
    doc.fontSize(10).text('Thank you for your order', { align: 'center' });
    doc.fontSize(8).text('Powered by Systego', { align: 'center' });

    doc.end();
};

export const getallnumbersoforders = async (req: Request, res: Response) => {
    const adminRestaurantId = req.user?.restaurantId || req.user?.id;
    if (!adminRestaurantId) throw new BadRequest("Restaurant ID missing or unauthorized");

    const statusCountsResult = await db
        .select({
            status: orders.status,
            count: sql<number>`count(${orders.id})`,
        })
        .from(orders)
        .where(eq(orders.restaurantId, adminRestaurantId))
        .groupBy(orders.status);

    const totalOrders = statusCountsResult.reduce((acc, curr) => acc + Number(curr.count), 0);

    // Format the status counts as an object for easier consumption
    const statusCounts = statusCountsResult.reduce((acc, curr) => {
        if (curr.status) {
            acc[curr.status] = Number(curr.count);
        }
        return acc;
    }, {} as Record<string, number>);

    return SuccessResponse(res, { 
        data: {
            totalOrders,
            statusCounts
        } 
    });
};