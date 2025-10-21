import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    node: "src/image-plugin-node.ts",
    serverless: "src/image-plugin-serverless.ts",
  },
  minify: true,
  format: ["esm", "cjs"],
  dts: true,
  outDir: "dist",
});
