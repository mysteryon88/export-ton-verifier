import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL, fileURLToPath } from "url";
import ts from "typescript";
import { Address, beginCell } from "@ton/core";

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

function decodeSerializedUint256Array(slice) {
  const length = Number(slice.loadUint(8));
  const hasFirst = slice.loadBit();
  const values = [];

  if (length === 0) {
    assert.equal(hasFirst, false);
    return values;
  }

  assert.equal(hasFirst, true);
  let chunk = slice.loadRef().beginParse();
  while (values.length < length) {
    const hasNext = chunk.loadBit();
    while (values.length < length && chunk.remainingBits >= 256) {
      values.push(chunk.loadUintBig(256));
    }

    if (values.length < length) {
      assert.equal(hasNext, true);
      chunk = chunk.loadRef().beginParse();
    } else {
      assert.equal(hasNext, false);
      assert.equal(chunk.remainingBits, 0);
      assert.equal(chunk.remainingRefs, 0);
    }
  }

  return values;
}

function makeTolkPlonkArgs(publicInputs = [11n, 22n, 33n, 44n]) {
  const point = (byte, size) =>
    beginCell().storeBuffer(Buffer.alloc(size, byte)).endCell();
  const args = [
    { type: "slice", cell: point(0x01, 48) },
    { type: "slice", cell: point(0x02, 48) },
    { type: "slice", cell: point(0x03, 48) },
    { type: "slice", cell: point(0x04, 48) },
    { type: "slice", cell: point(0x05, 48) },
    { type: "slice", cell: point(0x06, 48) },
    { type: "slice", cell: point(0x07, 48) },
    { type: "int", value: 101n },
    { type: "int", value: 102n },
    { type: "int", value: 103n },
    { type: "int", value: 104n },
    { type: "int", value: 105n },
    { type: "int", value: 106n },
    { type: "slice", cell: point(0x08, 48) },
    { type: "slice", cell: point(0x09, 48) },
    {
      type: "tuple",
      items: publicInputs.map((value) => ({ type: "int", value })),
    },
    { type: "slice", cell: point(0x11, 96) },
    { type: "slice", cell: point(0x12, 96) },
    { type: "slice", cell: point(0x13, 96) },
    { type: "slice", cell: point(0x14, 96) },
    { type: "slice", cell: point(0x15, 96) },
    { type: "slice", cell: point(0x16, 96) },
    { type: "slice", cell: point(0x17, 96) },
    { type: "slice", cell: point(0x18, 96) },
    { type: "slice", cell: point(0x19, 96) },
  ];
  return args;
}

function makeFuncPlonkArgs() {
  const args = makeTolkPlonkArgs();
  args[15] = { type: "cell", cell: beginCell().endCell() };
  return args;
}

function decodePlonkProofMessage(body) {
  const root = body.beginParse();
  assert.equal(root.loadUint(32), 0x76524659);
  const payload = root.loadRef().beginParse();
  assert.equal(root.remainingBits, 0);
  assert.equal(root.remainingRefs, 0);

  const compressed = payload.loadRef();
  const evaluations = payload.loadRef();
  const publicInputs = decodeSerializedUint256Array(payload);
  const uncompressed = payload.loadRef();

  assert.equal(payload.remainingBits, 0);
  assert.equal(payload.remainingRefs, 0);

  return { compressed, evaluations, publicInputs, uncompressed };
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

test("Tolk PLONK wrapper builds VerifyProofMessage with array<uint256> public inputs", async () => {
  const { proofMessageToCell } = await loadTemplateModule("Verifier_tolk_plonk.ts");
  const values = [11n, 22n, 33n, 44n];

  const decoded = decodePlonkProofMessage(proofMessageToCell(makeTolkPlonkArgs(values)));

  assert.deepEqual(decoded.publicInputs, values);
  assert.equal(decoded.compressed.refs.length, 4);
  assert.equal(decoded.evaluations.refs.length, 2);
  assert.equal(decoded.uncompressed.refs.length, 4);
});

test("Tolk PLONK wrapper rejects public inputs over transcript limit", async () => {
  const { proofMessageToCell } = await loadTemplateModule("Verifier_tolk_plonk.ts");
  const values = Array.from({ length: 245 }, (_, index) => BigInt(index));

  assert.throws(
    () => proofMessageToCell(makeTolkPlonkArgs(values)),
    /at most 244 public inputs/,
  );
});

test("Tolk PLONK sendVerify sends the contract-compatible proof message", async () => {
  const { Verifier } = await loadTemplateModule("Verifier_tolk_plonk.ts");
  const verifier = Verifier.createFromAddress(
    Address.parseRaw(`0:${"0".repeat(64)}`),
  );
  const values = [5n, 6n, 7n, 8n];
  const calls = [];
  const provider = {
    internal: async (...args) => {
      calls.push(args);
    },
  };

  await verifier.sendVerify(provider, {}, 1000n, makeTolkPlonkArgs(values));

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].value, 1000n);
  assert.deepEqual(decodePlonkProofMessage(calls[0][1].body).publicInputs, values);
});

test("Tolk PLONK getVerify passes tuple calldata through unchanged", async () => {
  const { Verifier } = await loadTemplateModule("Verifier_tolk_plonk.ts");
  const verifier = Verifier.createFromAddress(
    Address.parseRaw(`0:${"0".repeat(64)}`),
  );
  const values = [9n, 10n];
  const args = makeTolkPlonkArgs(values);
  const provider = {
    get: async (method, receivedArgs) => {
      assert.equal(method, "verify");
      assert.equal(receivedArgs, args);
      assert.equal(receivedArgs[15].type, "tuple");
      assert.deepEqual(
        receivedArgs[15].items.map((item) => item.value),
        values,
      );
      return { stack: { readBoolean: () => true }, gasUsed: 123n };
    },
  };

  assert.equal(await verifier.getVerify(provider, args), true);
});

test("Func PLONK getVerify passes Func calldata through unchanged", async () => {
  const { Verifier } = await loadTemplateModule("Verifier_func_plonk.ts");
  const verifier = Verifier.createFromAddress(
    Address.parseRaw(`0:${"0".repeat(64)}`),
  );
  const args = makeFuncPlonkArgs();
  const provider = {
    get: async (method, receivedArgs) => {
      assert.equal(method, "verify");
      assert.equal(receivedArgs, args);
      assert.equal(receivedArgs[15].type, "cell");
      return { stack: { readBoolean: () => true } };
    },
  };

  assert.equal(await verifier.getVerify(provider, args), true);
});

test("Func PLONK sendVerify sends the receiver-compatible proof message", async () => {
  const { Verifier } = await loadTemplateModule("Verifier_func_plonk.ts");
  const verifier = Verifier.createFromAddress(
    Address.parseRaw(`0:${"0".repeat(64)}`),
  );
  const args = makeFuncPlonkArgs();
  const calls = [];
  const provider = {
    internal: async (...received) => {
      calls.push(received);
    },
  };

  await verifier.sendVerify(provider, {}, 50000000n, args);

  assert.equal(calls.length, 1);
  assert.equal(calls[0][1].value, 50000000n);
  const body = calls[0][1].body.beginParse();
  assert.equal(body.loadUint(32), 0x76524659);
  assert.equal(body.loadRef().refs.length, 4);
});
