import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { utils } from "ffjavascript";
import { generateVerifier } from "../src/generateVerifiers.js";
import { getCurveFromName } from "../src/utils.js";

const { stringifyBigInts } = utils;

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-templates-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function writeBlsGroth16JsonVk(filePath, nPublic = 1) {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const vk = stringifyBigInts({
      protocol: "groth16",
      curve: "bls12381",
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

test("generateVerifier resolves bundled templates when called outside the package cwd", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "verification_key.json");
    const outputPath = path.join(tempDir, "verifier.tolk");
    await writeBlsGroth16JsonVk(inputPath);

    const originalCwd = process.cwd();
    const originalLog = console.log;
    console.log = () => {};
    try {
      process.chdir(tempDir);
      const protocol = await generateVerifier(inputPath, outputPath);
      assert.equal(protocol, "groth16");
    } finally {
      process.chdir(originalCwd);
      console.log = originalLog;
    }

    const rendered = await fs.readFile(outputPath, "utf8");
    assert.match(rendered, /contract Verifier \{/);
  });
});

test("default template resolver avoids direct import.meta usage in bundled source", async () => {
  const content = await fs.readFile("src/templateResolver.js", "utf8");

  assert.doesNotMatch(content, /import\.meta/);
});
