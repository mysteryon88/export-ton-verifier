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
    assert.doesNotMatch(funcWrapper, /queryID/);
    assert.doesNotMatch(tolkWrapper, /queryID/);

    assert.equal(defaultWrapper, tolkWrapper);
  });
});

test("import-wrapper defaults PLONK wrapper selection to the Tolk PLONK wrapper", async () => {
  await withTempDir(async (tempDir) => {
    const destPath = path.join(tempDir, "plonk.ts");
    importWrapper(destPath, ["--plonk"]);

    const [copied, expected] = await Promise.all([
      fs.readFile(destPath, "utf8"),
      readTemplate("Verifier_tolk_plonk.ts"),
    ]);

    assert.equal(copied, expected);
  });
});

test("import-wrapper accepts protocol flags before the destination path", async () => {
  await withTempDir(async (tempDir) => {
    const destPath = path.join(tempDir, "Verifier.ts");

    execFileSync(
      process.execPath,
      [cliPath, "import-wrapper", "--groth16", destPath, "--force"],
      { cwd: repoRoot, stdio: "pipe" },
    );

    const [copied, expected] = await Promise.all([
      fs.readFile(destPath, "utf8"),
      readTemplate("Verifier_tolk_groth16.ts"),
    ]);

    assert.equal(copied, expected);
  });
});

test("import-wrapper treats trailing slash destinations as directories", async () => {
  await withTempDir(async (tempDir) => {
    const destDir = path.join(tempDir, "wrappers");
    importWrapper(`${destDir}${path.sep}`, ["--groth16"]);

    const [copied, expected] = await Promise.all([
      fs.readFile(path.join(destDir, "Verifier.ts"), "utf8"),
      readTemplate("Verifier_tolk_groth16.ts"),
    ]);
    const stat = await fs.stat(destDir);

    assert.equal(copied, expected);
    assert.equal(stat.isDirectory(), true);
  });
});

test("import-wrapper copies the Func-specific PLONK wrapper for Func", async () => {
  await withTempDir(async (tempDir) => {
    const destPath = path.join(tempDir, "plonk-func.ts");
    importWrapper(destPath, ["--plonk", "--func"]);

    const [copied, expected] = await Promise.all([
      fs.readFile(destPath, "utf8"),
      readTemplate("Verifier_func_plonk.ts"),
    ]);

    assert.equal(copied, expected);
    assert.match(copied, /proofMessageToCell/);
    assert.match(copied, /sendVerify/);
    assert.doesNotMatch(copied, /TupleBuilder/);
    assert.doesNotMatch(copied, /serializeUint256Array/);
  });
});

test("PLONK wrappers keep Func and Tolk public input layouts separate", async () => {
  const [funcWrapper, tolkWrapper] = await Promise.all([
    readTemplate("Verifier_func_plonk.ts"),
    readTemplate("Verifier_tolk_plonk.ts"),
  ]);

  assert.match(funcWrapper, /getVerify\(provider: ContractProvider, args: TupleItem\[\]\)/);
  assert.doesNotMatch(funcWrapper, /Dictionary/);
  assert.match(funcWrapper, /proofMessageToCell/);
  assert.match(funcWrapper, /sendVerify/);

  assert.match(tolkWrapper, /proofMessageToCell/);
  assert.match(tolkWrapper, /requirePublicInputTuple/);
  assert.doesNotMatch(tolkWrapper, /Dictionary/);
  assert.doesNotMatch(tolkWrapper, /requireContiguousPublicInputs/);
  assert.doesNotMatch(tolkWrapper, /replacePublicInputsWithTuple/);
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
