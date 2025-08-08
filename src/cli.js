#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { generateVerifier } from "./lib.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printHelp() {
  console.log(`
Usage:
  export-ton-verifier <zkeyPath> <outputPath>

Description:
  Generates a Groth16 verifier for the TON blockchain from a Circom .zkey file
  using a provided EJS template.

Arguments:
  zkeyPath     Path to the .zkey file (required)
  outputPath   Path to save the generated verifier file (required)

Options:
  -h, --help   Show this help message and exit

Example:
  export-ton-verifier ./circuits/verifier.zkey ./verifier.fc
`);
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  if (args.length < 2) {
    console.error("❌ Missing required arguments.");
    printHelp();
    process.exit(1);
  }

  const [zkeyPath, outputPath] = args;
  const templatePath = path.join(__dirname, "./templates/func_verifier.ejs");

  // Проверяем, что файлы существуют
  if (!fileExists(zkeyPath)) {
    console.error(`❌ .zkey file not found: ${zkeyPath}`);
    process.exit(1);
  }
  if (!fileExists(templatePath)) {
    console.error(`❌ Template file not found: ${templatePath}`);
    process.exit(1);
  }

  try {
    await generateVerifier(zkeyPath, templatePath, outputPath);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
