import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import { utils } from "ffjavascript";
import { getCurveFromName } from "../src/utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const cliPath = path.join(repoRoot, "src/cli.js");
const { stringifyBigInts } = utils;

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

function runCliExpectFailure(args, { cwd = repoRoot } = {}) {
  try {
    execFileSync(process.execPath, [cliPath, ...args], {
      cwd,
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

function runCliSuccess(args) {
  return execFileSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    stdio: "pipe",
    encoding: "utf8",
  });
}

async function writeGroth16JsonVk(filePath, nPublic = 1) {
  const curve = await getCurveFromName("bls12381");

  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const vk = stringifyBigInts({
      protocol: "groth16",
      curve: "bls12381",
      vk_alpha_1: g1,
      vk_beta_2: g2,
      vk_gamma_2: g2,
      vk_delta_2: g2,
      IC: Array.from({ length: nPublic + 1 }, () => g1),
    });

    await fs.writeFile(filePath, JSON.stringify(vk), "utf8");
  } finally {
    await curve.terminate();
  }
}

test("CLI help states Tolk is the default for PLONK and FunC needs --func", () => {
  const output = runCliSuccess(["--help"]);

  assert.match(output, /Tolk is the default for Groth16 and PLONK verifier generation/);
  assert.match(output, /Use --func to generate FunC output/);
});

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

test("CLI reports missing import-wrapper destination without a stack trace", () => {
  const result = runCliExpectFailure(["import-wrapper"]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Error: Missing <destPath> for 'import-wrapper'\./);
  assert.match(result.stdout, /Usage:/);
  assert.doesNotMatch(result.stderr, /CliUsageError/);
  assert.doesNotMatch(result.stderr, /at runImportWrapperCommand/);
  assert.doesNotMatch(result.stderr, /Node\.js/);
});

test("CLI does not treat protocol flags as an import-wrapper destination", async () => {
  await withTempDir(async (tempDir) => {
    const result = runCliExpectFailure(
      ["import-wrapper", "--groth16", "--force"],
      { cwd: tempDir },
    );

    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Missing <destPath> for 'import-wrapper'/);
    await assert.rejects(fs.stat(path.join(tempDir, "--groth16")), {
      code: "ENOENT",
    });
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

test("CLI does not treat --wrapper-dest value as the verifier output path", () => {
  const result = runCliExpectFailure([
    "package.json",
    "--wrapper-dest",
    "wrappers",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing required arguments/);
  assert.doesNotMatch(result.stderr, /could not auto-detect verification key JSON format/);
});

test("CLI rejects the removed --vk flag", () => {
  const result = runCliExpectFailure([
    "unused-input.json",
    "verifier.tolk",
    "--vk",
  ]);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--vk is no longer supported/);
});

test("CLI generation keeps progress output enabled", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "verification_key.json");
    const outputPath = path.join(tempDir, "verifier.tolk");
    await writeGroth16JsonVk(inputPath);

    const output = runCliSuccess([inputPath, outputPath]);

    assert.match(output, /Using template for: tolk groth16/);
    assert.match(output, /Done\./);
  });
});
