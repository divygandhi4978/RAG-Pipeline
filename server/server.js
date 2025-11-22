// server.js
import express from "express";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import cors from "cors";

dotenv.config();

import authRoutes from "./routes/authRoutes.js";
import queryRoutes from "./routes/queryRoutes.js";
import docRoutes from "./routes/docRoutes.js";

const app = express();
app.use(bodyParser.json({ limit: "10mb" }));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors());

const PORT = process.env.PORT || 3002;
const MONGO_URI = process.env.MONGO_URI;
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

if (!MONGO_URI) {
  console.error("❌ MONGO_URI missing in .env");
  process.exit(1);
}

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

await mongoose.connect(MONGO_URI);

app.use("/api/auth", authRoutes);
app.use("/api", queryRoutes); 
app.use("/api/docs", docRoutes);

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`RAG Rnning on port ${PORT}`);
});


