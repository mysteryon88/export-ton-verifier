import { buildBls12381, utils } from "ffjavascript";
import { g1Compressed, g2Compressed } from "./utils";

export async function groth16CompressProof(proof, publicSignals) {
  const curve = await buildBls12381();
  const proofProc = utils.unstringifyBigInts(proof);

  const pi_aS = g1Compressed(curve, proofProc.pi_a);
  const pi_bS = g2Compressed(curve, proofProc.pi_b);
  const pi_cS = g1Compressed(curve, proofProc.pi_c);

  const pi_a = Buffer.from(pi_aS, "hex");
  const pi_b = Buffer.from(pi_bS, "hex");
  const pi_c = Buffer.from(pi_cS, "hex");

  const pubInputs = publicSignals.map((s) => BigInt(s));

  return {
    pi_a,
    pi_b,
    pi_c,
    pubInputs,
  };
}
