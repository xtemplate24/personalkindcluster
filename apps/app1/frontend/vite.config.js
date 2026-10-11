import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // This MUST match the ingress path (app-deployments/app1/frontend/ingress.yaml
  // routes /app1 here). Vite bakes this into every built <script>/<link> src,
  // so the browser requests /app1/assets/..., which matches the ingress rule;
  // Traefik's StripPrefix middleware then strips "/app1" before it reaches
  // the pod, where Express serves the same file at its root-relative path.
  base: "/",
  server: {
    proxy: {
      // Convenience for `npm run dev` outside the cluster: forwards API
      // calls to a locally-running backend. Not used in production —
      // there, Express (server.js) does this proxy via BACKEND_URL.
      "/app1/api": {
        target: "http://localhost:8081",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/app1/, ""),
      },
    },
  },
});
