import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import ts from "typescript";
import { beginCell } from "@ton/core";
import { utils } from "ffjavascript";
import {
  exportPlonkFuncCalldata,
  exportPlonkTolkCalldata,
} from "../src/export_plonk_calldata.js";
import { proofToMessageCell } from "../src/proofMessages.js";
import { getCurveFromName } from "../src/utils.js";

const { stringifyBigInts } = utils;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const templatesDir = path.join(repoRoot, "templates");

const BLS12_381_P = BigInt(
  "0x1a0111ea397fe69a4b1ba7b6434bacd7" +
    "64774b84f38512bf6730d2a0f6b0f624" +
    "1eabfffeb153ffffb9feffffffffaaab",
);
const BLS12_381_R = BigInt(
  "0x73eda753299d7d483339d80809a1d805" +
    "53bda402fffe5bfeffffffff00000001",
);
const BINDING_CRT_MODULI = [
  115792089237316195423570985008687907853269984665640564039457584007908834671663n,
  115792089210356248762697446949407573530086143415290314195533631308867097853951n,
  57896044618658097711785492504343953926634992332820282019728792003956564819949n,
  52435875175126190479447740508185965837690552500527637822603658699938581184513n,
  340282366920938463463374607431768211455n,
];
const POINT_FIELDS = ["A", "B", "C", "Z", "T1", "T2", "T3", "Wxi", "Wxiw"];
const EVALUATION_FIELDS = [
  "eval_a",
  "eval_b",
  "eval_c",
  "eval_s1",
  "eval_s2",
  "eval_zw",
];
const COMPRESSED_ARG_INDICES = [0, 1, 2, 3, 4, 5, 6, 13, 14];
const TRANSCRIPT_ARG_INDICES = [16, 17, 18, 19, 20, 21, 22, 23, 24];

const GENERATOR_COMPRESSED_HEX =
  "97f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905" +
  "a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb";
const GENERATOR_COORDINATES_HEX =
  "17f1d3a73197d7942695638c4fa9ac0fc3688c4f9774b905" +
  "a14e3a3f171bac586c55e83ff97a1aeffb3af00adb22c6bb" +
  "08b3f481e3aaa0f1a09e30ed741d8ae4fcf5e095d5d00af" +
  "600db18cb2c04b3edd03cc744a2888ae40caa232946c5e7e1";

function gcd(a, b) {
  return b === 0n ? a : gcd(b, a % b);
}

test("contract CRT moduli prove the bounded curve equation exactly", () => {
  for (let i = 0; i < BINDING_CRT_MODULI.length; i += 1) {
    for (let j = i + 1; j < BINDING_CRT_MODULI.length; j += 1) {
      assert.equal(gcd(BINDING_CRT_MODULI[i], BINDING_CRT_MODULI[j]), 1n);
    }
  }
  const product = BINDING_CRT_MODULI.reduce((value, modulus) => value * modulus, 1n);
  const maximumDifference =
    BLS12_381_P ** 3n +
    BLS12_381_P ** 2n +
    ((1n << 768n) - 1n) * BLS12_381_P +
    4n;
  assert.ok(product > 2n * maximumDifference);
  assert.equal(product.toString(2).length, 1150);
  assert.ok(maximumDifference.toString(2).length <= 1150);
});

function proofWithPoint(point) {
  return stringifyBigInts({
    protocol: "plonk",
    curve: "bls12381",
    A: point,
    B: point,
    C: point,
    Z: point,
    T1: point,
    T2: point,
    T3: point,
    Wxi: point,
    Wxiw: point,
    eval_a: 1n,
    eval_b: 2n,
    eval_c: 3n,
    eval_s1: 4n,
    eval_s2: 5n,
    eval_zw: 6n,
  });
}

async function makeProofFixtures() {
  const curve = await getCurveFromName("bls12381");
  try {
    const generator = curve.G1.toObject(curve.G1.g);
    const twiceGenerator = curve.G1.toObject(
      curve.G1.timesScalar(curve.G1.g, 2n),
    );
    return {
      generator,
      twiceGenerator,
      identity: curve.G1.toObject(curve.G1.zero),
      nonSubgroup: [0n, 2n, 1n],
      nonCanonical: [generator[0] + BLS12_381_P, generator[1], 1n],
      proof: proofWithPoint(generator),
      otherProof: proofWithPoint(twiceGenerator),
    };
  } finally {
    await curve.terminate();
  }
}

function bytesToBigInt(bytes) {
  return BigInt(`0x${Buffer.from(bytes).toString("hex")}`);
}

function quotientWitness(coordinates) {
  const x = bytesToBigInt(coordinates.subarray(0, 48));
  const y = bytesToBigInt(coordinates.subarray(48));
  const numerator = x ** 3n + 4n - y ** 2n;
  assert.equal(numerator % BLS12_381_P, 0n, "fixture point must be on y^2 = x^3 + 4");
  const quotient = numerator / BLS12_381_P;
  return {
    negative: quotient < 0n,
    magnitude: quotient < 0n ? -quotient : quotient,
  };
}

function transcriptCellWithWitness(coordinateCell) {
  const coordinatesSlice = coordinateCell.beginParse();
  assert.equal(coordinatesSlice.remainingBits, 768);
  const coordinates = coordinatesSlice.loadBuffer(96);
  const witness = quotientWitness(coordinates);
  const witnessCell = beginCell()
    .storeBit(witness.negative)
    .storeUint(witness.magnitude, 768)
    .endCell();
  return beginCell().storeBuffer(coordinates).storeRef(witnessCell).endCell();
}

function mutateWitness(transcriptCell) {
  const transcript = transcriptCell.beginParse();
  const coordinates = transcript.loadBuffer(96);
  const witness = transcript.loadRef().beginParse();
  const negative = witness.loadBit();
  const magnitude = witness.loadUintBig(768);
  return beginCell()
    .storeBuffer(coordinates)
    .storeRef(
      beginCell()
        .storeBit(negative)
        .storeUint(magnitude + 1n, 768)
        .endCell(),
    )
    .endCell();
}

function withSecureTranscriptCells(args) {
  const result = [...args];
  for (const index of TRANSCRIPT_ARG_INDICES) {
    result[index] = {
      ...result[index],
      cell: transcriptCellWithWitness(result[index].cell),
    };
  }
  return result;
}

function readTranscriptLeaves(message) {
  const root = message.beginParse();
  assert.equal(Number(root.loadUint(32)), 0x76524659);
  const payload = root.loadRef();
  assert.equal(root.remainingBits, 0);
  assert.equal(root.remainingRefs, 0);

  const uncompressed = payload.refs.at(-1);
  const tail = uncompressed.refs[3];
  const tail2 = tail.refs[3];
  return [
    ...uncompressed.refs.slice(0, 3),
    ...tail.refs.slice(0, 3),
    ...tail2.refs,
  ];
}

async function loadTemplateModule(templateName) {
  const tempDir = path.join(
    repoRoot,
    `.tmp-plonk-binding-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await fs.mkdir(tempDir, { recursive: true });
  try {
    const source = await fs.readFile(path.join(templatesDir, templateName), "utf8");
    const transpiled = ts.transpileModule(source, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ES2022,
      },
    }).outputText;
    const outputPath = path.join(tempDir, templateName.replace(/\.ts$/, ".mjs"));
    await fs.writeFile(outputPath, transpiled, "utf8");
    return await import(
      `${pathToFileURL(outputPath).href}?t=${Date.now()}-${Math.random()}`
    );
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function captureError(run) {
  try {
    run();
    return null;
  } catch (error) {
    return error;
  }
}

test("encodePlonkG1Point emits canonical bytes and an exact signed quotient witness", async () => {
  const { encodePlonkG1Point } = await import("../src/plonkEncoding.js");
  const { generator } = await makeProofFixtures();
  const curve = await getCurveFromName("bls12381");
  try {
    const encoded = encodePlonkG1Point(curve, generator, "proof.A");

    assert.equal(Buffer.from(encoded.compressed).toString("hex"), GENERATOR_COMPRESSED_HEX);
    assert.equal(Buffer.from(encoded.coordinates).toString("hex"), GENERATOR_COORDINATES_HEX);
    assert.equal(encoded.transcriptCell.bits.length, 768);
    assert.equal(encoded.transcriptCell.refs.length, 1);

    const transcript = encoded.transcriptCell.beginParse();
    assert.equal(transcript.loadBuffer(96).toString("hex"), GENERATOR_COORDINATES_HEX);
    const witness = transcript.loadRef().beginParse();
    assert.equal(witness.remainingBits, 769);
    const negative = witness.loadBit();
    const magnitude = witness.loadUintBig(768);
    assert.equal(witness.remainingBits, 0);
    assert.equal(witness.remainingRefs, 0);
    assert.equal(negative, encoded.witness.negative);
    assert.equal(magnitude, encoded.witness.magnitude);

    const coordinates = Buffer.from(encoded.coordinates);
    const x = bytesToBigInt(coordinates.subarray(0, 48));
    const y = bytesToBigInt(coordinates.subarray(48));
    const signedWitness = negative ? -magnitude : magnitude;
    assert.equal(x ** 3n + 4n - y ** 2n, signedWitness * BLS12_381_P);
  } finally {
    await curve.terminate();
  }
});

test("encodePlonkG1Point rejects non-canonical, identity, and non-subgroup proof points", async () => {
  const { encodePlonkG1Point } = await import("../src/plonkEncoding.js");
  const { identity, nonSubgroup, nonCanonical } = await makeProofFixtures();
  const curve = await getCurveFromName("bls12381");
  try {
    assert.throws(
      () => encodePlonkG1Point(curve, nonCanonical, "proof.A"),
      /proof\.A.*(?:canonical|coordinate|range)/i,
    );
    assert.throws(
      () => encodePlonkG1Point(curve, identity, "proof.A"),
      /proof\.A.*(?:identity|zero|infinity)/i,
    );
    assert.throws(
      () => encodePlonkG1Point(curve, nonSubgroup, "proof.A"),
      /proof\.A.*(?:subgroup|prime.order)/i,
    );
  } finally {
    await curve.terminate();
  }
});

test("assertPlonkPointBindingCells rejects representation and witness mutations", async () => {
  const { encodePlonkG1Point, assertPlonkPointBindingCells } = await import(
    "../src/plonkEncoding.js"
  );
  const { generator, twiceGenerator } = await makeProofFixtures();
  const curve = await getCurveFromName("bls12381");
  try {
    const point = encodePlonkG1Point(curve, generator, "proof.A");
    const other = encodePlonkG1Point(curve, twiceGenerator, "proof.A");
    const compressedCell = beginCell().storeBuffer(point.compressed).endCell();

    assert.doesNotThrow(() =>
      assertPlonkPointBindingCells(compressedCell, point.transcriptCell, "proof.A"),
    );
    assert.throws(
      () =>
        assertPlonkPointBindingCells(compressedCell, other.transcriptCell, "proof.A"),
      /proof\.A.*(?:match|binding|representation)/i,
    );
    assert.throws(
      () =>
        assertPlonkPointBindingCells(
          compressedCell,
          mutateWitness(point.transcriptCell),
          "proof.A",
        ),
      /proof\.A.*witness/i,
    );
  } finally {
    await curve.terminate();
  }
});

test("parseCanonicalPlonkScalar accepts only integers in [0, r)", async () => {
  const { parseCanonicalPlonkScalar } = await import("../src/plonkEncoding.js");

  assert.equal(parseCanonicalPlonkScalar(0n, "proof.eval_a"), 0n);
  assert.equal(
    parseCanonicalPlonkScalar(BLS12_381_R - 1n, "proof.eval_a"),
    BLS12_381_R - 1n,
  );
  for (const invalid of [-1n, BLS12_381_R, BLS12_381_R + 1n]) {
    assert.throws(
      () => parseCanonicalPlonkScalar(invalid, "proof.eval_a"),
      /proof\.eval_a.*(?:canonical|field|range|\[0)/i,
    );
  }
});

test("PLONK calldata adds one exact witness reference to every transcript point", async () => {
  const { proof } = await makeProofFixtures();
  for (const exportCalldata of [exportPlonkFuncCalldata, exportPlonkTolkCalldata]) {
    const args = await exportCalldata(proof, ["7", "8"]);
    assert.equal(args.length, 25);
    for (const index of COMPRESSED_ARG_INDICES) {
      assert.equal(args[index].type, "slice");
      assert.equal(args[index].cell.bits.length, 384, `calldata[${index}] bits`);
      assert.equal(args[index].cell.refs.length, 0, `calldata[${index}] refs`);
    }
    for (const index of TRANSCRIPT_ARG_INDICES) {
      const point = args[index].cell;
      assert.equal(args[index].type, "slice");
      assert.equal(point.bits.length, 768, `calldata[${index}] bits`);
      assert.equal(point.refs.length, 1, `calldata[${index}] refs`);
      assert.equal(point.refs[0].bits.length, 769, `calldata[${index}] witness bits`);
      assert.equal(point.refs[0].refs.length, 0, `calldata[${index}] witness refs`);
    }
  }
});

test("PLONK calldata rejects invalid proof points instead of normalizing them", async () => {
  const { proof, identity, nonSubgroup, nonCanonical } = await makeProofFixtures();
  const hostilePoints = [
    ["identity", identity, /identity|zero|infinity/i],
    ["non-subgroup", nonSubgroup, /subgroup|prime.order/i],
    ["non-canonical", nonCanonical, /canonical|coordinate|range/i],
  ];
  const accepted = [];

  for (const [name, hostilePoint, expectedError] of hostilePoints) {
    const hostileProof = { ...proof, A: stringifyBigInts(hostilePoint) };
    try {
      await exportPlonkTolkCalldata(hostileProof, []);
      accepted.push(name);
    } catch (error) {
      assert.match(String(error), expectedError);
    }
  }

  assert.deepEqual(accepted, []);
});

test("PLONK calldata rejects evaluations at r instead of silently reducing them", async () => {
  const { proof } = await makeProofFixtures();
  const accepted = [];

  for (const field of EVALUATION_FIELDS) {
    try {
      await exportPlonkTolkCalldata({ ...proof, [field]: BLS12_381_R.toString() }, []);
      accepted.push(field);
    } catch (error) {
      assert.match(String(error), new RegExp(field, "i"));
    }
  }

  assert.deepEqual(accepted, []);
});

test("Func and Tolk calldata reject public signals outside [0, r)", async () => {
  const { proof } = await makeProofFixtures();
  const violations = [];

  for (const [language, exportCalldata] of [
    ["Func", exportPlonkFuncCalldata],
    ["Tolk", exportPlonkTolkCalldata],
  ]) {
    for (const value of [-1n, BLS12_381_R]) {
      try {
        await exportCalldata(proof, [value.toString()]);
        violations.push(`${language}:${value}: accepted`);
      } catch (error) {
        if (!/public inputs?\[0\]|public signal/i.test(String(error))) {
          violations.push(`${language}:${value}: ${error}`);
        }
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("proofMessages preserves the PLONK opcode and all nine witness references", async () => {
  const { proof } = await makeProofFixtures();

  for (const lang of ["func", "tolk"]) {
    const message = await proofToMessageCell({
      proof,
      publicSignals: ["7", "8"],
      protocol: "plonk",
      lang,
    });
    const transcriptLeaves = readTranscriptLeaves(message);
    assert.equal(transcriptLeaves.length, 9);
    for (const [index, point] of transcriptLeaves.entries()) {
      assert.equal(point.bits.length, 768, `${lang} point ${index} bits`);
      assert.equal(point.refs.length, 1, `${lang} point ${index} refs`);
      assert.equal(point.refs[0].bits.length, 769, `${lang} point ${index} witness bits`);
      assert.equal(point.refs[0].refs.length, 0, `${lang} point ${index} witness refs`);
    }
  }
});

test("PLONK wrappers require exactly 25 arguments and preserve witness cells", async (t) => {
  const { proof } = await makeProofFixtures();
  for (const [name, templateName, exportCalldata] of [
    ["Func", "Verifier_func_plonk.ts", exportPlonkFuncCalldata],
    ["Tolk", "Verifier_tolk_plonk.ts", exportPlonkTolkCalldata],
  ]) {
    await t.test(name, async () => {
      const { proofMessageToCell } = await loadTemplateModule(templateName);
      const args = withSecureTranscriptCells(await exportCalldata(proof, ["7"]));
      const message = proofMessageToCell(args);
      const leaves = readTranscriptLeaves(message);
      assert.deepEqual(
        leaves.map((cell) => cell.hash().toString("hex")),
        TRANSCRIPT_ARG_INDICES.map((index) => args[index].cell.hash().toString("hex")),
      );

      const rejected = [];
      for (const [caseName, candidate] of [
        ["truncated", args.slice(0, 24)],
        ["trailing", [...args, { type: "int", value: 0n }]],
      ]) {
        const error = captureError(() => proofMessageToCell(candidate));
        if (error) {
          assert.match(String(error), /25|calldata\[24\]/i);
          rejected.push(caseName);
        }
      }
      assert.deepEqual(rejected, ["truncated", "trailing"]);
    });
  }
});

test("PLONK wrappers reject malformed point and witness cell shapes", async (t) => {
  const { proof } = await makeProofFixtures();
  for (const [name, templateName, exportCalldata] of [
    ["Func", "Verifier_func_plonk.ts", exportPlonkFuncCalldata],
    ["Tolk", "Verifier_tolk_plonk.ts", exportPlonkTolkCalldata],
  ]) {
    await t.test(name, async () => {
      const { proofMessageToCell } = await loadTemplateModule(templateName);
      const args = withSecureTranscriptCells(await exportCalldata(proof, ["7"]));
      const coordinates = args[16].cell.beginParse().loadBuffer(96);
      const witness = args[16].cell.refs[0];
      const malformed = [
        ["383-bit compressed point", 0, beginCell().storeUint(0n, 383).endCell()],
        [
          "compressed point with a ref",
          0,
          beginCell().storeBuffer(args[0].cell.beginParse().loadBuffer(48)).storeRef(witness).endCell(),
        ],
        [
          "767-bit transcript point",
          16,
          beginCell().storeUint(0n, 767).storeRef(witness).endCell(),
        ],
        ["transcript point without witness", 16, beginCell().storeBuffer(coordinates).endCell()],
        [
          "transcript point with two refs",
          16,
          beginCell().storeBuffer(coordinates).storeRef(witness).storeRef(witness).endCell(),
        ],
        [
          "768-bit witness",
          16,
          beginCell()
            .storeBuffer(coordinates)
            .storeRef(beginCell().storeUint(0n, 768).endCell())
            .endCell(),
        ],
        [
          "witness with a ref",
          16,
          beginCell()
            .storeBuffer(coordinates)
            .storeRef(beginCell().storeUint(0n, 769).storeRef(witness).endCell())
            .endCell(),
        ],
      ];
      const accepted = [];

      for (const [caseName, index, cell] of malformed) {
        const candidate = [...args];
        candidate[index] = { ...candidate[index], cell };
        if (!captureError(() => proofMessageToCell(candidate))) accepted.push(caseName);
      }

      assert.deepEqual(accepted, []);
    });
  }
});

test("PLONK wrappers reject mismatched representations and a mutated witness", async (t) => {
  const { proof, otherProof } = await makeProofFixtures();
  for (const [name, templateName, exportCalldata] of [
    ["Func", "Verifier_func_plonk.ts", exportPlonkFuncCalldata],
    ["Tolk", "Verifier_tolk_plonk.ts", exportPlonkTolkCalldata],
  ]) {
    await t.test(name, async () => {
      const { proofMessageToCell } = await loadTemplateModule(templateName);
      const args = withSecureTranscriptCells(await exportCalldata(proof, ["7"]));
      const otherArgs = withSecureTranscriptCells(
        await exportCalldata(otherProof, ["7"]),
      );
      const mismatched = [...args];
      mismatched[16] = otherArgs[16];
      const mutated = [...args];
      mutated[16] = { ...mutated[16], cell: mutateWitness(mutated[16].cell) };

      assert.throws(
        () => proofMessageToCell(mismatched),
        /(?:calldata\[16\]|proof\.A).*(?:match|binding|representation)/i,
      );
      assert.throws(
        () => proofMessageToCell(mutated),
        /(?:calldata\[16\]|proof\.A).*witness/i,
      );
    });
  }
});
