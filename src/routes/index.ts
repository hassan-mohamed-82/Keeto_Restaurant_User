import { Router } from "express";
import adminRouter from './admin/index';
import userRouter from './user/index';
import cashierRouter from './cashier/index';
import posRouter from './admin/pos/index';

const route = Router();

route.use('/restaurant', adminRouter);
route.use('/user', userRouter);
route.use('/cashier', cashierRouter);
route.use('/restaurant/pos', posRouter);


export default route;