// backend/routes/equipment.js

import { Router } from "express";

import { requireAuth } from "../middleware/auth.js";
import {
    requireHomeOwnership,
} from "../middleware/ownership.js";
import {
    buildMaintenanceTasksFromSchedule,
    lookupCpscRecalls,
    normalizeEquipmentIdentity,
} from "../services/equipmentIntelligence.js";

export function createEquipmentRouter() {
    const router = Router();

    router.post(
        "/homes/:homeId/equipment/recalls",
        requireAuth,
        requireHomeOwnership,
        async (req, res) => {
            try {
                const identity = normalizeEquipmentIdentity(
                    req.body || {}
                );
                const recalls = await lookupCpscRecalls(
                    identity
                );

                return res.json({
                    identity,
                    recalls,
                    suggestedTasks:
                        buildMaintenanceTasksFromSchedule(
                            req.body?.serviceIntervalMonths ||
                                12,
                            identity.model ||
                                identity.brand ||
                                "Equipment"
                        ),
                });
            } catch (error) {
                console.error(
                    "Equipment recall lookup failed:",
                    error
                );
                return res.status(500).json({
                    error: "Failed to look up equipment recalls",
                });
            }
        }
    );

    return router;
}
