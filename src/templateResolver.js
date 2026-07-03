import path from "path";
import { createRequire } from "module";

const PACKAGE_NAME = "export-ton-verifier";

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

export function defaultTemplatesDir() {
  const packageRoot =
    resolvePackageRootFromSelfReference() ??
    resolvePackageRootFromModuleDir() ??
    process.cwd();

  return path.join(packageRoot, "templates");
}
