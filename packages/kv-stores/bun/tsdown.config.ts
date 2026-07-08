import { defineConfig } from "tsdown";

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  minify: true,
  format: ["esm", "cjs"],
  dts: true,
  // `bun` is a runtime built-in. Its `RedisClient` type is only exposed via a
  // `declare module "bun"` augmentation reached through a triple-slash reference,
  // which the rolldown dts bundler doesn't follow (it resolves to the bare
  // @types/bun/index.d.ts and reports RedisClient as a missing export). Keeping
  // `bun` external leaves the type import untouched in the emitted declarations.
  deps: { neverBundle: ["bun"] },
  outDir: "dist",
});
