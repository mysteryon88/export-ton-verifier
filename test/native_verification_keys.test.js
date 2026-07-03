import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs/promises";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { generateVerifier } from "../src/generateVerifiers.js";
import { g1Compressed, g2Compressed, getCurveFromName } from "../src/utils.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(__dirname, "..");
const templatesDir = path.join(repoRoot, "templates");

async function withTempDir(run) {
  const tempDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "export-ton-verifier-native-"),
  );
  try {
    return await run(tempDir);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

async function withBls12381Fixtures(run) {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const g1Hex = g1Compressed(curve, g1);
    const g2Hex = g2Compressed(curve, g2);
    return await run({ g1, g2, g1Hex, g2Hex });
  } finally {
    await curve.terminate();
  }
}

async function withBn128Fixtures(run) {
  const curve = await getCurveFromName("bn128");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    return await run({ g1, g2 });
  } finally {
    await curve.terminate();
  }
}

function gnarkG1(point) {
  return {
    X: point[0].toString(),
    Y: point[1].toString(),
  };
}

function gnarkG2(point) {
  return {
    X: {
      A0: point[0][0].toString(),
      A1: point[0][1].toString(),
    },
    Y: {
      A0: point[1][0].toString(),
      A1: point[1][1].toString(),
    },
  };
}

function makeGnarkJsonVk({ g1, g2 }) {
  return {
    G1: {
      Alpha: gnarkG1(g1),
      Beta: gnarkG1(g1),
      Delta: gnarkG1(g1),
      K: [gnarkG1(g1), gnarkG1(g1)],
    },
    G2: {
      Beta: gnarkG2(g2),
      Gamma: gnarkG2(g2),
      Delta: gnarkG2(g2),
    },
    CommitmentKeys: [],
    PublicAndCommitmentCommitted: [],
  };
}

function u32be(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}

function u64le(value) {
  const out = Buffer.alloc(8);
  out.writeBigUInt64LE(BigInt(value));
  return out;
}

function makeGnarkBinaryVk({ g1Hex, g2Hex }) {
  const g1 = Buffer.from(g1Hex, "hex");
  const g2 = Buffer.from(g2Hex, "hex");
  return Buffer.concat([
    g1,
    g1,
    g2,
    g2,
    g1,
    g2,
    u32be(2),
    g1,
    g1,
    u32be(0),
    u32be(0),
  ]);
}

function makeArkworksJsonVk({ g1Hex, g2Hex }) {
  const vk = Buffer.concat([
    Buffer.from(g1Hex, "hex"),
    Buffer.from(g2Hex, "hex"),
    Buffer.from(g2Hex, "hex"),
    Buffer.from(g2Hex, "hex"),
    u64le(2),
    Buffer.from(g1Hex, "hex"),
    Buffer.from(g1Hex, "hex"),
  ]).toString("hex");

  return {
    curve: "bls12_381",
    vk,
  };
}

async function renderVerifier(inputPath, outputPath, lang = "tolk") {
  const originalLog = console.log;
  let protocol;
  console.log = () => {};
  try {
    protocol = await generateVerifier(inputPath, outputPath, {
      lang,
      templatesDir,
    });
  } finally {
    console.log = originalLog;
  }
  return {
    protocol,
    rendered: await fs.readFile(outputPath, "utf8"),
  };
}

test("generateVerifier renders a Groth16 verifier from native gnark JSON", async () => {
  await withTempDir(async (tempDir) => {
    await withBls12381Fixtures(async (fixtures) => {
      const inputPath = path.join(tempDir, "verification_key_gnark.json");
      const outputPath = path.join(tempDir, "verifier.tolk");
      await fs.writeFile(
        inputPath,
        JSON.stringify(makeGnarkJsonVk(fixtures)),
        "utf8",
      );

      const { protocol, rendered } = await renderVerifier(inputPath, outputPath);

      assert.equal(protocol, "groth16");
      assert.match(rendered, /const IC0: slice/);
      assert.match(rendered, /const IC1: slice/);
      assert.match(rendered, /const N_PUBLIC: int = 1/);
    });
  });
});

test("generateVerifier rejects gnark JSON points that are not on BLS12-381", async () => {
  await withTempDir(async (tempDir) => {
    await withBn128Fixtures(async (fixtures) => {
      const inputPath = path.join(tempDir, "verification_key_gnark_bn128.json");
      const outputPath = path.join(tempDir, "verifier.tolk");
      await fs.writeFile(
        inputPath,
        JSON.stringify(makeGnarkJsonVk(fixtures)),
        "utf8",
      );

      await assert.rejects(
        renderVerifier(inputPath, outputPath),
        /BLS12-381/,
      );
    });
  });
});

test("generateVerifier renders a Groth16 verifier from native gnark binary", async () => {
  await withTempDir(async (tempDir) => {
    await withBls12381Fixtures(async (fixtures) => {
      const inputPath = path.join(tempDir, "verification_key.bin");
      const outputPath = path.join(tempDir, "verifier.fc");
      await fs.writeFile(inputPath, makeGnarkBinaryVk(fixtures));

      const { protocol, rendered } = await renderVerifier(
        inputPath,
        outputPath,
        "func",
      );

      assert.equal(protocol, "groth16");
      assert.match(rendered, /const slice verifier::IC0 = "([0-9a-f]{96})"s;/);
      assert.match(rendered, /const slice verifier::IC1 = "([0-9a-f]{96})"s;/);
    });
  });
});

test("generateVerifier renders a Groth16 verifier from native arkworks JSON", async () => {
  await withTempDir(async (tempDir) => {
    await withBls12381Fixtures(async (fixtures) => {
      const inputPath = path.join(tempDir, "groth16_artifacts.json");
      const outputPath = path.join(tempDir, "verifier.tact");
      await fs.writeFile(
        inputPath,
        JSON.stringify(makeArkworksJsonVk(fixtures)),
        "utf8",
      );

      const { protocol, rendered } = await renderVerifier(
        inputPath,
        outputPath,
        "tact",
      );

      assert.equal(protocol, "groth16");
      assert.match(rendered, /const IC0: Slice = rawSlice\("([0-9a-f]{96})"\);/);
      assert.match(rendered, /const IC1: Slice = rawSlice\("([0-9a-f]{96})"\);/);
    });
  });
});
