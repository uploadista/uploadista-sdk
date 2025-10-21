import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  minify: true,
  format: ["esm"],
  dts: true,
  outDir: "dist",
  external: ["react-native", "expo"],
});
