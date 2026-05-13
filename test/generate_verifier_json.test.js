import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { utils } from "ffjavascript";
import { generateVerifier } from "../src/generateVerifiers.js";
import { getCurveFromName } from "../src/utils.js";

const { stringifyBigInts } = utils;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const templatesDir = path.join(repoRoot, "templates");

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-json-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function writeGroth16JsonVk(filePath, nPublic = 2) {
  const curve = await getCurveFromName("bn128");

  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const vk = stringifyBigInts({
      protocol: "groth16",
      curve: "bn128",
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

async function writePlonkJsonVk(filePath, nPublic = 1) {
  const curve = await getCurveFromName("bls12381");

  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const vk = stringifyBigInts({
      protocol: "plonk",
      curve: "bls12381",
      nPublic,
      power: 4,
      k1: 2n,
      k2: 3n,
      Qm: g1,
      Ql: g1,
      Qr: g1,
      Qo: g1,
      Qc: g1,
      S1: g1,
      S2: g1,
      S3: g1,
      X_2: g2,
      w: 13n,
    });

    await fs.writeFile(filePath, JSON.stringify(vk), "utf8");
  } finally {
    await curve.terminate();
  }
}

test("generateVerifier renders the Tolk Groth16 template by default for JSON inputs", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "verification_key.json");
    const outputPath = path.join(tempDir, "verifier.tolk");

    await writeGroth16JsonVk(inputPath, 2);

    const originalLog = console.log;
    let protocol;
    console.log = () => {};

    try {
      protocol = await generateVerifier(inputPath, outputPath, {
        templatesDir,
      });
    } finally {
      console.log = originalLog;
    }

    const rendered = await fs.readFile(outputPath, "utf8");

    assert.equal(protocol, "groth16");
    assert.match(rendered, /const IC0: slice/);
    assert.match(rendered, /struct \(0x3b3cca17\) Verify \{/);
    assert.match(rendered, /pubInputs: RemainingBitsAndRefs/);
    assert.match(rendered, /\.hexToSlice\(\)/);
    assert.match(rendered, /pubInputs\.get\(1\)/);
    assert.match(rendered, /get fun verify\(piA: slice, piB: slice, piC: slice, pubInputs: array<int>\): bool/);
    assert.doesNotMatch(rendered, /struct MyVerifier \{/);
    assert.doesNotMatch(rendered, /get fun verify_/);
  });
});

test("generateVerifier normalizes custom contractName for the Tolk Groth16 template", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "verification_key.json");
    const outputPath = path.join(tempDir, "verifier.tolk");

    await writeGroth16JsonVk(inputPath, 2);

    const originalLog = console.log;
    console.log = () => {};

    try {
      await generateVerifier(inputPath, outputPath, {
        contractName: "secondVerifier",
        templatesDir,
      });
    } finally {
      console.log = originalLog;
    }

    const rendered = await fs.readFile(outputPath, "utf8");

    assert.match(rendered, /struct SecondVerifier \{/);
    assert.match(rendered, /fun SecondVerifier\.create\(\): SecondVerifier/);
    assert.match(rendered, /struct \(0x3b3cca17\) SecondVerifierVerify \{/);
    assert.match(rendered, /enum SecondVerifierErrors \{\s*InvalidInputs = 258,\s*WrongProof = 260,\s*\}/);
    assert.match(rendered, /throw SecondVerifierErrors\.InvalidInputs;/);
    assert.match(rendered, /get fun verify_SecondVerifier\(piA: slice, piB: slice, piC: slice, pubInputs: array<int>\): bool/);
    assert.match(rendered, /return SecondVerifier\.create\(\)\.verify\(piA, piB, piC, pubInputs\);/);
    assert.doesNotMatch(rendered, /SECOND_VERIFIER_ERR_INVALID_INPUTS/);
    assert.doesNotMatch(rendered, /get fun verify\(/);
  });
});

test("generateVerifier renders the Tolk PLONK template from verification_key.json", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "verification_key.json");
    const outputPath = path.join(tempDir, "verifier.tolk");

    await writePlonkJsonVk(inputPath, 1);

    const originalLog = console.log;
    let protocol;
    console.log = () => {};

    try {
      protocol = await generateVerifier(inputPath, outputPath, {
        templatesDir,
      });
    } finally {
      console.log = originalLog;
    }

    const rendered = await fs.readFile(outputPath, "utf8");

    assert.equal(protocol, "plonk");
    assert.match(rendered, /contract Verifier \{/);
    assert.match(rendered, /const QM: slice = "[0-9a-f]{96}"\.hexToSlice\(\)/);
    assert.match(rendered, /const QM_UC: slice = "[0-9a-f]{192}"\.hexToSlice\(\)/);
    assert.match(rendered, /const X_2: slice = "[0-9a-f]{192}"\.hexToSlice\(\)/);
    assert.match(rendered, /const K1: int = 2/);
    assert.match(rendered, /const K2: int = 3/);
    assert.match(rendered, /const W1: int = 13/);
    assert.match(rendered, /const N_PUBLIC: int = 1/);
    assert.doesNotMatch(rendered, /\[object Object\]/);
  });
});
