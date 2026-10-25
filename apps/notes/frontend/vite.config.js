import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Served at the root of notes.xtemplate.cc.
  base: "/",
  server: {
    proxy: {
      // Only for `npm run dev` on your laptop: forwards API calls to a locally
      // running backend. In the cluster the ingress sends /api to the backend.
      "/api": {
        target: "http://localhost:8081",
        changeOrigin: true,
        // The backend expects oauth2-proxy's header; fake one user locally.
        headers: { "X-Auth-Request-User": "local-dev" },
      },
    },
  },
});
