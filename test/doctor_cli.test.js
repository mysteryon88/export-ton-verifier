import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { utils } from "ffjavascript";
import { getCurveFromName } from "../src/utils.js";

const { stringifyBigInts } = utils;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "src/cli.js");

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-doctor-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function writeGroth16JsonVk(filePath, curveName, nPublic = 1) {
  const curve = await getCurveFromName(curveName);
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const vk = stringifyBigInts({
      protocol: "groth16",
      curve: curveName,
      vk_alpha_1: g1,
      vk_beta_2: g2,
      vk_gamma_2: g2,
      vk_delta_2: g2,
      IC: Array.from({ length: nPublic + 1 }, () => g1),
    });
    await fs.writeFile(filePath, JSON.stringify(vk), "utf8");
  } finally {
    await curve.terminate();
  }
}

function runCli(args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
  });
}

function runCliFailure(args) {
  try {
    runCli(args);
    throw new Error(`CLI unexpectedly succeeded: ${args.join(" ")}`);
  } catch (err) {
    if (err instanceof Error && !("status" in err)) throw err;
    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

test("doctor reports OK for a supported BLS Groth16 Tolk verifier", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "verification_key.json");
    await writeGroth16JsonVk(inputPath, "bls12381", 1);

    const output = runCli(["doctor", inputPath, "--tolk"]);

    assert.match(output, /Verifier doctor: OK/);
    assert.match(output, /Source format: snarkjs-json/);
    assert.match(output, /Protocol: groth16/);
    assert.match(output, /Curve: bls12381/);
    assert.match(output, /Public inputs: 1/);
    assert.match(output, /Language: tolk/);
  });
});

test("doctor JSON blocks non-BLS TON verifier generation", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "verification_key.json");
    await writeGroth16JsonVk(inputPath, "bn128", 1);

    const result = runCliFailure(["doctor", inputPath, "--json"]);

    assert.notEqual(result.status, 0);
    const report = JSON.parse(result.stdout);
    assert.equal(report.ok, false);
    assert.equal(report.protocol, "groth16");
    assert.equal(report.curve, "bn128");
    assert.equal(report.nPublic, 1);
    assert.ok(
      report.checks.some(
        (check) => check.name === "curve" && check.ok === false,
      ),
    );
  });
});

test("doctor accepts flags before the input path", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "verification_key.json");
    await writeGroth16JsonVk(inputPath, "bls12381", 1);

    const output = runCli(["doctor", "--json", inputPath]);
    const report = JSON.parse(output);

    assert.equal(report.ok, true);
    assert.equal(report.protocol, "groth16");
    assert.equal(report.curve, "bls12381");
  });
});

test("doctor JSON blocks incomplete snarkjs verification keys", async () => {
  await withTempDir(async (tempDir) => {
    const cases = [
      {
        name: "groth16",
        value: { protocol: "groth16", curve: "bls12381" },
        missingField: "vk_alpha_1",
      },
      {
        name: "plonk",
        value: { protocol: "plonk", curve: "bls12381", nPublic: 1 },
        missingField: "power",
      },
    ];

    for (const item of cases) {
      const inputPath = path.join(tempDir, `${item.name}.json`);
      await fs.writeFile(inputPath, JSON.stringify(item.value), "utf8");

      const result = runCliFailure(["doctor", inputPath, "--json"]);

      assert.notEqual(result.status, 0);
      const report = JSON.parse(result.stdout);
      assert.equal(report.ok, false);
      assert.match(report.error, new RegExp(item.missingField));
    }
  });
});

test("inspectVerifierInput exposes stable doctor fields for library consumers", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "verification_key.json");
    await writeGroth16JsonVk(inputPath, "bls12381", 2);
    const { inspectVerifierInput } = await import("../src/artifactInfo.js");

    const report = await inspectVerifierInput(inputPath, { lang: "func" });

    assert.equal(report.ok, true);
    assert.equal(report.sourceFormat, "snarkjs-json");
    assert.equal(report.protocol, "groth16");
    assert.equal(report.curve, "bls12381");
    assert.equal(report.nPublic, 2);
    assert.equal(report.language, "func");
    assert.match(report.template, /func_verifier_groth16\.ejs$/);
  });
});
