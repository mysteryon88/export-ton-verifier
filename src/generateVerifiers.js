import fs from "fs/promises";
import path from "path";
import ejs from "ejs";
import { utils } from "ffjavascript";
import { normalizeContractName, resolveTemplatePath } from "./helpers.js";
import { getCurveFromName, g1Compressed, g2Compressed } from "./utils.js";
import { assertTonBlsCurve } from "./limits.js";
import { defaultTemplatesDir } from "./templateResolver.js";
import { createLogger } from "./logger.js";
import {
  loadPlonkTemplateVerificationKey,
  loadVerificationKey,
} from "./formats/index.js";

const { unstringifyBigInts } = utils;

/**
 * Generate a TON verifier contract from .zkey, snarkjs JSON, gnark, or arkworks VK input.
 * Protocol is auto-detected from the input artifact.
 * Returns the detected protocol: "groth16" | "plonk".
 *
 * @param {string} inputPath - Path to .zkey, snarkjs JSON, gnark JSON/.bin, or arkworks JSON
 * @param {string} outputPath
 * @param {{ lang?: 'func'|'tolk'|'tact', templatesDir?: string, contractName?: string | null, logger?: false | null | ((message: string) => void) | { log(message: string): void }, quiet?: boolean }} opts
 * @returns {Promise<'groth16'|'plonk'>}
 */
export async function generateVerifier(
  inputPath,
  outputPath,
  {
    lang = "tolk",
    templatesDir = defaultTemplatesDir(),
    contractName = null,
    logger = null,
    quiet = false,
  } = {},
) {
  const log = createLogger({ logger, quiet });
  const verifierInput = await loadVerificationKey(inputPath, { logger: log });
  const vkRaw = verifierInput.verificationKey;
  assertTonBlsCurve(vkRaw.curve, "verification_key.curve");
  const normalizedContractName =
    typeof contractName === "string" && contractName.trim()
      ? normalizeContractName(contractName)
      : null;

  const templatePath = await resolveTemplatePath(
    templatesDir,
    lang,
    vkRaw.protocol,
  );
  log.log(`Using template for: ${lang} ${vkRaw.protocol}`);

  let curve;
  try {
    if (vkRaw.protocol === "groth16") {
      const vk = unstringifyBigInts(vkRaw);
      curve = await getCurveFromName(vkRaw.curve);

      log.log("Compressing points...");
      const data = {
        protocol: "groth16",
        curve: vkRaw.curve,
        contractName: normalizedContractName,
        vk_alpha_1: g1Compressed(curve, vk.vk_alpha_1),
        vk_beta_2: g2Compressed(curve, vk.vk_beta_2),
        vk_gamma_2: g2Compressed(curve, vk.vk_gamma_2),
        vk_delta_2: g2Compressed(curve, vk.vk_delta_2),
        IC: vk.IC.map((x) => g1Compressed(curve, x)),
        nPublic: vk.IC.length - 1,
        publicInputKeyLen: 32,
        _raw: vkRaw,
      };

      log.log("Rendering template...");
      const template = await fs.readFile(templatePath, "utf8");
      const rendered = ejs.render(template, data);

      log.log(`Saving file: ${outputPath}`);
      await fs.writeFile(outputPath, rendered, "utf8");
      log.log("Done.");

      return "groth16";
    }

    log.log("Rendering template for PLONK...");
    const template = await fs.readFile(templatePath, "utf8");
    const verificationKey = {
      ...(await loadPlonkTemplateVerificationKey(verifierInput)),
      contractName: normalizedContractName,
    };
    const rendered = ejs.render(template, verificationKey);

    log.log(`Saving file: ${outputPath}`);
    await fs.writeFile(outputPath, rendered, "utf8");
    log.log("Done.");

    return "plonk";
  } finally {
    if (curve && typeof curve.terminate === "function") {
      await curve.terminate();
    }
  }
}
