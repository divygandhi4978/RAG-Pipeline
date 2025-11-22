// routes/queryRoutes.js
import express from "express";
import { protect } from "../middleware/authProtect.js";
import { queryRag, listHistory, emailReport } from "../controllers/queryController.js";

const router = express.Router();

// proxy query -> Flask + save history
router.post("/query", protect, queryRag);

// list query history
router.get("/history", protect, listHistory);

// email PDF report for date range
router.post("/history/report", protect, emailReport);

export default router;
