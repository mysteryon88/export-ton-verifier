import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");

async function readRepoFile(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), "utf8");
}

test("CLI entrypoint is a thin wrapper around runCli", async () => {
  const content = await readRepoFile("src/cli.js");
  const exitCalls = content.match(/process\.exit\(/g) ?? [];

  assert.match(content, /import\s+\{\s*runCli\s*\}\s+from\s+"\.\/cli\/commands\.js"/);
  assert.ok(exitCalls.length <= 1, `expected at most one process.exit call, got ${exitCalls.length}`);
});

test("CLI command modules do not terminate the process directly", async () => {
  const cliDir = path.join(repoRoot, "src", "cli");
  const entries = await fs.readdir(cliDir);
  const jsFiles = entries.filter((entry) => entry.endsWith(".js"));

  assert.ok(jsFiles.length > 0, "expected CLI modules under src/cli");

  for (const file of jsFiles) {
    const content = await fs.readFile(path.join(cliDir, file), "utf8");
    assert.doesNotMatch(content, /process\.exit\(/, `${file} should return status codes instead`);
  }
});
