import { Router } from "express";
import adminRouter from './admin/index';
import userRouter from './user/index';
import cashierRouter from './cashier/index';
import posRouter from './admin/pos/index';
import deliveryManRouter from './delivery_man/index';
import resolveDomainRouter from './resolveDomain';

const route = Router();

// Public: no auth required — resolves custom domain → restaurant slug
route.use('/resolve-domain', resolveDomainRouter);

route.use('/restaurant', adminRouter);
// route.use('/user', userRouter);
route.use('/cashier', cashierRouter);
route.use('/restaurant/pos', posRouter);
route.use('/delivery_man', deliveryManRouter);


export default route;