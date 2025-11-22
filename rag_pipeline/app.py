# app.py
import os
import json
import tempfile
import threading
from flask import Flask, request, jsonify
from src.data_loader import load_all_documents
from src.vectorstore import FaissVectorStore
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)

CORE_DIR = os.environ.get("CORE_DIR", "faiss_store/core")
CLIENTS_DIR = os.environ.get("CLIENTS_DIR", "faiss_store/clients")
os.makedirs(CORE_DIR, exist_ok=True)
os.makedirs(CLIENTS_DIR, exist_ok=True)

DOCUMENT_SERVICE_URL = os.environ.get("DOCUMENT_SERVICE_URL") or "http://localhost:3000"
GROQ_API_KEY = os.environ.get("GROQ_API_KEY")  # keep empty in env to disable LLM

llm = None
if GROQ_API_KEY:
    try:
    
        print("[INFO] GROQ_API_KEY provided but ChatGroq init commented out in code.")
    except Exception as e:
        print("[WARN] Failed to initialize Groq LLM:", e)
        llm = None
else:
    print("[WARN] GROQ_API_KEY not provided. LLM responses will be placeholder text.")

core_store = FaissVectorStore(persist_dir=CORE_DIR)
if not core_store.exists_on_disk():
    print("[INFO] Building core FAISS store...")
    core_docs = load_all_documents("data/core")  # put shared regulatory docs etc. here
    if core_docs:
        core_store.build_from_documents(core_docs)
    else:
        print("[INFO] No core docs found in data/core; skipping initial build.")
else:
    core_store.load()

client_locks = {}
client_locks_lock = threading.Lock()


def get_client_lock(client_id: str):
    with client_locks_lock:
        if client_id not in client_locks:
            client_locks[client_id] = threading.Lock()
        return client_locks[client_id]


def get_client_store(client_id: str) -> FaissVectorStore:
    client_dir = os.path.join(CLIENTS_DIR, client_id)
    os.makedirs(client_dir, exist_ok=True)
    store = FaissVectorStore(persist_dir=client_dir)
    if store.exists_on_disk():
        store.load()
    else:
        print(f"[INFO] No existing client store for {client_id}. It will be built on upload.")
    return store


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200


@app.route("/upload", methods=["POST"])
def upload_client_docs():
    """
    Upload client documents (multipart files) and build (or augment) client FAISS store.
    Optional form param 'doc_ids' is JSON mapping filename -> external doc_id (from Express service).
    """
    # Debug: Print all form data
    print("[DEBUG] Form data keys:", list(request.form.keys()))
    print("[DEBUG] Form data:", dict(request.form))
    print("[DEBUG] Files:", list(request.files.keys()))
    
    client_id = request.form.get("client_id")
    
    if not client_id:
        print("[ERROR] client_id not found in form data")
        return jsonify({
            "error": "Missing client_id",
            "received_form_keys": list(request.form.keys()),
            "hint": "Ensure client_id is in form data"
        }), 400

    print(f"[INFO] Processing upload for client_id: {client_id}")

    files = request.files.getlist("files")
    if not files:
        print("[ERROR] No files in request")
        return jsonify({"error": "No files uploaded"}), 400

    # optional mapping for doc ids from external document service: JSON string e.g. {"myfile.pdf": "642.."}
    doc_ids_raw = request.form.get("doc_ids")
    doc_id_map = {}
    if doc_ids_raw:
        try:
            doc_id_map = json.loads(doc_ids_raw)
            print(f"[INFO] Received doc_ids mapping: {doc_id_map}")
        except Exception as e:
            print(f"[WARN] Failed to parse doc_ids: {e}")
            doc_id_map = {}

    saved_paths = []
    with tempfile.TemporaryDirectory() as tmp_dir:
        for file in files:
            file_path = os.path.join(tmp_dir, file.filename)
            file.save(file_path)
            saved_paths.append(file_path)
            print(f"[INFO] Saved file: {file.filename}")

        docs = load_all_documents(tmp_dir)
        print(f"[INFO] Loaded {len(docs)} documents")

        normalized_map = {}
        for k, v in doc_id_map.items():
            normalized_map[k] = v
            normalized_map[os.path.basename(k)] = v

        lock = get_client_lock(client_id)
        with lock:
            client_store = get_client_store(client_id)
            client_store.build_from_documents(docs, doc_id_map=normalized_map)
            print(f"[INFO] Successfully built embeddings for client {client_id}")

    return jsonify({
        "message": f"Documents processed and embeddings stored for {client_id}.",
        "uploaded_files": [os.path.basename(p) for p in saved_paths],
        "client_id": client_id
    }), 200


@app.route("/query", methods=["POST"])
def query_rag():
    """
    Query both core, client-private, and general embeddings.
    Returns LLM response plus resource list (filename, doc_id, download_url).
    """
    data = request.get_json(force=True)
    query = data.get("query")
    print(query)
    client_id = data.get("client_id")
    print(client_id)

    if not query:
        return jsonify({"error": "query required"}), 400
    
    if not client_id:
        return jsonify({"error": "client_id required"}), 400

    core_results = core_store.query(query, top_k=3) if core_store else []
    core_contexts = [r["metadata"]["text"] for r in core_results if r.get("metadata")]

    client_store = get_client_store(client_id)
    client_results = client_store.query(query, top_k=3) if client_store else []
    client_contexts = [r["metadata"]["text"] for r in client_results if r.get("metadata")]

    general_store = get_client_store("general")
    general_results = general_store.query(query, top_k=3) if general_store else []
    general_contexts = [r["metadata"]["text"] for r in general_results if r.get("metadata")]

    combined_context = "\n\n".join(core_contexts + client_contexts + general_contexts)
    if not combined_context.strip():
        return jsonify({"result": "No relevant documents found."}), 200

    prompt = f"""
Query: {query}
Context:
{combined_context}
Provide a clear, concise, factual answer below.
"""

    if llm:
        try:
            response = llm.invoke([prompt])
            llm_text = response.content
        except Exception as e:
            print("[WARN] LLM invocation failed:", e)
            llm_text = "LLM invocation failed. Please check Groq key / service."
    else:
        llm_text = "LLM not configured. Returning combined contexts:\n\n" + combined_context

    resources = []
    seen = set()
    for r in (core_results + client_results + general_results):
        meta = r.get("metadata") or {}
        key = (meta.get("source"), meta.get("filename"), meta.get("doc_id"))
        if key in seen:
            continue
        seen.add(key)
        resource = {
            "source": meta.get("source"),
            "filename": meta.get("filename"),
            "doc_id": meta.get("doc_id"),
            "download_url": f"{DOCUMENT_SERVICE_URL.rstrip('/')}/documents/{meta.get('doc_id')}/download" if meta.get("doc_id") else None
        }
        resources.append(resource)

    return jsonify({
        "client_id": client_id,
        "query": query,
        "response": llm_text,
        "core_hits": len(core_results),
        "client_hits": len(client_results),
        "general_hits": len(general_results),
        "resources": resources
    }), 200


@app.route("/clients/<client_id>/files", methods=["GET"])
def list_client_files(client_id):
    """
    List unique files known to the client's FAISS store (filename, doc_id, download_url)
    """
    client_store = get_client_store(client_id)
    files = []
    seen = set()
    for m in getattr(client_store, "metadata", []):
        key = (m.get("source"), m.get("filename"), m.get("doc_id"))
        if key in seen:
            continue
        seen.add(key)
        entry = {
            "source": m.get("source"),
            "filename": m.get("filename"),
            "doc_id": m.get("doc_id"),
        }
        if m.get("doc_id") and DOCUMENT_SERVICE_URL:
            entry["download_url"] = f"{DOCUMENT_SERVICE_URL.rstrip('/')}/documents/{m.get('doc_id')}/download"
        else:
            entry["download_url"] = None
        files.append(entry)
    return jsonify({"client_id": client_id, "files": files}), 200


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)