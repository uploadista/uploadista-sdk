import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  minify: true,
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  external: [
    // node-av is a native addon and cannot be bundled
    "node-av",
    "node-av/constants",
    "node-av/api",
  ],
});
