import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"], // один вход
  format: ["cjs"],
  outDir: "dist-cjs",
  clean: true,
});
