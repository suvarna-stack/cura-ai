import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Admin frontend for the RAG backend. `/api/*` is proxied to FastAPI on :8000
// so the browser talks to one origin and CORS never gets in the way.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
