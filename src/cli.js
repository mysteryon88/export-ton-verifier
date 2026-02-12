#!/usr/bin/env node
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { generateVerifier } from "./generateVerifiers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function printHelp() {
  console.log(`
Usage:
  export-ton-verifier <zkeyPath> <outputPath> [--func | --tolk | --tact] [--wrapper-dest <destPath>] [--groth16 | --plonk] [--vk] [--force]
  export-ton-verifier import-wrapper <destPath> [--groth16 | --plonk] [--force]

Description:
  1) Generates a TON verifier smart contract from a Circom .zkey file (or verification_key.json with --vk).
     Protocol (Groth16/PLONK) is auto-detected from the .zkey.
  2) (Optional) Can also copy a TypeScript wrapper template to your project.
     Wrapper selection supports protocol-specific files.

Notes:
  • With --vk, input is treated as verification_key.json (Groth16 only).
  • If language is Tact (--tact), wrapper copy is skipped even if --wrapper-dest is provided.

Arguments:
  zkeyPath        Path to the .zkey file (or verification_key.json with --vk)
  outputPath      Path to save the generated verifier file

Subcommands:
  import-wrapper  Copies a protocol-specific wrapper to <destPath> (file or directory).
                  If <destPath> is a directory, the file will be saved as <destPath>/Verifier.ts.
                  Requires one of --groth16 or --plonk.

Options:
  -h, --help                Show this help message and exit
  --func                    Use FunC language template for the verifier [default]
  --tolk                    Use Tolk language template for the verifier
  --tact                    Use Tact language template for the verifier
  --wrapper-dest <destPath> After generation, copy a protocol-specific TypeScript wrapper to <destPath>
  --groth16                 Protocol hint for wrapper selection (wrapper only; verifier protocol is auto-detected)
  --plonk                   Protocol hint for wrapper selection (wrapper only; verifier protocol is auto-detected)
  --vk                      Force treat <inputPath> as verification_key.json (Groth16 only)
  --force                   Overwrite existing file when used with 'import-wrapper' or '--wrapper-dest'

Examples:
  # Generate FunC verifier from .zkey (default language)
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc

  # Generate from verification_key.json
  npx export-ton-verifier ./circuits/verification_key.json ./verifier.fc --vk

  # Generate Tolk verifier
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tolk --tolk

  # Generate Tact verifier
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tact --tact --wrapper-dest ./wrappers/

  # Generate and also drop a wrapper (auto-detect protocol from .zkey)
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc --wrapper-dest ./wrappers/ --force

  # Only copy the TypeScript wrapper (protocol required here)
  npx export-ton-verifier import-wrapper ./wrappers/ --plonk --force
`);
}

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function copyWrapper(wrapperSrc, destPath, { force = false } = {}) {
  if (!destPath) throw new Error("Missing <destPath> for wrapper copy.");

  let stat = null;
  try {
    stat = await fsp.stat(destPath);
  } catch {}

  let finalDest = destPath;
  if (stat?.isDirectory()) {
    finalDest = path.join(destPath, "Verifier.ts");
  } else {
    await ensureDir(path.dirname(destPath));
  }

  if (fileExists(finalDest) && !force) {
    throw new Error(
      `Wrapper already exists: ${finalDest}. Use --force to overwrite.`,
    );
  }

  const content = await fsp.readFile(wrapperSrc);
  await fsp.writeFile(finalDest, content);
  console.log(`✅ Wrapper copied to: ${finalDest}`);
}

function parseLangFlag(args) {
  const allowed = ["--func", "--tolk", "--tact"];
  const chosen = allowed.filter((f) => args.includes(f));
  if (chosen.length > 1) {
    console.error("❌ Use only one of --func, --tolk, --tact.");
    process.exit(1);
  }
  if (chosen.length === 0) return "func";
  return chosen[0].slice(2);
}

function parseProtocolFlag(args, { required = false } = {}) {
  const isGroth = args.includes("--groth16");
  const isPlonk = args.includes("--plonk");
  if (isGroth && isPlonk) {
    console.error("❌ Use only one of --groth16 or --plonk.");
    process.exit(1);
  }
  if (!isGroth && !isPlonk) {
    if (required) {
      console.error("❌ Missing protocol flag: use --groth16 or --plonk.");
      process.exit(1);
    }
    return null;
  }
  return isGroth ? "groth16" : "plonk";
}

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;
  const val = args[idx + 1];
  if (!val || val.startsWith("--")) {
    console.error(`❌ Missing value for ${flag}.`);
    process.exit(1);
  }
  return val;
}

function wrapperFileForProtocol(protocol) {
  switch (protocol) {
    case "groth16":
      return "Verifier_groth16.ts";
    case "plonk":
      return "Verifier_plonk.ts";
    default:
      console.error(`❌ Unknown protocol for wrapper: ${protocol}`);
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

    const protocol = parseProtocolFlag(args, { required: true });
    const force = args.includes("--force");
    const wrapperFile = wrapperFileForProtocol(protocol);
    const wrapperSrc = path.join(__dirname, "../templates", wrapperFile);

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
  if (positional.length < 2) {
    console.error("❌ Missing required arguments.");
    printHelp();
    process.exit(1);
  }

  const [zkeyPath, outputPath] = positional;
  const lang = parseLangFlag(args);
  const forceJson = args.includes("--vk");
  const wrapperDest = getFlagValue(args, "--wrapper-dest");
  const force = args.includes("--force");

  if (!fileExists(zkeyPath)) {
    console.error(`❌ Input file not found: ${zkeyPath}`);
    process.exit(1);
  }

  const templatesDir = path.join(__dirname, "../templates");

  try {
    const detectedProtocol = await generateVerifier(zkeyPath, outputPath, {
      lang,
      templatesDir,
      forceJson,
    });

    if (wrapperDest) {
      if (lang === "tact") {
        console.log(
          "ℹ️ Tact selected — wrapper copy is skipped even though --wrapper-dest was provided.",
        );
      } else {
        const protocol =
          parseProtocolFlag(args, { required: false }) || detectedProtocol;
        const wrapperFile = wrapperFileForProtocol(protocol);
        const wrapperSrc = path.join(templatesDir, wrapperFile);

        if (!fileExists(wrapperSrc)) {
          console.error(`❌ Wrapper template not found: ${wrapperSrc}`);
          process.exit(1);
        }
        await copyWrapper(wrapperSrc, wrapperDest, { force });
      }
    }
  } catch (err) {
    console.error("❌ Error:", err?.message || err);
    process.exit(1);
  }
}

main();
