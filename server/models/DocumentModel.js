// models/DocumentModel.js
import mongoose from "mongoose";

const VersionSchema = new mongoose.Schema({
  versionNumber: Number,
  filePath: String,
  filename: String,
  uploadedAt: Date
}, { _id: false });

const DocumentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  type: String,
  source: String,
  userId: { type: String, index: true },
  versions: { type: [VersionSchema], default: [] },
  createdAt: { type: Date, default: () => new Date() }
});

export default mongoose.model("Document", DocumentSchema);
