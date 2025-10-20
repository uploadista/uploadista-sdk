import tailwindcss from "@tailwindcss/vite";
import vue from "@vitejs/plugin-vue";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 5174,
    open: true,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});
