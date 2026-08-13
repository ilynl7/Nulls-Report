import { Router, type IRouter } from "express";
import healthRouter from "./health";
import accountRouter from "./account";
import reportsRouter from "./reports";
import notificationsRouter from "./notifications";
import adminRouter from "./admin";
import storageRouter from "./storage";
import nullsConnectRouter from "./nulls-connect";

const router: IRouter = Router();

router.use(healthRouter);
router.use(accountRouter);
router.use(reportsRouter);
router.use(notificationsRouter);
router.use(adminRouter);
router.use(storageRouter);
router.use(nullsConnectRouter);

export default router;
