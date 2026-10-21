// SPDX-License-Identifier: GPL-3.0-or-later
import {
  BinaryReader,
  BLS12381_CURVE_NAME,
  decodeBls12381G1,
  decodeBls12381G2,
  decodeHex,
  makeGroth16VerificationKey,
  normalizeBls12381CurveName,
  withBls12381,
} from "./common.js";
import { MAX_ARKWORKS_IC_POINTS } from "../limits.js";

const G1_COMPRESSED_BYTES = 48;
const G2_COMPRESSED_BYTES = 96;

export async function normalizeArkworksVerificationKey(value) {
  const curve = parseCurve(value);
  const vkHex = firstString(value, ["vk", "verification_key", "verifying_key"], "vk");
  return decodeArkworksVerificationKey(vkHex, curve);
}

export async function decodeArkworksVerificationKey(
  raw,
  curveName = BLS12381_CURVE_NAME,
) {
  normalizeBls12381CurveName(curveName, "curve");
  const bytes = decodeHex(raw, "vk");
  const reader = new BinaryReader(bytes, "arkworks verification key");
  const alphaBytes = reader.readBytes(G1_COMPRESSED_BYTES, "vk.alpha_g1");
  const betaBytes = reader.readBytes(G2_COMPRESSED_BYTES, "vk.beta_g2");
  const gammaBytes = reader.readBytes(G2_COMPRESSED_BYTES, "vk.gamma_g2");
  const deltaBytes = reader.readBytes(G2_COMPRESSED_BYTES, "vk.delta_g2");
  const icLen = Number(reader.readU64LE("vk.gamma_abc_g1 length"));
  if (!Number.isSafeInteger(icLen) || icLen > MAX_ARKWORKS_IC_POINTS) {
    throw new Error(`vk.gamma_abc_g1 length must be at most ${MAX_ARKWORKS_IC_POINTS}.`);
  }
  if (bytes.length - reader.offset !== icLen * G1_COMPRESSED_BYTES) {
    throw new Error("vk.gamma_abc_g1 byte length must match its declared point count exactly.");
  }

  return withBls12381((curve) => {
    const vk_alpha_1 = decodeBls12381G1(
      curve,
      alphaBytes,
      "vk.alpha_g1",
    );
    const vk_beta_2 = decodeBls12381G2(
      curve,
      betaBytes,
      "vk.beta_g2",
    );
    const vk_gamma_2 = decodeBls12381G2(
      curve,
      gammaBytes,
      "vk.gamma_g2",
    );
    const vk_delta_2 = decodeBls12381G2(
      curve,
      deltaBytes,
      "vk.delta_g2",
    );

    const IC = [];
    for (let idx = 0; idx < icLen; idx += 1) {
      IC.push(
        decodeBls12381G1(
          curve,
          reader.readBytes(G1_COMPRESSED_BYTES, `vk.gamma_abc_g1[${idx}]`),
          `vk.gamma_abc_g1[${idx}]`,
        ),
      );
    }

    reader.finish("arkworks verification key");
    return makeGroth16VerificationKey({
      curve: BLS12381_CURVE_NAME,
      vk_alpha_1,
      vk_beta_2,
      vk_gamma_2,
      vk_delta_2,
      IC,
    });
  });
}

function parseCurve(value) {
  const curve = value?.curve;
  if (!curve) {
    throw new Error("arkworks input requires curve metadata.");
  }
  return normalizeBls12381CurveName(curve, "curve");
}

function firstString(value, keys, label) {
  for (const key of keys) {
    const candidate = value?.[key];
    if (typeof candidate === "string") return candidate;
  }
  throw new Error(`arkworks input requires ${label} hex field.`);
}
