import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: ["src/index.ts"],
    format: ["esm", "cjs"],
    outDir: "dist",
    clean: true,
    dts: {
      compilerOptions: {
        allowJs: true,
        checkJs: false,
        ignoreDeprecations: "6.0",
        noImplicitAny: false,
      },
    },
  },
  {
    entry: [
      "src/cli.js",
      "src/generateVerifiers.js",
      "src/export_plonk_vk.js",
      "src/export_plonk_calldata.js",
      "src/export_plonk_func_calldata.js",
      "src/artifactInfo.js",
      "src/proofMessages.js",
      "src/limits.js",
      "src/templateResolver.js",
      "src/helpers.js",
      "src/curves.js",
      "src/utils.js",
      "src/groth16CompressProof.js",
    ],
    format: ["esm"],
    outDir: "dist",
    clean: false,
    dts: false,
  },
]);
