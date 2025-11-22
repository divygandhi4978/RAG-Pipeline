// routes/authRoutes.js
import express from "express";
import {
  registerUser,
  verifyOtp,
  loginUser,
  logoutUser,
  getUserProfile
} from "../controllers/authController.js";
import { protect } from "../middleware/authProtect.js";

const router = express.Router();

router.post("/register", registerUser);
router.post("/verify-otp", verifyOtp);
router.post("/login", loginUser);
router.post("/logout", logoutUser);

router.get("/me", protect, getUserProfile);

export default router;
