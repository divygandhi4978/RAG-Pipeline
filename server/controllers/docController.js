import fs from "fs";
import path from "path";
import { fetch, FormData, File } from "undici";
import multer from "multer";
import Document from "../models/DocumentModel.js";

const UPLOADS_DIR =
  process.env.UPLOADS_DIR || path.join(process.cwd(), "uploads");

const BASE_FLASK =
  (process.env.FLASK_URL || "http://127.0.0.1:5000").replace(/\/$/, "");

const FLASK_UPLOAD_URL = BASE_FLASK + "/upload";

fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || "";
    const tmpName = `tmp-${Date.now()}-${Math.round(
      Math.random() * 1e6
    )}${ext}`;
    cb(null, tmpName);
  },
});

export const uploadMiddleware = multer({
  storage,
  limits: { fileSize: parseInt(process.env.MAX_FILE_SIZE || 10 * 1024 * 1024) },
});

async function sendToFlask({ url, filePath, clientId, docId, filename, contentType }) {
  if (!fs.existsSync(filePath)) {
    throw new Error("Local file not found: " + filePath);
  }

  if (!clientId) {
    throw new Error("clientId is required for Flask request");
  }

  const form = new FormData();

  form.set("client_id", String(clientId));

  if (docId) {
    form.set("doc_ids", JSON.stringify({ [filename]: String(docId) }));
  }

  const buffer = fs.readFileSync(filePath);
  form.set(
    "files",
    new File([buffer], filename, {
      type: contentType || "application/octet-stream",
    })
  );

  console.log(`[DEBUG] Sending to Flask → client_id=${clientId}, file=${filename}`);

  try {
    const response = await fetch(url, {
      method: "POST",
      body: form,
    });

    const raw = await response.text();
    let json;

    try {
      json = JSON.parse(raw);
    } catch {
      json = { raw };
    }

    if (!response.ok) {
      console.error(`[Flask Error] Status ${response.status}:`, json);
      const error = new Error("Flask error");
      error.status = response.status;
      error.response = json;
      throw error;
    }

    return json;
  } catch (err) {
    console.error("[sendToFlask Error]:", err.message);
    throw err;
  }
}

export const uploadDocument = async (req, res) => {
  try {
    let clientId =
      req.userId ||
      req.userEmail ||
      req.body?.client_id ||
      req.query?.client_id ||
      req.headers["client_id"] ||
      req.headers["x-client-id"];

    console.log("[uploadDocument] Resolved clientId:", clientId);

    if (!clientId) {
      return res.status(400).json({
        error: "client_id is required",
        hint: "Provide via body, query, or headers",
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const title = req.body.title || req.file.originalname;
    const type = req.body.type || req.file.mimetype;

    const newDoc = new Document({
      title,
      type,
      source: "upload",
      userId: clientId,
      versions: [],
    });
    await newDoc.save();

    const ext = path.extname(req.file.originalname);
    const finalName = `${newDoc._id}${ext}`;
    const oldPath = path.join(UPLOADS_DIR, req.file.filename);
    const newPath = path.join(UPLOADS_DIR, finalName);

    fs.renameSync(oldPath, newPath);

    const version = {
      versionNumber: 1,
      filePath: newPath.replace(/\\/g, "/"),
      filename: finalName,
      uploadedAt: new Date(),
    };

    newDoc.versions.push(version);
    await newDoc.save();

    let flaskResponse;
    try {
      flaskResponse = await sendToFlask({
        url: FLASK_UPLOAD_URL,
        filePath: newPath,
        clientId: String(clientId),
        docId: String(newDoc._id),
        filename: finalName,
        contentType: type,
      });

      console.log("[Flask Success]:", flaskResponse);
    } catch (err) {
      console.error("[Flask Upload Failed]:", err.message);
      return res.status(201).json({
        message: "Document saved but RAG upload failed",
        document: newDoc,
        rag_response_error: err.response || err.message,
      });
    }

    return res.status(201).json({
      message: "Document saved and forwarded to RAG",
      document: newDoc,
      rag_response: flaskResponse,
    });
  } catch (err) {
    console.error("[uploadDocument Error]:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

export const parseDocument = async (req, res) => {
  try {
    let clientId =
      req.userId ||
      req.userEmail ||
      req.body?.client_id ||
      req.query?.client_id ||
      req.headers["client_id"] ||
      req.headers["x-client-id"];

    console.log("[parseDocument] Resolved clientId:", clientId);

    if (!clientId) {
      return res.status(400).json({
        error: "client_id is required",
        hint: "Provide client_id via body/query/headers",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded. Expected multipart form with 'file'",
      });
    }

    const filePath = path.join(UPLOADS_DIR, req.file.filename);

    let flaskResponse;

    try {
      flaskResponse = await sendToFlask({
        url: FLASK_UPLOAD_URL,
        filePath,
        clientId: String(clientId),
        filename: req.file.originalname,
        contentType: req.file.mimetype,
      });

      console.log("[Flask Parse Success]:", flaskResponse);
    } catch (err) {
      console.error("[Flask Parse Failed]:", err.message);
      return res.status(400).json({
        message: "Parsing failed",
        rag_response_error: err.response || err.message,
      });
    } finally {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }

    return res.json({
      message: "Parsing successful",
      client_id: clientId,
      rag_response: flaskResponse,
    });
  } catch (err) {
    console.error("[parseDocument Error]:", err.message);
    return res.status(500).json({ error: err.message });
  }
};

