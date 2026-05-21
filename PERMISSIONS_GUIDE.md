# 🔐 دليل نظام الصلاحيات (Permissions System Guide)

## 📋 نظرة عامة

نظام الصلاحيات يسمح بالتحكم الدقيق في من يمكنه الوصول لأي resource في المطعم.

---

## 👥 أنواع المستخدمين (User Types)

### 1. **Owner (المالك)**
- له صلاحية الوصول لكل شيء في المطعم
- لا يحتاج لـ roleId أو permissions
- يمكنه الوصول لكل الفروع

### 2. **Branch Manager (مدير الفرع)**
- له صلاحية الوصول لكل شيء في فرعه فقط
- لا يحتاج لـ roleId أو permissions
- مرتبط بـ `branchId` محدد

### 3. **Subadmin (مدير فرعي)**
- يحتاج لـ `roleId` أو `permissions` مخصصة
- يمكنه الوصول لكل الفروع (حسب الصلاحيات)
- `branchId` = `null`

### 4. **Staff (موظف)**
- يحتاج لـ `roleId` أو `permissions` مخصصة
- مرتبط بـ `branchId` محدد (عادةً)
- صلاحيات محدودة

---

## 🔑 الصلاحيات (Permissions)

### Modules المتاحة:
- `users` - إدارة المستخدمين
- `admins` - إدارة الموظفين
- `restaurants` - إدارة المطاعم
- `orders` - إدارة الطلبات
- `favorites` - إدارة المفضلة
- `foods` - إدارة الأطعمة

### Actions المتاحة:
- `create` - إنشاء
- `read` - قراءة/عرض
- `update` - تعديل
- `delete` - حذف

---

## 🛠️ استخدام الـ Middleware

### 1. **hasPermission** - صلاحية واحدة

```typescript
import { hasPermission } from '../middlewares/hasPermission';

// مثال: السماح بإنشاء طعام جديد
router.post(
    "/foods",
    authenticated,
    hasPermission("foods", "create"),
    catchAsync(createFood)
);

// مثال: السماح بتعديل طلب (مع التحقق من الفرع)
router.put(
    "/orders/:id",
    authenticated,
    hasPermission("orders", "update", true), // true = check branch
    catchAsync(updateOrder)
);
```

### 2. **hasAnyPermission** - أي صلاحية من المجموعة (OR)

```typescript
import { hasAnyPermission } from '../middlewares/hasPermission';

// مثال: السماح بعرض الطلبات أو الأطعمة
router.get(
    "/dashboard",
    authenticated,
    hasAnyPermission([
        { module: "orders", action: "read" },
        { module: "foods", action: "read" }
    ]),
    catchAsync(getDashboard)
);
```

### 3. **hasAllPermissions** - كل الصلاحيات مطلوبة (AND)

```typescript
import { hasAllPermissions } from '../middlewares/hasPermission';

// مثال: يحتاج صلاحية قراءة وتعديل الطلبات
router.post(
    "/orders/bulk-update",
    authenticated,
    hasAllPermissions([
        { module: "orders", action: "read" },
        { module: "orders", action: "update" }
    ]),
    catchAsync(bulkUpdateOrders)
);
```

---

## 📝 أمثلة عملية

### مثال 1: إدارة الأطعمة (Foods Management)

```typescript
import { Router } from "express";
import { authenticated } from "../middlewares/authenticated";
import { hasPermission } from "../middlewares/hasPermission";
import { catchAsync } from "../utils/catchAsync";
import {
    createFood,
    getAllFoods,
    getFoodById,
    updateFood,
    deleteFood
} from "../controllers/admin/food";

const router = Router();

// كل الـ routes تحتاج authentication
router.use(authenticated);

// إنشاء طعام جديد - يحتاج صلاحية create
router.post(
    "/",
    hasPermission("foods", "create"),
    catchAsync(createFood)
);

// عرض كل الأطعمة - يحتاج صلاحية read
router.get(
    "/",
    hasPermission("foods", "read"),
    catchAsync(getAllFoods)
);

// عرض طعام محدد - يحتاج صلاحية read
router.get(
    "/:id",
    hasPermission("foods", "read"),
    catchAsync(getFoodById)
);

// تعديل طعام - يحتاج صلاحية update
router.put(
    "/:id",
    hasPermission("foods", "update"),
    catchAsync(updateFood)
);

// حذف طعام - يحتاج صلاحية delete
router.delete(
    "/:id",
    hasPermission("foods", "delete"),
    catchAsync(deleteFood)
);

export default router;
```

---

### مثال 2: إدارة الطلبات مع التحقق من الفرع

```typescript
import { Router } from "express";
import { authenticated } from "../middlewares/authenticated";
import { hasPermission } from "../middlewares/hasPermission";
import { catchAsync } from "../utils/catchAsync";
import {
    getOrders,
    getOrderById,
    updateOrderStatus,
    cancelOrder
} from "../controllers/admin/order";

const router = Router();

router.use(authenticated);

// عرض الطلبات - مع التحقق من الفرع
router.get(
    "/",
    hasPermission("orders", "read", true), // true = check branch
    catchAsync(getOrders)
);

// عرض طلب محدد - مع التحقق من الفرع
router.get(
    "/:id",
    hasPermission("orders", "read", true),
    catchAsync(getOrderById)
);

// تعديل حالة الطلب - مع التحقق من الفرع
router.put(
    "/:id/status",
    hasPermission("orders", "update", true),
    catchAsync(updateOrderStatus)
);

// إلغاء الطلب - مع التحقق من الفرع
router.delete(
    "/:id",
    hasPermission("orders", "delete", true),
    catchAsync(cancelOrder)
);

export default router;
```

---

### مثال 3: استخدام في Controller مباشرة

```typescript
import { checkUserPermission } from '../middlewares/hasPermission';

export const someController = async (req: Request, res: Response) => {
    const userId = req.user?.id;
    
    if (!userId) {
        throw new UnauthorizedError("Not authenticated");
    }
    
    // التحقق من الصلاحية يدوياً
    const canCreateFood = await checkUserPermission(userId, "foods", "create");
    
    if (!canCreateFood) {
        throw new ForbiddenError("You don't have permission to create foods");
    }
    
    // ... باقي الكود
};
```

---

## 🔄 كيفية إنشاء Role جديد

### API Endpoint:
```
POST /api/admin/roles
```

### Request Body:
```json
{
  "name": "Kitchen Manager",
  "permissions": [
    {
      "module": "foods",
      "actions": [
        { "action": "create" },
        { "action": "read" },
        { "action": "update" }
      ]
    },
    {
      "module": "orders",
      "actions": [
        { "action": "read" },
        { "action": "update" }
      ]
    }
  ]
}
```

---

## 🔄 كيفية تعيين Role لموظف

### API Endpoint:
```
PUT /api/admin/staff/:id
```

### Request Body:
```json
{
  "roleId": "role-uuid-here",
  "type": "staff",
  "branchId": "branch-uuid-here"
}
```

---

## 🔄 كيفية إضافة صلاحيات مخصصة لموظف

```json
{
  "permissions": [
    {
      "module": "foods",
      "actions": [
        { "action": "delete" }
      ]
    }
  ]
}
```

**ملاحظة:** الصلاحيات المخصصة تُضاف للصلاحيات الموجودة في الـ Role.

---

## 📊 جدول الصلاحيات حسب النوع

| User Type | Access Level | Needs roleId? | Needs branchId? | Check Permissions? |
|-----------|--------------|---------------|-----------------|-------------------|
| Owner | كل شيء في المطعم | ❌ | ❌ | ❌ |
| Branch Manager | كل شيء في فرعه | ❌ | ✅ | ❌ |
| Subadmin | حسب الصلاحيات | ✅ | ❌ | ✅ |
| Staff | حسب الصلاحيات | ✅ | ✅ (عادةً) | ✅ |

---

## 🎯 أمثلة على السيناريوهات

### السيناريو 1: Kitchen Manager

**الوصف:** موظف مسؤول عن المطبخ، يمكنه إدارة الأطعمة فقط.

**الإعدادات:**
```json
{
  "type": "staff",
  "branchId": "branch-123",
  "roleId": "kitchen-manager-role",
  "permissions": [
    {
      "module": "foods",
      "actions": [
        { "action": "create" },
        { "action": "read" },
        { "action": "update" },
        { "action": "delete" }
      ]
    }
  ]
}
```

**النتيجة:**
- ✅ يمكنه إدارة الأطعمة في فرعه
- ❌ لا يمكنه الوصول للطلبات
- ❌ لا يمكنه الوصول لفروع أخرى

---

### السيناريو 2: Order Manager

**الوصف:** موظف مسؤول عن الطلبات، يمكنه عرض وتعديل الطلبات فقط.

**الإعدادات:**
```json
{
  "type": "staff",
  "branchId": "branch-123",
  "roleId": "order-manager-role",
  "permissions": [
    {
      "module": "orders",
      "actions": [
        { "action": "read" },
        { "action": "update" }
      ]
    }
  ]
}
```

**النتيجة:**
- ✅ يمكنه عرض الطلبات في فرعه
- ✅ يمكنه تعديل حالة الطلبات
- ❌ لا يمكنه حذف الطلبات
- ❌ لا يمكنه إدارة الأطعمة

---

### السيناريو 3: General Manager (Subadmin)

**الوصف:** مدير عام يمكنه الوصول لكل الفروع.

**الإعدادات:**
```json
{
  "type": "subadmin",
  "branchId": null,
  "roleId": "general-manager-role",
  "permissions": [
    {
      "module": "foods",
      "actions": [
        { "action": "create" },
        { "action": "read" },
        { "action": "update" },
        { "action": "delete" }
      ]
    },
    {
      "module": "orders",
      "actions": [
        { "action": "read" },
        { "action": "update" }
      ]
    }
  ]
}
```

**النتيجة:**
- ✅ يمكنه إدارة الأطعمة في كل الفروع
- ✅ يمكنه عرض وتعديل الطلبات في كل الفروع
- ❌ لا يمكنه حذف الطلبات

---

## 🐛 Troubleshooting

### المشكلة: "You don't have permission to..."
**الحل:** تأكد من:
1. الموظف له `roleId` صحيح
2. الـ Role فيه الصلاحيات المطلوبة
3. الموظف مرتبط بالفرع الصحيح (لو مطلوب)

### المشكلة: Branch Manager لا يمكنه الوصول
**الحل:** تأكد من:
1. `type` = `"branch_manager"`
2. `branchId` موجود ومطابق للفرع المطلوب

### المشكلة: Owner لا يمكنه الوصول
**الحل:** تأكد من:
1. `type` = `"owner"`
2. الـ token صحيح ويحتوي على `type: "owner"`

---

## 📞 للدعم

لو عندك أي استفسار، تواصل مع فريق التطوير.
