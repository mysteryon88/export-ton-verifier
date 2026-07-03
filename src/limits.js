export function normalizeTonBlsCurveName(raw, field = "curve") {
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

export const MAX_PLONK_PUBLIC_INPUTS = 244;

export function assertPlonkPublicInputCount(count, field = "public inputs") {
  if (!Number.isInteger(count) || count < 0) {
    throw new Error(`${field}: public input count must be a non-negative integer.`);
  }

  if (count > MAX_PLONK_PUBLIC_INPUTS) {
    throw new Error(
      `${field}: PLONK verifier supports at most ${MAX_PLONK_PUBLIC_INPUTS} public inputs because the TVM Keccak transcript is limited to 255 tuple items.`,
    );
  }
}
