import os
import faiss
import numpy as np
import pickle
from typing import List, Any, Dict
from sentence_transformers import SentenceTransformer
from src.embedding import EmbeddingPipeline


class FaissVectorStore:
    def __init__(self, persist_dir: str = "faiss_store", embedding_model: str = "all-MiniLM-L6-v2",
                 chunk_size: int = 1000, chunk_overlap: int = 200):
        self.persist_dir = persist_dir
        os.makedirs(self.persist_dir, exist_ok=True)

        self.index = None
        self.metadata = []
        self.embedding_model = embedding_model
        self.model = SentenceTransformer(embedding_model)
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        print(f"[INFO] Loaded embedding model: {embedding_model}")

    # ✅ Added: Check if FAISS files exist
    def exists_on_disk(self) -> bool:
        faiss_path = os.path.join(self.persist_dir, "faiss.index")
        meta_path = os.path.join(self.persist_dir, "metadata.pkl")
        return os.path.exists(faiss_path) and os.path.exists(meta_path)

    def build_from_documents(self, documents: List[Any], doc_id_map: Dict[str, str] = None):
        print(f"[INFO] Building vector store from {len(documents)} raw documents...")

        if not documents:
            print("[WARN] No documents found. Skipping FAISS index build.")
            return

        emb_pipe = EmbeddingPipeline(
            model_name=self.embedding_model,
            chunk_size=self.chunk_size,
            chunk_overlap=self.chunk_overlap
        )

        chunks = emb_pipe.chunk_documents(documents)
        if not chunks:
            print("[WARN] No chunks created. Skipping FAISS index build.")
            return

        embeddings = emb_pipe.embed_chunks(chunks)
        if embeddings is None or len(embeddings) == 0:
            print("[WARN] No embeddings generated. Skipping FAISS index build.")
            return

        metadatas = []
        for chunk in chunks:
            source_file = chunk.metadata.get("source", "unknown")
            filename = os.path.basename(source_file)
            meta = {
                "text": chunk.page_content,
                "source": source_file,
                "filename": filename,
                "doc_id": None
            }
            if doc_id_map and filename in doc_id_map:
                meta["doc_id"] = doc_id_map[filename]
            metadatas.append(meta)

        self.add_embeddings(np.array(embeddings).astype("float32"), metadatas)
        self.save()
        print(f"[INFO] Vector store built and saved to {self.persist_dir}")

    def add_embeddings(self, embeddings: np.ndarray, metadatas: List[Any] = None):
        if embeddings is None or len(embeddings) == 0:
            print("[WARN] Empty embeddings array. Nothing to add.")
            return

        dim = embeddings.shape[1]
        if self.index is None:
            self.index = faiss.IndexFlatL2(dim)

        self.index.add(embeddings)
        if metadatas:
            self.metadata.extend(metadatas)
        print(f"[INFO] Added {embeddings.shape[0]} vectors to Faiss index.")

    def save(self):
        faiss_path = os.path.join(self.persist_dir, "faiss.index")
        meta_path = os.path.join(self.persist_dir, "metadata.pkl")

        if self.index is None:
            print("[WARN] No FAISS index to save.")
            return

        faiss.write_index(self.index, faiss_path)
        with open(meta_path, "wb") as f:
            pickle.dump(self.metadata, f)
        print(f"[INFO] Saved Faiss index and metadata to {self.persist_dir}")

    def load(self):
        faiss_path = os.path.join(self.persist_dir, "faiss.index")
        meta_path = os.path.join(self.persist_dir, "metadata.pkl")

        if not os.path.exists(faiss_path) or not os.path.exists(meta_path):
            print("[WARN] No existing FAISS store found to load.")
            return

        self.index = faiss.read_index(faiss_path)
        with open(meta_path, "rb") as f:
            self.metadata = pickle.load(f)
        print(f"[INFO] Loaded Faiss index and metadata from {self.persist_dir}")

    def search(self, query_embedding: np.ndarray, top_k: int = 5):
        if self.index is None or self.index.ntotal == 0:
            print("[WARN] Empty FAISS index. Run build_from_documents() first.")
            return []

        D, I = self.index.search(query_embedding, top_k)
        results = []
        for idx, dist in zip(I[0], D[0]):
            meta = self.metadata[idx] if idx < len(self.metadata) else None
            results.append({"index": idx, "distance": float(dist), "metadata": meta})
        return results

    def query(self, query_text: str, top_k: int = 5):
        print(f"[INFO] Querying vector store for: '{query_text}'")
        query_emb = self.model.encode([query_text]).astype("float32")
        return self.search(query_emb, top_k=top_k)


# ✅ Example usage (test only)
if __name__ == "__main__":
    from src.data_loader import load_all_documents

    docs = load_all_documents("data")
    store = FaissVectorStore("faiss_store")
    store.build_from_documents(docs)
    store.load()

    results = store.query("What is attention mechanism?", top_k=3)
    for r in results:
        print(r)
