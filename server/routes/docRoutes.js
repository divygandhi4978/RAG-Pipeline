// routes/docRoutes.js
import express from "express";
import { uploadMiddleware, uploadDocument } from "../controllers/docController.js";
import { protect } from "../middleware/authProtect.js";

const router = express.Router();

router.post("/documents/upload", protect, uploadMiddleware.single("file"), uploadDocument);

export default router;
