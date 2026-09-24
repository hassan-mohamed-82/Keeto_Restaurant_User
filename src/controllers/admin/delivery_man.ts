import { Request, Response } from "express";
import { db } from "../../models/connection";
import { deliveryMen, orders, users, paymentMethods } from "../../models/schema";
import { eq, and, inArray, sql, gte, lte, desc } from "drizzle-orm";
import { SuccessResponse } from "../../utils/response";
import { BadRequest } from "../../Errors/BadRequest";
import { NotFound } from "../../Errors/NotFound";
import { v4 as uuidv4 } from "uuid";
import bcrypt from "bcrypt";

export const createDeliveryMan = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { branchId, name, phone, email, password, image , isActive } = req.body;

    if (!name || !phone) {
        throw new BadRequest("Missing required fields (name, phone)");
    }

    const id = uuidv4();
    
    let hashedPassword = null;
    if (password) {
        hashedPassword = await bcrypt.hash(password, 10);
    }

    await db.insert(deliveryMen).values({
        id,
        restaurantId,
        branchId: branchId || null,
        name,
        phone,
        email: email || null,
        password: hashedPassword,
        image: image || null,
        isActive: isActive ?? true,
    });

    return SuccessResponse(res, { message: "Delivery man created successfully", data: { id } }, 201);
};

export const getDeliveryMen = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { branchId } = req.query;

    let condition = eq(deliveryMen.restaurantId, restaurantId);
    if (branchId) {
        condition = and(condition, eq(deliveryMen.branchId, branchId as string)) as any;
    }

    const allDeliveryMen = await db.select({
        id: deliveryMen.id,
        restaurantId: deliveryMen.restaurantId,
        branchId: deliveryMen.branchId,
        name: deliveryMen.name,
        phone: deliveryMen.phone,
        email: deliveryMen.email,
        image: deliveryMen.image,
        isActive: deliveryMen.isActive,
        createdAt: deliveryMen.createdAt,
        updatedAt: deliveryMen.updatedAt,
    })
    .from(deliveryMen)
    .where(condition);

    return SuccessResponse(res, { message: "Get delivery men success", data: allDeliveryMen });
};

export const getDeliveryManById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const deliveryMan = await db.select({
        id: deliveryMen.id,
        restaurantId: deliveryMen.restaurantId,
        branchId: deliveryMen.branchId,
        name: deliveryMen.name,
        phone: deliveryMen.phone,
        email: deliveryMen.email,
        image: deliveryMen.image,
        isActive: deliveryMen.isActive,
        createdAt: deliveryMen.createdAt,
        updatedAt: deliveryMen.updatedAt,
    })
    .from(deliveryMen)
    .where(
        and(
            eq(deliveryMen.id, id),
            eq(deliveryMen.restaurantId, restaurantId)
        )
    )
    .limit(1);

    if (!deliveryMan[0]) throw new NotFound("Delivery man not found or does not belong to your restaurant");

    return SuccessResponse(res, { message: "Get delivery man by id success", data: deliveryMan[0] });
};

export const updateDeliveryMan = async (req: Request, res: Response) => {
    const { id } = req.params;
    const { branchId, name, phone, email, password, image, isActive } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const existing = await db
        .select()
        .from(deliveryMen)
        .where(
            and(
                eq(deliveryMen.id, id),
                eq(deliveryMen.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing[0]) throw new NotFound("Delivery man not found or you don't have permission to edit it");

    const updateData: any = {};
    if (branchId !== undefined) updateData.branchId = branchId || null;
    if (name) updateData.name = name;
    if (phone) updateData.phone = phone;
    if (email !== undefined) updateData.email = email || null;
    if (image !== undefined) updateData.image = image || null;
    
    if (password) {
        updateData.password = await bcrypt.hash(password, 10);
    }

    if (isActive !== undefined) updateData.isActive = isActive;

    await db
        .update(deliveryMen)
        .set(updateData)
        .where(eq(deliveryMen.id, id));

    return SuccessResponse(res, { message: "Delivery man updated successfully" });
};

export const deleteDeliveryMan = async (req: Request, res: Response) => {
    const { id } = req.params;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const existing = await db
        .select()
        .from(deliveryMen)
        .where(
            and(
                eq(deliveryMen.id, id),
                eq(deliveryMen.restaurantId, restaurantId)
            )
        )
        .limit(1);

    if (!existing[0]) throw new NotFound("Delivery man not found or you don't have permission to delete it");

    await db.delete(deliveryMen).where(eq(deliveryMen.id, id));

    return SuccessResponse(res, { message: "Delivery man deleted successfully" });
};

// ==========================================
// الطلبات القابلة للإسناد (pending / accepted / preparing)
// ==========================================

/**
 * GET /delivery-men/pending-orders
 * يجلب كل الطلبات التي يمكن إسنادها لعامل توصيل
 * (حالتها: pending, accepted, preparing)
 */
export const getPendingOrders = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { branchId } = req.query;

    const assignableStatuses = ["pending", "accepted", "preparing"] as const;

    let conditions = and(
        eq(orders.restaurantId, restaurantId),
        inArray(orders.status, [...assignableStatuses])
    );

    if (branchId) {
        conditions = and(
            conditions,
            eq(orders.branchId, branchId as string)
        ) as any;
    }

    const pendingOrders = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            status: orders.status,
            orderType: orders.orderType,
            totalAmount: orders.totalAmount,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            paymentMethod: orders.paymentMethod,
            note: orders.note,
            shippingAddress: orders.shippingAddress,
            branchSnapshot: orders.branchSnapshot,
            deliveryManId: orders.deliveryManId,
            createdAt: orders.createdAt,
            // بيانات العميل
            customerId: users.id,
            customerName: users.name,
            customerPhone: users.phone,
            customerEmail: users.email,
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(conditions)
        .orderBy(orders.createdAt);

    return SuccessResponse(res, {
        message: "Assignable orders fetched successfully",
        total: pendingOrders.length,
        data: pendingOrders,
    });
};

// ==========================================
// إسناد طلبات لعامل توصيل
// ==========================================

/**
 * POST /delivery-men/assign-orders
 * body: { deliveryManId: string, orderIds: string[] }
 * يُسند مصفوفة من الطلبات لعامل توصيل محدد
 */
export const assignOrdersToDeliveryMan = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { deliveryManId, orderIds } = req.body as {
        deliveryManId: string;
        orderIds: string[];
    };

    // 1. التحقق من وجود عامل التوصيل وانتمائه للمطعم
    const [existingDeliveryMan] = await db
        .select({ id: deliveryMen.id, name: deliveryMen.name })
        .from(deliveryMen)
        .where(
            and(
                eq(deliveryMen.id, deliveryManId),
                eq(deliveryMen.restaurantId, restaurantId),
                eq(deliveryMen.isDeleted, false)
            )
        )
        .limit(1);

    if (!existingDeliveryMan) {
        throw new NotFound("Delivery man not found or does not belong to your restaurant");
    }

    // 2. التحقق من أن كل الطلبات موجودة وقابلة للإسناد (pending/accepted/preparing)
    const assignableStatuses = ["pending", "accepted", "preparing"] as const;

    const eligibleOrders = await db
        .select({ id: orders.id, orderNumber: orders.orderNumber, status: orders.status })
        .from(orders)
        .where(
            and(
                inArray(orders.id, orderIds),
                eq(orders.restaurantId, restaurantId),
                inArray(orders.status, [...assignableStatuses])
            )
        );

    if (eligibleOrders.length !== orderIds.length) {
        const foundIds = new Set(eligibleOrders.map(o => o.id));
        const invalidIds = orderIds.filter(id => !foundIds.has(id));
        throw new BadRequest(
            `The following order IDs are invalid or not in an assignable status (pending/accepted/preparing): ${invalidIds.join(", ")}`
        );
    }

    // 3. تحديث الطلبات بـ deliveryManId
    await db
        .update(orders)
        .set({ deliveryManId })
        .where(
            and(
                inArray(orders.id, orderIds),
                eq(orders.restaurantId, restaurantId)
            )
        );

    return SuccessResponse(res, {
        message: `Successfully assigned ${eligibleOrders.length} order(s) to ${existingDeliveryMan.name}`,
        data: {
            deliveryManId,
            deliveryManName: existingDeliveryMan.name,
            assignedOrdersCount: eligibleOrders.length,
            assignedOrders: eligibleOrders,
        },
    });
};

// ==========================================
// عمال التوصيل مع طلباتهم المُسندة
// ==========================================

/**
 * GET /delivery-men/assigned-orders
 * يجلب كل عمال التوصيل مع الطلبات المسندة لكل منهم
 * + إجمالي عدد الطلبات + إجمالي المبلغ لكل عامل
 */
export const getDeliveryMenWithOrders = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { branchId } = req.query;

    // 1. جلب كل عمال التوصيل
    let deliveryMenCondition = and(
        eq(deliveryMen.restaurantId, restaurantId),
        eq(deliveryMen.isDeleted, false)
    );

    if (branchId) {
        deliveryMenCondition = and(
            deliveryMenCondition,
            eq(deliveryMen.branchId, branchId as string)
        ) as any;
    }

    const allDeliveryMen = await db
        .select({
            id: deliveryMen.id,
            name: deliveryMen.name,
            phone: deliveryMen.phone,
            email: deliveryMen.email,
            image: deliveryMen.image,
            branchId: deliveryMen.branchId,
            isActive: deliveryMen.isActive,
        })
        .from(deliveryMen)
        .where(deliveryMenCondition);

    if (allDeliveryMen.length === 0) {
        return SuccessResponse(res, {
            message: "No delivery men found",
            total: 0,
            data: [],
        });
    }

    // 2. جلب الطلبات المُسندة لهؤلاء العمال (بحالات النشطة فقط)
    const deliveryMenIds = allDeliveryMen.map(dm => dm.id);
    const activeStatuses = ["pending", "accepted", "preparing", "out_for_delivery"] as const;

    const assignedOrders = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            status: orders.status,
            orderType: orders.orderType,
            totalAmount: orders.totalAmount,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            paymentMethod: orders.paymentMethod,
            note: orders.note,
            shippingAddress: orders.shippingAddress,
            deliveryManId: orders.deliveryManId,
            createdAt: orders.createdAt,
            // بيانات العميل
            customerId: users.id,
            customerName: users.name,
            customerPhone: users.phone,
        })
        .from(orders)
        .leftJoin(users, eq(orders.userId, users.id))
        .where(
            and(
                inArray(orders.deliveryManId, deliveryMenIds),
                eq(orders.restaurantId, restaurantId),
                inArray(orders.status, [...activeStatuses])
            )
        )
        .orderBy(orders.createdAt);

    // 3. تجميع الطلبات حسب deliveryManId
    const ordersMap = new Map<string, typeof assignedOrders>();
    for (const order of assignedOrders) {
        const dmId = order.deliveryManId!;
        if (!ordersMap.has(dmId)) ordersMap.set(dmId, []);
        ordersMap.get(dmId)!.push(order);
    }

    // 4. تجميع النتيجة النهائية
    const result = allDeliveryMen.map(dm => {
        const dmOrders = ordersMap.get(dm.id) ?? [];
        const totalAmount = dmOrders.reduce(
            (sum, o) => sum + parseFloat(o.totalAmount ?? "0"),
            0
        );

        return {
            ...dm,
            totalOrders: dmOrders.length,
            totalAmount: totalAmount.toFixed(2),
            orders: dmOrders,
        };
    });

    return SuccessResponse(res, {
        message: "Delivery men with assigned orders fetched successfully",
        total: result.length,
        data: result,
    });
};

// ==========================================
// طلبات التوصيل (out_for_delivery / delivered) مع الحسابات والكاش
// ==========================================

/**
 * GET /delivery-men/delivery-orders
 * query params:
 * - deliveryManId: string (UUID or "all")
 * - status: "out_for_delivery" | "delivered" | "all"
 * - branchId: string (UUID)
 * - startDate: string (ISO)
 * - endDate: string (ISO)
 * 
 * يجلب الطلبات بحالة out_for_delivery أو delivered
 * مع إمكانية الفلترة بمندوب توصيل محدد أو للكل
 * ويحسب:
 * - إجمالي عدد الطلبات (totalOrders)
 * - إجمالي الطلبات المستلمة (totalDeliveredOrders)
 * - إجمالي المبلغ المحصل (totalDeliveredAmount)
 * - الكاش في يد المندوب لتسليمه للإدارة (cashOnHand)
 */
export const getDeliveryOrders = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { deliveryManId, status, branchId, startDate, endDate } = req.query as {
        deliveryManId?: string;
        status?: "out_for_delivery" | "delivered" | "all";
        branchId?: string;
        startDate?: string;
        endDate?: string;
    };

    let targetStatuses: ("out_for_delivery" | "delivered")[] = ["out_for_delivery", "delivered"];
    if (status === "out_for_delivery" || status === "delivered") {
        targetStatuses = [status];
    }

    const conditions: any[] = [
        eq(orders.restaurantId, restaurantId),
        inArray(orders.status, targetStatuses),
    ];

    if (branchId) {
        conditions.push(eq(orders.branchId, branchId));
    }

    if (startDate) {
        conditions.push(gte(orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.createdAt, end));
    }

    let targetDeliveryMan: any = null;
    if (deliveryManId && deliveryManId !== "all") {
        const [dm] = await db
            .select({
                id: deliveryMen.id,
                name: deliveryMen.name,
                phone: deliveryMen.phone,
                email: deliveryMen.email,
                image: deliveryMen.image,
                branchId: deliveryMen.branchId,
                isActive: deliveryMen.isActive,
            })
            .from(deliveryMen)
            .where(
                and(
                    eq(deliveryMen.id, deliveryManId),
                    eq(deliveryMen.restaurantId, restaurantId),
                    eq(deliveryMen.isDeleted, false)
                )
            )
            .limit(1);

        if (!dm) {
            throw new NotFound("Delivery man not found or does not belong to your restaurant");
        }
        targetDeliveryMan = dm;
        conditions.push(eq(orders.deliveryManId, deliveryManId));
    }

    const rawOrders = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            status: orders.status,
            orderType: orders.orderType,
            totalAmount: orders.totalAmount,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            paymentMethod: orders.paymentMethod,
            paymentMethodName: paymentMethods.name,
            paymentMethodNameAr: paymentMethods.nameAr,
            note: orders.note,
            shippingAddress: orders.shippingAddress,
            deliveryManId: orders.deliveryManId,
            deliveryManName: deliveryMen.name,
            deliveryManPhone: deliveryMen.phone,
            isCashCollected: orders.isCashCollected,
            cashCollectedAt: orders.cashCollectedAt,
            cashCollectedBy: orders.cashCollectedBy,
            customerId: users.id,
            customerName: users.name,
            customerPhone: users.phone,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
        })
        .from(orders)
        .leftJoin(deliveryMen, eq(orders.deliveryManId, deliveryMen.id))
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(paymentMethods, eq(orders.paymentMethod, paymentMethods.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

    const checkIsCash = (name?: string | null, nameAr?: string | null, raw?: string | null) => {
        const n = (name || "").toLowerCase();
        const nar = (nameAr || "");
        const r = (raw || "").toLowerCase();
        return (
            n.includes("cash") ||
            nar.includes("استلام") ||
            nar.includes("كاش") ||
            r.includes("cash") ||
            r.includes("استلام")
        );
    };

    let totalOrders = rawOrders.length;
    let totalDeliveredOrders = 0;
    let totalOutForDeliveryOrders = 0;
    let totalDeliveredAmount = 0;
    let totalDeliveredCash = 0;
    let cashOnHand = 0; // 👈 الفلوس الكاش التي استلمتها الإدارة وتوردت للمطعم (isCashCollected === true)
    let cashWithDeliveryMan = 0; // 👈 الفلوس الكاش التي ما زالت مع المندوب ومطلوب توريدها (isCashCollected === false)
    let digitalCollectedAmount = 0;

    const formattedOrders = rawOrders.map(order => {
        const isCash = checkIsCash(order.paymentMethodName, order.paymentMethodNameAr, order.paymentMethod);
        const amount = parseFloat(order.totalAmount || "0");
        const isCashCollected = Boolean(order.isCashCollected);

        if (order.status === "delivered") {
            totalDeliveredOrders++;
            totalDeliveredAmount += amount;
            if (isCash) {
                totalDeliveredCash += amount;
                if (isCashCollected) {
                    cashOnHand += amount; // 👈 اتسلمت للمطعم خلاص
                } else {
                    cashWithDeliveryMan += amount; // 👈 لسه مع الديلفري
                }
            } else {
                digitalCollectedAmount += amount;
            }
        } else if (order.status === "out_for_delivery") {
            totalOutForDeliveryOrders++;
        }

        return {
            ...order,
            isCash,
            isCashCollected,
            paymentMethodDisplay: {
                id: order.paymentMethod,
                name: order.paymentMethodName || (isCash ? "Cash on Delivery" : order.paymentMethod || "Unknown"),
                nameAr: order.paymentMethodNameAr || (isCash ? "الدفع عند الاستلام" : order.paymentMethod || "غير معروف"),
            },
        };
    });

    // تجميع حسب عمال التوصيل في حال كان الاستعلام للكل
    if (!targetDeliveryMan) {
        const deliveryMenMap = new Map<string, {
            deliveryManId: string;
            deliveryManName: string;
            deliveryManPhone: string | null;
            totalOrders: number;
            deliveredOrdersCount: number;
            outForDeliveryOrdersCount: number;
            totalDeliveredAmount: number;
            totalDeliveredCash: number;
            cashOnHand: number;
            cashWithDeliveryMan: number;
            digitalCollectedAmount: number;
            orders: any[];
        }>();

        for (const order of formattedOrders) {
            const dmId = order.deliveryManId || "unassigned";
            const dmName = order.deliveryManName || "Unassigned";
            const dmPhone = order.deliveryManPhone || null;

            if (!deliveryMenMap.has(dmId)) {
                deliveryMenMap.set(dmId, {
                    deliveryManId: dmId,
                    deliveryManName: dmName,
                    deliveryManPhone: dmPhone,
                    totalOrders: 0,
                    deliveredOrdersCount: 0,
                    outForDeliveryOrdersCount: 0,
                    totalDeliveredAmount: 0,
                    totalDeliveredCash: 0,
                    cashOnHand: 0,
                    cashWithDeliveryMan: 0,
                    digitalCollectedAmount: 0,
                    orders: [],
                });
            }

            const group = deliveryMenMap.get(dmId)!;
            group.totalOrders++;
            group.orders.push(order);

            const amount = parseFloat(order.totalAmount || "0");
            if (order.status === "delivered") {
                group.deliveredOrdersCount++;
                group.totalDeliveredAmount += amount;
                if (order.isCash) {
                    group.totalDeliveredCash += amount;
                    if (order.isCashCollected) {
                        group.cashOnHand += amount;
                    } else {
                        group.cashWithDeliveryMan += amount;
                    }
                } else {
                    group.digitalCollectedAmount += amount;
                }
            } else if (order.status === "out_for_delivery") {
                group.outForDeliveryOrdersCount++;
            }
        }

        const deliveryMenBreakdown = Array.from(deliveryMenMap.values()).map(dm => ({
            ...dm,
            totalDeliveredAmount: dm.totalDeliveredAmount.toFixed(2),
            totalDeliveredCash: dm.totalDeliveredCash.toFixed(2),
            cashOnHand: dm.cashOnHand.toFixed(2),
            cashWithDeliveryMan: dm.cashWithDeliveryMan.toFixed(2),
            digitalCollectedAmount: dm.digitalCollectedAmount.toFixed(2),
        }));

        return SuccessResponse(res, {
            message: "Delivery orders fetched successfully",
            summary: {
                totalOrders,
                totalDeliveredOrders,
                totalOutForDeliveryOrders,
                totalDeliveredAmount: totalDeliveredAmount.toFixed(2),
                totalDeliveredCash: totalDeliveredCash.toFixed(2),
                cashOnHand: cashOnHand.toFixed(2), // 👈 الفلوس الكاش اللي اتسلمت للمطعم خلاص
                cashWithDeliveryMan: cashWithDeliveryMan.toFixed(2), // 👈 الفلوس الكاش اللي لسه مع الديلفري
                digitalCollectedAmount: digitalCollectedAmount.toFixed(2),
            },
            deliveryMen: deliveryMenBreakdown,
            orders: formattedOrders,
        });
    }

    return SuccessResponse(res, {
        message: "Delivery orders for delivery man fetched successfully",
        deliveryMan: targetDeliveryMan,
        summary: {
            totalOrders,
            totalDeliveredOrders,
            totalOutForDeliveryOrders,
            totalDeliveredAmount: totalDeliveredAmount.toFixed(2),
            totalDeliveredCash: totalDeliveredCash.toFixed(2),
            cashOnHand: cashOnHand.toFixed(2), // 👈 الفلوس الكاش اللي اتسلمت للمطعم خلاص
            cashWithDeliveryMan: cashWithDeliveryMan.toFixed(2), // 👈 الفلوس الكاش اللي لسه مع الديلفري
            digitalCollectedAmount: digitalCollectedAmount.toFixed(2),
        },
        orders: formattedOrders,
    });
};

// ==========================================
// استعراض طلبات الكاش للتوريد (GET /collect-cash)
// ==========================================

/**
 * GET /delivery-men/collect-cash
 * query params:
 * - deliveryManId: string (UUID or "all")
 * - isCashCollected: "true" | "false" | "all"
 * - branchId: string (UUID)
 * - startDate: string (ISO)
 * - endDate: string (ISO)
 * 
 * يستعرض جميع الطلبات الكاش المسلمة لمندوب التوصيل
 * مع إمكانية الفلترة بحالة التوريد (تم التوريد / لم يتم التوريد بعد)
 * ويحسب:
 * - cashWithDeliveryMan: المبلغ المتبقي مع المندوب ومطلوب توريده
 * - cashOnHand: المبلغ المحصل والمورد للمطعم بالفعل
 * - totalDeliveredCash: إجمالي الكاش لجميع الطلبات المسلمة
 */
export const getDeliveryCashOrders = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { deliveryManId, isCashCollected, branchId, startDate, endDate } = req.query as {
        deliveryManId?: string;
        isCashCollected?: "true" | "false" | "all";
        branchId?: string;
        startDate?: string;
        endDate?: string;
    };

    const conditions: any[] = [
        eq(orders.restaurantId, restaurantId),
        eq(orders.status, "delivered"), // الكاش يحصل فقط عند تسليم الأوردر
    ];

    if (isCashCollected === "true") {
        conditions.push(eq(orders.isCashCollected, true));
    } else if (isCashCollected === "false") {
        conditions.push(eq(orders.isCashCollected, false));
    }

    if (branchId) {
        conditions.push(eq(orders.branchId, branchId));
    }

    if (startDate) {
        conditions.push(gte(orders.createdAt, new Date(startDate)));
    }
    if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        conditions.push(lte(orders.createdAt, end));
    }

    let targetDeliveryMan: any = null;
    if (deliveryManId && deliveryManId !== "all") {
        const [dm] = await db
            .select({
                id: deliveryMen.id,
                name: deliveryMen.name,
                phone: deliveryMen.phone,
                email: deliveryMen.email,
                image: deliveryMen.image,
                branchId: deliveryMen.branchId,
                isActive: deliveryMen.isActive,
            })
            .from(deliveryMen)
            .where(
                and(
                    eq(deliveryMen.id, deliveryManId),
                    eq(deliveryMen.restaurantId, restaurantId),
                    eq(deliveryMen.isDeleted, false)
                )
            )
            .limit(1);

        if (!dm) {
            throw new NotFound("Delivery man not found or does not belong to your restaurant");
        }
        targetDeliveryMan = dm;
        conditions.push(eq(orders.deliveryManId, deliveryManId));
    }

    const rawOrders = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            status: orders.status,
            orderType: orders.orderType,
            totalAmount: orders.totalAmount,
            subtotal: orders.subtotal,
            deliveryFee: orders.deliveryFee,
            paymentMethod: orders.paymentMethod,
            paymentMethodName: paymentMethods.name,
            paymentMethodNameAr: paymentMethods.nameAr,
            note: orders.note,
            shippingAddress: orders.shippingAddress,
            deliveryManId: orders.deliveryManId,
            deliveryManName: deliveryMen.name,
            deliveryManPhone: deliveryMen.phone,
            isCashCollected: orders.isCashCollected,
            cashCollectedAt: orders.cashCollectedAt,
            cashCollectedBy: orders.cashCollectedBy,
            customerId: users.id,
            customerName: users.name,
            customerPhone: users.phone,
            createdAt: orders.createdAt,
            updatedAt: orders.updatedAt,
        })
        .from(orders)
        .leftJoin(deliveryMen, eq(orders.deliveryManId, deliveryMen.id))
        .leftJoin(users, eq(orders.userId, users.id))
        .leftJoin(paymentMethods, eq(orders.paymentMethod, paymentMethods.id))
        .where(and(...conditions))
        .orderBy(desc(orders.createdAt));

    const checkIsCash = (name?: string | null, nameAr?: string | null, raw?: string | null) => {
        const n = (name || "").toLowerCase();
        const nar = (nameAr || "");
        const r = (raw || "").toLowerCase();
        return (
            n.includes("cash") ||
            nar.includes("استلام") ||
            nar.includes("كاش") ||
            r.includes("cash") ||
            r.includes("استلام")
        );
    };

    // تصفية الطلبات الكاش فقط
    const cashOrders = rawOrders.filter(o =>
        checkIsCash(o.paymentMethodName, o.paymentMethodNameAr, o.paymentMethod)
    );

    let cashWithDeliveryMan = 0; // لسه مع الديلفري
    let cashOnHand = 0; // اتسلمت للمطعم خلاص
    let totalDeliveredCash = 0;
    let pendingCount = 0;
    let collectedCount = 0;

    const formattedOrders = cashOrders.map(order => {
        const amount = parseFloat(order.totalAmount || "0");
        const isCollected = Boolean(order.isCashCollected);

        totalDeliveredCash += amount;
        if (isCollected) {
            cashOnHand += amount;
            collectedCount++;
        } else {
            cashWithDeliveryMan += amount;
            pendingCount++;
        }

        return {
            ...order,
            isCash: true,
            isCashCollected: isCollected,
            collectionStatus: isCollected ? "collected" : "pending_collection",
            paymentMethodDisplay: {
                id: order.paymentMethod,
                name: order.paymentMethodName || "Cash on Delivery",
                nameAr: order.paymentMethodNameAr || "الدفع عند الاستلام",
            },
        };
    });

    const summary = {
        totalCashOrders: formattedOrders.length,
        pendingCollectionOrdersCount: pendingCount,
        collectedOrdersCount: collectedCount,
        cashWithDeliveryMan: cashWithDeliveryMan.toFixed(2), // 👈 الفلوس الكاش اللي لسه مع الديلفري ومطلوب يسلمها
        cashOnHand: cashOnHand.toFixed(2), // 👈 الفلوس الكاش اللي اتسلمت للمطعم بالفعل
        totalDeliveredCash: totalDeliveredCash.toFixed(2), // 👈 إجمالي الكاش لجميع الطلبات المسلمة
    };

    return SuccessResponse(res, {
        message: targetDeliveryMan
            ? `Cash delivery orders for ${targetDeliveryMan.name} fetched successfully`
            : "Cash delivery orders fetched successfully",
        deliveryMan: targetDeliveryMan,
        summary,
        orders: formattedOrders,
    });
};

// ==========================================
// توريد كاش من مندوب التوصيل للإدارة (POST /collect-cash)
// ==========================================

/**
 * POST /delivery-men/collect-cash
 * body: {
 *   deliveryManId: string (UUID),
 *   orderIds: string[] (array of UUIDs),
 *   note?: string
 * }
 * 
 * توريد كاش الطلبات من مندوب التوصيل إلى إدارة المطعم
 * يقوم بالتحقق من:
 * 1. وجود المندوب وانتمائه للمطعم
 * 2. أن جميع الطلبات مسلمة (delivered)
 * 3. أن الدفع كاش
 * 4. أن الطلبات لم يتم تحصيلها مسبقاً
 * ثم يعلمها بأنها تم توريدها (isCashCollected = true)
 * ويحسب المبلغ المحصل في المعاملة والمتبقي مع المندوب
 */
export const collectDeliveryCash = async (req: Request, res: Response) => {
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const adminId = req.user?.id;
    if (!restaurantId) throw new BadRequest("Restaurant ID missing");

    const { deliveryManId, orderIds, note } = req.body as {
        deliveryManId: string;
        orderIds: string[];
        note?: string;
    };

    // 1. التحقق من وجود عامل التوصيل وانتمائه للمطعم
    const [existingDeliveryMan] = await db
        .select({ id: deliveryMen.id, name: deliveryMen.name, phone: deliveryMen.phone })
        .from(deliveryMen)
        .where(
            and(
                eq(deliveryMen.id, deliveryManId),
                eq(deliveryMen.restaurantId, restaurantId),
                eq(deliveryMen.isDeleted, false)
            )
        )
        .limit(1);

    if (!existingDeliveryMan) {
        throw new NotFound("Delivery man not found or does not belong to your restaurant");
    }

    // 2. جلب الطلبات والتحقق منها
    const eligibleOrders = await db
        .select({
            id: orders.id,
            orderNumber: orders.orderNumber,
            dailyOrderNumber: orders.dailyOrderNumber,
            status: orders.status,
            totalAmount: orders.totalAmount,
            paymentMethod: orders.paymentMethod,
            paymentMethodName: paymentMethods.name,
            paymentMethodNameAr: paymentMethods.nameAr,
            deliveryManId: orders.deliveryManId,
            isCashCollected: orders.isCashCollected,
        })
        .from(orders)
        .leftJoin(paymentMethods, eq(orders.paymentMethod, paymentMethods.id))
        .where(
            and(
                inArray(orders.id, orderIds),
                eq(orders.restaurantId, restaurantId)
            )
        );

    if (eligibleOrders.length !== orderIds.length) {
        const foundIds = new Set(eligibleOrders.map(o => o.id));
        const missingIds = orderIds.filter(id => !foundIds.has(id));
        throw new BadRequest(`The following order IDs were not found in your restaurant: ${missingIds.join(", ")}`);
    }

    const checkIsCash = (name?: string | null, nameAr?: string | null, raw?: string | null) => {
        const n = (name || "").toLowerCase();
        const nar = (nameAr || "");
        const r = (raw || "").toLowerCase();
        return (
            n.includes("cash") ||
            nar.includes("استلام") ||
            nar.includes("كاش") ||
            r.includes("cash") ||
            r.includes("استلام")
        );
    };

    // 3. التحقق من الشروط لكل أوردر:
    for (const ord of eligibleOrders) {
        if (ord.deliveryManId !== deliveryManId) {
            throw new BadRequest(`Order #${ord.orderNumber} is not assigned to ${existingDeliveryMan.name}`);
        }
        if (ord.status !== "delivered") {
            throw new BadRequest(`Order #${ord.orderNumber} cannot be collected because its status is '${ord.status}' (must be 'delivered')`);
        }
        const isCash = checkIsCash(ord.paymentMethodName, ord.paymentMethodNameAr, ord.paymentMethod);
        if (!isCash) {
            throw new BadRequest(`Order #${ord.orderNumber} is not a cash order (paid digitally)`);
        }
        if (ord.isCashCollected) {
            throw new BadRequest(`Order #${ord.orderNumber} has already been marked as cash collected`);
        }
    }

    // 4. حساب المبلغ المحصل في هذه المعاملة
    const now = new Date();
    const collectedAmount = eligibleOrders.reduce(
        (sum, o) => sum + parseFloat(o.totalAmount || "0"),
        0
    );

    // 5. تحديث الطلبات بأنها تم توريدها للمطعم
    await db
        .update(orders)
        .set({
            isCashCollected: true,
            cashCollectedAt: now,
            cashCollectedBy: adminId || null,
        })
        .where(
            and(
                inArray(orders.id, orderIds),
                eq(orders.restaurantId, restaurantId)
            )
        );

    // 6. حساب المبلغ المتبقي كاش مع هذا المندوب (الطلبات المسلمة كاش ولم تُورّد بعد)
    const remainingOrders = await db
        .select({
            id: orders.id,
            totalAmount: orders.totalAmount,
            paymentMethod: orders.paymentMethod,
            paymentMethodName: paymentMethods.name,
            paymentMethodNameAr: paymentMethods.nameAr,
        })
        .from(orders)
        .leftJoin(paymentMethods, eq(orders.paymentMethod, paymentMethods.id))
        .where(
            and(
                eq(orders.deliveryManId, deliveryManId),
                eq(orders.restaurantId, restaurantId),
                eq(orders.status, "delivered"),
                eq(orders.isCashCollected, false)
            )
        );

    const remainingCashWithDeliveryMan = remainingOrders
        .filter(o => checkIsCash(o.paymentMethodName, o.paymentMethodNameAr, o.paymentMethod))
        .reduce((sum, o) => sum + parseFloat(o.totalAmount || "0"), 0);

    return SuccessResponse(res, {
        message: `Successfully collected cash for ${eligibleOrders.length} order(s) from ${existingDeliveryMan.name}`,
        data: {
            deliveryMan: {
                id: existingDeliveryMan.id,
                name: existingDeliveryMan.name,
                phone: existingDeliveryMan.phone,
            },
            collectionReceipt: {
                collectedOrdersCount: eligibleOrders.length,
                collectedCashAmount: collectedAmount.toFixed(2),
                collectedAt: now,
                collectedBy: adminId || null,
                note: note || null,
            },
            remainingCashWithDeliveryMan: remainingCashWithDeliveryMan.toFixed(2), // 👈 الكاش المتبقي مع المندوب بعد هذه المعاملة
            collectedOrders: eligibleOrders.map(o => ({
                id: o.id,
                orderNumber: o.orderNumber,
                amount: o.totalAmount,
            })),
        },
    }, 200);
};


