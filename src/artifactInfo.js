// SPDX-License-Identifier: GPL-3.0-or-later
import path from "path";
import { resolveTemplatePath } from "./helpers.js";
import { loadVerificationKey } from "./formats/index.js";
import { assertPlonkPublicInputCount, assertTonBlsCurve } from "./limits.js";
import { defaultTemplatesDir } from "./templateResolver.js";

function check(name, run) {
  try {
    const message = run();
    return { name, ok: true, message };
  } catch (err) {
    return { name, ok: false, message: err?.message || String(err) };
  }
}

function publicInputCount(vkRaw) {
  if (vkRaw.protocol === "groth16") {
    return Array.isArray(vkRaw.IC) ? vkRaw.IC.length - 1 : null;
  }
  if (vkRaw.protocol === "plonk") {
    return Number(vkRaw.nPublic);
  }
  return null;
}

export async function inspectVerifierInput(
  inputPath,
  { lang = "tolk", templatesDir = defaultTemplatesDir() } = {},
) {
  const verifierInput = await loadVerificationKey(inputPath);
  const vkRaw = verifierInput.verificationKey;
  const nPublic = publicInputCount(vkRaw);
  const checks = [];

  checks.push(
    check("curve", () => {
      assertTonBlsCurve(vkRaw.curve, "verification_key.curve");
      return "BLS12-381 is supported by TON BLS opcodes.";
    }),
  );

  if (vkRaw.protocol === "plonk") {
    checks.push(
      check("plonk-public-inputs", () => {
        assertPlonkPublicInputCount(nPublic, "verification_key.nPublic");
        return "PLONK public input count fits internal-message gas limits.";
      }),
    );
  }

  let template = null;
  checks.push(
    await (async () => {
      try {
        template = await resolveTemplatePath(templatesDir, lang, vkRaw.protocol);
        return {
          name: "template",
          ok: true,
          message: `Template found: ${path.basename(template)}.`,
        };
      } catch (err) {
        return {
          name: "template",
          ok: false,
          message: err?.message || String(err),
        };
      }
    })(),
  );

  const ok = checks.every((item) => item.ok);
  return {
    ok,
    inputPath,
    sourceFormat: verifierInput.sourceFormat,
    protocol: vkRaw.protocol,
    curve: vkRaw.curve,
    nPublic,
    language: lang,
    template,
    checks,
  };
}

export function formatDoctorReport(report) {
  const lines = [
    `Verifier doctor: ${report.ok ? "OK" : "BLOCKED"}`,
    `Input: ${report.inputPath}`,
    `Source format: ${report.sourceFormat}`,
    `Protocol: ${report.protocol}`,
    `Curve: ${report.curve}`,
    `Public inputs: ${report.nPublic}`,
    `Language: ${report.language}`,
    `Template: ${report.template ?? "not found"}`,
    "Checks:",
  ];

  for (const item of report.checks) {
    lines.push(`  [${item.ok ? "ok" : "blocked"}] ${item.name}: ${item.message}`);
  }

  return `${lines.join("\n")}\n`;
}
