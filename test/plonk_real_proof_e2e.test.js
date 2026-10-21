import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import * as snarkjs from "snarkjs";
import { Address, beginCell, Cell, toNano } from "@ton/core";
import { Blockchain, createShardAccount } from "@ton/sandbox";
import { compileFunc } from "@ton-community/func-js";
import { generateVerifier } from "../src/generateVerifiers.js";
import { getCurveFromName } from "../src/utils.js";
import {
  exportPlonkFuncCalldata,
} from "../src/export_plonk_calldata.js";
import { proofToMessageCell } from "../src/proofMessages.js";
import { BLS12_381_SCALAR_FIELD } from "../src/plonkEncoding.js";
import { MINIMAL_FUNC_STDLIB } from "../test-support/func_minimal_stdlib.js";
import { ensurePlonkE2EArtifacts } from "../test-support/plonk_e2e.js";

import {
  writeGasBoundaryArtifacts, mismatchFirstCompressedPoint, addTrailingBit,
  emptyCompressedTree, malformedPublicInputs, malformedTranscriptWitness,
} from "../test-support/plonk_fixtures.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
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
  await generateVerifier(verificationKeyPath, funcPath, { lang: "func", quiet: true });
  const funcSource = await fs.readFile(funcPath, "utf8");
  const func = await compileFunc({
    targets: ["condition.fc"],
    sources: { "condition.fc": funcSource, "imports/stdlib.fc": MINIMAL_FUNC_STDLIB },
  });
  assert.equal(func.status, "ok", func.status === "error" ? func.message : undefined);
  if (func.status !== "ok") return null;
  return { func: Cell.fromBoc(Buffer.from(func.codeBoc, "base64"))[0] };
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

test("maximum supported PLONK public inputs fit FunC transaction gas limits", async () => {
  await withRepoTempDir(async (tempDir) => {
    const { proof, publicSignals, verificationKeyPath } =
      await writeGasBoundaryArtifacts(tempDir);
    const code = await compileVerifierSources(tempDir, verificationKeyPath);
    assert.ok(code);

    for (const [lang, discriminator, exportCalldata] of [
      ["func", 21, exportPlonkFuncCalldata],
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
  "real snarkjs PLONK proof passes getter and internal-message verification in FunC",
  async (t) => {
    t.after(async () => {
      const curve = await getCurveFromName("bls12381");
      await curve.terminate();
    });
    const artifactDir = await ensurePlonkE2EArtifacts();
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
      };
      const calldata = {
        func: await exportPlonkFuncCalldata(proof, publicSignals),
      };

      for (const lang of ["func"]) {
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
        const invalidCalldata = await exportPlonkFuncCalldata(invalidProof, publicSignals);
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
