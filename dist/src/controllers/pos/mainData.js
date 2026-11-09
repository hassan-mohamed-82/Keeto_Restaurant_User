"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categories_list = categories_list;
exports.sub_categories_list = sub_categories_list;
exports.products = products;
const connection_1 = require("../../models/connection");
const schema_1 = require("../../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const response_1 = require("../../utils/response");
const BadRequest_1 = require("../../Errors/BadRequest");
const Errors_1 = require("../../Errors");
const pricing_helper_1 = require("../../helpers/pricing.helper");
async function categories_list(req, res) {
    const { language } = req.body;
    if (!language) {
        throw new BadRequest_1.BadRequest("language is required");
    }
    if (language != "En" && language != "Ar" && language != "Fr") {
        throw new BadRequest_1.BadRequest("language is not valid");
    }
    const categories_items = await connection_1.db
        .select({
        id: schema_1.categories.id,
        name: language === "En" ? schema_1.categories.name : language === "Ar" ? schema_1.categories.nameAr : schema_1.categories.nameFr,
        Image: schema_1.categories.Image,
    })
        .from(schema_1.categories)
        .where((0, drizzle_orm_1.eq)(schema_1.categories.status, "active"))
        .orderBy((0, drizzle_orm_1.sql) `CASE 
            WHEN ${schema_1.categories.priority} = 'high' THEN 1
            WHEN ${schema_1.categories.priority} = 'medium' THEN 2
            WHEN ${schema_1.categories.priority} = 'low' THEN 3
            ELSE 4 
        END`);
    return (0, response_1.SuccessResponse)(res, { message: "Get all categories success", data: categories_items });
}
async function sub_categories_list(req, res) {
    const { language } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.UnauthorizedError("Unauthorized");
    }
    if (!language) {
        throw new BadRequest_1.BadRequest("language is required");
    }
    if (language != "En" && language != "Ar" && language != "Fr") {
        throw new BadRequest_1.BadRequest("language is not valid");
    }
    const subcategories_items = await connection_1.db
        .select({
        id: schema_1.subcategories.id,
        name: language === "En" ? schema_1.subcategories.name : language === "Ar" ? schema_1.subcategories.nameAr : schema_1.subcategories.nameFr,
        image: schema_1.subcategories.image,
        categoryId: schema_1.subcategories.categoryId,
    })
        .from(schema_1.subcategories)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.subcategories.status, "active"), (0, drizzle_orm_1.eq)(schema_1.subcategories.restaurantId, restaurantId)))
        .orderBy((0, drizzle_orm_1.sql) `CASE 
            WHEN ${schema_1.subcategories.priority} = 'high' THEN 1
            WHEN ${schema_1.subcategories.priority} = 'medium' THEN 2
            WHEN ${schema_1.subcategories.priority} = 'low' THEN 3
            ELSE 4 
        END`);
    return (0, response_1.SuccessResponse)(res, { message: "Get all sub categories success", data: subcategories_items });
}
async function products(req, res) {
    const { language, categoryId, subcategoryId, serviceModule } = req.body;
    const restaurantId = req.user?.restaurantId || req.user?.id;
    const branchId = req.user?.branchId || req.user?.id;
    if (!restaurantId) {
        throw new Errors_1.UnauthorizedError("Unauthorized");
    }
    if (!branchId) {
        throw new BadRequest_1.BadRequest("branchId is required");
    }
    // 1. التحقق من صحة المدخلات
    if (!language) {
        throw new BadRequest_1.BadRequest("language is required");
    }
    if (!serviceModule) {
        throw new BadRequest_1.BadRequest("serviceModule is required");
    }
    if (!["En", "Ar", "Fr"].includes(language)) {
        throw new BadRequest_1.BadRequest("language is not valid");
    }
    if (!categoryId && !subcategoryId) {
        throw new BadRequest_1.BadRequest("categoryId or subcategoryId is required");
    }
    // 2. بناء شروط الاستعلام بشكل ديناميكي لتجنب التكرار
    const queryConditions = [
        (0, drizzle_orm_1.eq)(schema_1.food.status, "active"),
        (0, drizzle_orm_1.eq)(schema_1.food.restaurantid, restaurantId),
        (0, drizzle_orm_1.eq)(schema_1.food.isOutOfStock, false),
    ];
    if (subcategoryId) {
        queryConditions.push((0, drizzle_orm_1.eq)(schema_1.food.subcategoryid, subcategoryId));
    }
    else {
        queryConditions.push((0, drizzle_orm_1.eq)(schema_1.food.categoryid, categoryId));
    }
    // 3. جلب المنتجات
    const productsList = await connection_1.db
        .select()
        .from(schema_1.food)
        .where((0, drizzle_orm_1.and)(...queryConditions));
    // 4. معالجة المنتجات باستخدام Promise.all لضمان انتظار جميع العمليات
    const products_items = await Promise.all(productsList.map((product) => 
    // تمرير المعاملات بالترتيب الصحيح المطابق لدالة product_form
    (0, pricing_helper_1.product_form)(product, branchId, serviceModule, language)));
    return (0, response_1.SuccessResponse)(res, { message: "Get all products success", data: products_items });
}
