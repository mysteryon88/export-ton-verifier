// SPDX-License-Identifier: GPL-3.0-or-later

export const PLONK_VERIFIER_DISABLED_MESSAGE =
  "PLONK verifier generation is disabled: the current TON templates cannot " +
  "prove that the uncompressed snarkjs Fiat-Shamir transcript points match " +
  "the compressed points consumed by TVM BLS operations.";

export function assertPlonkVerifierGenerationSupported(protocol) {
  if (protocol === "plonk") {
    throw new Error(PLONK_VERIFIER_DISABLED_MESSAGE);
  }
}
