import User from "../models/UserModel.js";
import bcrypt from "bcrypt";
import { sendOtpEmail } from "../utils/sendMailOTP.js";
import { generateTokenAndSetCookie } from "../middleware/generateToken.js";

export const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "email+password required" });

    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    const user = await User.create({
      name,
      email: email.toLowerCase(),
      password: hash,
      otp,
      otpExpires,
      isVerified: false
    });

    await sendOtpEmail(user.email, otp);
    return res.status(201).json({ message: "Registered. OTP sent to email." });
  } catch (err) {
    console.error("registerUser error:", err);
    return res.status(500).json({ message: err.message });
  }
};

export const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ message: "email+otp required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!user.otp || user.otp !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = undefined;
    user.otpExpires = undefined;
    await user.save();

    return res.json({ message: "Email verified. You can now log in." });
  } catch (err) {
    console.error("verifyOtp error:", err);
    return res.status(500).json({ message: err.message });
  }
};export const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "email+password required" });

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isVerified) return res.status(403).json({ message: "Email not verified" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    // generate token and set cookie; return token in body too
    const token = generateTokenAndSetCookie(res, user._id.toString(), user.email);

    return res.json({
      message: "Login successful",
      token,
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error("loginUser error:", err);
    return res.status(500).json({ message: err.message });
  }
};

export const logoutUser = (req, res) => {
  res.cookie("loginData", "", { httpOnly: true, expires: new Date(0) });
  return res.json({ message: "Logged out" });
};

export const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.userId).select("-password -otp -otpExpires -newPasswordTemp");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.json(user);
  } catch (err) {
    console.error("getUserProfile error:", err);
    return res.status(500).json({ message: err.message });
  }
};
