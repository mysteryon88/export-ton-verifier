// SPDX-License-Identifier: GPL-3.0-or-later
import path from "path";
import { fileURLToPath } from "url";
import { runCli } from "../src/cli/commands.js";

const testSupportDir = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.dirname(testSupportDir);
export const templatesDir = path.join(repoRoot, "templates");

function captureStream() {
  let value = "";
  return {
    stream: {
      write(chunk) {
        value += String(chunk);
        return true;
      },
    },
    output() {
      return value;
    },
  };
}

export async function runCliInProcess(args, options = {}) {
  const stdout = captureStream();
  const stderr = captureStream();
  const previousCwd = process.cwd();

  try {
    if (options.cwd) process.chdir(options.cwd);
    const status = await runCli(args, {
      stdout: stdout.stream,
      stderr: stderr.stream,
      templatesDir: options.templatesDir ?? templatesDir,
    });
    return {
      status,
      stdout: stdout.output(),
      stderr: stderr.output(),
    };
  } finally {
    process.chdir(previousCwd);
  }
}

export async function runCliSuccess(args, options = {}) {
  const result = await runCliInProcess(args, options);
  if (result.status !== 0) {
    throw new Error(
      `CLI failed with status ${result.status}: ${result.stderr || result.stdout}`,
    );
  }
  return result.stdout;
}
