import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as snarkjs from "snarkjs";
import { Address, beginCell, Cell, toNano } from "@ton/core";
import { Blockchain, createShardAccount } from "@ton/sandbox";
import { compileFunc } from "@ton-community/func-js";
import { runTolkCompiler } from "@ton/tolk-js";
import { utils } from "ffjavascript";
import { generateVerifier } from "../src/generateVerifiers.js";
import {
  exportPlonkFuncCalldata,
  exportPlonkTolkCalldata,
} from "../src/export_plonk_calldata.js";
import { proofToMessageCell } from "../src/proofMessages.js";
import { BLS12_381_SCALAR_FIELD } from "../src/plonkEncoding.js";
import { getCurveFromName } from "../src/utils.js";
import { MINIMAL_FUNC_STDLIB } from "../test-support/func_minimal_stdlib.js";

const { stringifyBigInts } = utils;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const artifactDir = process.env.PLONK_E2E_DIR;
const GAS_BOUNDARY_POINT_SCALARS = [
  50916109517175266503558523219887323923571274000853750801091278434669014013606n,
  15196286005408635417834397136113578268035780568673066023375782179383664568600n,
  15621810029831814445277559204893052940273344700366105678066281833719598588141n,
  14435829131475316105368651183331733443867866210919537647922506079903936178720n,
  8524976667748464845817996835030051479635428698713792448942762027445187293348n,
  48928640595579239036040181681679858491941317621668149444631161915574822518880n,
  42513001712974512546854079958147303300012343085313367052791910999179382734714n,
  21319702541254155645077490416820185631314128952606055379147150052579587763710n,
  12797336275846957843884373625825056986001827341243715887396320952821273908861n,
];
const GAS_BOUNDARY_EVALUATIONS = [
  22159261517167154269647235771342439101981790977778319122101756543140579077189n,
  20668703858645708566895241052552816901444104474518923861009027012547223702339n,
  25684910626801141064270761638772924901524972789290700345616193718868286884270n,
  12297663011568994251647929605307410077313212443576466254722810941373337743339n,
  10891316139632037623502342446047946434820789801445004203716245159630157153255n,
  10561075245925702910880933390168560511578089812631905884535547166353667622034n,
];
const GAS_BOUNDARY_PUBLIC_INPUTS = [
  16340562073278941416831612165628560107426626149021088969716066934275589187295n,
  44848186906117793618284884826246005445002148770207598148475735342608199563403n,
  8387239482916463682063212098674862429918350147167800582071213291258037439671n,
  36074327104474219406434381665782725488477113981170380625359150079243472959781n,
  25306781145950119862351237167092082161895273882275770963301726261208929230395n,
  14069372771925503355236889477738611535521386346359708394033710075363746331203n,
  22179537813115141036237796579282502420739529730322708562564393558157578670719n,
  5134737791827963101940161987800521203334593753003546617686777119855855921226n,
];

async function withRepoTempDir(run) {
  const tempDir = path.join(
    repoRoot,
    `.tmp-plonk-e2e-${Date.now()}-${Math.random().toString(16).slice(2)}`,
  );
  await fs.mkdir(tempDir, { recursive: true });
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function compileVerifierSources(tempDir, verificationKeyPath) {
  const funcPath = path.join(tempDir, "condition.fc");
  const tolkPath = path.join(tempDir, "condition.tolk");
  await generateVerifier(verificationKeyPath, funcPath, {
    lang: "func",
    quiet: true,
  });
  await generateVerifier(verificationKeyPath, tolkPath, {
    lang: "tolk",
    quiet: true,
  });
  const [funcSource, tolkSource] = await Promise.all([
    fs.readFile(funcPath, "utf8"),
    fs.readFile(tolkPath, "utf8"),
  ]);
  const [func, tolk] = await Promise.all([
    compileFunc({
      targets: ["condition.fc"],
      sources: {
        "condition.fc": funcSource,
        "imports/stdlib.fc": MINIMAL_FUNC_STDLIB,
      },
    }),
    runTolkCompiler({
      entrypointFileName: "condition.tolk",
      fsReadCallback: () => tolkSource,
    }),
  ]);
  assert.equal(func.status, "ok", func.status === "error" ? func.message : undefined);
  assert.equal(tolk.status, "ok", tolk.status === "error" ? tolk.message : undefined);
  if (func.status !== "ok" || tolk.status !== "ok") return null;
  return {
    func: Cell.fromBoc(Buffer.from(func.codeBoc, "base64"))[0],
    tolk: Cell.fromBoc(Buffer.from(tolk.codeBoc64, "base64"))[0],
  };
}

async function deployCode(code, discriminator) {
  const blockchain = await Blockchain.create();
  blockchain.verbosity = {
    print: false,
    blockchainLogs: false,
    vmLogs: "none",
    debugLogs: false,
  };
  const address = new Address(0, Buffer.alloc(32, discriminator));
  await blockchain.setShardAccount(
    address,
    createShardAccount({
      address,
      code,
      data: beginCell().endCell(),
      balance: toNano("10"),
    }),
  );
  const sender = await blockchain.treasury(`plonk-real-${discriminator}`);
  return { blockchain, address, sender };
}

function targetTransaction(result, address) {
  return result.transactions.find(
    (transaction) =>
      transaction.inMessage?.info.type === "internal" &&
      transaction.inMessage.info.dest.equals(address),
  );
}

async function sendProofBody(deployment, body, value = toNano("1")) {
  const result = await deployment.sender.send({
    to: deployment.address,
    value,
    body,
  });
  const transaction = targetTransaction(result, deployment.address);
  assert.equal(transaction?.description.type, "generic");
  assert.equal(transaction?.description.computePhase.type, "vm");
  return transaction;
}

async function writeGasBoundaryArtifacts(tempDir) {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const points = GAS_BOUNDARY_POINT_SCALARS.map((scalar) =>
      curve.G1.toObject(curve.G1.timesScalar(curve.G1.g, scalar)),
    );
    const verificationKey = stringifyBigInts({
      protocol: "plonk",
      curve: "bls12381",
      nPublic: 8,
      power: 4,
      k1: 2n,
      k2: 3n,
      Qm: g1,
      Ql: g1,
      Qr: g1,
      Qo: g1,
      Qc: g1,
      S1: g1,
      S2: g1,
      S3: g1,
      X_2: g2,
      w: curve.Fr.toObject(curve.Fr.w[4]),
    });
    const proof = stringifyBigInts({
      protocol: "plonk",
      curve: "bls12381",
      A: points[0],
      B: points[1],
      C: points[2],
      Z: points[3],
      T1: points[4],
      T2: points[5],
      T3: points[6],
      Wxi: points[7],
      Wxiw: points[8],
      eval_a: GAS_BOUNDARY_EVALUATIONS[0],
      eval_b: GAS_BOUNDARY_EVALUATIONS[1],
      eval_c: GAS_BOUNDARY_EVALUATIONS[2],
      eval_s1: GAS_BOUNDARY_EVALUATIONS[3],
      eval_s2: GAS_BOUNDARY_EVALUATIONS[4],
      eval_zw: GAS_BOUNDARY_EVALUATIONS[5],
    });
    const verificationKeyPath = path.join(tempDir, "gas-boundary-vk.json");
    await fs.writeFile(
      verificationKeyPath,
      JSON.stringify(verificationKey),
      "utf8",
    );
    return {
      proof,
      publicSignals: GAS_BOUNDARY_PUBLIC_INPUTS.map(String),
      verificationKeyPath,
    };
  } finally {
    await curve.terminate();
  }
}

function mismatchFirstCompressedPoint(body) {
  const root = body.beginParse();
  const op = root.loadUint(32);
  const payload = root.loadRef().beginParse();
  root.endParse();
  const compressed = payload.loadRef().beginParse();
  const firstPair = compressed.loadRef().beginParse();
  const a = firstPair.loadBuffer(48);
  const b = firstPair.loadBuffer(48);
  firstPair.endParse();
  a[0] ^= 0x20;
  const changedPair = beginCell().storeBuffer(a).storeBuffer(b).endCell();
  const changedCompressed = beginCell()
    .storeRef(changedPair)
    .storeSlice(compressed)
    .endCell();
  const changedPayload = beginCell()
    .storeRef(changedCompressed)
    .storeSlice(payload)
    .endCell();
  return beginCell().storeUint(op, 32).storeRef(changedPayload).endCell();
}

function addTrailingBit(body) {
  const root = body.beginParse();
  const op = root.loadUint(32);
  const payload = root.loadRef();
  root.endParse();
  return beginCell().storeUint(op, 32).storeBit(true).storeRef(payload).endCell();
}

function emptyCompressedTree(body) {
  const root = body.beginParse();
  const op = root.loadUint(32);
  const payload = root.loadRef().beginParse();
  root.endParse();
  payload.loadRef();
  const changedPayload = beginCell()
    .storeRef(beginCell().endCell())
    .storeSlice(payload)
    .endCell();
  return beginCell().storeUint(op, 32).storeRef(changedPayload).endCell();
}

function replaceCellRef(cell, index, replacement) {
  const builder = beginCell().storeBits(cell.bits);
  cell.refs.forEach((ref, refIndex) =>
    builder.storeRef(refIndex === index ? replacement : ref),
  );
  return builder.endCell();
}

function malformedPublicInputs(body) {
  const payload = body.refs[0];
  const malformed = beginCell().storeBit(true).endCell();
  return replaceCellRef(body, 0, replaceCellRef(payload, 2, malformed));
}

function malformedTranscriptWitness(body) {
  const payload = body.refs[0];
  const uncompressed = payload.refs[3];
  const a = uncompressed.refs[0];
  const malformedWitness = beginCell().storeUint(0n, 768).endCell();
  const malformedA = replaceCellRef(a, 0, malformedWitness);
  const malformedUncompressed = replaceCellRef(uncompressed, 0, malformedA);
  return replaceCellRef(
    body,
    0,
    replaceCellRef(payload, 3, malformedUncompressed),
  );
}

test("maximum supported PLONK public inputs fit FunC and Tolk transaction gas limits", async () => {
  await withRepoTempDir(async (tempDir) => {
    const { proof, publicSignals, verificationKeyPath } =
      await writeGasBoundaryArtifacts(tempDir);
    const code = await compileVerifierSources(tempDir, verificationKeyPath);
    assert.ok(code);

    for (const [lang, discriminator, exportCalldata] of [
      ["func", 21, exportPlonkFuncCalldata],
      ["tolk", 22, exportPlonkTolkCalldata],
    ]) {
      const deployment = await deployCode(code[lang], discriminator);
      const calldata = await exportCalldata(proof, publicSignals);
      const getter = await deployment.blockchain.runGetMethod(
        deployment.address,
        "verify",
        calldata,
      );
      assert.equal(getter.exitCode, 0);
      assert.equal(getter.stackReader.readBoolean(), false);
      assert.ok(
        getter.gasUsed < 920000n,
        `${lang} boundary getter used ${getter.gasUsed} gas`,
      );

      const body = await proofToMessageCell({
        proof,
        publicSignals,
        protocol: "plonk",
        lang,
      });
      const transaction = await sendProofBody(
        deployment,
        body,
        toNano("0.07"),
      );
      assert.equal(transaction.description.computePhase.exitCode, 106);
      assert.ok(
        transaction.description.computePhase.gasUsed < 920000n,
        `${lang} boundary message used ${transaction.description.computePhase.gasUsed} gas`,
      );

      const underfunded = await sendProofBody(
        deployment,
        body,
        toNano("0.069999999"),
      );
      assert.equal(underfunded.description.computePhase.exitCode, 107);
    }
  });
});

test(
  "real snarkjs PLONK proof passes getter and internal-message verification in FunC and Tolk",
  { skip: !artifactDir },
  async () => {
    const wasmPath = path.join(artifactDir, "condition_js", "condition.wasm");
    const zkeyPath = path.join(artifactDir, "condition_0000.zkey");
    const verificationKeyPath = path.join(artifactDir, "verification_key.json");
    const verificationKey = JSON.parse(await fs.readFile(verificationKeyPath, "utf8"));
    const { proof, publicSignals } = await snarkjs.plonk.fullProve(
      { a: "10", b: "20", cond: "1" },
      wasmPath,
      zkeyPath,
    );
    assert.equal(
      await snarkjs.plonk.verify(verificationKey, publicSignals, proof),
      true,
    );

    await withRepoTempDir(async (tempDir) => {
      const code = await compileVerifierSources(tempDir, verificationKeyPath);
      assert.ok(code);
      const deployments = {
        func: await deployCode(code.func, 11),
        tolk: await deployCode(code.tolk, 12),
      };
      const calldata = {
        func: await exportPlonkFuncCalldata(proof, publicSignals),
        tolk: await exportPlonkTolkCalldata(proof, publicSignals),
      };

      for (const lang of ["func", "tolk"]) {
        const getter = await deployments[lang].blockchain.runGetMethod(
          deployments[lang].address,
          "verify",
          calldata[lang],
        );
        assert.equal(
          getter.exitCode,
          0,
          `${lang} getter used ${getter.gasUsed} gas`,
        );
        assert.equal(getter.stackReader.readBoolean(), true);
        assert.ok(
          getter.gasUsed < 900000n,
          `${lang} getter used ${getter.gasUsed} gas`,
        );

        const body = await proofToMessageCell({
          proof,
          publicSignals,
          protocol: "plonk",
          lang,
        });
        const validTransaction = await sendProofBody(deployments[lang], body);
        assert.equal(validTransaction.description.computePhase.exitCode, 0);
        assert.equal(validTransaction.description.aborted, false);

        const invalidProof = {
          ...proof,
          eval_a: (
            (BigInt(proof.eval_a) + 1n) % BLS12_381_SCALAR_FIELD
          ).toString(),
        };
        assert.equal(
          await snarkjs.plonk.verify(verificationKey, publicSignals, invalidProof),
          false,
        );
        const invalidCalldata =
          lang === "func"
            ? await exportPlonkFuncCalldata(invalidProof, publicSignals)
            : await exportPlonkTolkCalldata(invalidProof, publicSignals);
        const invalidGetter = await deployments[lang].blockchain.runGetMethod(
          deployments[lang].address,
          "verify",
          invalidCalldata,
        );
        assert.equal(invalidGetter.exitCode, 0);
        assert.equal(invalidGetter.stackReader.readBoolean(), false);
        const invalidBody = await proofToMessageCell({
          proof: invalidProof,
          publicSignals,
          protocol: "plonk",
          lang,
        });
        const invalidTransaction = await sendProofBody(
          deployments[lang],
          invalidBody,
        );
        assert.equal(invalidTransaction.description.computePhase.exitCode, 106);

        const mismatchTransaction = await sendProofBody(
          deployments[lang],
          mismatchFirstCompressedPoint(body),
        );
        assert.equal(mismatchTransaction.description.computePhase.exitCode, 106);

        const trailingTransaction = await sendProofBody(
          deployments[lang],
          addTrailingBit(body),
        );
        assert.equal(trailingTransaction.description.computePhase.exitCode, 105);

        const truncatedTransaction = await sendProofBody(
          deployments[lang],
          beginCell().storeUint(0x76524659, 32).endCell(),
        );
        assert.equal(truncatedTransaction.description.computePhase.exitCode, 105);

        const shortOpcodeTransaction = await sendProofBody(
          deployments[lang],
          beginCell().storeUint(0x3b29232c, 31).endCell(),
        );
        assert.equal(
          shortOpcodeTransaction.description.computePhase.exitCode,
          105,
        );

        const malformedTransaction = await sendProofBody(
          deployments[lang],
          beginCell()
            .storeUint(0x76524659, 32)
            .storeRef(beginCell().endCell())
            .endCell(),
        );
        assert.equal(malformedTransaction.description.computePhase.exitCode, 105);

        const malformedTreeTransaction = await sendProofBody(
          deployments[lang],
          emptyCompressedTree(body),
        );
        assert.equal(
          malformedTreeTransaction.description.computePhase.exitCode,
          105,
        );

        const malformedPublicTransaction = await sendProofBody(
          deployments[lang],
          malformedPublicInputs(body),
        );
        assert.equal(
          malformedPublicTransaction.description.computePhase.exitCode,
          105,
        );

        const malformedWitnessTransaction = await sendProofBody(
          deployments[lang],
          malformedTranscriptWitness(body),
        );
        assert.equal(
          malformedWitnessTransaction.description.computePhase.exitCode,
          105,
        );
      }
    });
  },
);
