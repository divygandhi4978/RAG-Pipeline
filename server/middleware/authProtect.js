import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

import User from "../models/UserModel.js";
import { generateTokenAndSetCookie } from "./generateToken.js";

const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const ALLOW_DEV_BYPASS = String(process.env.ALLOW_DEV_BYPASS || "false").toLowerCase() === "true";

function cleanTokenRaw(t) {
  if (!t) return null;
  try { t = decodeURIComponent(String(t)); } catch (e) {}
  t = String(t).trim();
  if (t.toLowerCase().startsWith("bearer ")) t = t.split(" ")[1];
  if (t.includes("loginData=") && !t.startsWith("eyJ")) {
    const m = t.match(/loginData=([^;]+)/);
    if (m && m[1]) t = m[1];
  }
  if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
    t = t.slice(1, -1);
  }
  return t.trim();
}

function resolvePlaceholderFromEnv(placeholder) {
  if (!placeholder) return null;
  const raw = placeholder.replace(/^\s*\{\{\s*/, "").replace(/\s*\}\}\s*$/, "").trim();
  if (!raw) return null;

  const candidates = [
    raw,
    raw.toUpperCase(),
    raw.toLowerCase(),
    `POSTMAN_${raw.toUpperCase()}`,
    `POSTMAN_${raw.toLowerCase()}`
  ];

  for (const name of candidates) {
    if (process.env[name]) return process.env[name];
  }
  return null;
}

async function devBypass(req, res) {
  if (!ALLOW_DEV_BYPASS) return null;
  const devEmail = req.headers["x-dev-user"] || req.headers["x_dev_user"] || null;
  if (!devEmail) return null;
  const user = await User.findOne({ email: String(devEmail).toLowerCase() });
  if (!user) return null;
  const token = generateTokenAndSetCookie(res, user._id.toString(), user.email);
  req.userId = user._id.toString();
  req.userEmail = user.email;
  req._generatedToken = token;
  console.log("Dev bypass successful — acting as user:", user.email);
  return user;
}

export const protect = async (req, res, next) => {
  try {
    let raw = req.headers.authorization || req.headers.Authorization || "";
    if (!raw && req.cookies && req.cookies.loginData) raw = req.cookies.loginData;
    if (!raw && req.headers.cookie) raw = req.headers.cookie;

    console.log("protect raw candidate:", raw);

    let token = cleanTokenRaw(raw || "");
    const looksLikePlaceholder = !!(token && token.includes("{{") && token.includes("}}"));

    if (looksLikePlaceholder) {
      console.log("Detected placeholder token:", token);
      const resolved = resolvePlaceholderFromEnv(token);
      if (resolved) {
        console.log("Resolved placeholder from env variable.");
        token = resolved;
      } else {
        console.warn("Placeholder not found in process.env. Candidates tried. Falling back to dev bypass if enabled.");
      }
    }

    if ((!token || token === "{{}}") && req.headers.cookie) {
      // attempt extracting loginData and resolving
      const m = req.headers.cookie.match(/loginData=([^;]+)/);
      if (m && m[1]) {
        const maybe = m[1];
        if (maybe.includes("{{") && maybe.includes("}}")) {
          const resolved = resolvePlaceholderFromEnv(maybe);
          if (resolved) {
            token = resolved;
            console.log("Resolved loginData placeholder from env.");
          }
        } else {
          token = maybe;
        }
      }
    }

    if (token && !token.includes("{{")) {
      try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.userId = decoded.userId || decoded.user_id || decoded.id || decoded._id;
        req.userEmail = decoded.email || decoded.userEmail || null;
        if (!req.userId) {
          console.error("Verified token but no userId in payload");
          return res.status(401).json({ message: "Invalid token payload (no userId)" });
        }
        console.log("Token verified for userId:", req.userId);
        return next();
      } catch (verifyErr) {
        console.warn("Token present but verification failed:", verifyErr?.message || verifyErr);
      }
    }

    const bypassUser = await devBypass(req, res);
    if (bypassUser) return next();

    if (looksLikePlaceholder) {
      const hint = "Placeholder token detected. Set the matching environment variable on the server (e.g. LOGIN_COOKIE) or use Authorization header.";
      console.error(hint);
      return res.status(401).json({ message: hint });
    }

    return res.status(401).json({ message: "Not authorized, token missing or invalid" });
  } catch (err) {
    console.error("protect unexpected error:", err);
    return res.status(401).json({ message: "Auth error" });
  }
};
