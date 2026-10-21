import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { utils } from "ffjavascript";
import { generateVerifier } from "../src/generateVerifiers.js";
import zkeyExportPlonkVerificationKey, {
  normalizePlonkVerificationKey,
} from "../src/export_plonk_vk.js";
import { loadVerificationKey } from "../src/formats/index.js";
import { normalizeGnarkBinaryVerificationKey } from "../src/formats/gnark.js";
import { decodeArkworksVerificationKey } from "../src/formats/arkworks.js";
import { groth16CompressProof } from "../src/groth16CompressProof.js";
import { proofToMessageBoc } from "../src/proofMessages.js";
import { runCliInProcess } from "../test-support/run_cli.js";
import { normalizeTonBlsCurveName } from "../src/limits.js";
import { readHeaderPlonk } from "../src/helpers.js";
import { g1Compressed, g2Compressed, getCurveFromName } from "../src/utils.js";

const { stringifyBigInts } = utils;
const MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-limits-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function minimalPlonkJson(overrides = {}) {
  const point = ["1", "2", "1"];
  return {
    protocol: "plonk",
    curve: "bls12381",
    nPublic: 0,
    power: 4,
    k1: "2",
    k2: "3",
    Qm: point,
    Ql: point,
    Qr: point,
    Qo: point,
    Qc: point,
    S1: point,
    S2: point,
    S3: point,
    X_2: [point, point, ["1", "0"]],
    w: "13",
    ...overrides,
  };
}

test("verification-key artifacts are rejected before oversized data is materialized", async () => {
  await withTempDir(async (tempDir) => {
    const oversized = Buffer.alloc(MAX_ARTIFACT_BYTES + 1, 0x20);

    for (const extension of ["json", "bin"]) {
      const inputPath = path.join(tempDir, `oversized.${extension}`);
      await fs.writeFile(inputPath, oversized);
      await assert.rejects(
        loadVerificationKey(inputPath),
        /artifact.*too large/i,
      );
    }
  });
});

test("zkey field widths are rejected before SnarkJS can allocate from them", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "hostile.zkey");
    const u32le = (value) => {
      const bytes = Buffer.alloc(4);
      bytes.writeUInt32LE(value);
      return bytes;
    };
    const u64le = (value) => {
      const bytes = Buffer.alloc(8);
      bytes.writeBigUInt64LE(BigInt(value));
      return bytes;
    };
    await fs.writeFile(
      inputPath,
      Buffer.concat([
        Buffer.from("zkey"),
        u32le(1),
        u32le(1),
        u32le(2),
        u64le(4),
        u32le(0xffffffff),
      ]),
    );

    await assert.rejects(loadVerificationKey(inputPath), /n8q.*48/i);
  });
});

test("oversized zkeys are rejected before either public parser opens them", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "oversized.zkey");
    await fs.writeFile(inputPath, "not a zkey", "utf8");
    await fs.truncate(inputPath, MAX_ARTIFACT_BYTES + 1);

    for (const load of [loadVerificationKey, zkeyExportPlonkVerificationKey]) {
      await assert.rejects(load(inputPath), /artifact.*too large/i);
    }
  });
});

test("SnarkJS JSON rejects excessive depth before recursive bigint conversion", async () => {
  await withTempDir(async (tempDir) => {
    const inputPath = path.join(tempDir, "deep.json");
    const outputPath = path.join(tempDir, "verifier.tolk");
    const depth = 20_000;
    const json = JSON.stringify(minimalPlonkJson()).replace(
      '"k1":"2"',
      `"k1":${"[".repeat(depth)}"2"${"]".repeat(depth)}`,
    );
    await fs.writeFile(inputPath, json, "utf8");

    await assert.rejects(
      generateVerifier(inputPath, outputPath, { quiet: true }),
      /JSON nesting exceeds/i,
    );
  });
});

test("SnarkJS JSON rejects oversized containers and numeric strings", async () => {
  await withTempDir(async (tempDir) => {
    const containerPath = path.join(tempDir, "container.json");
    const numericPath = path.join(tempDir, "numeric.json");
    await fs.writeFile(
      containerPath,
      JSON.stringify(minimalPlonkJson({ ignored: Array(4097).fill(0) })),
      "utf8",
    );
    await fs.writeFile(
      numericPath,
      JSON.stringify(minimalPlonkJson({ k1: "1".repeat(1025) })),
      "utf8",
    );

    await assert.rejects(loadVerificationKey(containerPath), /container.*4096/i);
    await assert.rejects(loadVerificationKey(numericPath), /numeric string.*1024/i);
  });
});

test("nested signed numeric strings are bounded before BigInt conversion", async () => {
  const hostile = minimalPlonkJson();
  hostile.X_2[0][0] = `-${"1".repeat(1025)}`;

  await assert.rejects(
    normalizePlonkVerificationKey(hostile),
    /numeric string.*1024/i,
  );
});

test("PLONK power is bounded by the BLS12-381 scalar field", async () => {
  await assert.rejects(
    normalizePlonkVerificationKey(
      minimalPlonkJson({ power: Number.MAX_SAFE_INTEGER }),
    ),
    /power.*at most 32/i,
  );
});

test("PLONK header rejects attacker-controlled widths before any variable read", async () => {
  const reads = [];
  const fd = {
    fileName: "hostile.zkey",
    pos: 0,
    async readULE32() {
      return 0xffffffff;
    },
    async read(length) {
      reads.push(length);
      throw new Error("unexpected variable read");
    },
  };

  await assert.rejects(
    readHeaderPlonk(fd, { 2: [{ p: 0, size: 64 }] }),
    /n8q.*48/i,
  );
  assert.deepEqual(reads, []);
});

test("Gnark binary rejects oversized point counts before its IC loop", async () => {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = Buffer.from(g1Compressed(curve, curve.G1.toObject(curve.G1.g)), "hex");
    const g2 = Buffer.from(g2Compressed(curve, curve.G2.toObject(curve.G2.g)), "hex");
    const count = Buffer.alloc(4);
    count.writeUInt32BE(0xffffffff);
    const bytes = Buffer.concat([g1, g1, g2, g2, g1, g2, count]);

    await assert.rejects(
      normalizeGnarkBinaryVerificationKey(bytes),
      /G1\.K length.*at most 4096/i,
    );
  } finally {
    await curve.terminate();
  }
});

test("bounded JSON and maximum supported PLONK power remain accepted", async () => {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const normalized = await normalizePlonkVerificationKey(
      stringifyBigInts(
        minimalPlonkJson({
          power: 32,
          Qm: g1,
          Ql: g1,
          Qr: g1,
          Qo: g1,
          Qc: g1,
          S1: g1,
          S2: g1,
          S3: g1,
          X_2: g2,
          w: curve.Fr.toObject(curve.Fr.w[32]).toString(),
        }),
      ),
    );

    assert.equal(normalized.power, 32);
  } finally {
    await curve.terminate();
  }
});

test("Arkworks checks IC counts and exact byte lengths before decoding points", async () => {
  for (const [count, payloadBytes, expected] of [
    [4097n, 0, /gamma_abc_g1 length.*at most 4096/i],
    [1n << 63n, 0, /gamma_abc_g1 length.*at most 4096/i],
    [1n, 47, /gamma_abc_g1.*byte length/i],
    [1n, 49, /gamma_abc_g1.*byte length/i],
  ]) {
    // Invalid point bytes ensure count/length errors precede curve decoding.
    const bytes = Buffer.alloc(48 + 3 * 96 + 8 + payloadBytes);
    bytes.writeBigUInt64LE(count, 48 + 3 * 96);
    await assert.rejects(decodeArkworksVerificationKey(bytes.toString("hex")), expected);
  }
});

test("Arkworks accepts the IC count limit with valid points", async () => {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = Buffer.from(g1Compressed(curve, curve.G1.toObject(curve.G1.g)), "hex");
    const g2 = Buffer.from(g2Compressed(curve, curve.G2.toObject(curve.G2.g)), "hex");
    const identity = Buffer.from(g1Compressed(curve, curve.G1.toObject(curve.G1.zero)), "hex");
    const count = Buffer.alloc(8);
    count.writeBigUInt64LE(4096n);
    const bytes = Buffer.concat([g1, g2, g2, g2, count, ...Array(4096).fill(identity)]);
    const key = await decodeArkworksVerificationKey(bytes.toString("hex"));
    assert.equal(key.IC.length, 4096);
    assert.equal(key.nPublic, 4095);
  } finally {
    await curve.terminate();
  }
});

test("Groth16 signal counts are checked before proof or signal conversion", async () => {
  const signals = Array(4097);
  Object.defineProperty(signals, 0, { get() { throw new Error("signal was read"); } });
  const proof = { curve: "bls12381" };
  await assert.rejects(groth16CompressProof(proof, signals), /at most 4096/i);
  for (const lang of ["func", "tolk"]) {
    await assert.rejects(
      proofToMessageBoc({ proof, publicSignals: signals, protocol: "groth16", lang }),
      /at most (4096|255)/i,
    );
  }
  await assert.rejects(
    proofToMessageBoc({ proof, publicSignals: Array(256), protocol: "groth16" }),
    /at most 255/i,
  );
});

test("Groth16 rejects malformed coordinates and bounded numeric values early", async () => {
  const proof = {
    curve: "bls12381",
    pi_a: [0n, 0n, 1n],
    pi_b: [[0n, 0n], [0n, 0n], [1n, 0n]],
    pi_c: [0n, 0n, 1n],
  };
  for (const coordinate of ["1".repeat(1025), `0x${"f".repeat(1025)}`]) {
    await assert.rejects(
      groth16CompressProof({ ...proof, pi_a: [coordinate, 0n, 1n] }, []),
      /numeric string.*1024/i,
    );
  }
  await assert.rejects(
    groth16CompressProof({ ...proof, pi_a: [1n << 384n, 0n, 1n] }, []),
    /384 bits/i,
  );
  await assert.rejects(groth16CompressProof(proof, [1n << 256n]), /256 bits/i);
  await assert.rejects(groth16CompressProof(proof, ["1".repeat(1025)]), /numeric string.*1024/i);
  await assert.rejects(groth16CompressProof(proof, [Number.MAX_SAFE_INTEGER + 1]), /integer/i);
  await assert.rejects(groth16CompressProof({ ...proof, pi_a: [[0], 0, 1] }, []), /integer/i);
  await assert.rejects(groth16CompressProof({ ...proof, pi_b: [[0], [0, 0], [1, 0]] }, []), /coordinates/i);
  await assert.rejects(groth16CompressProof({ ...proof, pi_a: Array(3) }, []), /integer/i);
  await assert.rejects(groth16CompressProof(proof, Array(1)), /integer/i);
  const coercible = { valueOf() { throw new Error("numeric object was coerced"); } };
  await assert.rejects(groth16CompressProof(proof, [coercible]), /integer/i);
});

test("Groth16 bounds curve metadata before normalization and reports a bounded error", async () => {
  for (const curve of ["x".repeat(1025), " ".repeat(1025)]) {
    const proof = { curve };
    Object.defineProperty(proof, "pi_a", {
      get() { throw new Error("proof point was read"); },
    });
    await assert.rejects(groth16CompressProof(proof, []), (error) => {
      assert.match(error.message, /proof\.curve.*1024 characters/i);
      assert.ok(error.message.length < 160);
      return true;
    });
  }
  for (const alias of ["bls12381", "BLS12-381", " bls12_381 "]) {
    assert.equal(normalizeTonBlsCurveName(alias), "bls12381");
  }
});

test("proof-to-message bounds both input files before parsing JSON", async () => {
  await withTempDir(async (tempDir) => {
    const proofPath = path.join(tempDir, "proof.json");
    const publicPath = path.join(tempDir, "public.json");
    for (const [targetPath, label] of [[proofPath, "proof"], [publicPath, "public signals"]]) {
      await fs.writeFile(proofPath, "{}");
      await fs.writeFile(publicPath, "[]");
      await fs.truncate(targetPath, MAX_ARTIFACT_BYTES + 1);
      const result = await runCliInProcess(["proof-to-message", proofPath, publicPath, "--groth16"]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, new RegExp(`${label} artifact.*too large`, "i"));
      assert.equal(result.stdout, "");
    }
  });
});

test("proof-to-message applies JSON complexity limits to both input files", async () => {
  await withTempDir(async (tempDir) => {
    const proofPath = path.join(tempDir, "proof.json");
    const publicPath = path.join(tempDir, "public.json");
    const cases = [
      [`${"[".repeat(65)}0${"]".repeat(65)}`, /nesting.*64/i],
      [JSON.stringify(Array(4097).fill(0)), /container.*4096/i],
      [JSON.stringify(Array.from({ length: 3 }, () => Array(3500).fill(0))), /exceeds 10000 values/i],
      [JSON.stringify(["1".repeat(1025)]), /numeric string.*1024/i],
    ];
    for (const targetPath of [proofPath, publicPath]) {
      for (const [json, expected] of cases) {
        await fs.writeFile(proofPath, "{}");
        await fs.writeFile(publicPath, "[]");
        await fs.writeFile(targetPath, json);
        const result = await runCliInProcess(["proof-to-message", proofPath, publicPath, "--plonk"]);
        assert.equal(result.status, 1);
        assert.match(result.stderr, expected);
      }
    }
  });
});
