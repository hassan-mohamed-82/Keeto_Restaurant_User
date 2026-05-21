import { Router } from "express";
import { createBasiccampaign, getAllBasiccampaigns,
     getBasiccampaignById, updateBasiccampaign, 
     deleteBasiccampaign, updateBasiccampaignStatus 
     } from "../../controllers/admin/Basiccampaign";
import { catchAsync } from "../../utils/catchAsync";
import { hasPermission } from "../../middlewares/hasPermission";
const router = Router();

router.post("/",hasPermission("basiccampaign","create"), catchAsync(createBasiccampaign));
router.get("/",hasPermission("basiccampaign","read"), catchAsync(getAllBasiccampaigns));
router.get("/:id",hasPermission("basiccampaign","read"), catchAsync(getBasiccampaignById));
router.put("/:id",hasPermission("basiccampaign","update"), catchAsync(updateBasiccampaign));
router.delete("/:id",hasPermission("basiccampaign","delete"), catchAsync(deleteBasiccampaign));
router.put("/:id/status",hasPermission("basiccampaign","update"), catchAsync(updateBasiccampaignStatus));

export default router;