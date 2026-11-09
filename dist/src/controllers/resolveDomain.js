"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveDomain = void 0;
const connection_1 = require("../models/connection");
const schema_1 = require("../models/schema");
const drizzle_orm_1 = require("drizzle-orm");
const domainCache_1 = require("../utils/domainCache");
const HOSTNAME_REGEX = /^(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
/** GET /api/resolve-domain?host=order.pizzaking.com */
const resolveDomain = async (req, res) => {
    const host = (req.query.host ?? "")
        .trim()
        .toLowerCase()
        .replace(/:\d+$/, ""); // strip port
    if (!host || !HOSTNAME_REGEX.test(host)) {
        res.status(400).json({ error: "Invalid host parameter" });
        return;
    }
    // Check positive/negative cache
    const cached = domainCache_1.domainResolutionCache.get(host);
    if (cached !== undefined) {
        if (cached === null) {
            res.status(404).json({ error: "Domain not found" });
            return;
        }
        res.status(200).json(cached);
        return;
    }
    // DB lookup
    const rows = await connection_1.db
        .select({
        restaurantSlug: schema_1.restaurants.slug,
        name: schema_1.restaurants.name,
    })
        .from(schema_1.restaurantDomains)
        .innerJoin(schema_1.restaurants, (0, drizzle_orm_1.eq)(schema_1.restaurantDomains.restaurantId, schema_1.restaurants.id))
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.restaurantDomains.domain, host), (0, drizzle_orm_1.eq)(schema_1.restaurantDomains.verified, 1)))
        .limit(1);
    if (!rows.length || !rows[0].restaurantSlug) {
        domainCache_1.domainResolutionCache.setNegative(host);
        res.status(404).json({ error: "Domain not found" });
        return;
    }
    const result = {
        restaurantSlug: rows[0].restaurantSlug,
        name: rows[0].name,
    };
    domainCache_1.domainResolutionCache.set(host, result);
    res.status(200).json(result);
};
exports.resolveDomain = resolveDomain;
