// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "fs/promises";
import path from "path";
import assert from "node:assert/strict";
import { beginCell, convertToMerkleProof } from "@ton/core";
import { utils } from "ffjavascript";
import { generateVerifier } from "../src/generateVerifiers.js";
import { g1Compressed, g2Compressed, getCurveFromName } from "../src/utils.js";
import { exportPlonkTolkCalldata } from "../src/export_plonk_calldata.js";
import { proofToMessageCell } from "../src/proofMessages.js";
import { BLS12_381_BASE_FIELD } from "../src/plonkEncoding.js";
import {
  writeGasBoundaryArtifacts, replaceCellRef, mismatchFirstCompressedPoint,
  addTrailingBit, emptyCompressedTree, malformedPublicInputs,
  malformedTranscriptWitness,
} from "./plonk_fixtures.js";

const { stringifyBigInts } = utils;

function cellLiteral(cell) {
  return `parseCellFromBase64("${cell.toBoc().toString("base64")}")`;
}

function argsLiteral(args) {
  return `[${args.map((arg) => {
    if (arg.type === "int") return String(arg.value);
    if (arg.type === "tuple") return `${argsLiteral(arg.items)} as array<int>`;
    if (arg.type === "slice") return `${cellLiteral(arg.cell)}.beginParse()`;
    throw new Error(`Unsupported fixture stack item: ${arg.type}`);
  }).join(", ")}]`;
}

function replaceRefPath(cell, indices, replacement) {
  if (indices.length === 0) return replacement;
  const [index, ...rest] = indices;
  assert.ok(index >= 0 && index < cell.refs.length, "Fixture ref path must exist");
  return replaceCellRef(cell, index, replaceRefPath(cell.refs[index], rest, replacement));
}

function compressedPoints(body) {
  const compressed = body.refs[0].refs[0];
  const pairs = [...compressed.refs.slice(0, 3), compressed.refs[3].refs[0]];
  return [
    ...pairs.flatMap((pair) => {
      const reader = pair.beginParse();
      return [reader.loadBuffer(48), reader.loadBuffer(48)];
    }),
    compressed.refs[3].refs[1].beginParse().loadBuffer(48),
  ];
}

export async function prepareActonFixtures(root) {
  const generated = path.join(root, "generated");
  await fs.mkdir(generated, { recursive: true });
  const declarations = ['import "@acton/fmt"'];
  const add = (name, type, value) => declarations.push(`fun ${name}(): ${type} { return ${value}; }`);
  const addArgs = (name, args) => add(name, "array<unknown>", argsLiteral(args));
  const addArgCases = (name, cases) => add(name, "array<array<unknown>>", `[${cases.map(argsLiteral).join(", ")}]`);
  const addCells = (name, cells) => add(name, "array<cell>", `[${cells.map(cellLiteral).join(", ")}]`);
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
      IC: Array(5).fill(g1),
      nPublic: 4,
    });
    const key = path.join(generated, "groth16-vk.json");
    const compileCases = [];
    for (const [count, contractName] of [
      [0], [1], [2], [3], [4], [7], [8], [9], [14], [9, "MyVerifier"],
    ]) {
      vk.IC = Array(count + 1).fill(stringifyBigInts(g1));
      vk.nPublic = count;
      await fs.writeFile(key, JSON.stringify(vk));
      const name = count === 4 ? "Groth16" : `Groth16-${count}${contractName ? "-named" : ""}`;
      await generateVerifier(key, path.join(generated, `${name}.tolk`), { quiet: true, contractName });
      compileCases.push(`{ source: "test/acton/generated/${name}.tolk", getter: "${contractName ? "verify_MyVerifier" : "verify"}", inputs: [${Array(count).fill("0").join(", ")}] }`);
    }
    declarations.push("struct Groth16Case { source: string; getter: string; inputs: array<int> }");
    add("groth16CompileCases", "array<Groth16Case>", `[${compileCases.join(", ")}]`);

    const point = (hex, ref = false) => {
      const b = beginCell().storeBuffer(Buffer.from(hex, "hex"));
      if (ref) b.storeRef(beginCell().endCell());
      return b.endCell();
    };
    const pointBits = (bits) => beginCell().storeUint(0n, bits).endCell();
    const g1Hex = g1Compressed(curve, g1);
    const g2Hex = g2Compressed(curve, g2);
    const validG1 = point(g1Hex);
    const validG2 = point(g2Hex);
    // With zero inputs, pairing exponents sum to IC0 - A + C + alpha = 1 - 3 + 1 + 1 = 0.
    const tripleG1 = point(g1Compressed(curve, curve.G1.toObject(curve.G1.timesScalar(curve.G1.g, 3n))));
    const identityG1 = point(g1Compressed(curve, curve.G1.toObject(curve.G1.zero)));
    const identityG2 = point(g2Compressed(curve, curve.G2.toObject(curve.G2.zero)));
    const nonSubgroupG1 = point(g1Compressed(curve, [0n, 2n, 1n]));
    const nonSubgroupG2 = point("80" + "00".repeat(94) + "02");
    const grothArgs = (a = validG1, b = validG2, c = validG1, inputs = [0n, 0n, 0n, 0n]) => [
      ...[a, b, c].map((cell) => ({ type: "slice", cell })),
      { type: "tuple", items: inputs.map((value) => ({ type: "int", value })) },
    ];
    addArgs("groth16Args", grothArgs(tripleG1));
    addArgs("groth16MaxScalarArgs", grothArgs(validG1, validG2, validG1, [0n, 0n, 0n, curve.r - 1n]));
    addArgCases("groth16InvalidPointArgs", [
      ...[383, 385].map((bits) => grothArgs(pointBits(bits))),
      ...[767, 769].map((bits) => grothArgs(validG1, pointBits(bits))),
      grothArgs(beginCell().endCell()), grothArgs(point(g1Hex + "00")),
      grothArgs(validG1, point(g2Hex + "00")), grothArgs(point(g1Hex, true)),
      grothArgs(validG1, point(g2Hex, true)), grothArgs(identityG1),
      grothArgs(validG1, identityG2), grothArgs(validG1, validG2, identityG1),
      grothArgs(identityG1, identityG2, identityG1), grothArgs(nonSubgroupG1),
      grothArgs(validG1, nonSubgroupG2),
    ]);
    addArgCases("groth16InvalidScalarArgs", [[], [0n, 0n, 0n], [0n, 0n, 0n, 0n, 0n],
      ...[curve.r, curve.r + 1n, -1n].map((last) => [0n, 0n, 0n, last]),
    ].map((inputs) => grothArgs(validG1, validG2, validG1, inputs)));

    const proof = (a = validG1, b = validG2, c = validG1) => beginCell().storeRef(a).storeRef(b).storeRef(c).endCell();
    const tail = beginCell().storeInt(0n, 257).endCell();
    const payload = beginCell().storeUint(4, 8).storeInt(0n, 257).storeInt(0n, 257).storeInt(0n, 257).storeRef(tail).endCell();
    const grothBody = (p = proof(), inputs = payload, trailing = false) => {
      const b = beginCell().storeUint(0x3b3cca17, 32).storeRef(p).storeRef(inputs);
      if (trailing) b.storeBit(false);
      return b.endCell();
    };
    add("groth16Body", "cell", cellLiteral(grothBody(proof(tripleG1))));
    add("groth16WrongBody", "cell", cellLiteral(grothBody()));
    const malformedProofs = [
      beginCell().storeBit(false).storeRef(validG1).storeRef(validG2).storeRef(validG1).endCell(),
      beginCell().storeRef(validG1).storeRef(validG2).storeRef(validG1).storeRef(tail).endCell(),
      convertToMerkleProof(proof()), proof(convertToMerkleProof(validG1)),
      proof(validG1, convertToMerkleProof(validG2)), proof(validG1, validG2, convertToMerkleProof(validG1)),
    ];
    const malformedPayloads = [
      beginCell().storeUint(4, 8).storeInt(0n, 257).storeRef(beginCell().storeInt(0n, 257).storeInt(0n, 257).storeInt(0n, 257)).endCell(),
      beginCell().storeUint(4, 8).endCell(),
      beginCell().storeUint(4, 8).storeRef(tail).storeRef(tail).endCell(),
      beginCell().storeUint(4, 8).storeUint(0n, 256).storeRef(tail).endCell(),
      ...[beginCell().endCell(),
        beginCell().storeInt(0n, 257).storeBit(false).endCell(),
        beginCell().storeInt(0n, 257).storeRef(tail).endCell(),
        convertToMerkleProof(tail),
      ].map((badTail) => beginCell().storeUint(4, 8).storeInt(0n, 257).storeInt(0n, 257).storeInt(0n, 257).storeRef(badTail).endCell()),
      beginCell().storeUint(4, 8).storeInt(0n, 257).storeInt(0n, 257).storeInt(0n, 257).storeRef(tail).storeRef(tail).endCell(),
      convertToMerkleProof(payload),
    ];
    addCells("groth16InvalidMessages", [grothBody(proof(), payload, true),
      ...malformedProofs.map((p) => grothBody(p)),
      ...malformedPayloads.map((p) => grothBody(proof(), p)),
    ]);

    const boundary = await writeGasBoundaryArtifacts(generated);
    await generateVerifier(boundary.verificationKeyPath, path.join(generated, "PlonkBoundary.tolk"), { quiet: true });
    const plonkKey = JSON.parse(await fs.readFile(boundary.verificationKeyPath, "utf8"));
    plonkKey.nPublic = 0;
    const plonkKeyPath = path.join(generated, "plonk-vk.json");
    await fs.writeFile(plonkKeyPath, JSON.stringify(plonkKey));
    await generateVerifier(plonkKeyPath, path.join(generated, "Plonk.tolk"), { quiet: true });
    const plonkSource = await fs.readFile(path.join(generated, "Plonk.tolk"), "utf8");
    await fs.writeFile(path.join(generated, "PlonkHelpers.tolk"), plonkSource + `
get fun compareBaseField(encoded: slice): bool { return lessThanBaseField(encoded); }
get fun compareHalfBaseField(encoded: slice): bool { return lessThanHalfBaseField(encoded); }
`);
    const halfBaseField = (BLS12_381_BASE_FIELD + 1n) / 2n;
    const comparisonValues = new Set([0n, (1n << 384n) - 1n]);
    for (const threshold of [BLS12_381_BASE_FIELD, halfBaseField]) {
      comparisonValues.add(threshold);
      for (let limb = 0n; limb < 6n; limb++) {
        comparisonValues.add(threshold - (1n << (64n * limb)));
        comparisonValues.add(threshold + (1n << (64n * limb)));
      }
    }
    declarations.push("struct ComparisonCase { encoded: cell; belowBase: bool; belowHalf: bool }");
    add("plonkComparisonCases", "array<ComparisonCase>", `[${[...comparisonValues].map((value) => {
      const encoded = beginCell().storeUint(value, 384).endCell();
      return `{ encoded: ${cellLiteral(encoded)}, belowBase: ${value < BLS12_381_BASE_FIELD}, belowHalf: ${value < halfBaseField} }`;
    }).join(", ")}]`);
    addCells("plonkMalformedCoordinates", [pointBits(383), pointBits(385), point("00".repeat(48), true)]);

    const args = await exportPlonkTolkCalldata(boundary.proof, boundary.publicSignals);
    const body = await proofToMessageCell({ ...boundary, protocol: "plonk", lang: "tolk" });
    addArgs("boundaryArgs", args);
    add("boundaryBody", "cell", cellLiteral(body));
    const emptyArgs = await exportPlonkTolkCalldata(boundary.proof, []);
    const emptyBody = await proofToMessageCell({ proof: boundary.proof, publicSignals: [], protocol: "plonk", lang: "tolk" });
    addArgs("plonkArgs", emptyArgs);
    add("plonkBody", "cell", cellLiteral(emptyBody));
    const positions = [0, 1, 2, 3, 4, 5, 6, 13, 14];
    const invalidPointArgs = [];
    const invalidPointBodies = [];
    for (const hostile of [identityG1, nonSubgroupG1]) {
      positions.forEach((position, i) => {
        const changed = [...emptyArgs];
        changed[position] = { type: "slice", cell: hostile };
        invalidPointArgs.push(changed);
        let changedBody;
        if (i === 8) {
          changedBody = replaceRefPath(emptyBody, [0, 0, 3, 1], hostile);
        } else {
          const pairPath = i < 6 ? [0, 0, Math.floor(i / 2)] : [0, 0, 3, 0];
          const reader = pairPath.reduce((cell, index) => cell.refs[index], emptyBody).beginParse();
          const halves = [reader.loadBits(384), reader.loadBits(384)];
          halves[i % 2] = hostile.bits;
          const pair = beginCell().storeBits(halves[0]).storeBits(halves[1]).endCell();
          changedBody = replaceRefPath(emptyBody, pairPath, pair);
        }
        const expectedPoints = compressedPoints(emptyBody);
        expectedPoints[i] = hostile.beginParse().loadBuffer(48);
        assert.deepEqual(compressedPoints(changedBody), expectedPoints, `Hostile PLONK point ${i}`);
        invalidPointBodies.push(changedBody);
      });
    }
    addArgCases("plonkInvalidPointArgs", invalidPointArgs);
    addCells("plonkInvalidPointBodies", invalidPointBodies);
    const mismatchArgs = [...emptyArgs];
    mismatchArgs[0] = emptyArgs[1];
    addArgCases("plonkInvalidBindingArgs", [mismatchArgs]);
    addCells("plonkInvalidBindingBodies", [mismatchFirstCompressedPoint(emptyBody)]);
    addCells("plonkMalformedMessages", [
      addTrailingBit(body), beginCell().storeUint(0x76524659, 32).endCell(),
      beginCell().storeUint(0x3b29232c, 31).endCell(),
      beginCell().storeUint(0x76524659, 32).storeRef(beginCell().endCell()).endCell(),
      emptyCompressedTree(body), malformedPublicInputs(body), malformedTranscriptWitness(body),
    ]);
    await fs.writeFile(path.join(generated, "fixtures.tolk"), declarations.join("\n") + "\n");
    const optionalTest = path.join(generated, "tests", "real-plonk.test.tolk");
    await fs.rm(optionalTest, { force: true });
    if (process.env.PLONK_E2E_DIR) {
      const snarkjs = await import("snarkjs");
      const artifactDir = process.env.PLONK_E2E_DIR;
      const keyPath = path.join(artifactDir, "verification_key.json");
      const verificationKey = JSON.parse(await fs.readFile(keyPath, "utf8"));
      const { proof, publicSignals } = await snarkjs.plonk.fullProve(
        { a: "10", b: "20", cond: "1" },
        path.join(artifactDir, "condition_js", "condition.wasm"),
        path.join(artifactDir, "condition_0000.zkey"),
      );
      if (!await snarkjs.plonk.verify(verificationKey, publicSignals, proof)) {
        throw new Error("The real-proof fixture failed independent snarkjs verification.");
      }
      await generateVerifier(keyPath, path.join(generated, "PlonkReal.tolk"), { quiet: true });
      const realDeclarations = ['import "@acton/fmt"'];
      for (const [prefix, value] of [
        ["realPlonk", proof],
        ["realPlonkInvalid", { ...proof, eval_a: ((BigInt(proof.eval_a) + 1n) % curve.r).toString() }],
      ]) {
        const valid = await snarkjs.plonk.verify(verificationKey, publicSignals, value);
        if (valid !== (prefix === "realPlonk")) {
          throw new Error(`Unexpected snarkjs verification result for ${prefix}.`);
        }
        const args = await exportPlonkTolkCalldata(value, publicSignals);
        const body = await proofToMessageCell({ proof: value, publicSignals, protocol: "plonk", lang: "tolk" });
        realDeclarations.push(`fun ${prefix}Args(): array<unknown> { return ${argsLiteral(args)}; }`);
        realDeclarations.push(`fun ${prefix}Body(): cell { return ${cellLiteral(body)}; }`);
      }
      await fs.writeFile(path.join(generated, "real-fixtures.tolk"), realDeclarations.join("\n") + "\n");
      await fs.mkdir(path.dirname(optionalTest), { recursive: true });
      await fs.copyFile(path.join(root, "optional", "real-plonk.test.tolk"), optionalTest);
    } else {
      console.log("Skipping real PLONK proof test: set PLONK_E2E_DIR to the circuit artifacts.");
    }
  } finally {
    await curve.terminate();
  }
}
