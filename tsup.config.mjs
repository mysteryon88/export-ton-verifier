import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    outDir: "dist",
    clean: true,
    dts: true,
  },
  {
    entry: ["src/cli.js"],
    format: ["esm"],
    outDir: "dist",
    clean: false,
    dts: false,
  },
]);
