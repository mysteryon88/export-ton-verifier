import fs from "fs/promises";
import ejs from "ejs";
import { zKey } from "snarkjs";
import { utils } from "ffjavascript";

import { getCurveFromName, g1Compressed, g2Compressed } from "./utils.js";

const { unstringifyBigInts } = utils;

async function loadVerificationKey(
  inputPath,
  { forceJson = false, logger = console } = {}
) {
  const lower = inputPath.toLowerCase();
  if (forceJson || lower.endsWith(".json")) {
    logger.log("📦 Loading verification key from JSON...");
    const raw = await fs.readFile(inputPath, "utf8");
    const vkRaw = JSON.parse(raw);

    // Базовая валидация
    if (!vkRaw.protocol)
      throw new Error("verification_key.json: missing 'protocol'.");
    if (!vkRaw.curve)
      throw new Error("verification_key.json: missing 'curve'.");
    if (vkRaw.protocol !== "groth16") {
      throw new Error(`Only Groth16 is supported (got '${vkRaw.protocol}').`);
    }
    return vkRaw;
  }

  logger.log("📦 Loading verification key from .zkey...");
  const vkRaw = await zKey.exportVerificationKey(inputPath, logger);
  if (vkRaw.protocol !== "groth16") {
    throw new Error(`Only Groth16 is supported (got '${vkRaw.protocol}').`);
  }
  return vkRaw;
}

export async function generateVerifier(
  inputPath,
  templatePath,
  outputPath,
  opts = {}
) {
  const logger = console;
  const vkRaw = await loadVerificationKey(inputPath, {
    forceJson: opts.forceJson,
    logger,
  });

  const vk = unstringifyBigInts(vkRaw);
  const curve = await getCurveFromName(vkRaw.curve);

  try {
    logger.log("🔄 Compressing points...");
    const data = {
      vk_alpha_1: g1Compressed(curve, vk.vk_alpha_1),
      vk_beta_2: g2Compressed(curve, vk.vk_beta_2),
      vk_gamma_2: g2Compressed(curve, vk.vk_gamma_2),
      vk_delta_2: g2Compressed(curve, vk.vk_delta_2),
      IC: vk.IC.map((x) => g1Compressed(curve, x)),
      // nPublic можно взять из vkRaw.nPublic, но точнее считать по длине IC:
      nPublic: vk.IC.length - 1,
      publicInputKeyLen: 32,
      protocol: vkRaw.protocol,
      curve: vkRaw.curve,
    };

    logger.log("📄 Rendering template...");
    const template = await fs.readFile(templatePath, "utf8");
    const rendered = ejs.render(template, data);

    logger.log(`💾 Saving file: ${outputPath}`);
    await fs.writeFile(outputPath, rendered, "utf8");
    logger.log("✅ Done.");
  } finally {
    if (curve && typeof curve.terminate === "function") {
      await curve.terminate();
    }
  }
}
