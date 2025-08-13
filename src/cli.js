#!/usr/bin/env node

import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { generateVerifier } from "./generateVerifier.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printHelp() {
  console.log(`
Usage:
  export-ton-verifier <zkeyPath> <outputPath> [--func | --tolk | --tact] [--wrapper-dest <destPath>] [--force]
  export-ton-verifier import-wrapper <destPath> [--force]

Description:
  1) Generates a Groth16 verifier for the TON blockchain from a Circom .zkey file
  2) (Optional) Can also copy a TypeScript wrapper template (templates/Verifier.ts)
     to your project. By default, the wrapper is NOT imported anywhere; you decide
     its destination and handle imports yourself.

Arguments:
  zkeyPath        Path to the .zkey file (required for main command)
  outputPath      Path to save the generated verifier file (required for main command)

Subcommands:
  import-wrapper  Copies templates/Verifier.ts to <destPath> (file or directory).
                  If <destPath> is a directory, the file will be saved as <destPath>/Verifier.ts.

Options:
  -h, --help                Show this help message and exit
  --func                    Use FunC template (templates/func_verifier.ejs) [default]
  --tolk                    Use Tolk template (templates/tolk_verifier.ejs)
  --tact                    Use Tact template (templates/tact_verifier.ejs)
  --wrapper-dest <destPath> Copy the TypeScript wrapper (templates/Verifier.ts) to <destPath> after generation
  --force                   Overwrite existing file when used with 'import-wrapper' or '--wrapper-dest'

Examples:
  # Just generate FunC verifier from .zkey (default template)
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc

  # Generate Tolk verifier
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tolk --tolk

  # Generate Tact verifier
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tact --tact

  # Generate and also drop the TypeScript wrapper into ./wrappers/
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc --func --wrapper-dest ./wrappers/ --force

  # Only copy the TypeScript wrapper
  npx export-ton-verifier import-wrapper ./wrappers/Verifier.ts --force
`);
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function copyWrapper(wrapperSrc, destPath, { force = false } = {}) {
  let stat = null;
  try {
    stat = await fsp.stat(destPath);
  } catch {}
  let finalDest = destPath;

  if (stat?.isDirectory()) {
    finalDest = path.join(destPath, "Verifier.ts");
  } else {
    const parent = path.dirname(destPath);
    await ensureDir(parent);
  }

  const exists = fileExists(finalDest);
  if (exists && !force) {
    throw new Error(
      `Wrapper already exists: ${finalDest}. Use --force to overwrite.`
    );
  }

  const content = await fsp.readFile(wrapperSrc);
  await fsp.writeFile(finalDest, content);
  console.log(`✅ Wrapper copied to: ${finalDest}`);
}

function parseTemplateFlag(args) {
  const allowed = ["--func", "--tolk", "--tact"];
  const chosen = allowed.filter((f) => args.includes(f));
  if (chosen.length > 1) {
    console.error(
      "❌ You cannot use more than one of --func, --tolk, --tact at the same time."
    );
    process.exit(1);
  }
  if (chosen.length === 0) return "func"; // default
  // strip leading "--"
  return chosen[0].slice(2); // 'func' | 'tolk' | 'tact'
}

function templateFileFor(lang) {
  switch (lang) {
    case "func":
      return "func_verifier.ejs";
    case "tolk":
      return "tolk_verifier.ejs";
    case "tact":
      return "tact_verifier.ejs";
    default:
      console.error(`❌ Unknown template language: ${lang}`);
      process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    printHelp();
    process.exit(0);
  }

  // Subcommand: import-wrapper
  if (args[0] === "import-wrapper") {
    const destPath = args[1];
    if (!destPath) {
      console.error("❌ Missing <destPath> for 'import-wrapper'.");
      printHelp();
      process.exit(1);
    }
    const force = args.includes("--force");
    const wrapperSrc = path.join(__dirname, "./templates/Verifier.ts");

    if (!fileExists(wrapperSrc)) {
      console.error(`❌ Wrapper template not found: ${wrapperSrc}`);
      process.exit(1);
    }

    try {
      await copyWrapper(wrapperSrc, destPath, { force });
      process.exit(0);
    } catch (err) {
      console.error("❌ Error:", err.message || err);
      process.exit(1);
    }
  }

  // Main command
  const positional = args.filter((a) => !a.startsWith("--"));
  const flags = args.filter((a) => a.startsWith("--"));

  if (positional.length < 2) {
    console.error("❌ Missing required arguments.");
    printHelp();
    process.exit(1);
  }

  const [zkeyPath, outputPath] = positional;

  const lang = parseTemplateFlag(flags); // 'func' | 'tolk' | 'tact'
  const templateFilename = templateFileFor(lang);
  const templatePath = path.join(__dirname, `../templates/${templateFilename}`);

  const wrapperDestIndex = flags.indexOf("--wrapper-dest");
  const force = flags.includes("--force");
  const wrapperDest =
    wrapperDestIndex >= 0 ? args[args.indexOf("--wrapper-dest") + 1] : null;

  if (!fileExists(zkeyPath)) {
    console.error(`❌ .zkey file not found: ${zkeyPath}`);
    process.exit(1);
  }
  if (!fileExists(templatePath)) {
    console.error(`❌ Template file not found: ${templatePath}`);
    console.error(
      `   Make sure ${templateFilename} exists in ./templates (relative to this CLI).`
    );
    process.exit(1);
  }

  try {
    await generateVerifier(zkeyPath, templatePath, outputPath);

    if (wrapperDest) {
      const wrapperSrc = path.join(__dirname, "./templates/Verifier.ts");
      if (!fileExists(wrapperSrc)) {
        console.error(`❌ Wrapper template not found: ${wrapperSrc}`);
        process.exit(1);
      }
      await copyWrapper(wrapperSrc, wrapperDest, { force });
    }
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
}

main();
