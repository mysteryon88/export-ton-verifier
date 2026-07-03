// SPDX-License-Identifier: GPL-3.0-or-later
import {
  loadSnarkjsPlonkTemplateVerificationKey,
  loadSnarkjsZkeyVerificationKey,
  normalizeSnarkjsVerificationKey,
  SNARKJS_JSON_SOURCE,
  SNARKJS_ZKEY_SOURCE,
} from "./snarkjs.js";
import {
  loadGnarkBinaryVerificationKey,
  normalizeGnarkJsonVerificationKey,
} from "./gnark.js";
import { normalizeArkworksVerificationKey } from "./arkworks.js";
import { readJson } from "./common.js";
import { createLogger } from "../logger.js";

const GNARK_JSON_SOURCE = "gnark-json";
const GNARK_BINARY_SOURCE = "gnark-bin";
const ARKWORKS_JSON_SOURCE = "arkworks-json";

export async function loadVerificationKey(
  inputPath,
  { logger = null, quiet = false } = {},
) {
  const log = createLogger({ logger, quiet });
  const nativeInput = await loadNativeVerificationKeyInput(inputPath);
  if (nativeInput) return nativeInput;

  return makeVerifierInput(
    inputPath,
    SNARKJS_ZKEY_SOURCE,
    await loadSnarkjsZkeyVerificationKey(inputPath, { logger: log }),
  );
}

export async function loadPlonkTemplateVerificationKey(verifierInput) {
  return loadSnarkjsPlonkTemplateVerificationKey(verifierInput);
}

async function loadNativeVerificationKeyInput(inputPath) {
  const lower = inputPath.toLowerCase();
  if (lower.endsWith(".json")) {
    return loadJsonVerificationKey(inputPath);
  }
  if (lower.endsWith(".bin")) {
    return makeVerifierInput(
      inputPath,
      GNARK_BINARY_SOURCE,
      await loadGnarkBinaryVerificationKey(inputPath),
    );
  }

  return null;
}

async function loadJsonVerificationKey(inputPath) {
  const raw = await readJson(inputPath, "verification key");
  const errors = [];

  try {
    return makeVerifierInput(
      inputPath,
      SNARKJS_JSON_SOURCE,
      normalizeSnarkjsVerificationKey(raw),
    );
  } catch (err) {
    errors.push(`snarkjs JSON: ${err.message}`);
  }

  try {
    return makeVerifierInput(
      inputPath,
      GNARK_JSON_SOURCE,
      await normalizeGnarkJsonVerificationKey(raw),
    );
  } catch (err) {
    errors.push(`gnark JSON: ${err.message}`);
  }

  try {
    return makeVerifierInput(
      inputPath,
      ARKWORKS_JSON_SOURCE,
      await normalizeArkworksVerificationKey(raw),
    );
  } catch (err) {
    errors.push(`arkworks JSON: ${err.message}`);
  }

  throw new Error(
    `could not auto-detect verification key JSON format: ${errors.join("; ")}`,
  );
}

function makeVerifierInput(inputPath, sourceFormat, verificationKey) {
  return {
    inputPath,
    sourceFormat,
    verificationKey,
  };
}
