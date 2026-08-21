import test from "node:test";
import assert from "node:assert/strict";
import { utils } from "ffjavascript";
import { normalizePlonkVerificationKey } from "../src/export_plonk_vk.js";
import { exportPlonkTolkCalldata } from "../src/export_plonk_calldata.js";
import { getCurveFromName } from "../src/utils.js";

const { stringifyBigInts } = utils;

const g1Hex = "a0" + "11".repeat(47);
const g2Hex = "b0" + "22".repeat(95);
const g1UncompressedHex = "c0" + "33".repeat(95);

function readyPlonkVk(nPublic) {
  return {
    protocol: "plonk",
    curve: "bls12381",
    nPublic,
    power: 4,
    k1: "2",
    k2: "3",
    w: "13",
    Qm: g1Hex,
    Ql: g1Hex,
    Qr: g1Hex,
    Qo: g1Hex,
    Qc: g1Hex,
    S1: g1Hex,
    S2: g1Hex,
    S3: g1Hex,
    Qm_uc: g1UncompressedHex,
    Ql_uc: g1UncompressedHex,
    Qr_uc: g1UncompressedHex,
    Qo_uc: g1UncompressedHex,
    Qc_uc: g1UncompressedHex,
    S1_uc: g1UncompressedHex,
    S2_uc: g1UncompressedHex,
    S3_uc: g1UncompressedHex,
    X_2: g2Hex,
  };
}

async function makeProof() {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    return stringifyBigInts({
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
    });
  } finally {
    await curve.terminate();
  }
}

test("normalizePlonkVerificationKey rejects public input counts over the internal-message gas limit", async () => {
  await assert.rejects(
    normalizePlonkVerificationKey(readyPlonkVk(9)),
    /at most 8 public inputs/,
  );
});
test("PLONK calldata helpers reject public input counts over the internal-message gas limit", async () => {
  const proof = await makeProof();
  const publicInputs = stringifyBigInts(
    Array.from({ length: 9 }, (_, index) => BigInt(index)),
  );

  await assert.rejects(
    exportPlonkTolkCalldata(proof, publicInputs),
    /at most 8 public inputs/,
  );
});
