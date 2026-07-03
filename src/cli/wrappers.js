import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { CliUsageError } from "./errors.js";

export function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

export async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

export async function copyWrapper(
  wrapperSrc,
  destPath,
  { force = false, stdout = process.stdout } = {},
) {
  if (!destPath) throw new CliUsageError("Missing <destPath> for wrapper copy.");

  let stat = null;
  try {
    stat = await fsp.stat(destPath);
  } catch {}

  let finalDest = destPath;
  if (stat?.isDirectory() || hasTrailingPathSeparator(destPath)) {
    await ensureDir(destPath);
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
  stdout.write(`Wrapper copied to: ${finalDest}\n`);
}

function hasTrailingPathSeparator(destPath) {
  return /[\\/]$/.test(destPath);
}

function wrapperTemplateCandidates(lang, protocol) {
  switch (protocol) {
    case "groth16":
    case "plonk":
      return [`Verifier_${lang}_${protocol}.ts`, `Verifier_${protocol}.ts`];
    default:
      throw new CliUsageError(`Unknown protocol for wrapper: ${protocol}`);
  }
}

export function resolveWrapperTemplate(templatesDir, lang, protocol) {
  if (lang === "tact") {
    throw new CliUsageError("TypeScript wrappers are not available for Tact.");
  }

  for (const file of wrapperTemplateCandidates(lang, protocol)) {
    const fullPath = path.join(templatesDir, file);
    if (fileExists(fullPath)) {
      return fullPath;
    }
  }

  throw new CliUsageError(
    `Wrapper template not found for language '${lang}' and protocol '${protocol}'.`,
  );
}
