import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "components/index": "src/components/index.tsx",
    "hooks/index": "src/hooks/index.ts",
  },
  minify: true,
  format: ["esm"],
  dts: true,
  outDir: "dist",
  external: ["react", "react-dom"],
});
