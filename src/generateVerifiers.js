import fs from "fs/promises";
import path from "path";
import ejs from "ejs";
import { zKey } from "snarkjs";
import { utils } from "ffjavascript";
import { normalizeContractName, resolveTemplatePath } from "./helpers.js";
import { getCurveFromName, g1Compressed, g2Compressed } from "./utils.js";
import zkeyExportPlonkVerificationKey, {
  normalizePlonkVerificationKey,
} from "./export_plonk_vk.js";

const { unstringifyBigInts } = utils;

/**
 * Load verification key from .zkey or JSON file.
 */
async function loadVerificationKey(inputPath) {
  const lower = inputPath.toLowerCase();
  if (lower.endsWith(".json")) {
    console.log("Loading verification key from JSON...");
    const raw = await fs.readFile(inputPath, "utf8");
    const vkRaw = JSON.parse(raw);
    if (!vkRaw.protocol)
      throw new Error("verification_key: missing 'protocol'.");
    if (!vkRaw.curve) throw new Error("verification_key: missing 'curve'.");
    if (vkRaw.protocol !== "groth16" && vkRaw.protocol !== "plonk") {
      throw new Error(
        `Only Groth16 and PLONK are supported from JSON (got '${vkRaw.protocol}').`,
      );
    }
    return vkRaw;
  }

  console.log("Loading verification key...");
  const vkRaw = await zKey.exportVerificationKey(inputPath);

  if (vkRaw.protocol !== "groth16" && vkRaw.protocol !== "plonk") {
    throw new Error("Only Groth16 and PLONK are supported!");
  }
  return vkRaw;
}

/**
 * Generate a TON verifier contract from .zkey or verification_key.json.
 * Protocol is auto-detected (or Groth16 when loading from JSON).
 * Returns the detected protocol: "groth16" | "plonk".
 *
 * @param {string} inputPath - Path to .zkey or verification_key.json
 * @param {string} outputPath
 * @param {{ lang?: 'func'|'tolk'|'tact', templatesDir?: string, contractName?: string | null }} opts
 * @returns {Promise<'groth16'|'plonk'>}
 */
export async function generateVerifier(
  inputPath,
  outputPath,
  {
    lang = "tolk",
    templatesDir = path.join(process.cwd(), "templates"),
    contractName = null,
  } = {},
) {
  const vkRaw = await loadVerificationKey(inputPath);
  const normalizedContractName =
    typeof contractName === "string" && contractName.trim()
      ? normalizeContractName(contractName)
      : null;

  const templatePath = await resolveTemplatePath(
    templatesDir,
    lang,
    vkRaw.protocol,
  );
  console.log(`Using template for: ${lang} ${vkRaw.protocol}`);

  let curve;
  try {
    if (vkRaw.protocol === "groth16") {
      const vk = unstringifyBigInts(vkRaw);
      curve = await getCurveFromName(vkRaw.curve);

      console.log("Compressing points...");
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

      console.log("Rendering template...");
      const template = await fs.readFile(templatePath, "utf8");
      const rendered = ejs.render(template, data);

      console.log(`Saving file: ${outputPath}`);
      await fs.writeFile(outputPath, rendered, "utf8");
      console.log("Done.");

      return "groth16";
    }

    console.log("Rendering template for PLONK...");
    const template = await fs.readFile(templatePath, "utf8");
    const isJsonInput = inputPath.toLowerCase().endsWith(".json");
    const verificationKey = {
      ...(isJsonInput
        ? await normalizePlonkVerificationKey(vkRaw)
        : await zkeyExportPlonkVerificationKey(inputPath)),
      contractName: normalizedContractName,
    };
    const rendered = ejs.render(template, verificationKey);

    console.log(`Saving file: ${outputPath}`);
    await fs.writeFile(outputPath, rendered, "utf8");
    console.log("Done.");

    return "plonk";
  } finally {
    if (curve && typeof curve.terminate === "function") {
      await curve.terminate();
    }
  }
}
