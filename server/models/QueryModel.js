// models/QueryModel.js
import mongoose from "mongoose";

const QuerySchema = new mongoose.Schema({
  userId: { type: String, index: true },
  queryText: { type: String, required: true },
  responseText: { type: String },
  resources: { type: Array, default: [] },
  createdAt: { type: Date, default: () => new Date() }
});

export default mongoose.model("Query", QuerySchema);
