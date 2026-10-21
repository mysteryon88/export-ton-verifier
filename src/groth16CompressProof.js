// SPDX-License-Identifier: GPL-3.0-or-later
import { buildBls12381 } from "ffjavascript";
import { g1Compressed, g2Compressed } from "./utils.js";
import {
  assertTonBlsCurve,
  MAX_GROTH16_PUBLIC_INPUTS,
  MAX_JSON_NUMERIC_STRING_LENGTH,
} from "./limits.js";

function boundedInteger(value, field, bits) {
  if (typeof value === "string" && value.length > MAX_JSON_NUMERIC_STRING_LENGTH) {
    throw new Error(`${field}: numeric string exceeds ${MAX_JSON_NUMERIC_STRING_LENGTH} characters.`);
  }
  if (
    typeof value !== "bigint" &&
    typeof value !== "string" &&
    !(typeof value === "number" && Number.isSafeInteger(value))
  ) {
    throw new Error(`${field}: expected an integer string, bigint, or safe integer.`);
  }
  let integer;
  try {
    integer = BigInt(value);
  } catch {
    throw new Error(`${field}: expected an integer.`);
  }
  const limit = 1n << BigInt(bits);
  if (integer < -limit || integer >= limit) {
    throw new Error(`${field}: integer must fit in ${bits} bits.`);
  }
  return integer;
}

function proofPoint(point, field, g2 = false) {
  if (!Array.isArray(point) || (point.length !== 2 && point.length !== 3)) {
    throw new Error(`${field}: expected affine or projective coordinates.`);
  }
  return Array.from(point, (coordinate, index) => {
    const label = `${field}[${index}]`;
    if (!g2) return boundedInteger(coordinate, label, 384);
    if (!Array.isArray(coordinate) || coordinate.length !== 2) {
      throw new Error(`${label}: expected two extension-field coordinates.`);
    }
    return Array.from(coordinate, (value, part) =>
      boundedInteger(value, `${label}[${part}]`, 384),
    );
  });
}

export async function groth16CompressProof(proof, publicSignals) {
  assertTonBlsCurve(proof?.curve, "proof.curve");
  if (!Array.isArray(publicSignals)) {
    throw new Error("publicSignals must be an array.");
  }
  if (publicSignals.length > MAX_GROTH16_PUBLIC_INPUTS) {
    throw new Error(`Groth16 supports at most ${MAX_GROTH16_PUBLIC_INPUTS} public inputs.`);
  }
  const proofProc = {
    pi_a: proofPoint(proof.pi_a, "proof.pi_a"),
    pi_b: proofPoint(proof.pi_b, "proof.pi_b", true),
    pi_c: proofPoint(proof.pi_c, "proof.pi_c"),
  };
  const pubInputs = Array.from(publicSignals, (value, index) =>
    boundedInteger(value, `publicSignals[${index}]`, 256),
  );

  const curve = await buildBls12381();
  try {
    const pi_aS = g1Compressed(curve, proofProc.pi_a);
    const pi_bS = g2Compressed(curve, proofProc.pi_b);
    const pi_cS = g1Compressed(curve, proofProc.pi_c);

    const pi_a = Buffer.from(pi_aS, "hex");
    const pi_b = Buffer.from(pi_bS, "hex");
    const pi_c = Buffer.from(pi_cS, "hex");

    return {
      pi_a,
      pi_b,
      pi_c,
      pubInputs,
    };
  } finally {
    if (curve && typeof curve.terminate === "function") {
      await curve.terminate();
    }
  }
}
