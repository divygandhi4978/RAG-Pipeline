// controllers/queryController.js
import { fetch } from "undici";
import QueryModel from "../models/QueryModel.js";
import User from "../models/UserModel.js";
import PDFDocument from "pdfkit";
import { sendMail } from "../utils/mailer.js";

// consistent: lowercase, trimmed, no undefined/null
const sanitizeClientId = (id) => {
  if (!id) return "general";
  return String(id).trim().toLowerCase();
};

const FLASK_URL = process.env.FLASK_URL || "http://127.0.0.1:5000";

const resolveClientId = (req) => {
  return sanitizeClientId(
    req.userEmail ||
    req.userId ||
    (req.userId ? String(req.userId) : null) ||
    "general"
  );
};

export const queryRag = async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ error: "query required" });

    // const client_id = resolveClientId(req);
    const client_id = req.userId;

    const resp = await fetch(`${FLASK_URL}/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, client_id }),
      timeout: 120000
    });

    console.log('fff',query,client_id);
    

    const json = await resp.json().catch(() => ({}));

    const qdoc = new QueryModel({
      userId: client_id,
      queryText: query,
      responseText: json.response || json.result || JSON.stringify(json),
      resources: json.resources || []
    });

    await qdoc.save();

    return res.json({ saved: true, rag: json });
  } catch (err) {
    console.error("queryRag error:", err);
    return res.status(500).json({ error: err.message });
  }
};

export const listHistory = async (req, res) => {
  try {
    const userId = resolveClientId(req);

    const rows = await QueryModel
      .find({ userId })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json({ count: rows.length, queries: rows });
  } catch (err) {
    console.error("listHistory error:", err);
    return res.status(500).json({ error: err.message });
  }
};

function generatePdfBuffer(queries, user) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 40 });
      const buffers = [];
      doc.on("data", (d) => buffers.push(d));
      doc.on("end", () => resolve(Buffer.concat(buffers)));

      doc.fontSize(18).text(`PolicyLens - Query Report`, { align: "center" });
      doc.moveDown();
      
      doc.fontSize(12).text(`User: ${user.email}`);
      doc.text(`Generated: ${new Date().toISOString()}`);
      doc.moveDown();

      queries.forEach((q, idx) => {
        doc.fontSize(12).text(`${idx + 1}. Query: ${q.queryText}`);
        doc.moveDown(0.2);

        doc.fontSize(11).fillColor("gray")
           .text(`Date: ${new Date(q.createdAt).toISOString()}`);
        doc.moveDown(0.2);

        doc.fontSize(11).fillColor("black").text("Response:");
        doc.fontSize(10).text(q.responseText || "-", { indent: 10 });

        if (q.resources?.length) {
          doc.fontSize(10).text("Resources:", { indent: 10 });
          q.resources.forEach((r) => {
            doc.fontSize(9).text(`- ${r.filename || r.source || "resource"}`, { indent: 20 });
          });
        }

        doc.moveDown();
        doc.moveDown();
      });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

export const emailReport = async (req, res) => {
  try {
    const { startDate, endDate, to } = req.body;
    const userId = resolveClientId(req);

    const start = startDate ? new Date(startDate) : new Date(0);
    const end = endDate ? new Date(endDate) : new Date();

    const queries = await QueryModel
      .find({ userId, createdAt: { $gte: start, $lte: end } })
      .sort({ createdAt: 1 })
      .lean();

    if (!queries.length)
      return res.status(404).json({ error: "No queries in range" });

    const user = await User.findOne({ _id: req.userId }).lean();
    if (!user)
      return res.status(404).json({ error: "User not found" });

    const pdfBuffer = await generatePdfBuffer(queries, user);

    const recipient = to || user.email;

    await sendMail({
      to: recipient,
      subject: "PolicyLens Query Report",
      text: "Attached is your query report (PDF).",
      attachments: [
        {
          filename: `policylens-report-${Date.now()}.pdf`,
          content: pdfBuffer
        }
      ]
    });

    return res.json({ message: "Report emailed", emailedTo: recipient });
  } catch (err) {
    console.error("emailReport error:", err);
    return res.status(500).json({ error: err.message });
  }
};
