import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

async function readRepoFile(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

test("PLONK calldata helpers are exported for Func and Tolk layouts", async () => {
  const apiFiles = await Promise.all([
    readRepoFile("src/index.ts"),
    readRepoFile("index.d.ts"),
    readRepoFile("README.md"),
  ]);
  const buildConfig = await readRepoFile("tsup.config.mjs");

  for (const content of apiFiles) {
    assert.match(content, /exportPlonkFuncCalldata/);
    assert.match(content, /exportPlonkTolkCalldata/);
  }

  assert.match(buildConfig, /export_plonk_calldata/);
});
