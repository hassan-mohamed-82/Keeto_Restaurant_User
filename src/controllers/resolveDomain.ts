import { Request, Response } from "express";
import { db } from "../models/connection";
import { restaurantDomains, restaurants } from "../models/schema";
import { eq, and } from "drizzle-orm";
import { domainResolutionCache } from "../utils/domainCache";

const HOSTNAME_REGEX =
  /^(?:[a-z0-9](?:[a-z0-9\-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;

/** GET /api/resolve-domain?host=order.pizzaking.com */
export const resolveDomain = async (req: Request, res: Response) => {
  const host = ((req.query.host as string) ?? "")
    .trim()
    .toLowerCase()
    .replace(/:\d+$/, ""); // strip port

  if (!host || !HOSTNAME_REGEX.test(host)) {
    res.status(400).json({ error: "Invalid host parameter" });
    return;
  }

  // Check positive/negative cache
  const cached = domainResolutionCache.get(host);
  if (cached !== undefined) {
    if (cached === null) {
      res.status(404).json({ error: "Domain not found" });
      return;
    }
    res.status(200).json(cached);
    return;
  }

  // DB lookup
  const rows = await db
    .select({
      restaurantSlug: restaurants.slug,
      name: restaurants.name,
    })
    .from(restaurantDomains)
    .innerJoin(restaurants, eq(restaurantDomains.restaurantId, restaurants.id))
    .where(
      and(
        eq(restaurantDomains.domain, host),
        eq(restaurantDomains.verified, 1)
      )
    )
    .limit(1);

  if (!rows.length || !rows[0].restaurantSlug) {
    domainResolutionCache.setNegative(host);
    res.status(404).json({ error: "Domain not found" });
    return;
  }

  const result = {
    restaurantSlug: rows[0].restaurantSlug,
    name: rows[0].name,
  };
  domainResolutionCache.set(host, result);
  res.status(200).json(result);
};
