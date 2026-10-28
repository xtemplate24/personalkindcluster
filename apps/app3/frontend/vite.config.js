import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from the root of workout.xtemplate.cc, so the base path is "/".
export default defineConfig({
  plugins: [react()],
  base: "/",
});