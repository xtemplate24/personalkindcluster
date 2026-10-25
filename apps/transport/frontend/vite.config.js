import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Served at the root of transport.xtemplate.cc.
  base: "/",
  server: {
    proxy: {
      // Convenience for `npm run dev` outside the cluster: forwards API calls
      // to a locally-running backend (PORT=8081 node server.js). In the
      // cluster, Express (server.js) does this via BACKEND_URL instead.
      "/api": { target: "http://localhost:8081", changeOrigin: true },
    },
  },
});
