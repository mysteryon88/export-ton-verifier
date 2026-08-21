// SPDX-License-Identifier: GPL-3.0-or-later
import path from "path";
import { createRequire } from "module";
import { existsSync } from "fs";

const PACKAGE_NAME = "export-ton-verifier";
const INITIAL_CWD = process.cwd();

function packageRootFromDirectory(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (
      existsSync(path.join(current, "package.json")) &&
      existsSync(path.join(current, "templates"))
    ) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function requireBases() {
  const bases = [];

  if (typeof __filename === "string") {
    bases.push(__filename);
  }
  if (process.argv[1]) {
    bases.push(path.resolve(process.argv[1]));
  }

  bases.push(path.join(process.cwd(), "__export_ton_verifier_resolver__.js"));
  return [...new Set(bases)];
}

function packageRootFromResolvedEntry(entryPath) {
  const dir = path.dirname(entryPath);
  return path.basename(dir) === "dist" ? path.dirname(dir) : dir;
}

function resolvePackageRootFromSelfReference() {
  for (const base of requireBases()) {
    try {
      return packageRootFromResolvedEntry(
        createRequire(base).resolve(PACKAGE_NAME),
      );
    } catch {}
  }

  return null;
}

function resolvePackageRootFromModuleDir() {
  if (typeof __dirname !== "string") return null;

  if (path.basename(__dirname) === "dist" || path.basename(__dirname) === "src") {
    return path.dirname(__dirname);
  }

  return __dirname;
}

function resolvePackageRootFromEntrypoint() {
  if (!process.argv[1]) return null;
  return packageRootFromDirectory(path.dirname(path.resolve(process.argv[1])));
}

export function defaultTemplatesDir() {
  const packageRoot =
    resolvePackageRootFromSelfReference() ??
    resolvePackageRootFromModuleDir() ??
    resolvePackageRootFromEntrypoint() ??
    packageRootFromDirectory(INITIAL_CWD) ??
    process.cwd();

  return path.join(packageRoot, "templates");
}
