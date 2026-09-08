# ⏰ دليل الـ APIs الخاصة بالورديات - Shifts API Documentation

## 📋 نظرة عامة
هذا الدليل يوضح واجهات برمجة التطبيقات (APIs) الخاصة بإدارة الورديات (Shifts) لنظام الـ POS وإدارة المطعم في مشروع `Keeto_Restaurant_User`.

---

## 🔐 القواعد التلقائية المطبقة (Business Rules)
1. **`restaurantId`**: يتم تعيينه واستخلاصه تلقائياً من المستخدم المسجل (`req.user.restaurantId || req.user.id`)، ولا يتم تمريره يدوياً في الـ Body لحماية أمان وعزل بيانات كل مطعم.
2. **`isTomorrow`**: يتم حسابه تلقائياً من قبل السيرفر:
   - إذا كان وقت الانتهاء أصغر من وقت البدء (`to < from`) تصبح القيمة `true`.
   - إذا كان وقت الانتهاء أكبر من أو يساوي وقت البدء (`to >= from`) تصبح القيمة `false`.

---

## 🌐 المسار الأساسي (Base URL)
```
/api/restaurant/shifts
```
*(متاح أيضاً عبر `/api/restaurant/pos/shifts`)*

### الهيدرز العامة (Headers):
```http
Authorization: Bearer {TOKEN}
Content-Type: application/json
```

---

## 📌 الـ Endpoints

### 1. إضافة وردية جديدة (Create Shift)
- **Method**: `POST`
- **Endpoint**: `/api/restaurant/shifts`

#### Request Body:
```json
{
  "name": "الوردية الليلية",
  "from": "22:00",
  "to": "06:00",
  "status": "active"
}
```
> **ملاحظة**: صيغة الوقت المقبولة هي `HH:mm` أو `HH:mm:ss` بنظام 24 ساعة. حقل `status` اختياري (القيمة الافتراضية: `active`).

#### Success Response (201 Created):
```json
{
  "success": true,
  "message": "Shift created successfully",
  "data": {
    "id": "18f9e612-4217-4860-93a0-38827725dc01",
    "restaurantId": "b1a2c3d4-0000-1111-2222-333344445555",
    "name": "الوردية الليلية",
    "from": "22:00:00",
    "to": "06:00:00",
    "isTomorrow": true,
    "status": "active",
    "createdAt": "2026-09-08T16:30:00.000Z",
    "updatedAt": "2026-09-08T16:30:00.000Z"
  }
}
```

---

### 2. جلب جميع الورديات للمطعم (Get All Shifts)
- **Method**: `GET`
- **Endpoint**: `/api/restaurant/shifts`

#### Query Parameters:
| المعامل | النوع | اختياري/إلزامي | الوصف |
|---------|-------|----------------|-------|
| `status` | string | اختياري | فلترة الورديات بحسب الحالة (`active` أو `inactive`) |

#### مثال على الطلب:
```
GET /api/restaurant/shifts?status=active
```

#### Success Response (200 OK):
```json
{
  "success": true,
  "message": "Shifts fetched successfully",
  "data": [
    {
      "id": "18f9e612-4217-4860-93a0-38827725dc01",
      "restaurantId": "b1a2c3d4-0000-1111-2222-333344445555",
      "name": "الوردية الليلية",
      "from": "22:00:00",
      "to": "06:00:00",
      "isTomorrow": true,
      "status": "active",
      "createdAt": "2026-09-08T16:30:00.000Z",
      "updatedAt": "2026-09-08T16:30:00.000Z"
    },
    {
      "id": "92cb0023-7711-4fa2-938b-d7293810ef12",
      "restaurantId": "b1a2c3d4-0000-1111-2222-333344445555",
      "name": "الوردية الصباحية",
      "from": "08:00:00",
      "to": "16:00:00",
      "isTomorrow": false,
      "status": "active",
      "createdAt": "2026-09-08T14:00:00.000Z",
      "updatedAt": "2026-09-08T14:00:00.000Z"
    }
  ]
}
```

---

### 3. جلب تفاصيل وردية محددة (Get Shift By ID)
- **Method**: `GET`
- **Endpoint**: `/api/restaurant/shifts/:id`

#### Path Parameters:
- `id` (UUID): معرف الوردية.

#### Success Response (200 OK):
```json
{
  "success": true,
  "message": "Shift fetched successfully",
  "data": {
    "id": "18f9e612-4217-4860-93a0-38827725dc01",
    "restaurantId": "b1a2c3d4-0000-1111-2222-333344445555",
    "name": "الوردية الليلية",
    "from": "22:00:00",
    "to": "06:00:00",
    "isTomorrow": true,
    "status": "active",
    "createdAt": "2026-09-08T16:30:00.000Z",
    "updatedAt": "2026-09-08T16:30:00.000Z"
  }
}
```

#### Error Response (404 Not Found):
```json
{
  "success": false,
  "error": {
    "code": 404,
    "message": "Shift not found"
  }
}
```

---

### 4. تعديل وردية (Update Shift)
- **Method**: `PUT`
- **Endpoint**: `/api/restaurant/shifts/:id`

#### Request Body (جميع الحقول اختيارية):
```json
{
  "name": "وردية ليلية معدلة",
  "from": "23:00",
  "to": "07:00",
  "status": "active"
}
```
> يتم إعادة احتساب `isTomorrow` تلقائياً فوراً إذا تم إرسال `from` أو `to`.

#### Success Response (200 OK):
```json
{
  "success": true,
  "message": "Shift updated successfully",
  "data": {
    "id": "18f9e612-4217-4860-93a0-38827725dc01",
    "restaurantId": "b1a2c3d4-0000-1111-2222-333344445555",
    "name": "وردية ليلية معدلة",
    "from": "23:00:00",
    "to": "07:00:00",
    "isTomorrow": true,
    "status": "active",
    "createdAt": "2026-09-08T16:30:00.000Z",
    "updatedAt": "2026-09-08T16:35:00.000Z"
  }
}
```

---

### 5. تبديل حالة الوردية نشط / معطل (Toggle Status)
- **Method**: `PATCH`
- **Endpoint**: `/api/restaurant/shifts/:id/toggle-status`

#### Success Response (200 OK):
```json
{
  "success": true,
  "message": "Shift status changed to inactive",
  "data": {
    "id": "18f9e612-4217-4860-93a0-38827725dc01",
    "status": "inactive"
  }
}
```

---

### 6. حذف وردية (Delete Shift)
- **Method**: `DELETE`
- **Endpoint**: `/api/restaurant/shifts/:id`

#### Success Response (200 OK):
```json
{
  "success": true,
  "message": "Shift deleted successfully"
}
```

---

## ⚠️ معالجة أخطاء الـ Validation

عند إرسال بيانات غير متوافقة مع الـ Validation Schema (مثلاً صيغة وقت غير صحيحة)، يقوم السيرفر بإرجاع خطأ 400:

```json
{
  "success": false,
  "error": {
    "code": 400,
    "message": "Validation failed",
    "details": [
      {
        "field": "from",
        "message": "Invalid time format for 'from', expected HH:mm or HH:mm:ss"
      }
    ]
  }
}
```
