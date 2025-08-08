#!/usr/bin/env node
import path from "path";
import { fileURLToPath } from "url";
import { generateVerifier } from "./lib.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const zkeyPath = process.argv[2] || path.join(__dirname, "./verifier.zkey");
const templatePath = path.join(__dirname, "./templates/func_verifier.ejs");
const outputPath = process.argv[3] || path.join(__dirname, "./verifier.fc");

generateVerifier(zkeyPath, templatePath, outputPath).catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
