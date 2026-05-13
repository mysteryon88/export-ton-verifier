import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "src/cli.js");
const templatesDir = path.join(repoRoot, "templates");

async function readTemplate(name) {
  return fs.readFile(path.join(templatesDir, name), "utf8");
}

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-test-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function importWrapper(destPath, args) {
  execFileSync(
    process.execPath,
    [cliPath, "import-wrapper", destPath, ...args, "--force"],
    { cwd: repoRoot, stdio: "pipe" },
  );
}

test("import-wrapper copies Func and Tolk Groth16 wrappers separately, with Tolk as the default", async () => {
  await withTempDir(async (tempDir) => {
    const funcDest = path.join(tempDir, "func.ts");
    const tolkDest = path.join(tempDir, "tolk.ts");
    const defaultDest = path.join(tempDir, "default.ts");

    importWrapper(funcDest, ["--groth16", "--func"]);
    importWrapper(tolkDest, ["--groth16", "--tolk"]);
    importWrapper(defaultDest, ["--groth16"]);

    const [funcWrapper, tolkWrapper, defaultWrapper] = await Promise.all([
      fs.readFile(funcDest, "utf8"),
      fs.readFile(tolkDest, "utf8"),
      fs.readFile(defaultDest, "utf8"),
    ]);

    assert.match(funcWrapper, /Dictionary/);
    assert.match(funcWrapper, /dictFromInputList/);
    assert.match(funcWrapper, /\.storeDict\(pubDict\)/);
    assert.doesNotMatch(funcWrapper, /TupleBuilder/);

    assert.match(tolkWrapper, /TupleBuilder/);
    assert.match(tolkWrapper, /serializeIntArray/);
    assert.match(tolkWrapper, /storeSlice\(pubInputs\.beginParse\(\)\)/);
    assert.match(tolkWrapper, /writeTuple\(this\.tupleFromInputList\(opts\.pubInputs\)\)/);
    assert.doesNotMatch(tolkWrapper, /\.storeDict\(/);

    assert.equal(defaultWrapper, tolkWrapper);
  });
});

test("import-wrapper defaults PLONK wrapper selection to Tolk and falls back to the generic wrapper", async () => {
  await withTempDir(async (tempDir) => {
    const destPath = path.join(tempDir, "plonk.ts");
    importWrapper(destPath, ["--plonk"]);

    const [copied, expected] = await Promise.all([
      fs.readFile(destPath, "utf8"),
      readTemplate("Verifier_plonk.ts"),
    ]);

    assert.equal(copied, expected);
  });
});

test("import-wrapper rejects Tact wrappers", async () => {
  await withTempDir(async (tempDir) => {
    const destPath = path.join(tempDir, "tact.ts");

    assert.throws(
      () => importWrapper(destPath, ["--groth16", "--tact"]),
      /TypeScript wrappers are not available for Tact/,
    );
  });
});
