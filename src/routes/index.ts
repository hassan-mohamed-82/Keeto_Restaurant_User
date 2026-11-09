import { Router } from "express";
import adminRouter from './admin/index';
import posRouter from './pos/index';
import deliveryManRouter from './delivery_man/index';
import resolveDomainRouter from './resolveDomain';

const route = Router();

// Public: no auth required — resolves custom domain → restaurant slug
route.use('/resolve-domain', resolveDomainRouter);

route.use('/restaurant', adminRouter);
route.use('/pos', posRouter);
route.use('/delivery_man', deliveryManRouter);

export default route;