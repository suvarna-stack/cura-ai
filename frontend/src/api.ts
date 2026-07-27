// ============================================================
// Typed client for the FastAPI Graph RAG backend.
// All paths go through the Vite dev proxy: /api/* -> localhost:8000/*
// ============================================================

const BASE = "/api";

export interface DocumentInfo {
  source: string;
  filename: string;
  size_bytes: number;
  pages: number;
  chunks: number;
  status: "queued" | "processing" | "indexed" | "failed";
  progress: number;
  error?: string | null;
  doc_type?: string | null;
  edition?: string | null;
  uploaded_at: string;
}

export interface Stats {
  documents_indexed: number;
  chunks_in_index: number;
  embed_model: string;
  llm_model: string;
  retrieval_mode: string;
  graph: {
    nodes_total: number;
    edges_total: number;
    nodes: Record<string, number>;
    edges: Record<string, number>;
  };
}

export interface RetrievedChunk {
  text: string;
  source: string;
  score: number;
  via: string;
  metadata: Record<string, unknown>;
}

export interface ChatResponse {
  question: string;
  answer: string;
  mode: string;
  contexts: RetrievedChunk[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    // FastAPI errors carry a JSON body: {"detail": "..."}
    let detail = `${res.status} ${res.statusText}`;
    try {
      const body = await res.json();
      if (body.detail) detail = String(body.detail);
    } catch {
      /* non-JSON error body — keep the status text */
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  stats: () => request<Stats>("/stats"),

  documents: () => request<DocumentInfo[]>("/documents"),

  upload: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ source: string; status: string; pages: number }>(
      "/documents/upload",
      { method: "POST", body: form },
    );
  },

  deleteDocument: (source: string) =>
    request<{ deleted: number }>(`/documents/${encodeURIComponent(source)}`, {
      method: "DELETE",
    }),

  rebuild: () =>
    request<{ status: string; documents: number }>("/documents/rebuild", {
      method: "POST",
    }),

  chat: (question: string, mode: "graph" | "plain") =>
    request<ChatResponse>("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, mode, max_new_tokens: 300 }),
    }),
};

export function formatSize(bytes: number): string {
  const KB = 1024;
  if (bytes < KB) return `${bytes} B`;
  if (bytes < KB * KB) return `${(bytes / KB).toFixed(0)} KB`;
  return `${(bytes / KB / KB).toFixed(1)} MB`;
}

export const formatDate = (iso: string) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";
