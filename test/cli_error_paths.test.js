import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "src/cli.js");

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-cli-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function runCliExpectFailure(args) {
  try {
    execFileSync(process.execPath, [cliPath, ...args], {
      cwd: repoRoot,
      stdio: "pipe",
    });
    throw new Error(`CLI unexpectedly succeeded: ${args.join(" ")}`);
  } catch (err) {
    if (err instanceof Error && !("status" in err)) {
      throw err;
    }

    return {
      status: err.status ?? 1,
      stdout: String(err.stdout ?? ""),
      stderr: String(err.stderr ?? ""),
    };
  }
}

test("CLI rejects conflicting language flags for import-wrapper", async () => {
  await withTempDir(async (tempDir) => {
    const destPath = path.join(tempDir, "Verifier.ts");
    const result = runCliExpectFailure([
      "import-wrapper",
      destPath,
      "--groth16",
      "--func",
      "--tolk",
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Use only one of --func, --tolk, --tact/);
  });
});

test("CLI requires a protocol flag for import-wrapper", async () => {
  await withTempDir(async (tempDir) => {
    const destPath = path.join(tempDir, "Verifier.ts");
    const result = runCliExpectFailure(["import-wrapper", destPath]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing protocol flag: use --groth16 or --plonk/);
  });
});

test("CLI refuses to overwrite an existing wrapper without --force", async () => {
  await withTempDir(async (tempDir) => {
    const destPath = path.join(tempDir, "Verifier.ts");
    await fs.writeFile(destPath, "// existing wrapper", "utf8");

    const result = runCliExpectFailure([
      "import-wrapper",
      destPath,
      "--groth16",
    ]);

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Wrapper already exists/);
    assert.match(result.stderr, /Use --force to overwrite/);
  });
});

test("CLI reports missing values for --wrapper-dest before touching the input file", () => {
  const result = runCliExpectFailure([
    "missing-input.json",
    "verifier.tolk",
    "--wrapper-dest",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing value for --wrapper-dest/);
  assert.doesNotMatch(result.stderr, /Input file not found/);
});
