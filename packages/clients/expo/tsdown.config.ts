import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  minify: true,
  format: ["esm"],
  dts: true,
  outDir: "dist",
  deps: {
    neverBundle: ["react-native", "expo"],
  },
});
