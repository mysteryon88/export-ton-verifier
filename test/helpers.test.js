import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { resolveTemplatePath } from "../src/helpers.js";

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-helpers-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

test("resolveTemplatePath prefers protocol-specific templates when they exist", async () => {
  await withTempDir(async (tempDir) => {
    const grothPath = path.join(tempDir, "demo_verifier_groth16.ejs");
    const plonkPath = path.join(tempDir, "demo_verifier_plonk.ejs");
    const fallbackPath = path.join(tempDir, "demo_verifier.ejs");

    await Promise.all([
      fs.writeFile(grothPath, "groth16", "utf8"),
      fs.writeFile(plonkPath, "plonk", "utf8"),
      fs.writeFile(fallbackPath, "fallback", "utf8"),
    ]);

    assert.equal(
      await resolveTemplatePath(tempDir, "demo", "groth16"),
      grothPath,
    );
    assert.equal(
      await resolveTemplatePath(tempDir, "demo", "plonk"),
      plonkPath,
    );
  });
});

test("resolveTemplatePath falls back to the generic Groth16 template", async () => {
  await withTempDir(async (tempDir) => {
    const fallbackPath = path.join(tempDir, "demo_verifier.ejs");
    await fs.writeFile(fallbackPath, "fallback", "utf8");

    assert.equal(
      await resolveTemplatePath(tempDir, "demo", "groth16"),
      fallbackPath,
    );
  });
});

test("resolveTemplatePath throws when no matching template exists", async () => {
  await withTempDir(async (tempDir) => {
    await assert.rejects(
      resolveTemplatePath(tempDir, "missing", "plonk"),
      /Template not found/,
    );
  });
});
