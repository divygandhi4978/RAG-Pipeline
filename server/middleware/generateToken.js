import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

export const generateTokenAndSetCookie = (res, userId, email) => {
  const uid = typeof userId === "string" ? userId : String(userId);
  const payload = { userId: uid };
  if (email) payload.email = email;

  const token = jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "1h"
  });

  res.cookie("loginData", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * (process.env.JWT_EXPIRES_HOURS ? parseInt(process.env.JWT_EXPIRES_HOURS) : 1)
  });

  return token;
};
