// SPDX-License-Identifier: GPL-3.0-or-later
export function normalizeTonBlsCurveName(raw, field = "curve") {
  if (typeof raw === "string" && raw.length > MAX_JSON_NUMERIC_STRING_LENGTH) {
    throw new Error(`${field}: curve metadata exceeds ${MAX_JSON_NUMERIC_STRING_LENGTH} characters.`);
  }
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`${field}: BLS12-381 curve metadata is required.`);
  }

  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized !== "bls12381") {
    throw new Error(
      `${field}: TON verifier templates use TVM BLS12-381 opcodes; got '${raw}'.`,
    );
  }

  return "bls12381";
}

export function assertTonBlsCurve(raw, field = "curve") {
  normalizeTonBlsCurveName(raw, field);
}

// Eight inputs keep both generated receivers below 920k gas across the
// boundary matrix, leaving at least 8% under TVM's 1M transaction gas ceiling.
export const MAX_PLONK_PUBLIC_INPUTS = 8;
export const MAX_PLONK_POWER = 32;
export const MAX_VERIFICATION_KEY_BYTES = 16 * 1024 * 1024;
export const MAX_JSON_DEPTH = 64;
export const MAX_JSON_NODES = 10_000;
export const MAX_JSON_CONTAINER_ENTRIES = 4096;
export const MAX_JSON_NUMERIC_STRING_LENGTH = 1024;
export const MAX_GNARK_G1_POINTS = 4096;
export const MAX_ARKWORKS_IC_POINTS = 4096;
export const MAX_GROTH16_PUBLIC_INPUTS = 4096;

export function assertPlonkPublicInputCount(count, field = "public inputs") {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new Error(`${field}: public input count must be a non-negative integer.`);
  }

  if (count > MAX_PLONK_PUBLIC_INPUTS) {
    throw new Error(
      `${field}: PLONK verifier supports at most ${MAX_PLONK_PUBLIC_INPUTS} public inputs within the TVM internal-message gas limit.`,
    );
  }
}

export function assertPlonkPower(power, field = "PLONK power") {
  if (!Number.isSafeInteger(power) || power < 0 || power > MAX_PLONK_POWER) {
    throw new Error(
      `${field}: must be a non-negative safe integer and at most ${MAX_PLONK_POWER}.`,
    );
  }
}
