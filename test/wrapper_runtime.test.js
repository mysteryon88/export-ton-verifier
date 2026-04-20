import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const templatesDir = path.join(repoRoot, "templates");

async function withRepoTempDir(run) {
  const tempDir = path.join(
    repoRoot,
    `.tmp-wrapper-test-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await fs.mkdir(tempDir, { recursive: true });
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function loadTemplateModule(templateName) {
  return withRepoTempDir(async (tempDir) => {
    const source = await fs.readFile(path.join(templatesDir, templateName), "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText;

    const outPath = path.join(tempDir, templateName.replace(/\.ts$/, ".mjs"));
    await fs.writeFile(outPath, transpiled, "utf8");

    const module = await import(
      `${pathToFileURL(outPath).href}?t=${Date.now()}-${Math.random()}`
    );

    return module;
  });
}

function decodeSerializedIntArray(cell) {
  let slice = cell.beginParse();
  const length = Number(slice.loadUint(8));
  const values = [];

  while (values.length < length) {
    if (slice.remainingBits < 257) {
      assert.equal(slice.remainingBits, 0);
      assert.ok(slice.remainingRefs > 0);
      slice = slice.loadRef().beginParse();
    }
    values.push(slice.loadIntBig(257));
  }

  assert.equal(slice.remainingBits, 0);
  assert.equal(slice.remainingRefs, 0);
  return values;
}

test("Func wrapper builds the expected public input dictionary", async () => {
  const { Verifier } = await loadTemplateModule("Verifier_func_groth16.ts");
  const verifier = new Verifier({});
  const dict = verifier.dictFromInputList([10n, 20n, 30n]);

  assert.equal(dict.get(0n), 10n);
  assert.equal(dict.get(1n), 20n);
  assert.equal(dict.get(2n), 30n);
  assert.equal(dict.get(3n), undefined);
});

test("Tolk wrapper serializes array<int> payloads in contract-compatible form", async () => {
  const { Verifier } = await loadTemplateModule("Verifier_tolk_groth16.ts");
  const verifier = new Verifier({});
  const values = [1n, 2n, 3n, 4n];

  const serialized = verifier.serializeIntArray(values);

  assert.deepEqual(decodeSerializedIntArray(serialized), values);
  assert.throws(
    () => verifier.serializeIntArray(Array.from({ length: 256 }, (_, i) => BigInt(i))),
    /supports at most 255 items/,
  );
});
