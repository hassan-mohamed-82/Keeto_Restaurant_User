# 🧪 دليل اختبار نظام الصلاحيات (Permissions Testing Guide)

## 📋 نظرة عامة

هذا الدليل يشرح كيفية اختبار نظام الصلاحيات بالكامل.

---

## 🔧 الإعداد الأولي

### 1. إنشاء Roles

#### أ. Kitchen Manager Role
```bash
POST /api/admin/roles
Authorization: Bearer {owner_token}
Content-Type: application/json

{
  "name": "Kitchen Manager",
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
  ],
  "status": "active"
}
```

#### ب. Order Manager Role
```bash
POST /api/admin/roles
Authorization: Bearer {owner_token}
Content-Type: application/json

{
  "name": "Order Manager",
  "permissions": [
    {
      "module": "orders",
      "actions": [
        { "action": "read" },
        { "action": "update" }
      ]
    }
  ],
  "status": "active"
}
```

#### ج. Cashier Role
```bash
POST /api/admin/roles
Authorization: Bearer {owner_token}
Content-Type: application/json

{
  "name": "Cashier",
  "permissions": [
    {
      "module": "orders",
      "actions": [
        { "action": "read" }
      ]
    }
  ],
  "status": "active"
}
```

---

### 2. إنشاء Staff Members

#### أ. Kitchen Manager
```bash
POST /api/admin/restaurantadmin
Authorization: Bearer {owner_token}
Content-Type: application/json

{
  "name": "Ahmed Kitchen",
  "email": "ahmed.kitchen@restaurant.com",
  "password": "password123",
  "phoneNumber": "+201234567890",
  "type": "staff",
  "roleId": "{kitchen_manager_role_id}",
  "branchId": "{branch_id}",
  "status": "active"
}
```

#### ب. Order Manager
```bash
POST /api/admin/restaurantadmin
Authorization: Bearer {owner_token}
Content-Type: application/json

{
  "name": "Sara Orders",
  "email": "sara.orders@restaurant.com",
  "password": "password123",
  "phoneNumber": "+201234567891",
  "type": "staff",
  "roleId": "{order_manager_role_id}",
  "branchId": "{branch_id}",
  "status": "active"
}
```

#### ج. Branch Manager
```bash
POST /api/admin/restaurantadmin
Authorization: Bearer {owner_token}
Content-Type: application/json

{
  "name": "Mohamed Manager",
  "email": "mohamed.manager@restaurant.com",
  "password": "password123",
  "phoneNumber": "+201234567892",
  "type": "branch_manager",
  "branchId": "{branch_id}",
  "status": "active"
}
```

---

## 🧪 سيناريوهات الاختبار

### Test 1: Owner Access (كل شيء مسموح)

```bash
# Login as Owner
POST /api/admin/auth/login
Content-Type: application/json

{
  "email": "owner@restaurant.com",
  "password": "password123"
}

# Response: { token: "owner_token" }

# Test: Create Food (يجب أن ينجح ✅)
POST /api/admin/food
Authorization: Bearer {owner_token}
Content-Type: application/json

{
  "name": "Pizza Margherita",
  "description": "Classic pizza",
  "price": 50,
  "categoryid": "{category_id}"
}

# Expected: 201 Created ✅

# Test: View Orders (يجب أن ينجح ✅)
GET /api/admin/order
Authorization: Bearer {owner_token}

# Expected: 200 OK ✅

# Test: Delete Branch (يجب أن ينجح ✅)
DELETE /api/admin/branches/{branch_id}
Authorization: Bearer {owner_token}

# Expected: 200 OK ✅
```

---

### Test 2: Branch Manager Access (كل شيء في فرعه)

```bash
# Login as Branch Manager
POST /api/admin/auth/login
Content-Type: application/json

{
  "email": "mohamed.manager@restaurant.com",
  "password": "password123"
}

# Response: { token: "branch_manager_token" }

# Test: Create Food (يجب أن ينجح ✅)
POST /api/admin/food
Authorization: Bearer {branch_manager_token}
Content-Type: application/json

{
  "name": "Burger",
  "description": "Delicious burger",
  "price": 40,
  "categoryid": "{category_id}"
}

# Expected: 201 Created ✅

# Test: View Orders in his branch (يجب أن ينجح ✅)
GET /api/admin/order
Authorization: Bearer {branch_manager_token}

# Expected: 200 OK (orders from his branch only) ✅

# Test: View Orders in another branch (يجب أن يفشل ❌)
GET /api/admin/order?branchId={another_branch_id}
Authorization: Bearer {branch_manager_token}

# Expected: 403 Forbidden ❌
# Response: { "message": "You can only access resources in your branch" }
```

---

### Test 3: Kitchen Manager Access (foods فقط)

```bash
# Login as Kitchen Manager
POST /api/admin/auth/login
Content-Type: application/json

{
  "email": "ahmed.kitchen@restaurant.com",
  "password": "password123"
}

# Response: { token: "kitchen_manager_token" }

# Test: Create Food (يجب أن ينجح ✅)
POST /api/admin/food
Authorization: Bearer {kitchen_manager_token}
Content-Type: application/json

{
  "name": "Pasta",
  "description": "Italian pasta",
  "price": 35,
  "categoryid": "{category_id}"
}

# Expected: 201 Created ✅

# Test: Update Food (يجب أن ينجح ✅)
PUT /api/admin/food/{food_id}
Authorization: Bearer {kitchen_manager_token}
Content-Type: application/json

{
  "name": "Pasta Carbonara",
  "price": 40
}

# Expected: 200 OK ✅

# Test: Delete Food (يجب أن ينجح ✅)
DELETE /api/admin/food/{food_id}
Authorization: Bearer {kitchen_manager_token}

# Expected: 200 OK ✅

# Test: View Orders (يجب أن يفشل ❌)
GET /api/admin/order
Authorization: Bearer {kitchen_manager_token}

# Expected: 403 Forbidden ❌
# Response: { "message": "You don't have permission to read orders" }

# Test: Create Staff (يجب أن يفشل ❌)
POST /api/admin/restaurantadmin
Authorization: Bearer {kitchen_manager_token}
Content-Type: application/json

{
  "name": "New Staff",
  "email": "new@restaurant.com",
  "password": "password123"
}

# Expected: 403 Forbidden ❌
# Response: { "message": "You don't have permission to create admins" }
```

---

### Test 4: Order Manager Access (orders read + update فقط)

```bash
# Login as Order Manager
POST /api/admin/auth/login
Content-Type: application/json

{
  "email": "sara.orders@restaurant.com",
  "password": "password123"
}

# Response: { token: "order_manager_token" }

# Test: View Orders (يجب أن ينجح ✅)
GET /api/admin/order
Authorization: Bearer {order_manager_token}

# Expected: 200 OK ✅

# Test: View Pending Orders (يجب أن ينجح ✅)
GET /api/admin/order/pending
Authorization: Bearer {order_manager_token}

# Expected: 200 OK ✅

# Test: Update Order Status (يجب أن ينجح ✅)
PUT /api/admin/order/{order_id}
Authorization: Bearer {order_manager_token}
Content-Type: application/json

{
  "status": "accepted"
}

# Expected: 200 OK ✅

# Test: Create Food (يجب أن يفشل ❌)
POST /api/admin/food
Authorization: Bearer {order_manager_token}
Content-Type: application/json

{
  "name": "Pizza",
  "price": 50
}

# Expected: 403 Forbidden ❌
# Response: { "message": "You don't have permission to create foods" }

# Test: Delete Order (يجب أن يفشل ❌ - ليس له صلاحية delete)
DELETE /api/admin/order/{order_id}
Authorization: Bearer {order_manager_token}

# Expected: 403 Forbidden ❌
# Response: { "message": "You don't have permission to delete orders" }
```

---

### Test 5: Cashier Access (orders read فقط)

```bash
# Login as Cashier
POST /api/admin/auth/login
Content-Type: application/json

{
  "email": "cashier@restaurant.com",
  "password": "password123"
}

# Response: { token: "cashier_token" }

# Test: View Orders (يجب أن ينجح ✅)
GET /api/admin/order
Authorization: Bearer {cashier_token}

# Expected: 200 OK ✅

# Test: View Order Details (يجب أن ينجح ✅)
GET /api/admin/order/{order_id}
Authorization: Bearer {cashier_token}

# Expected: 200 OK ✅

# Test: Update Order Status (يجب أن يفشل ❌)
PUT /api/admin/order/{order_id}
Authorization: Bearer {cashier_token}
Content-Type: application/json

{
  "status": "accepted"
}

# Expected: 403 Forbidden ❌
# Response: { "message": "You don't have permission to update orders" }

# Test: View Foods (يجب أن يفشل ❌)
GET /api/admin/food
Authorization: Bearer {cashier_token}

# Expected: 403 Forbidden ❌
# Response: { "message": "You don't have permission to read foods" }
```

---

## 📊 جدول النتائج المتوقعة

| Action | Owner | Branch Manager | Kitchen Manager | Order Manager | Cashier |
|--------|-------|----------------|-----------------|---------------|---------|
| Create Food | ✅ | ✅ | ✅ | ❌ | ❌ |
| Read Food | ✅ | ✅ | ✅ | ❌ | ❌ |
| Update Food | ✅ | ✅ | ✅ | ❌ | ❌ |
| Delete Food | ✅ | ✅ | ✅ | ❌ | ❌ |
| Read Orders | ✅ | ✅ (branch) | ❌ | ✅ (branch) | ✅ (branch) |
| Update Orders | ✅ | ✅ (branch) | ❌ | ✅ (branch) | ❌ |
| Delete Orders | ✅ | ✅ (branch) | ❌ | ❌ | ❌ |
| Create Staff | ✅ | ✅ | ❌ | ❌ | ❌ |
| Read Staff | ✅ | ✅ | ❌ | ❌ | ❌ |
| Update Staff | ✅ | ✅ | ❌ | ❌ | ❌ |
| Delete Staff | ✅ | ✅ | ❌ | ❌ | ❌ |
| Create Branch | ✅ | ❌ | ❌ | ❌ | ❌ |
| Update Branch | ✅ | ❌ | ❌ | ❌ | ❌ |
| Delete Branch | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## 🔍 كيفية التحقق من الصلاحيات

### في Postman:

1. **إنشاء Environment Variables:**
   - `owner_token`
   - `branch_manager_token`
   - `kitchen_manager_token`
   - `order_manager_token`
   - `cashier_token`

2. **إنشاء Collection:**
   - مجلد لكل user type
   - كل request فيه الـ token المناسب

3. **Run Collection:**
   - شغل الـ collection كاملة
   - شوف النتائج

### في Code:

```typescript
// Test helper function
async function testPermission(
    token: string,
    method: string,
    url: string,
    expectedStatus: number
) {
    const response = await fetch(url, {
        method,
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    
    console.log(`${method} ${url}: ${response.status === expectedStatus ? '✅' : '❌'}`);
    return response.status === expectedStatus;
}

// Run tests
await testPermission(kitchenToken, 'GET', '/api/admin/food', 200); // ✅
await testPermission(kitchenToken, 'GET', '/api/admin/order', 403); // ✅
```

---

## 🐛 Troubleshooting

### المشكلة: كل الـ requests بترجع 401
**الحل:** تأكد من:
- الـ token صحيح
- الـ token مش expired
- الـ Authorization header موجود

### المشكلة: Branch Manager يقدر يشوف orders من فروع تانية
**الحل:** تأكد من:
- الـ `checkBranch` parameter = `true` في الـ middleware
- الـ `branchId` موجود في الـ token

### المشكلة: Staff مش قادر يعمل حاجة رغم إن عنده role
**الحل:** تأكد من:
- الـ `roleId` صحيح
- الـ role فيه الصلاحيات المطلوبة
- الـ role status = "active"

---

## 📝 ملاحظات مهمة

1. **الـ Owner:** دايماً له صلاحية كل شيء، مش محتاج roleId
2. **الـ Branch Manager:** له صلاحية كل شيء في فرعه بس
3. **الـ Staff:** لازم يكون له roleId عشان يشتغل
4. **الـ Permissions:** بتتجمع من الـ role + الـ custom permissions

---

## 📞 للدعم

لو عندك أي استفسار، تواصل مع فريق التطوير.
