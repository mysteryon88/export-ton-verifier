import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import ejs from "ejs";
import { utils } from "ffjavascript";
import { generateVerifier } from "../src/generateVerifiers.js";
import {
  assertBls12381Groth16VerificationKey,
  decodeBls12381G1,
} from "../src/formats/common.js";
import { normalizePlonkVerificationKey } from "../src/export_plonk_vk.js";
import {
  g1Compressed,
  g2Compressed,
  getCurveFromName,
} from "../src/utils.js";

const { stringifyBigInts } = utils;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const templatesDir = path.join(repoRoot, "templates");
const dummyG1 = "a0" + "11".repeat(47);
const dummyG2 = "b0" + "22".repeat(95);
const dummyG1Uncompressed = "10" + "33".repeat(95);

async function renderTemplate(templateName, nPublic = 2) {
  const template = await fs.readFile(
    path.join(templatesDir, templateName),
    "utf8",
  );
  return ejs.render(template, {
    protocol: templateName.includes("plonk") ? "plonk" : "groth16",
    curve: "bls12381",
    contractName: null,
    vk_alpha_1: dummyG1,
    vk_beta_2: dummyG2,
    vk_gamma_2: dummyG2,
    vk_delta_2: dummyG2,
    IC: Array.from({ length: nPublic + 1 }, () => dummyG1),
    nPublic,
    publicInputKeyLen: 32,
    power: 4,
    k1: "2",
    k2: "3",
    w: "13",
    Qm: dummyG1,
    Ql: dummyG1,
    Qr: dummyG1,
    Qo: dummyG1,
    Qc: dummyG1,
    S1: dummyG1,
    S2: dummyG1,
    S3: dummyG1,
    X_2: dummyG2,
    Qm_uc: dummyG1Uncompressed,
    Ql_uc: dummyG1Uncompressed,
    Qr_uc: dummyG1Uncompressed,
    Qo_uc: dummyG1Uncompressed,
    Qc_uc: dummyG1Uncompressed,
    S1_uc: dummyG1Uncompressed,
    S2_uc: dummyG1Uncompressed,
    S3_uc: dummyG1Uncompressed,
  });
}

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-security-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function uncompressedG1Hex(curve, point) {
  const bytes = new Uint8Array(96);
  curve.G1.toRprUncompressed(bytes, 0, curve.G1.fromObject(point));
  return Buffer.from(bytes).toString("hex");
}

function readyPlonkVk({ g1, g2, g1Uc }) {
  return {
    protocol: "plonk",
    curve: "bls12381",
    nPublic: 1,
    power: 4,
    k1: "2",
    k2: "3",
    Qm: g1,
    Ql: g1,
    Qr: g1,
    Qo: g1,
    Qc: g1,
    S1: g1,
    S2: g1,
    S3: g1,
    Qm_uc: g1Uc,
    Ql_uc: g1Uc,
    Qr_uc: g1Uc,
    Qo_uc: g1Uc,
    Qc_uc: g1Uc,
    S1_uc: g1Uc,
    S2_uc: g1Uc,
    S3_uc: g1Uc,
    X_2: g2,
  };
}

test("Groth16 templates reject non-canonical public inputs", async () => {
  const [func, tolk, tact] = await Promise.all([
    renderTemplate("func_verifier_groth16.ejs"),
    renderTemplate("tolk_verifier_groth16.ejs"),
    renderTemplate("tact_verifier_groth16.ejs"),
  ]);

  assert.match(func, /BLS_PUSHR/);
  assert.match(func, /scalar_not_in_field/);
  assert.match(func, /val0 < bls_r\(\)/);

  assert.match(tolk, /fun checkPublicInput\(x: int\): int/);
  assert.match(tolk, /x < 0 \|\| x >= blsR\(\)/);
  assert.match(tolk, /checkPublicInput\(pubInputs\.get\(0\)\)/);

  assert.match(tact, /asm fun blsR\(\): Int \{ BLS_PUSHR \}/);
  assert.match(tact, /value >= 0 && value < blsR\(\)/);
});

test("all Groth16 templates validate proof shape, subgroup, and identity before pairing", async () => {
  const templates = await Promise.all([
    renderTemplate("func_verifier_groth16.ejs"),
    renderTemplate("tolk_verifier_groth16.ejs"),
    renderTemplate("tact_verifier_groth16.ejs"),
  ]);

  for (const rendered of templates) {
    assert.match(rendered, /BLS_G1_INGROUP/);
    assert.match(rendered, /BLS_G2_INGROUP/);
    assert.match(rendered, /BLS_G1_ISZERO/);
    assert.match(rendered, /BLS_G2_ISZERO/);
    assert.match(rendered, /384/);
    assert.match(rendered, /768/);
    assert.match(rendered, /checkProofPoints|check_proof_points/);
  }
});

test("Groth16 message parsers reject exotic points and non-canonical payloads", async () => {
  const [func, tolk, tact] = await Promise.all([
    renderTemplate("func_verifier_groth16.ejs", 4),
    renderTemplate("tolk_verifier_groth16.ejs", 4),
    renderTemplate("tact_verifier_groth16.ejs", 4),
  ]);

  assert.match(func, /XCTOS/);
  assert.match(func, /end_parse/);

  assert.match(tolk, /beginParseSpecial\(\)/);
  assert.match(tolk, /remainingRefsCount\(\) != 1/);
  assert.match(tolk, /remainingBitsCount\(\) < 257/);
  assert.match(tolk, /remainingBitsCount\(\) != chunk \* 257/);
  assert.match(tolk, /checkPublicInputsPayloadShape\(payload\)/);
  assert.match(tolk, /forceLoadLazyObject\(\)/);
  assert.match(tolk, /!messageTail\.isEmpty\(\)/);

  assert.match(tact, /XCTOS/);
  assert.match(tact, /piA: Cell/);
  assert.match(tact, /piB: Cell/);
  assert.match(tact, /piC: Cell/);
});

test("all expensive internal receivers enforce the minimum attached value", async () => {
  const [funcGroth16, tolkGroth16, tactGroth16, funcPlonk, tolkPlonk] =
    await Promise.all([
      renderTemplate("func_verifier_groth16.ejs"),
      renderTemplate("tolk_verifier_groth16.ejs"),
      renderTemplate("tact_verifier_groth16.ejs"),
      renderTemplate("func_verifier_plonk.ejs"),
      renderTemplate("tolk_verifier_plonk.ejs"),
    ]);

  assert.match(funcGroth16, /minVerifyValue = 50000000/);
  assert.match(funcGroth16, /recv_internal\(int msg_value,/);
  assert.match(funcGroth16, /msg_value >= verifier::minVerifyValue/);

  assert.match(tolkGroth16, /MIN_VERIFY_VALUE: coins = 50000000/);
  assert.match(tolkGroth16, /inMsg\.valueCoins >= MIN_VERIFY_VALUE/);

  assert.match(tactGroth16, /MIN_VERIFY_VALUE: Int = 50000000/);
  assert.match(tactGroth16, /context\(\)\.value >= MIN_VERIFY_VALUE/);

  assert.match(funcPlonk, /minVerifyValue = 70000000/);
  assert.match(funcPlonk, /recv_internal\(int msg_value,/);
  assert.match(funcPlonk, /msg_value >= verifier::minVerifyValue/);

  assert.match(tolkPlonk, /MIN_VERIFY_VALUE: coins = 70000000/);
  assert.match(tolkPlonk, /inMsg\.valueCoins >= MIN_VERIFY_VALUE/);
});

test("FunC PLONK renders a receiver and rejects negative scalars", async () => {
  const rendered = await renderTemplate("func_verifier_plonk.ejs");

  assert.match(rendered, /x >= 0/);
  assert.match(rendered, /const op::verify = 0x76524659/);
  assert.match(rendered, /\(\) recv_internal\(int msg_value, cell in_msg_full, slice in_msg_body\) impure/);
  assert.match(rendered, /int ok = verify\(/);
  assert.doesNotMatch(rendered, /\(\) recv_internal\(\) impure \{\s*\}/);
});

test("Groth16 generation rejects identity and non-subgroup core VK points", async () => {
  await withTempDir(async (tempDir) => {
    const curve = await getCurveFromName("bls12381");
    try {
      const g1 = curve.G1.toObject(curve.G1.g);
      const g2 = curve.G2.toObject(curve.G2.g);
      const identity = curve.G1.toObject(curve.G1.zero);
      const nonSubgroup = [0n, 2n, 1n];
      assert.equal(curve.G1.isValid(curve.G1.fromObject(nonSubgroup)), true);
      assert.equal(
        curve.G1.isZero(
          curve.G1.timesScalar(curve.G1.fromObject(nonSubgroup), curve.r),
        ),
        false,
      );

      for (const [name, alpha, expected] of [
        ["identity", identity, /identity/],
        ["non-subgroup", nonSubgroup, /subgroup/],
      ]) {
        const inputPath = path.join(tempDir, `${name}.json`);
        const outputPath = path.join(tempDir, `${name}.tolk`);
        await fs.writeFile(
          inputPath,
          JSON.stringify(
            stringifyBigInts({
              protocol: "groth16",
              curve: "bls12381",
              vk_alpha_1: alpha,
              vk_beta_2: g2,
              vk_gamma_2: g2,
              vk_delta_2: g2,
              IC: [g1, g1],
            }),
          ),
          "utf8",
        );

        await assert.rejects(
          generateVerifier(inputPath, outputPath, {
            templatesDir,
            quiet: true,
          }),
          expected,
        );
      }
    } finally {
      await curve.terminate();
    }
  });
});

test("FunC and Tolk PLONK verifiers validate every proof point before arithmetic", async () => {
  const [func, tolk] = await Promise.all([
    renderTemplate("func_verifier_plonk.ejs"),
    renderTemplate("tolk_verifier_plonk.ejs"),
  ]);

  for (const rendered of [func, tolk]) {
    assert.match(rendered, /BLS_G1_INGROUP/);
    assert.match(rendered, /BLS_G1_ISZERO/);
  }
  assert.match(
    func,
    /check_proof_point\(A\);[\s\S]*check_proof_point\(B\);[\s\S]*check_proof_point\(C\);[\s\S]*check_proof_point\(Z\);[\s\S]*check_proof_point\(T1\);[\s\S]*check_proof_point\(T2\);[\s\S]*check_proof_point\(T3\);[\s\S]*check_proof_point\(Wxi\);[\s\S]*check_proof_point\(Wxiw\);/,
  );
  assert.match(
    tolk,
    /checkProofPoint\(a\);[\s\S]*checkProofPoint\(b\);[\s\S]*checkProofPoint\(c\);[\s\S]*checkProofPoint\(z\);[\s\S]*checkProofPoint\(t1\);[\s\S]*checkProofPoint\(t2\);[\s\S]*checkProofPoint\(t3\);[\s\S]*checkProofPoint\(wxi\);[\s\S]*checkProofPoint\(wxiw\);/,
  );
});

test("Groth16 generation rejects verification keys with inconsistent public input metadata", async () => {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    assert.throws(
      () =>
        assertBls12381Groth16VerificationKey(curve, {
          vk_alpha_1: g1,
          vk_beta_2: g2,
          vk_gamma_2: g2,
          vk_delta_2: g2,
          IC: [g1, g1],
          nPublic: 2,
        }),
      /IC.*nPublic/,
    );
  } finally {
    await curve.terminate();
  }
});

test("native point decoding rejects compressed and uncompressed non-subgroup points", async () => {
  const curve = await getCurveFromName("bls12381");
  try {
    const point = [0n, 2n, 1n];
    const compressed = Buffer.from(g1Compressed(curve, point), "hex");
    const uncompressed = Buffer.from(await uncompressedG1Hex(curve, point), "hex");

    assert.throws(
      () => decodeBls12381G1(curve, compressed, "compressed"),
      /subgroup/,
    );
    assert.throws(
      () => decodeBls12381G1(curve, uncompressed, "uncompressed"),
      /subgroup/,
    );
  } finally {
    await curve.terminate();
  }
});

test("template-ready PLONK VK rejects mismatched compressed and uncompressed points", async () => {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const otherG1 = curve.G1.toObject(
      curve.G1.timesScalar(curve.G1.g, 2n),
    );
    const g2 = curve.G2.toObject(curve.G2.g);
    const vk = readyPlonkVk({
      g1: g1Compressed(curve, g1),
      g2: g2Compressed(curve, g2),
      g1Uc: await uncompressedG1Hex(curve, g1),
    });
    vk.Qm_uc = await uncompressedG1Hex(curve, otherG1);

    await assert.rejects(
      normalizePlonkVerificationKey(vk),
      /Qm.*same point/,
    );
  } finally {
    await curve.terminate();
  }
});

test("PLONK VK normalization rejects coercive metadata and canonicalizes output", async () => {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const base = stringifyBigInts({
      protocol: "plonk",
      curve: "bls12381",
      nPublic: 1,
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
      untrusted: "must not survive",
    });

    for (const value of [true, [], "", " 1", "1 ", "0x1", "1e0", -1]) {
      await assert.rejects(
        normalizePlonkVerificationKey({ ...base, nPublic: value }),
        /invalid 'nPublic'/,
      );
    }
    for (const value of [true, [], "", " 2", "2 ", "0x2", "2e0", -1]) {
      await assert.rejects(
        normalizePlonkVerificationKey({ ...base, k1: value }),
        /k1.*(non-negative integer field element|\[0, r\))/,
      );
    }
    await assert.rejects(
      normalizePlonkVerificationKey({ ...base, k1: curve.r.toString() }),
      /k1.*\[0, r\)/,
    );
    await assert.rejects(
      normalizePlonkVerificationKey({ ...base, w: "13" }),
      /canonical.*root of unity/,
    );

    const normalized = await normalizePlonkVerificationKey(base);
    assert.equal(normalized.untrusted, undefined);
    assert.equal(normalized.w, curve.Fr.toObject(curve.Fr.w[4]).toString());
    assert.equal(normalized.Qm, g1Compressed(curve, g1));
    assert.equal(normalized.Qm_uc, await uncompressedG1Hex(curve, g1));
  } finally {
    await curve.terminate();
  }
});

test("Groth16 wrappers have no dead queryID and curve loading has one implementation", async () => {
  const [funcWrapper, tolkWrapper, calldataSource] = await Promise.all([
    fs.readFile(path.join(templatesDir, "Verifier_func_groth16.ts"), "utf8"),
    fs.readFile(path.join(templatesDir, "Verifier_tolk_groth16.ts"), "utf8"),
    fs.readFile(path.join(repoRoot, "src/export_plonk_calldata.js"), "utf8"),
  ]);

  assert.doesNotMatch(funcWrapper, /queryID/);
  assert.doesNotMatch(tolkWrapper, /queryID/);
  assert.match(calldataSource, /from "\.\/utils\.js"/);
  await assert.rejects(
    fs.access(path.join(repoRoot, "src/curves.js")),
    (err) => err?.code === "ENOENT",
  );
});
