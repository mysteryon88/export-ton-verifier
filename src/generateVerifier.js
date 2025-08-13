import fs from "fs/promises";
import ejs from "ejs";
import { zKey } from "snarkjs";
import { utils } from "ffjavascript";

import { getCurveFromName, g1Compressed, g2Compressed } from "./utils";

const { unstringifyBigInts } = utils;

export async function generateVerifier(zkeyPath, templatePath, outputPath) {
  console.log("📦 Loading verification key...");
  const vkRaw = await zKey.exportVerificationKey(zkeyPath, console);

  if (vkRaw.protocol !== "groth16") {
    throw new Error("Only Groth16 is supported.");
  }

  const vk = unstringifyBigInts(vkRaw);
  const curve = await getCurveFromName(vkRaw.curve);

  try {
    console.log("🔄 Compressing points...");
    const data = {
      vk_alpha_1: g1Compressed(curve, vk.vk_alpha_1),
      vk_beta_2: g2Compressed(curve, vk.vk_beta_2),
      vk_gamma_2: g2Compressed(curve, vk.vk_gamma_2),
      vk_delta_2: g2Compressed(curve, vk.vk_delta_2),
      IC: vk.IC.map((x) => g1Compressed(curve, x)),
      nPublic: vk.IC.length - 1,
      publicInputKeyLen: 32,
    };

    console.log("📄 Rendering template...");
    const template = await fs.readFile(templatePath, "utf8");
    const rendered = ejs.render(template, data);

    console.log(`💾 Saving file: ${outputPath}`);
    await fs.writeFile(outputPath, rendered, "utf8");
    console.log("✅ Done.");
  } finally {
    if (curve && typeof curve.terminate === "function") {
      await curve.terminate();
    }
  }
}
