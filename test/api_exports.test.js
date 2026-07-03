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
    readRepoFile("README.md"),
  ]);
  const buildConfig = await readRepoFile("tsup.config.mjs");
  const packageJson = JSON.parse(await readRepoFile("package.json"));

  for (const content of apiFiles) {
    assert.match(content, /exportPlonkFuncCalldata/);
    assert.match(content, /exportPlonkTolkCalldata/);
    assert.match(content, /inspectVerifierInput/);
    assert.match(content, /proofToMessageBoc/);
    assert.match(content, /MAX_PLONK_PUBLIC_INPUTS/);
  }

  assert.match(buildConfig, /export_plonk_calldata/);
  assert.equal(packageJson.dependencies["@iden3/binfileutils"], "0.0.12");
  assert.equal(packageJson.scripts.build, "tsup");
  assert.equal(packageJson.scripts["pack:local"], "npm pack");
  assert.equal(packageJson.scripts.prepack, "npm run build");
  assert.equal(packageJson.types, "./dist/index.d.ts");
  assert.equal(packageJson.exports["."].import.types, "./dist/index.d.ts");
  assert.equal(packageJson.exports["."].require.types, "./dist/index.d.cts");

  const rootTypesPath = path.join(repoRoot, "index.d.ts");
  await assert.rejects(
    fs.access(rootTypesPath),
    (err) => err?.code === "ENOENT",
  );

  const indexSource = await readRepoFile("src/index.ts");
  assert.doesNotMatch(indexSource, /proof:\s*any/);
  assert.doesNotMatch(indexSource, /publicSignals:\s*any/);
});

test("input dictionary helper does not rely on TypeScript ignore comments", async () => {
  const content = await readRepoFile("src/dictFromInputList.ts");

  assert.doesNotMatch(content, /@ts-ignore/);
  assert.doesNotMatch(content, /@ts-expect-error/);
});
