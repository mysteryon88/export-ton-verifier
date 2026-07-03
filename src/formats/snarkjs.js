import { zKey } from "snarkjs";
import zkeyExportPlonkVerificationKey, {
  normalizePlonkVerificationKey,
} from "../export_plonk_vk.js";

export const SNARKJS_JSON_SOURCE = "snarkjs-json";
export const SNARKJS_ZKEY_SOURCE = "snarkjs-zkey";

const GROTH16_REQUIRED_FIELDS = [
  "vk_alpha_1",
  "vk_beta_2",
  "vk_gamma_2",
  "vk_delta_2",
];
const PLONK_REQUIRED_FIELDS = [
  "nPublic",
  "power",
  "k1",
  "k2",
  "Qm",
  "Ql",
  "Qr",
  "Qo",
  "Qc",
  "S1",
  "S2",
  "S3",
  "X_2",
];

export function normalizeSnarkjsVerificationKey(vkRaw) {
  if (!vkRaw?.protocol) {
    throw new Error("verification_key: missing 'protocol'.");
  }
  if (!vkRaw.curve) {
    throw new Error("verification_key: missing 'curve'.");
  }

  ensureSupportedProtocol(vkRaw.protocol, "JSON");
  validateSnarkjsVerificationKeyShape(vkRaw);
  return vkRaw;
}

export async function loadSnarkjsZkeyVerificationKey(
  inputPath,
  { logger = null } = {},
) {
  logger?.log?.("Loading verification key from .zkey...");
  const vkRaw = await zKey.exportVerificationKey(inputPath);
  ensureSupportedProtocol(vkRaw.protocol, ".zkey");
  return vkRaw;
}

export async function loadSnarkjsPlonkTemplateVerificationKey(verifierInput) {
  if (verifierInput.sourceFormat === SNARKJS_ZKEY_SOURCE) {
    return zkeyExportPlonkVerificationKey(verifierInput.inputPath);
  }

  return normalizePlonkVerificationKey(verifierInput.verificationKey);
}

function ensureSupportedProtocol(protocol, source) {
  if (protocol !== "groth16" && protocol !== "plonk") {
    throw new Error(
      `Only Groth16 and PLONK are supported from ${source} (got '${protocol}').`,
    );
  }
}

function validateSnarkjsVerificationKeyShape(vkRaw) {
  if (vkRaw.protocol === "groth16") {
    requireFields(vkRaw, GROTH16_REQUIRED_FIELDS);
    if (!Array.isArray(vkRaw.IC) || vkRaw.IC.length === 0) {
      throw new Error("verification_key: 'IC' must be a non-empty array.");
    }
    return;
  }

  requireFields(vkRaw, PLONK_REQUIRED_FIELDS);
}

function requireFields(value, fields) {
  for (const field of fields) {
    if (value[field] === undefined || value[field] === null) {
      throw new Error(`verification_key: missing '${field}'.`);
    }
  }
}
