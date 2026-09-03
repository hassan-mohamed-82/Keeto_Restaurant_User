"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseAndNormalizeCoordinates = parseAndNormalizeCoordinates;
exports.isPointInPolygon = isPointInPolygon;
exports.haversineKm = haversineKm;
exports.resolveZoneFromCoords = resolveZoneFromCoords;
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * دالة مساعدة لفك واستخراج مصفوفة النقاط {lat, lng} من أي شكل محتمل (JSON string, GeoJSON, Array, Objects)
 */
function parseAndNormalizeCoordinates(raw) {
    if (!raw)
        return [];
    let parsed = raw;
    while (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        }
        catch (e) {
            break;
        }
    }
    while (Array.isArray(parsed) && parsed.length === 1 && Array.isArray(parsed[0])) {
        parsed = parsed[0];
    }
    if (!Array.isArray(parsed))
        return [];
    const result = [];
    for (const item of parsed) {
        if (!item)
            continue;
        let pLat = null;
        let pLng = null;
        if (Array.isArray(item) && item.length >= 2) {
            pLng = Number(item[0]);
            pLat = Number(item[1]);
        }
        else if (typeof item === "object") {
            pLat = item.lat !== undefined ? Number(item.lat) : (item.latitude !== undefined ? Number(item.latitude) : (item.latitud !== undefined ? Number(item.latitud) : null));
            pLng = item.lng !== undefined ? Number(item.lng) : (item.longitude !== undefined ? Number(item.longitude) : (item.long !== undefined ? Number(item.long) : null));
        }
        if (pLat !== null && pLng !== null && !isNaN(pLat) && !isNaN(pLng)) {
            result.push({ lat: pLat, lng: pLng });
        }
    }
    return result;
}
/**
 * خوارزمية Ray-Casting للتأكد من وقوع النقطة داخل مضلع (Polygon)
 */
function isPointInPolygon(pLat, pLng, polygon) {
    if (!polygon || polygon.length < 3)
        return false;
    let inside = false;
    const n = polygon.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = Number(polygon[i].lng), yi = Number(polygon[i].lat);
        const xj = Number(polygon[j].lng), yj = Number(polygon[j].lat);
        if (isNaN(xi) || isNaN(yi) || isNaN(xj) || isNaN(yj))
            continue;
        const intersect = ((yi > pLat) !== (yj > pLat)) &&
            (pLng < ((xj - xi) * (pLat - yi)) / (yj - yi) + xi);
        if (intersect)
            inside = !inside;
    }
    return inside;
}
/**
 * حساب المسافة بين نقطتين جغرافيتين بالكيلومتر (Haversine Formula)
 */
function haversineKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
/**
 * يحدد أنسب zone لنقطة جغرافية معينة بناءً على zones المطعم النشطة، مع fallback للـ zones العامة إن لم توجد.
 *
 * @param lat خط عرض العنوان
 * @param lng خط طول العنوان
 * @param restaurantId معرف المطعم
 * @returns بيانات الـ zone المُستنتجة، أو null إن لم تتوافق أي zone
 */
async function resolveZoneFromCoords(lat, lng, restaurantId) {
    if (lat === null || lat === undefined || lng === null || lng === undefined)
        return null;
    const numLat = typeof lat === "number" ? lat : parseFloat(String(lat));
    const numLng = typeof lng === "number" ? lng : parseFloat(String(lng));
    if (isNaN(numLat) || isNaN(numLng))
        return null;
    let bestMatch = null;
    let bestFee = -1;
    // 1. فحص الـ zones المخصصة للمطعم أولاً (في حال وجود restaurantId)
    if (restaurantId) {
        const feesWithZones = await connection_1.db
            .select({
            fee: {
                id: schema_1.restaurantZoneDeliveryFees.id,
                zoneId: schema_1.restaurantZoneDeliveryFees.zoneId,
                coverageType: schema_1.restaurantZoneDeliveryFees.coverageType,
                customCoordinates: schema_1.restaurantZoneDeliveryFees.customCoordinates,
                customRadiusKm: schema_1.restaurantZoneDeliveryFees.customRadiusKm,
                deliveryFee: schema_1.restaurantZoneDeliveryFees.deliveryFee,
            },
            zone: {
                id: schema_1.zones.id,
                name: schema_1.zones.name,
                nameAr: schema_1.zones.nameAr,
                nameFr: schema_1.zones.nameFr,
                coordinates: schema_1.zones.coordinates,
                coverageAreaRadiusKm: schema_1.zones.coverageAreaRadiusKm,
                deliveryFee: schema_1.zones.deliveryFee,
            },
        })
            .from(schema_1.restaurantZoneDeliveryFees)
            .leftJoin(schema_1.zones, (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.zoneId, schema_1.zones.id))
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.restaurantId, restaurantId), (0, drizzle_orm_1.eq)(schema_1.restaurantZoneDeliveryFees.status, "active")));
        for (const row of feesWithZones) {
            if (!row.zone)
                continue;
            const coverageType = row.fee.coverageType || "POLYGON";
            const rawCoords = row.fee.customCoordinates || row.zone.coordinates;
            const coords = parseAndNormalizeCoordinates(rawCoords);
            const radiusKm = parseFloat(String(row.fee.customRadiusKm || row.zone.coverageAreaRadiusKm || "0"));
            let isInside = false;
            if (coverageType === "RADIUS" && radiusKm > 0 && coords.length > 0) {
                const center = coords.length === 1 ? coords[0] : {
                    lat: coords.reduce((sum, p) => sum + p.lat, 0) / coords.length,
                    lng: coords.reduce((sum, p) => sum + p.lng, 0) / coords.length,
                };
                const distKm = haversineKm(numLat, numLng, center.lat, center.lng);
                isInside = distKm <= radiusKm;
            }
            else if (coords.length >= 3) {
                isInside = isPointInPolygon(numLat, numLng, coords);
            }
            else if (radiusKm > 0 && coords.length > 0) {
                const center = coords[0];
                const distKm = haversineKm(numLat, numLng, center.lat, center.lng);
                isInside = distKm <= radiusKm;
            }
            if (isInside) {
                const fee = parseFloat(String(row.fee.deliveryFee || "0"));
                if (fee > bestFee || bestMatch === null) {
                    bestFee = fee;
                    bestMatch = {
                        id: row.zone.id,
                        name: row.zone.name,
                        nameAr: row.zone.nameAr ?? null,
                        nameFr: row.zone.nameFr ?? null,
                        deliveryFee: String(row.fee.deliveryFee || "0"),
                    };
                }
            }
        }
    }
    // 2. إذا لم نجد تطابق في إعدادات المطعم، نبحث في الـ zones العامة بالنظام
    if (!bestMatch) {
        const allActiveZones = await connection_1.db
            .select({
            id: schema_1.zones.id,
            name: schema_1.zones.name,
            nameAr: schema_1.zones.nameAr,
            nameFr: schema_1.zones.nameFr,
            coordinates: schema_1.zones.coordinates,
            coverageAreaRadiusKm: schema_1.zones.coverageAreaRadiusKm,
            deliveryFee: schema_1.zones.deliveryFee,
        })
            .from(schema_1.zones)
            .where((0, drizzle_orm_1.eq)(schema_1.zones.status, "active"));
        for (const zoneRow of allActiveZones) {
            const coords = parseAndNormalizeCoordinates(zoneRow.coordinates);
            const radiusKm = parseFloat(String(zoneRow.coverageAreaRadiusKm || "0"));
            let isInside = false;
            if (coords.length >= 3) {
                isInside = isPointInPolygon(numLat, numLng, coords);
            }
            if (!isInside && radiusKm > 0 && coords.length > 0) {
                const center = coords.length === 1 ? coords[0] : {
                    lat: coords.reduce((sum, p) => sum + p.lat, 0) / coords.length,
                    lng: coords.reduce((sum, p) => sum + p.lng, 0) / coords.length,
                };
                const distKm = haversineKm(numLat, numLng, center.lat, center.lng);
                isInside = distKm <= radiusKm;
            }
            if (isInside) {
                const fee = parseFloat(String(zoneRow.deliveryFee || "0"));
                if (fee > bestFee || bestMatch === null) {
                    bestFee = fee;
                    bestMatch = {
                        id: zoneRow.id,
                        name: zoneRow.name,
                        nameAr: zoneRow.nameAr ?? null,
                        nameFr: zoneRow.nameFr ?? null,
                        deliveryFee: String(zoneRow.deliveryFee || "0"),
                    };
                }
            }
        }
    }
    return bestMatch;
}
