// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "fs/promises";
import {
  BinaryReader,
  BLS12381_CURVE_NAME,
  decodeBls12381G1,
  decodeBls12381G2,
  g1Point,
  g2Point,
  makeGroth16VerificationKey,
  requireField,
  withBls12381,
} from "./common.js";

const BLS_FIELD_BYTES = 48;
const GNARK_FLAG_MASK = 0xe0;
const GNARK_COMPRESSED_FLAGS = new Set([0x80, 0xa0, 0xc0]);
const GNARK_UNCOMPRESSED_FLAGS = new Set([0x00, 0x40]);

export async function normalizeGnarkJsonVerificationKey(value) {
  const g1 = requireField(value?.G1, "G1");
  const g2 = requireField(value?.G2, "G2");

  ensureNoVerificationKeyCommitments(value);

  const k = requireField(g1.K, "G1.K");
  if (!Array.isArray(k)) {
    throw new Error("verification key: G1.K must be an array.");
  }

  const verificationKey = makeGroth16VerificationKey({
    curve: BLS12381_CURVE_NAME,
    vk_alpha_1: g1FromJson(requireField(g1.Alpha, "G1.Alpha"), "G1.Alpha"),
    vk_beta_2: g2FromJson(requireField(g2.Beta, "G2.Beta"), "G2.Beta"),
    vk_gamma_2: g2FromJson(requireField(g2.Gamma, "G2.Gamma"), "G2.Gamma"),
    vk_delta_2: g2FromJson(requireField(g2.Delta, "G2.Delta"), "G2.Delta"),
    IC: k.map((point, idx) => g1FromJson(point, `G1.K[${idx}]`)),
  });

  await assertBls12381VerificationKeyPoints(verificationKey);
  return verificationKey;
}

export async function loadGnarkBinaryVerificationKey(path) {
  const bytes = await fs.readFile(path);
  return normalizeGnarkBinaryVerificationKey(Uint8Array.from(bytes), path);
}

export async function normalizeGnarkBinaryVerificationKey(
  bytes,
  sourceName = "gnark binary VK",
) {
  return withBls12381((curve) => {
    const reader = new BinaryReader(bytes, sourceName);
    const alpha = readG1(reader, curve, "G1.Alpha");
    readG1(reader, curve, "G1.Beta");
    const beta = readG2(reader, curve, "G2.Beta");
    const gamma = readG2(reader, curve, "G2.Gamma");
    readG1(reader, curve, "G1.Delta");
    const delta = readG2(reader, curve, "G2.Delta");

    const icLen = reader.readU32BE("G1.K length");
    const IC = [];
    for (let idx = 0; idx < icLen; idx += 1) {
      IC.push(readG1(reader, curve, `G1.K[${idx}]`));
    }

    const publicAndCommitmentCommitted = readU64SliceSlice(
      reader,
      "PublicAndCommitmentCommitted",
    );
    const commitmentKeysLen = reader.readU32BE("CommitmentKeys length");
    if (publicAndCommitmentCommitted.length !== 0 || commitmentKeysLen !== 0) {
      throw new Error(
        "gnark commitment keys are not supported by TON verifier generation.",
      );
    }

    reader.finish("gnark verification key");
    return makeGroth16VerificationKey({
      curve: BLS12381_CURVE_NAME,
      vk_alpha_1: alpha,
      vk_beta_2: beta,
      vk_gamma_2: gamma,
      vk_delta_2: delta,
      IC,
    });
  });
}

function ensureNoVerificationKeyCommitments(value) {
  const commitmentKeys = value?.CommitmentKeys;
  const publicAndCommitmentCommitted = value?.PublicAndCommitmentCommitted;
  if (
    !isEmptyCommitmentValue(commitmentKeys) ||
    !isEmptyCommitmentValue(publicAndCommitmentCommitted)
  ) {
    throw new Error(
      "gnark commitment keys are not supported by TON verifier generation.",
    );
  }
}

function isEmptyCommitmentValue(value) {
  return value === undefined || value === null || (Array.isArray(value) && value.length === 0);
}

function g1FromJson(point, field) {
  return g1Point(
    requireField(point?.X, `${field}.X`),
    requireField(point?.Y, `${field}.Y`),
    field,
  );
}

function g2FromJson(point, field) {
  return g2Point(
    requireField(point?.X?.A0, `${field}.X.A0`),
    requireField(point?.X?.A1, `${field}.X.A1`),
    requireField(point?.Y?.A0, `${field}.Y.A0`),
    requireField(point?.Y?.A1, `${field}.Y.A1`),
    field,
  );
}

async function assertBls12381VerificationKeyPoints(vk) {
  await withBls12381((curve) => {
    assertBls12381Point(curve.G1, vk.vk_alpha_1, "G1.Alpha");
    assertBls12381Point(curve.G2, vk.vk_beta_2, "G2.Beta");
    assertBls12381Point(curve.G2, vk.vk_gamma_2, "G2.Gamma");
    assertBls12381Point(curve.G2, vk.vk_delta_2, "G2.Delta");
    vk.IC.forEach((point, idx) => {
      assertBls12381Point(curve.G1, point, `G1.K[${idx}]`);
    });
  });
}

function assertBls12381Point(group, point, field) {
  let parsed;
  try {
    parsed = group.fromObject(bigintPoint(point));
  } catch (err) {
    throw new Error(
      `${field}: expected a valid BLS12-381 point (${err?.message || err}).`,
    );
  }

  if (!group.isValid(parsed)) {
    throw new Error(`${field}: point is not on BLS12-381.`);
  }
}

function bigintPoint(value) {
  if (Array.isArray(value)) return value.map(bigintPoint);
  if (typeof value === "bigint") return value;
  return BigInt(value);
}

function readG1(reader, curve, field) {
  const bytes = reader.readBytes(pointLength(reader, BLS_FIELD_BYTES, field), field);
  return decodeBls12381G1(curve, bytes, field);
}

function readG2(reader, curve, field) {
  const bytes = reader.readBytes(
    pointLength(reader, BLS_FIELD_BYTES * 2, field),
    field,
  );
  return decodeBls12381G2(curve, bytes, field);
}

function pointLength(reader, compressedSize, field) {
  const flag = reader.peekByte(field) & GNARK_FLAG_MASK;
  if (GNARK_COMPRESSED_FLAGS.has(flag)) return compressedSize;
  if (GNARK_UNCOMPRESSED_FLAGS.has(flag)) return compressedSize * 2;
  throw new Error(
    `${field}: unsupported gnark point flag 0x${flag.toString(16).padStart(2, "0")}.`,
  );
}

function readU64SliceSlice(reader, field) {
  const outerLen = reader.readU32BE(`${field} length`);
  const outer = [];
  for (let outerIdx = 0; outerIdx < outerLen; outerIdx += 1) {
    const innerLen = reader.readU32BE(`${field}[${outerIdx}] length`);
    const inner = [];
    for (let innerIdx = 0; innerIdx < innerLen; innerIdx += 1) {
      inner.push(reader.readU64BE(`${field}[${outerIdx}][${innerIdx}]`));
    }
    outer.push(inner);
  }
  return outer;
}
