import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { Cell } from "@ton/core";
import { utils } from "ffjavascript";
import { getCurveFromName } from "../src/utils.js";
import { runCliSuccess } from "../test-support/run_cli.js";

const { stringifyBigInts } = utils;

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-message-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function makeProofs() {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    return {
      groth16: stringifyBigInts({
        protocol: "groth16",
        curve: "bls12381",
        pi_a: g1,
        pi_b: g2,
        pi_c: g1,
      }),
      plonk: stringifyBigInts({
        protocol: "plonk",
        curve: "bls12381",
        A: g1,
        B: g1,
        C: g1,
        Z: g1,
        T1: g1,
        T2: g1,
        T3: g1,
        Wxi: g1,
        Wxiw: g1,
        eval_a: 1n,
        eval_b: 2n,
        eval_c: 3n,
        eval_s1: 4n,
        eval_s2: 5n,
        eval_zw: 6n,
      }),
      publicSignals: stringifyBigInts([7n, 8n]),
    };
  } finally {
    await curve.terminate();
  }
}

function opcodeFromBase64(boc) {
  const [cell] = Cell.fromBoc(Buffer.from(boc, "base64"));
  return Number(cell.beginParse().loadUint(32));
}

test("proofToMessageBoc builds Groth16 Tolk and FunC internal messages", async () => {
  const { proofToMessageBoc } = await import("../src/proofMessages.js");
  const { groth16, publicSignals } = await makeProofs();

  const tolk = await proofToMessageBoc({
    proof: groth16,
    publicSignals,
    protocol: "groth16",
    lang: "tolk",
  });
  const func = await proofToMessageBoc({
    proof: groth16,
    publicSignals,
    protocol: "groth16",
    lang: "func",
  });

  assert.equal(opcodeFromBase64(tolk), 0x3b3cca17);
  assert.equal(opcodeFromBase64(func), 0x3b3cca17);

  const [tolkBody] = Cell.fromBoc(Buffer.from(tolk, "base64"));
  const tolkRoot = tolkBody.beginParse();
  tolkRoot.loadUint(32);
  const proof = tolkRoot.loadRef();
  const publicInputs = tolkRoot.loadRef();
  assert.equal(tolkRoot.remainingBits, 0);
  assert.equal(tolkRoot.remainingRefs, 0);
  assert.equal(proof.bits.length, 0);
  assert.equal(proof.refs.length, 3);
  assert.equal(publicInputs.beginParse().loadUint(8), publicSignals.length);
});

test("proofToMessageBoc rejects Groth16 proofs without curve metadata", async () => {
  const { proofToMessageBoc } = await import("../src/proofMessages.js");
  const { groth16, publicSignals } = await makeProofs();
  const { curve, ...proofWithoutCurve } = groth16;

  await assert.rejects(
    proofToMessageBoc({
      proof: proofWithoutCurve,
      publicSignals,
      protocol: "groth16",
      lang: "tolk",
    }),
    /proof\.curve.*BLS12-381/,
  );
});

test("proofToMessageBoc builds PLONK Tolk and FunC internal messages", async () => {
  const { proofToMessageBoc } = await import("../src/proofMessages.js");
  const { plonk, publicSignals } = await makeProofs();

  const tolk = await proofToMessageBoc({
    proof: plonk,
    publicSignals,
    protocol: "plonk",
    lang: "tolk",
  });
  const func = await proofToMessageBoc({
    proof: plonk,
    publicSignals,
    protocol: "plonk",
    lang: "func",
  });

  assert.equal(opcodeFromBase64(tolk), 0x76524659);
  assert.equal(opcodeFromBase64(func), 0x76524659);

  const [cell] = Cell.fromBoc(Buffer.from(func, "base64"));
  const root = cell.beginParse();
  root.loadUint(32);
  const payload = root.loadRef();
  assert.equal(payload.refs.length, 4);
});

test("proof-to-message CLI writes encoded BOC output", async () => {
  await withTempDir(async (tempDir) => {
    const { groth16, publicSignals } = await makeProofs();
    const proofPath = path.join(tempDir, "proof.json");
    const publicPath = path.join(tempDir, "public.json");
    const outputPath = path.join(tempDir, "body.hex");
    await fs.writeFile(proofPath, JSON.stringify(groth16), "utf8");
    await fs.writeFile(publicPath, JSON.stringify(publicSignals), "utf8");

    await runCliSuccess([
      "proof-to-message",
      proofPath,
      publicPath,
      "--groth16",
      "--func",
      "--format",
      "hex",
      "--output",
      outputPath,
    ]);

    const hex = await fs.readFile(outputPath, "utf8");
    assert.match(hex, /^[0-9a-f]+$/);
    const [cell] = Cell.fromBoc(Buffer.from(hex, "hex"));
    assert.equal(Number(cell.beginParse().loadUint(32)), 0x3b3cca17);
  });
});

test("proof-to-message accepts protocol flags before proof paths", async () => {
  await withTempDir(async (tempDir) => {
    const { groth16, publicSignals } = await makeProofs();
    const proofPath = path.join(tempDir, "proof.json");
    const publicPath = path.join(tempDir, "public.json");
    await fs.writeFile(proofPath, JSON.stringify(groth16), "utf8");
    await fs.writeFile(publicPath, JSON.stringify(publicSignals), "utf8");

    const output = await runCliSuccess([
      "proof-to-message",
      "--groth16",
      proofPath,
      publicPath,
      "--func",
    ]);

    assert.equal(opcodeFromBase64(output.trim()), 0x3b3cca17);
  });
});
