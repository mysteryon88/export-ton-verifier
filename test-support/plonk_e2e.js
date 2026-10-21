// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { buildBls12381 } from "ffjavascript";
import * as snarkjs from "snarkjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const circuitPath = path.join(repoRoot, "test", "circuits", "condition.circom");
const requiredFiles = [
  "condition_js/condition.wasm",
  "condition_0000.zkey",
  "verification_key.json",
];

async function requireArtifacts(directory) {
  for (const file of requiredFiles) {
    const artifact = await fs.stat(path.join(directory, file));
    if (!artifact.isFile() || artifact.size === 0) {
      throw new Error(`PLONK E2E artifact is empty or not a file: ${file}`);
    }
  }
}

function compileCircuit(outputDir) {
  const relative = (value) => path.relative(repoRoot, value).split(path.sep).join("/");
  const args = [relative(circuitPath), "--r1cs", "--wasm", "--prime", "bls12381", "--output", relative(outputDir)];
  const options = { cwd: repoRoot, encoding: "utf8", timeout: 90_000 };
  let result = spawnSync("circom", args, options);
  if (result.error?.code === "ENOENT" && process.platform === "win32") {
    result = spawnSync("wsl.exe", [
      "--cd", repoRoot, "--exec", "bash", "-lc",
      'exec timeout --signal=TERM --kill-after=5s 60s circom "$@"', "circom", ...args,
    ], options);
  }
  if (result.error || result.status !== 0) {
    throw new Error(`Circom is required to generate PLONK E2E artifacts: ${result.error?.message || result.stderr || result.stdout}`);
  }
}

export async function ensurePlonkE2EArtifacts() {
  if (process.env.PLONK_E2E_DIR) {
    const directory = path.resolve(process.env.PLONK_E2E_DIR);
    await requireArtifacts(directory);
    return directory;
  }

  const fingerprint = createHash("sha256");
  for (const file of [circuitPath, fileURLToPath(import.meta.url), path.join(repoRoot, "package-lock.json")]) {
    fingerprint.update(await fs.readFile(file));
  }
  const expected = fingerprint.digest("hex");
  const directory = path.join(repoRoot, "build", "plonk-e2e", expected);
  try {
    await requireArtifacts(directory);
    return directory;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  await fs.mkdir(path.dirname(directory), { recursive: true });
  const temporary = await fs.mkdtemp(path.join(path.dirname(directory), ".plonk-e2e-"));
  let curve;
  try {
    console.log("Generating local BLS12-381 PLONK E2E artifacts (test-only setup).");
    compileCircuit(temporary);
    curve = await buildBls12381();
    const initial = path.join(temporary, "initial.ptau");
    const contributed = path.join(temporary, "contributed.ptau");
    const prepared = path.join(temporary, "prepared.ptau");
    // Test-only local ceremony; these parameters must not be used in production.
    await snarkjs.powersOfTau.newAccumulator(curve, 5, initial);
    await snarkjs.powersOfTau.contribute(initial, contributed, "PLONK E2E test", "export-ton-verifier test fixture");
    await snarkjs.powersOfTau.preparePhase2(contributed, prepared);
    const zkey = path.join(temporary, "condition_0000.zkey");
    if (await snarkjs.plonk.setup(path.join(temporary, "condition.r1cs"), prepared, zkey) === -1) {
      throw new Error("PLONK E2E circuit setup failed.");
    }
    const verificationKey = await snarkjs.zKey.exportVerificationKey(zkey);
    await fs.writeFile(path.join(temporary, "verification_key.json"), JSON.stringify(verificationKey, null, 2));
    await requireArtifacts(temporary);
    for (const file of [initial, contributed, prepared]) await fs.rm(file);
    try {
      await fs.rename(temporary, directory);
    } catch (error) {
      if (error.code !== "EEXIST" && error.code !== "ENOTEMPTY") throw error;
      await requireArtifacts(directory);
    }
  } finally {
    await curve?.terminate();
    await fs.rm(temporary, { recursive: true, force: true });
  }
  return directory;
}
