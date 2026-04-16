import { Router } from "express";
import adminRouter from './admin/index';
import userRouter from './user/index';

const route = Router();

route.use('/restaurant', adminRouter);
route.use('/user', userRouter);


export default route;