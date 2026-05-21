# 📋 ملخص نظام الصلاحيات (Permissions System Summary)

## ✅ ما تم إنجازه

### 1. **إنشاء Middleware للصلاحيات**
📁 `src/middlewares/hasPermission.ts`

يحتوي على:
- ✅ `hasPermission(module, action, checkBranch)` - للتحقق من صلاحية واحدة
- ✅ `hasAnyPermission(permissions, checkBranch)` - للتحقق من أي صلاحية (OR)
- ✅ `hasAllPermissions(permissions, checkBranch)` - للتحقق من كل الصلاحيات (AND)
- ✅ `checkUserPermission(userId, module, action)` - helper function

---

### 2. **تطبيق الصلاحيات على Routes**

#### ✅ Foods Routes (`src/routes/admin/food.ts`)
- `GET /select` → `read` permission
- `POST /` → `create` permission
- `GET /` → `read` permission
- `GET /:id` → `read` permission
- `PUT /:id` → `update` permission
- `DELETE /:id` → `delete` permission
- `POST /assign-ingredients/:id` → `update` permission
- `GET /recipe/:id` → `read` permission
- `PUT /variation/:id/status` → `update` permission
- `PUT /option/:id/status` → `update` permission
- `PUT /status/:id` → `update` permission

#### ✅ Orders Routes (`src/routes/admin/order.ts`)
- `GET /reasons` → `read` permission
- `GET /` → `read` permission + **branch check**
- `GET /pending` → `read` permission + **branch check**
- `GET /accepted` → `read` permission + **branch check**
- `GET /preparing` → `read` permission + **branch check**
- `GET /out-for-delivery` → `read` permission + **branch check**
- `GET /delivered` → `read` permission + **branch check**
- `GET /cancelled` → `read` permission + **branch check**
- `GET /rejected` → `read` permission + **branch check**
- `GET /refund` → `read` permission + **branch check**
- `GET /:id` → `read` permission + **branch check**
- `PUT /:orderId` → `update` permission + **branch check**

#### ✅ Ingredients Routes (`src/routes/admin/ingredients.ts`)
- `GET /select` → `read` permission (foods module)
- `POST /` → `create` permission (foods module)
- `GET /` → `read` permission (foods module)
- `GET /:id` → `read` permission (foods module)
- `GET /foods/:id` → `read` permission (foods module)
- `PUT /:id` → `update` permission (foods module)
- `PUT /stock/:id` → `update` permission (foods module)
- `DELETE /:id` → `delete` permission (foods module)

#### ✅ Branches Routes (`src/routes/admin/branches.ts`)
- `GET /zone` → `read` permission (restaurants module)
- `POST /` → `create` permission (restaurants module)
- `GET /` → `read` permission (restaurants module)
- `GET /:id` → `read` permission (restaurants module)
- `PUT /:id` → `update` permission (restaurants module)
- `DELETE /:id` → `delete` permission (restaurants module)
- `PUT /:id/status` → `update` permission (restaurants module)

#### ✅ Admin/Staff Routes (`src/routes/admin/admin.ts`)
- `POST /` → `create` permission (admins module)
- `GET /` → `read` permission (admins module)
- `PUT /fcm-token` → **no permission required** (self-update)
- `PUT /:id` → `update` permission (admins module)
- `DELETE /:id` → `delete` permission (admins module)

---

### 3. **Documentation**

#### ✅ `PERMISSIONS_GUIDE.md`
- شرح كامل للنظام
- أمثلة على الاستخدام
- سيناريوهات عملية
- Troubleshooting

#### ✅ `PERMISSIONS_TESTING.md`
- دليل اختبار شامل
- سيناريوهات اختبار لكل user type
- جدول النتائج المتوقعة
- أمثلة على Postman requests

#### ✅ `PERMISSIONS_SUMMARY.md` (هذا الملف)
- ملخص شامل لكل ما تم إنجازه

---

## 🎯 كيفية عمل النظام

### 1. **Owner (المالك)**
```typescript
if (userType === "owner") {
    return next(); // ✅ له صلاحية كل شيء
}
```

### 2. **Branch Manager (مدير الفرع)**
```typescript
if (userType === "branch_manager") {
    // ✅ له صلاحية كل شيء في فرعه
    if (checkBranch) {
        // التحقق من الفرع
        if (requestedBranchId !== userBranchId) {
            throw new ForbiddenError("You can only access resources in your branch");
        }
    }
    return next();
}
```

### 3. **Subadmin/Staff**
```typescript
if (userType === "subadmin" || userType === "staff") {
    // 1. جلب بيانات الـ admin
    const admin = await db.select().from(restrauntadmin).where(eq(restrauntadmin.id, userId));
    
    // 2. جمع الصلاحيات من الـ role
    if (admin.roleId) {
        const role = await db.select().from(rolesadmin).where(eq(rolesadmin.id, admin.roleId));
        allPermissions = [...role.permissions];
    }
    
    // 3. إضافة الصلاحيات المخصصة
    if (admin.permissions) {
        allPermissions = [...allPermissions, ...admin.permissions];
    }
    
    // 4. التحقق من الصلاحية المطلوبة
    const hasPermission = allPermissions.some(p => 
        p.module === module && p.actions.some(a => a.action === action)
    );
    
    if (!hasPermission) {
        throw new ForbiddenError("You don't have permission");
    }
    
    return next();
}
```

---

## 📊 Modules & Actions

### Modules المتاحة:
1. `users` - إدارة المستخدمين
2. `admins` - إدارة الموظفين
3. `restaurants` - إدارة المطاعم والفروع
4. `orders` - إدارة الطلبات
5. `favorites` - إدارة المفضلة
6. `foods` - إدارة الأطعمة والمكونات

### Actions المتاحة:
1. `create` - إنشاء
2. `read` - قراءة/عرض
3. `update` - تعديل
4. `delete` - حذف

---

## 🔄 Flow Chart

```
Request → authenticated middleware
    ↓
Check user type
    ↓
┌─────────────────────────────────────┐
│ Owner?                              │
│ → Yes: Allow ✅                     │
│ → No: Continue                      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Branch Manager?                     │
│ → Yes: Check branch → Allow ✅      │
│ → No: Continue                      │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│ Subadmin/Staff?                     │
│ → Get roleId                        │
│ → Get role permissions              │
│ → Get custom permissions            │
│ → Merge all permissions             │
│ → Check required permission         │
│   → Has permission: Allow ✅        │
│   → No permission: Deny ❌          │
└─────────────────────────────────────┘
```

---

## 🚀 الخطوات القادمة

### Routes التي تحتاج إضافة Permissions:

1. ✅ **Foods** - تم ✅
2. ✅ **Orders** - تم ✅
3. ✅ **Ingredients** - تم ✅
4. ✅ **Branches** - تم ✅
5. ✅ **Admin/Staff** - تم ✅
6. ⏳ **Subcategories** - محتاج
7. ⏳ **Addons** - محتاج
8. ⏳ **Roles** - محتاج
9. ⏳ **Settings** - محتاج
10. ⏳ **Wallets** - محتاج
11. ⏳ **Reports** - محتاج
12. ⏳ **Notifications** - محتاج
13. ⏳ **Ratings** - محتاج
14. ⏳ **Discounts** - محتاج
15. ⏳ **Coupons** - محتاج
16. ⏳ **Policies** - محتاج
17. ⏳ **Popups** - محتاج

---

## 📝 أمثلة سريعة

### مثال 1: إضافة permission لـ route جديد

```typescript
import { hasPermission } from "../../middlewares/hasPermission";

router.post(
    "/new-endpoint",
    hasPermission("foods", "create"),
    catchAsync(newController)
);
```

### مثال 2: إضافة permission مع branch check

```typescript
router.get(
    "/orders",
    hasPermission("orders", "read", true), // true = check branch
    catchAsync(getOrders)
);
```

### مثال 3: استخدام في controller

```typescript
import { checkUserPermission } from "../../middlewares/hasPermission";

export const someController = async (req: Request, res: Response) => {
    const canDelete = await checkUserPermission(req.user.id, "foods", "delete");
    
    if (!canDelete) {
        throw new ForbiddenError("Cannot delete");
    }
    
    // ... continue
};
```

---

## 🎓 Best Practices

1. **دايماً استخدم الـ middleware في الـ routes**
   - ✅ `router.get("/", hasPermission("foods", "read"), controller)`
   - ❌ لا تتحقق من الصلاحيات في الـ controller

2. **استخدم branch check للـ resources المرتبطة بالفروع**
   - Orders ✅
   - Staff ✅
   - Branch-specific data ✅

3. **استخدم الـ module المناسب**
   - Foods & Ingredients → `foods` module
   - Branches & Settings → `restaurants` module
   - Staff management → `admins` module

4. **اختبر كل الـ user types**
   - Owner ✅
   - Branch Manager ✅
   - Staff with different roles ✅

---

## 🐛 Common Issues

### Issue 1: "You don't have permission"
**السبب:** الـ staff مش عنده الصلاحية المطلوبة
**الحل:** أضف الصلاحية للـ role أو للـ staff مباشرة

### Issue 2: "You can only access resources in your branch"
**السبب:** الـ branch manager بيحاول يوصل لفرع تاني
**الحل:** تأكد من الـ branchId في الـ request

### Issue 3: Owner مش قادر يوصل
**السبب:** الـ type في الـ token مش "owner"
**الحل:** تأكد من الـ login response

---

## 📞 للدعم

لو عندك أي استفسار أو محتاج مساعدة في تطبيق الـ permissions على routes تانية، تواصل مع فريق التطوير.

---

## 🎉 النظام جاهز للاستخدام!

النظام دلوقتي شغال بالكامل على:
- ✅ Foods Management
- ✅ Orders Management
- ✅ Ingredients Management
- ✅ Branches Management
- ✅ Staff Management

يمكنك البدء في الاختبار باستخدام `PERMISSIONS_TESTING.md`! 🚀
