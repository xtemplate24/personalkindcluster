import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Must match the ingress path (/app3). Traefik strips "/app3" before the pod sees it.
export default defineConfig({
  plugins: [react()],
  base: "/app3/",
});