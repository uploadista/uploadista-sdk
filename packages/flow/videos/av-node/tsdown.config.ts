import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  minify: true,
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
  // Target ES2022 to transpile 'await using' (explicit resource management)
  // which is not supported in Node.js 22 without special handling
  target: "es2022",
  external: [
    // node-av is a native addon and cannot be bundled
    "node-av",
    "node-av/constants",
    "node-av/api",
  ],
});
