import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "types/index": "src/types/index.ts",
  },
  minify: true,
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
});
