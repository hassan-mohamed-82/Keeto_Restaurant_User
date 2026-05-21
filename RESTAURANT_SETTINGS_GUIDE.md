# 🏪 دليل إعدادات المطعم (Restaurant Settings Guide)

## 📋 نظرة عامة

هذا الدليل يشرح كيفية استخدام نظام إعدادات المطعم في المشروع، وكيف يتم تطبيق هذه الإعدادات على كل الـ APIs.

---

## 🔧 الإعدادات المتاحة

### 1. **إعدادات الخدمات (Service Settings)**

| الإعداد | النوع | الوصف | التأثير |
|--------|------|-------|---------|
| `homeDelivery` | Boolean | تفعيل/إيقاف خدمة التوصيل | لو `false`، اليوزر مايقدرش يعمل order نوع `delivery` |
| `takeaway` | Boolean | تفعيل/إيقاف خدمة الاستلام | لو `false`، اليوزر مايقدرش يعمل order نوع `takeaway` |
| `dineIn` | Boolean | تفعيل/إيقاف خدمة الأكل في المطعم | لو `false`، اليوزر مايقدرش يعمل order نوع `dine_in` |
| `selfDelivery` | Boolean | التوصيل الذاتي | المطعم بيوصل بنفسه بدون شركة توصيل |

### 2. **إعدادات الطلبات (Order Settings)**

| الإعداد | النوع | الوصف | التأثير |
|--------|------|-------|---------|
| `minOrderAmount` | Decimal | الحد الأدنى للطلب | لو الـ order أقل من القيمة دي، الطلب يترفض |
| `canEditOrder` | Boolean | السماح بتعديل الطلب | لو `false`، اليوزر مايقدرش يعدل الطلب بعد إنشائه |
| `instantOrder` | Boolean | الطلب الفوري | |
| `orderSubscription` | Boolean | الاشتراكات | |
| `scheduledDelivery` | Boolean | التوصيل المجدول | |

### 3. **إعدادات الوقت (Time Settings)**

| الإعداد | النوع | الوصف | التأثير |
|--------|------|-------|---------|
| `isAlwaysOpen` | Boolean | المطعم مفتوح 24/7 | لو `true`، مفيش تحقق من مواعيد العمل |
| `isSameTimeEveryDay` | Boolean | نفس المواعيد كل يوم | |
| `minDeliveryTime` | Integer | الحد الأدنى لوقت التوصيل (بالدقائق) | |
| `maxDeliveryTime` | Integer | الحد الأقصى لوقت التوصيل (بالدقائق) | |

### 4. **إعدادات أخرى (Other Settings)**

| الإعداد | النوع | الوصف |
|--------|------|-------|
| `foodManagement` | Boolean | إدارة الأطعمة |
| `reviewsSection` | Boolean | قسم التقييمات |
| `posSection` | Boolean | نظام نقاط البيع |
| `halalTagStatus` | Boolean | علامة الحلال |
| `vegType` | Enum | نوع الطعام: `VEG`, `NON_VEG`, `BOTH` |

---

## 📅 مواعيد العمل (Restaurant Schedules)

### البنية:

```json
{
  "dayOfWeek": 0,           // 0 = الأحد, 1 = الإثنين, ... 6 = السبت
  "isOffDay": false,        // هل اليوم إجازة؟
  "openingTime": "09:00",   // وقت الفتح
  "closingTime": "23:00"    // وقت الإغلاق
}
```

### مثال:

```json
{
  "schedules": [
    { "dayOfWeek": 0, "isOffDay": false, "openingTime": "09:00", "closingTime": "23:00" },
    { "dayOfWeek": 1, "isOffDay": false, "openingTime": "09:00", "closingTime": "23:00" },
    { "dayOfWeek": 2, "isOffDay": false, "openingTime": "09:00", "closingTime": "23:00" },
    { "dayOfWeek": 3, "isOffDay": false, "openingTime": "09:00", "closingTime": "23:00" },
    { "dayOfWeek": 4, "isOffDay": false, "openingTime": "09:00", "closingTime": "23:00" },
    { "dayOfWeek": 5, "isOffDay": true, "openingTime": null, "closingTime": null },
    { "dayOfWeek": 6, "isOffDay": false, "openingTime": "10:00", "closingTime": "22:00" }
  ]
}
```

---

## 🔄 كيفية تحديث الإعدادات

### API Endpoint:
```
PUT /api/admin/settings
```

### Request Body:
```json
{
  "settings": {
    "homeDelivery": true,
    "takeaway": false,
    "dineIn": true,
    "minOrderAmount": 50.00,
    "canEditOrder": false,
    "isAlwaysOpen": false,
    "minDeliveryTime": 20,
    "maxDeliveryTime": 40
  },
  "schedules": [
    { "dayOfWeek": 0, "isOffDay": false, "openingTime": "09:00", "closingTime": "23:00" },
    { "dayOfWeek": 1, "isOffDay": false, "openingTime": "09:00", "closingTime": "23:00" }
  ]
}
```

---

## ✅ التحققات التي تتم عند إنشاء Order

عند استدعاء `/api/user/order/checkout`، النظام يتحقق من:

### 1. **نوع الأوردر (Order Type)**
```typescript
if (orderType === "delivery" && !settings.homeDelivery) {
    throw new BadRequest("Delivery service is currently disabled");
}
```

### 2. **الحد الأدنى للطلب (Minimum Order Amount)**
```typescript
if (subtotal < settings.minOrderAmount) {
    throw new BadRequest(`Minimum order amount is ${settings.minOrderAmount}`);
}
```

### 3. **مواعيد العمل (Opening Hours)**
```typescript
if (!settings.isAlwaysOpen) {
    // التحقق من اليوم والوقت الحالي
    if (todaySchedule.isOffDay) {
        throw new BadRequest("Restaurant is closed today");
    }
    if (currentTime < openingTime || currentTime > closingTime) {
        throw new BadRequest("Restaurant is closed");
    }
}
```

---

## 🛠️ كيفية استخدام الإعدادات في Controllers أخرى

### مثال 1: التحقق من إمكانية تعديل الأوردر

```typescript
import { getRestaurantSettings } from '../../middlewares/checkRestaurantSettings';

export const updateOrder = async (req: Request, res: Response) => {
    const { restaurantId } = req.body;
    
    const settings = await getRestaurantSettings(restaurantId);
    
    if (!settings || !settings.canEditOrder) {
        throw new BadRequest("Order editing is disabled for this restaurant");
    }
    
    // ... باقي الكود
};
```

### مثال 2: استخدام Middleware

```typescript
import { checkCanEditOrder } from '../../middlewares/checkRestaurantSettings';

router.put("/order/:id", checkCanEditOrder, catchAsync(updateOrder));
```

---

## 📊 أمثلة على السيناريوهات

### السيناريو 1: مطعم يوقف التوصيل مؤقتاً

```json
{
  "settings": {
    "homeDelivery": false,
    "takeaway": true,
    "dineIn": true
  }
}
```

**النتيجة:** اليوزر يقدر يطلب takeaway أو dine_in بس، مش delivery.

---

### السيناريو 2: مطعم يحدد حد أدنى للطلب

```json
{
  "settings": {
    "minOrderAmount": 100.00
  }
}
```

**النتيجة:** أي order أقل من 100 جنيه يترفض.

---

### السيناريو 3: مطعم مغلق يوم الجمعة

```json
{
  "settings": {
    "isAlwaysOpen": false
  },
  "schedules": [
    { "dayOfWeek": 5, "isOffDay": true, "openingTime": null, "closingTime": null }
  ]
}
```

**النتيجة:** أي order يوم الجمعة يترفض.

---

## 🚀 الخطوات القادمة

### 1. إضافة التحققات في APIs أخرى:
- [ ] تعديل الأوردر (Edit Order)
- [ ] إلغاء الأوردر (Cancel Order)
- [ ] جدولة التوصيل (Schedule Delivery)

### 2. إضافة إشعارات:
- [ ] إشعار للمطعم عند تغيير الإعدادات
- [ ] إشعار لليوزر لو المطعم أغلق خدمة معينة

### 3. Dashboard للمطعم:
- [ ] صفحة لإدارة الإعدادات بسهولة
- [ ] Toggle switches للإعدادات
- [ ] Calendar لمواعيد العمل

---

## 📝 ملاحظات مهمة

1. **الإعدادات الافتراضية:** لو المطعم مفيش له إعدادات، النظام يسمح بكل شيء (permissive by default).
2. **Transaction Safety:** كل التحديثات بتتم في transaction عشان نضمن consistency.
3. **Error Handling:** كل الأخطاء بترجع رسائل واضحة لليوزر.

---

## 🐛 Troubleshooting

### المشكلة: الإعدادات مش بتتحدث
**الحل:** تأكد إنك بتبعت الحقول بشكل صريح في الـ request body.

### المشكلة: اليوزر يقدر يطلب رغم إن الخدمة متوقفة
**الحل:** تأكد إن الـ checkout controller فيه التحققات الصحيحة.

---

## 📞 للدعم

لو عندك أي استفسار، تواصل مع فريق التطوير.
