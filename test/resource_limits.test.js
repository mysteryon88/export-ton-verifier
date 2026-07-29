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
