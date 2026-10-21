import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { ensurePlonkE2EArtifacts } from "../test-support/plonk_e2e.js";

test("PLONK E2E artifacts are complete, use BLS12-381, and are reused", async () => {
  const directory = await ensurePlonkE2EArtifacts();
  const keyPath = path.join(directory, "verification_key.json");
  const verificationKey = JSON.parse(await fs.readFile(keyPath, "utf8"));
  assert.equal(verificationKey.protocol, "plonk");
  assert.equal(verificationKey.curve, "bls12381");
  for (const file of ["condition_js/condition.wasm", "condition_0000.zkey"]) {
    assert.ok((await fs.stat(path.join(directory, file))).size > 0);
  }
  const modified = (await fs.stat(keyPath)).mtimeMs;
  assert.equal(await ensurePlonkE2EArtifacts(), directory);
  assert.equal((await fs.stat(keyPath)).mtimeMs, modified);
});

test("PLONK E2E fails on missing external artifacts without overwriting them", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "plonk-e2e-external-"));
  const previous = process.env.PLONK_E2E_DIR;
  try {
    process.env.PLONK_E2E_DIR = directory;
    await assert.rejects(ensurePlonkE2EArtifacts(), { code: "ENOENT" });
    assert.deepEqual(await fs.readdir(directory), []);
  } finally {
    if (previous === undefined) delete process.env.PLONK_E2E_DIR;
    else process.env.PLONK_E2E_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  }
});
