import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Must match the ingress path (/app3). Traefik strips "/app3" before the pod sees it.
export default defineConfig({
  plugins: [react()],
  base: "/app3/",
  server: {
    proxy: {
      // Dev only: stands in for Traefik (strip prefix + auth header).
      "/app3/api": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/app3/, ""),
        headers: { "x-auth-request-user": "testuser" },
      },
    },
  },
});