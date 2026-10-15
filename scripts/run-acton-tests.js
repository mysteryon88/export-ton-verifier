// SPDX-License-Identifier: GPL-3.0-or-later
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { prepareActonFixtures } from "../test-support/prepare_acton.js";

const root = fileURLToPath(new URL("../", import.meta.url));
await prepareActonFixtures(path.join(root, "test", "acton"));
const args = ["test", ...process.argv.slice(2)];
const options = {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ACTON_LOG_DIR: path.join(root, "build", "logs") },
};
let result = spawnSync("acton", args, options);
if (result.error?.code === "ENOENT" && process.platform === "win32") {
  result = spawnSync("wsl.exe", [
    "--cd", root, "--exec", "bash", "-lc",
    'ACTON_LOG_DIR=build/logs exec acton "$@"', "acton", ...args,
  ], options);
}
if (result.error) {
  console.error(`Acton is required for Tolk contract tests: ${result.error.message}`);
}
process.exitCode = result.status ?? 1;
