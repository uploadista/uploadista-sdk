import { defineConfig } from "tsdown";
import Vue from "unplugin-vue/rolldown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "composables/index": "src/composables/index.ts",
    "components/index": "src/components/index.ts",
    "providers/index": "src/providers/index.ts",
    "utils/index": "src/utils/index.ts",
  },
  platform: "neutral",
  minify: true,
  format: ["esm"],
  plugins: [Vue({ isProduction: true })],
  dts: { vue: true },
  outDir: "dist",
  external: ["vue"],
  fixedExtension: true,
});
