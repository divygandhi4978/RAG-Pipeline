// models/UserModel.js
import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
  name: { type: String, default: "" },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true }, // hashed
  isVerified: { type: Boolean, default: false },
  otp: { type: String },
  otpExpires: { type: Date },
  newPasswordTemp: { type: String },
  createdAt: { type: Date, default: () => new Date() }
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  const bcrypt = await import("bcrypt");
  return bcrypt.compare(enteredPassword, this.password);
};

export default mongoose.model("User", userSchema);
