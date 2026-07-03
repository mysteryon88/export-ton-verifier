import { CliUsageError } from "./errors.js";

export function parseLangFlag(args) {
  const allowed = ["--func", "--tolk", "--tact"];
  const chosen = allowed.filter((flag) => args.includes(flag));

  if (chosen.length > 1) {
    throw new CliUsageError("Use only one of --func, --tolk, --tact.");
  }

  if (chosen.length === 0) return "tolk";
  return chosen[0].slice(2);
}

export function parseProtocolFlag(args, { required = false } = {}) {
  const isGroth = args.includes("--groth16");
  const isPlonk = args.includes("--plonk");

  if (isGroth && isPlonk) {
    throw new CliUsageError("Use only one of --groth16 or --plonk.");
  }

  if (!isGroth && !isPlonk) {
    if (required) {
      throw new CliUsageError("Missing protocol flag: use --groth16 or --plonk.");
    }
    return null;
  }

  return isGroth ? "groth16" : "plonk";
}

export function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1) return null;

  const value = args[idx + 1];
  if (!value || value.startsWith("--")) {
    throw new CliUsageError(`Missing value for ${flag}.`);
  }

  return value;
}

export function positionalArgs(args, { valueFlags = [] } = {}) {
  const flagsWithValues = new Set(valueFlags);
  const positional = [];

  for (let idx = 0; idx < args.length; idx += 1) {
    const arg = args[idx];
    if (arg.startsWith("--")) {
      if (
        flagsWithValues.has(arg) &&
        args[idx + 1] &&
        !args[idx + 1].startsWith("--")
      ) {
        idx += 1;
      }
      continue;
    }

    positional.push(arg);
  }

  return positional;
}
