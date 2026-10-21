// SPDX-License-Identifier: GPL-3.0-or-later
import fsp from "fs/promises";
import path from "path";
import { generateVerifier } from "../generateVerifiers.js";
import { formatDoctorReport, inspectVerifierInput } from "../artifactInfo.js";
import { proofToMessageBoc } from "../proofMessages.js";
import { readJson } from "../formats/common.js";
import { CliUsageError } from "./errors.js";
import { printHelp } from "./help.js";
import {
  getFlagValue,
  parseLangFlag,
  parseProtocolFlag,
  positionalArgs,
} from "./options.js";
import {
  copyWrapper,
  ensureDir,
  fileExists,
  resolveWrapperTemplate,
} from "./wrappers.js";

function writeLine(stream, message = "") {
  stream.write(`${message}\n`);
}

function stdoutLogger(stdout) {
  return {
    log(message) {
      writeLine(stdout, message);
    },
  };
}

function normalizeEnv(env) {
  return {
    stdout: env.stdout ?? process.stdout,
    stderr: env.stderr ?? process.stderr,
    templatesDir: env.templatesDir,
  };
}

function writeUsageError(err, ctx) {
  writeLine(ctx.stderr, `Error: ${err.message}`);
  if (err.showHelp) {
    printHelp(ctx.stdout);
  }
}

async function runDoctorCommand(args, ctx) {
  const [inputPath] = positionalArgs(args.slice(1));
  const json = args.includes("--json");

  if (!inputPath || inputPath.startsWith("--")) {
    const message = "Missing <inputPath> for 'doctor'.";
    if (json) {
      writeLine(ctx.stdout, JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      writeLine(ctx.stderr, `Error: ${message}`);
      printHelp(ctx.stdout);
    }
    return 1;
  }

  try {
    const report = await inspectVerifierInput(inputPath, {
      lang: parseLangFlag(args),
      templatesDir: ctx.templatesDir,
    });

    if (json) {
      writeLine(ctx.stdout, JSON.stringify(report, null, 2));
    } else {
      ctx.stdout.write(formatDoctorReport(report));
    }

    return report.ok ? 0 : 1;
  } catch (err) {
    const message = err?.message || String(err);
    if (json) {
      writeLine(ctx.stdout, JSON.stringify({ ok: false, error: message }, null, 2));
    } else {
      writeLine(ctx.stderr, `Error: ${message}`);
    }
    return 1;
  }
}

async function runProofToMessageCommand(args, ctx) {
  const [proofPath, publicPath] = positionalArgs(args.slice(1), {
    valueFlags: ["--format", "--output"],
  });

  if (
    !proofPath ||
    proofPath.startsWith("--") ||
    !publicPath ||
    publicPath.startsWith("--")
  ) {
    writeLine(
      ctx.stderr,
      "Error: Missing <proof.json> or <public.json> for 'proof-to-message'.",
    );
    printHelp(ctx.stdout);
    return 1;
  }

  try {
    const proof = await readJson(proofPath, "proof");
    const publicSignals = await readJson(publicPath, "public signals");
    const format = getFlagValue(args, "--format") || "base64";
    const outputPath = getFlagValue(args, "--output");
    const encoded = await proofToMessageBoc({
      proof,
      publicSignals,
      protocol: parseProtocolFlag(args, { required: false }),
      lang: parseLangFlag(args),
      format,
    });

    if (outputPath) {
      await ensureDir(path.dirname(outputPath));
      await fsp.writeFile(outputPath, encoded, "utf8");
    } else {
      writeLine(ctx.stdout, encoded);
    }
    return 0;
  } catch (err) {
    writeLine(ctx.stderr, `Error: ${err?.message || err}`);
    return 1;
  }
}

async function runImportWrapperCommand(args, ctx) {
  const [destPath] = positionalArgs(args.slice(1), { valueFlags: ["--contract-name"] });
  if (!destPath || destPath.startsWith("--")) {
    throw new CliUsageError("Missing <destPath> for 'import-wrapper'.", {
      showHelp: true,
    });
  }

  const protocol = parseProtocolFlag(args, { required: true });
  const lang = parseLangFlag(args);
  const force = args.includes("--force");
  const wrapperSrc = resolveWrapperTemplate(ctx.templatesDir, lang, protocol);

  await copyWrapper(wrapperSrc, destPath, {
    force, stdout: ctx.stdout, contractName: getFlagValue(args, "--contract-name"),
  });
  return 0;
}

async function runGenerateCommand(args, ctx) {
  const positional = positionalArgs(args, {
    valueFlags: ["--contract-name", "--wrapper-dest"],
  });
  if (positional.length < 2) {
    throw new CliUsageError("Missing required arguments.", { showHelp: true });
  }

  const [inputPath, outputPath] = positional;
  const lang = parseLangFlag(args);
  const contractName = getFlagValue(args, "--contract-name");
  const wrapperDest = getFlagValue(args, "--wrapper-dest");
  const force = args.includes("--force");

  if (!fileExists(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const detectedProtocol = await generateVerifier(inputPath, outputPath, {
    lang,
    templatesDir: ctx.templatesDir,
    contractName,
    logger: stdoutLogger(ctx.stdout),
  });

  if (wrapperDest) {
    if (lang === "tact") {
      writeLine(
        ctx.stdout,
        "Tact selected - wrapper copy is skipped even though --wrapper-dest was provided.",
      );
    } else {
      const protocol =
        parseProtocolFlag(args, { required: false }) || detectedProtocol;
      const wrapperSrc = resolveWrapperTemplate(ctx.templatesDir, lang, protocol);
      await copyWrapper(wrapperSrc, wrapperDest, { force, stdout: ctx.stdout, contractName });
    }
  }

  return 0;
}

export async function runCli(args, env = {}) {
  const ctx = normalizeEnv(env);

  try {
    if (args.includes("--help") || args.includes("-h") || args.length === 0) {
      printHelp(ctx.stdout);
      return 0;
    }

    if (args.includes("--vk")) {
      throw new CliUsageError("--vk is no longer supported. Use a .json file directly.");
    }

    switch (args[0]) {
      case "doctor":
        return await runDoctorCommand(args, ctx);
      case "proof-to-message":
        return await runProofToMessageCommand(args, ctx);
      case "import-wrapper":
        return await runImportWrapperCommand(args, ctx);
      default:
        return await runGenerateCommand(args, ctx);
    }
  } catch (err) {
    if (err instanceof CliUsageError) {
      writeUsageError(err, ctx);
    } else {
      writeLine(ctx.stderr, `Error: ${err?.message || err}`);
    }
    return 1;
  }
}
