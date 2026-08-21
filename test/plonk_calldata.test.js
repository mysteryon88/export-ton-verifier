import test from "node:test";
import assert from "node:assert/strict";
import { utils } from "ffjavascript";
import {
  exportPlonkFuncCalldata,
  exportPlonkTolkCalldata,
} from "../src/export_plonk_calldata.js";
import { groth16CompressProof } from "../src/groth16CompressProof.js";
import { getCurveFromName } from "../src/utils.js";

const { stringifyBigInts } = utils;

async function makeProofAndPublicInputs() {
  const curve = await getCurveFromName("bls12381");

  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const proof = stringifyBigInts({
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
    return { proof, publicInputs: stringifyBigInts([7n, 8n, 9n]) };
  } finally {
    await curve.terminate();
  }
}

test("PLONK calldata helpers expose Func dict-cell and Tolk tuple public inputs", async () => {
  const { proof, publicInputs } = await makeProofAndPublicInputs();

  const funcCalldata = await exportPlonkFuncCalldata(proof, publicInputs);
  const tolkCalldata = await exportPlonkTolkCalldata(proof, publicInputs);

  assert.equal(funcCalldata.length, 25);
  assert.equal(tolkCalldata.length, 25);
  assert.equal(funcCalldata[15].type, "cell");
  assert.equal(tolkCalldata[15].type, "tuple");
  assert.deepEqual(
    tolkCalldata[15].items.map((item) => item.value),
    [7n, 8n, 9n],
  );
});

test("Func PLONK calldata represents zero public inputs as one exact empty cell", async () => {
  const { proof } = await makeProofAndPublicInputs();
  const calldata = await exportPlonkFuncCalldata(proof, []);

  assert.equal(calldata[15].type, "cell");
  assert.equal(calldata[15].cell.bits.length, 0);
  assert.equal(calldata[15].cell.refs.length, 0);
});

test("groth16CompressProof rejects non-BLS proof metadata before compression", async () => {
  await assert.rejects(
    groth16CompressProof(
      {
        curve: "bn128",
        pi_a: ["0", "0", "1"],
        pi_b: [["0", "0"], ["0", "0"], ["1", "0"]],
        pi_c: ["0", "0", "1"],
      },
      [],
    ),
    /BLS12-381/,
  );
});
