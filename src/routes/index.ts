import { Router } from "express";
import adminRouter from './admin/index';
import userRouter from './user/index';
import cashierRouter from './cashier/index';

const route = Router();

route.use('/restaurant', adminRouter);
route.use('/user', userRouter);
route.use('/cashier', cashierRouter);


export default route;