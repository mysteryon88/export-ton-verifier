import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";
import { Address, beginCell, Cell, toNano } from "@ton/core";
import { Blockchain, createShardAccount } from "@ton/sandbox";
import { compileFunc } from "@ton-community/func-js";
import { g1Compressed, g2Compressed, getCurveFromName } from "../src/utils.js";
import {
  BLS12_381_SCALAR_FIELD,
  encodePlonkG1Point,
} from "../src/plonkEncoding.js";
import { MINIMAL_FUNC_STDLIB } from "../test-support/func_minimal_stdlib.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatePath = path.join(__dirname, "../templates/func_verifier_plonk.ejs");

async function renderTemplate(constants) {
  const template = await fs.readFile(templatePath, "utf8");
  return ejs.render(template, {
    protocol: "plonk",
    curve: "bls12381",
    nPublic: 0,
    power: 4,
    k1: "5",
    k2: "7",
    w: "13",
    Qm: constants.g1,
    Ql: constants.g1,
    Qr: constants.g1,
    Qo: constants.g1,
    Qc: constants.g1,
    S1: constants.g1,
    S2: constants.g1,
    S3: constants.g1,
    X_2: constants.g2,
    Qm_uc: constants.g1Uc,
    Ql_uc: constants.g1Uc,
    Qr_uc: constants.g1Uc,
    Qo_uc: constants.g1Uc,
    Qc_uc: constants.g1Uc,
    S1_uc: constants.g1Uc,
    S2_uc: constants.g1Uc,
    S3_uc: constants.g1Uc,
  });
}

function pair(first, second) {
  return beginCell()
    .storeSlice(first.beginParse())
    .storeSlice(second.beginParse())
    .endCell();
}

function proofBody(compressedPoints, transcriptPoints, options = {}) {
  const compressedTail = beginCell()
    .storeRef(pair(compressedPoints[6], compressedPoints[7]))
    .storeRef(compressedPoints[8])
    .endCell();
  const compressed = beginCell()
    .storeRef(pair(compressedPoints[0], compressedPoints[1]))
    .storeRef(pair(compressedPoints[2], compressedPoints[3]))
    .storeRef(pair(compressedPoints[4], compressedPoints[5]))
    .storeRef(compressedTail)
    .endCell();
  const evaluations = beginCell()
    .storeRef(beginCell().storeUint(1, 256).storeUint(2, 256).storeUint(3, 256))
    .storeRef(beginCell().storeUint(4, 256).storeUint(5, 256).storeUint(6, 256))
    .endCell();
  const transcriptTail2 = beginCell()
    .storeRef(transcriptPoints[6])
    .storeRef(transcriptPoints[7])
    .storeRef(transcriptPoints[8])
    .endCell();
  const transcriptTail = beginCell()
    .storeRef(transcriptPoints[3])
    .storeRef(transcriptPoints[4])
    .storeRef(transcriptPoints[5])
    .storeRef(transcriptTail2)
    .endCell();
  const transcript = beginCell()
    .storeRef(transcriptPoints[0])
    .storeRef(transcriptPoints[1])
    .storeRef(transcriptPoints[2])
    .storeRef(transcriptTail)
    .endCell();
  const payload = beginCell()
    .storeRef(compressed)
    .storeRef(evaluations)
    .storeRef(beginCell().endCell())
    .storeRef(transcript)
    .endCell();
  const root = beginCell().storeUint(0x76524659, 32);
  if (options.trailing) root.storeBit(true);
  return root.storeRef(payload).endCell();
}

function getterArgs(compressed, transcript, evaluation = 1n) {
  return [
    ...Array.from({ length: 7 }, () => ({ type: "slice", cell: compressed })),
    ...Array.from({ length: 6 }, (_, index) => ({
      type: "int",
      value: index === 0 ? evaluation : BigInt(index + 1),
    })),
    { type: "slice", cell: compressed },
    { type: "slice", cell: compressed },
    { type: "cell", cell: beginCell().endCell() },
    ...Array.from({ length: 9 }, () => ({ type: "slice", cell: transcript })),
  ];
}

test("FunC PLONK executes point binding in getter and internal-message paths", async () => {
  const curve = await getCurveFromName("bls12381");
  try {
    const rawG1 = curve.G1.toObject(curve.G1.g);
    const encoded = encodePlonkG1Point(curve, rawG1, "test.G1");
    const compressed = beginCell().storeBuffer(encoded.compressed).endCell();
    const g1 = g1Compressed(curve, rawG1);
    const g2 = g2Compressed(curve, curve.G2.toObject(curve.G2.g));
    const source = await renderTemplate({
      g1,
      g2,
      g1Uc: Buffer.from(encoded.coordinates).toString("hex"),
    });
    const compiled = await compileFunc({
      targets: ["Verifier.fc"],
      sources: {
        "Verifier.fc": source,
        "imports/stdlib.fc": MINIMAL_FUNC_STDLIB,
      },
    });
    assert.equal(
      compiled.status,
      "ok",
      compiled.status === "error" ? compiled.message : undefined,
    );
    if (compiled.status !== "ok") return;

    const code = Cell.fromBoc(Buffer.from(compiled.codeBoc, "base64"))[0];
    const address = new Address(0, Buffer.alloc(32, 3));
    const blockchain = await Blockchain.create();
    blockchain.verbosity = {
      print: false,
      blockchainLogs: false,
      vmLogs: "none",
      debugLogs: false,
    };
    await blockchain.setShardAccount(
      address,
      createShardAccount({
        address,
        code,
        data: beginCell().endCell(),
        balance: toNano("1"),
      }),
    );

    const valid = await blockchain.runGetMethod(
      address,
      "verify",
      getterArgs(compressed, encoded.transcriptCell),
    );
    assert.equal(valid.exitCode, 0);

    const negativeEncoding = Buffer.from(encoded.compressed);
    negativeEncoding[0] ^= 0x20;
    const negative = beginCell().storeBuffer(negativeEncoding).endCell();
    await assert.rejects(
      blockchain.runGetMethod(
        address,
        "verify",
        getterArgs(negative, encoded.transcriptCell),
      ),
      (error) => error?.exitCode === 106,
    );
    const missingWitness = beginCell().storeBuffer(encoded.coordinates).endCell();
    await assert.rejects(
      blockchain.runGetMethod(
        address,
        "verify",
        getterArgs(compressed, missingWitness),
      ),
      (error) => error?.exitCode === 106,
    );
    await assert.rejects(
      blockchain.runGetMethod(
        address,
        "verify",
        getterArgs(compressed, encoded.transcriptCell, BLS12_381_SCALAR_FIELD),
      ),
      (error) => error?.exitCode === 103,
    );

    const sender = await blockchain.treasury("func-plonk-point-sender");
    const validPoints = Array(9).fill(compressed);
    const transcriptPoints = Array(9).fill(encoded.transcriptCell);
    const sentMismatch = await sender.send({
      to: address,
      value: toNano("0.1"),
      body: proofBody(
        [negative, ...validPoints.slice(1)],
        transcriptPoints,
      ),
    });
    const mismatchTx = sentMismatch.transactions.find(
      (transaction) =>
        transaction.inMessage?.info.type === "internal" &&
        transaction.inMessage.info.dest.equals(address),
    );
    assert.equal(mismatchTx?.description.type, "generic");
    assert.equal(mismatchTx?.description.computePhase.type, "vm");
    assert.equal(mismatchTx.description.computePhase.exitCode, 106);

    const sentTrailing = await sender.send({
      to: address,
      value: toNano("0.1"),
      body: proofBody(validPoints, transcriptPoints, { trailing: true }),
    });
    const trailingTx = sentTrailing.transactions.find(
      (transaction) =>
        transaction.inMessage?.info.type === "internal" &&
        transaction.inMessage.info.dest.equals(address),
    );
    assert.equal(trailingTx?.description.type, "generic");
    assert.equal(trailingTx?.description.computePhase.type, "vm");
    assert.equal(trailingTx.description.computePhase.exitCode, 105);
  } finally {
    await curve.terminate();
  }
});
