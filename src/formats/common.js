// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "fs/promises";
import { buildBls12381 } from "ffjavascript";

export const BLS12381_CURVE_NAME = "bls12381";

export function normalizeBls12381CurveName(raw, field = "curve") {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error(`${field}: BLS12-381 curve metadata is required.`);
  }

  const normalized = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized !== "bls12381") {
    throw new Error(
      `${field}: only BLS12-381 artifacts are supported for gnark/arkworks inputs (got '${raw}').`,
    );
  }

  return BLS12381_CURVE_NAME;
}

export function decimalString(value, field) {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^[0-9]+$/.test(trimmed)) return trimmed;
  }

  throw new Error(`${field} must be a decimal string or integer.`);
}

export function requireField(value, field) {
  if (value === undefined || value === null) {
    throw new Error(`verification key: missing '${field}'.`);
  }
  return value;
}

export function g1Point(x, y, field) {
  return [
    decimalString(x, `${field}.X`),
    decimalString(y, `${field}.Y`),
    "1",
  ];
}

export function g2Point(x0, x1, y0, y1, field) {
  return [
    [
      decimalString(x0, `${field}.X.A0`),
      decimalString(x1, `${field}.X.A1`),
    ],
    [
      decimalString(y0, `${field}.Y.A0`),
      decimalString(y1, `${field}.Y.A1`),
    ],
    ["1", "0"],
  ];
}

export function makeGroth16VerificationKey({
  curve = BLS12381_CURVE_NAME,
  vk_alpha_1,
  vk_beta_2,
  vk_gamma_2,
  vk_delta_2,
  IC,
}) {
  if (!Array.isArray(IC) || IC.length === 0) {
    throw new Error("verification key: IC/G1.K must contain at least one point.");
  }

  return {
    protocol: "groth16",
    curve,
    vk_alpha_1,
    vk_beta_2,
    vk_gamma_2,
    vk_delta_2,
    IC,
    nPublic: IC.length - 1,
  };
}

export async function readJson(path, label) {
  const content = await fs.readFile(path, "utf8");
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`invalid ${label} JSON in ${path}: ${err.message}`);
  }
}

export function decodeHex(raw, field) {
  if (typeof raw !== "string") {
    throw new Error(`${field} must be a hex string.`);
  }

  const hex = raw.trim().replace(/^0x/i, "");
  if (hex.length === 0) throw new Error(`${field} must not be empty.`);
  if (hex.length % 2 !== 0) {
    throw new Error(`${field} has odd hex length.`);
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`${field} must be a hex string.`);
  }

  return Uint8Array.from(Buffer.from(hex, "hex"));
}

export async function withBls12381(run) {
  const curve = await buildBls12381();
  try {
    return await run(curve);
  } finally {
    if (curve && typeof curve.terminate === "function") {
      await curve.terminate();
    }
  }
}

export function decodeBls12381G1(curve, bytes, field) {
  const point = decodeBls12381Point(curve.G1, curve.r, bytes, 48, field);
  return curvePointToObjectArray(curve.G1, point);
}

export function decodeBls12381G2(curve, bytes, field) {
  const point = decodeBls12381Point(curve.G2, curve.r, bytes, 96, field);
  return curvePointToObjectArray(curve.G2, point);
}

export function parseBls12381Point(
  group,
  scalarOrder,
  raw,
  field,
  options,
) {
  let point;
  try {
    point = group.fromObject(bigintPoint(raw));
  } catch (err) {
    throw new Error(
      `${field}: expected a valid BLS12-381 point (${err?.message || err}).`,
    );
  }
  assertBls12381Point(group, scalarOrder, point, field, options);
  return point;
}

export function assertBls12381Point(
  group,
  scalarOrder,
  point,
  field,
  { allowIdentity = true } = {},
) {
  if (!group.isValid(point)) {
    throw new Error(`${field}: point is not on BLS12-381.`);
  }
  if (group.isZero(point)) {
    if (!allowIdentity) {
      throw new Error(`${field}: identity point is not allowed.`);
    }
    return;
  }
  if (!group.isZero(group.timesScalar(point, scalarOrder))) {
    throw new Error(`${field}: point is not in the BLS12-381 prime-order subgroup.`);
  }
}

export function assertBls12381Groth16VerificationKey(curve, vk) {
  if (!Array.isArray(vk.IC) || vk.IC.length === 0) {
    throw new Error("verification_key.IC must contain at least one point.");
  }
  if (vk.nPublic !== undefined && vk.nPublic !== null) {
    const nPublic = Number(vk.nPublic);
    if (!Number.isSafeInteger(nPublic) || nPublic < 0) {
      throw new Error("verification_key.nPublic must be a non-negative integer.");
    }
    if (vk.IC.length !== nPublic + 1) {
      throw new Error(
        `verification_key.IC length (${vk.IC.length}) must equal nPublic + 1 (${nPublic + 1}).`,
      );
    }
  }

  parseBls12381Point(
    curve.G1,
    curve.r,
    vk.vk_alpha_1,
    "verification_key.vk_alpha_1",
    { allowIdentity: false },
  );
  parseBls12381Point(
    curve.G2,
    curve.r,
    vk.vk_beta_2,
    "verification_key.vk_beta_2",
    { allowIdentity: false },
  );
  parseBls12381Point(
    curve.G2,
    curve.r,
    vk.vk_gamma_2,
    "verification_key.vk_gamma_2",
    { allowIdentity: false },
  );
  parseBls12381Point(
    curve.G2,
    curve.r,
    vk.vk_delta_2,
    "verification_key.vk_delta_2",
    { allowIdentity: false },
  );
  vk.IC.forEach((point, idx) => {
    parseBls12381Point(
      curve.G1,
      curve.r,
      point,
      `verification_key.IC[${idx}]`,
    );
  });
}

function curvePointToObjectArray(curveGroup, point) {
  return stringifyBigIntsDeep(curveGroup.toObject(point));
}

function stringifyBigIntsDeep(value) {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(stringifyBigIntsDeep);
  return value;
}

function decodeBls12381Point(
  group,
  scalarOrder,
  bytes,
  compressedSize,
  field,
) {
  const first = bytes[0];
  if (first === undefined) {
    throw new Error(`${field}: empty point encoding.`);
  }

  const flag = first & 0xe0;
  const compressed = flag === 0x80 || flag === 0xa0 || flag === 0xc0;
  const uncompressed = flag === 0x00 || flag === 0x40;

  if (!compressed && !uncompressed) {
    throw new Error(
      `${field}: unsupported gnark/arkworks point flag 0x${flag.toString(16)}.`,
    );
  }

  if (compressed) {
    if (bytes.length !== compressedSize) {
      throw new Error(
        `${field}: expected ${compressedSize} compressed bytes, got ${bytes.length}.`,
      );
    }
    const point =
      flag === 0xc0
        ? group.zero
        : group.fromRprCompressed(toFfjavascriptCompressed(bytes), 0);
    assertBls12381Point(group, scalarOrder, point, field);
    return point;
  }

  if (bytes.length !== compressedSize * 2) {
    throw new Error(
      `${field}: expected ${compressedSize * 2} uncompressed bytes, got ${bytes.length}.`,
    );
  }
  const point =
    flag === 0x40 ? group.zero : group.fromRprUncompressed(bytes, 0);
  assertBls12381Point(group, scalarOrder, point, field);
  return point;
}

function toFfjavascriptCompressed(bytes) {
  const converted = Uint8Array.from(bytes);
  const sign = converted[0] & 0x20;
  converted[0] &= 0x1f;
  if (sign) converted[0] |= 0x80;
  return converted;
}

function bigintPoint(value) {
  if (Array.isArray(value)) return value.map(bigintPoint);
  if (typeof value === "bigint") return value;
  return BigInt(value);
}

export class BinaryReader {
  constructor(bytes, sourceName) {
    this.bytes = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
    this.sourceName = sourceName;
    this.offset = 0;
  }

  readBytes(len, field) {
    const end = this.offset + len;
    if (end > this.bytes.length) {
      throw new Error(
        `${this.sourceName} ended while reading ${field}: need ${len} bytes at offset ${this.offset}, remaining ${this.bytes.length - this.offset}.`,
      );
    }

    const slice = this.bytes.slice(this.offset, end);
    this.offset = end;
    return slice;
  }

  peekByte(field) {
    const value = this.bytes[this.offset];
    if (value === undefined) {
      throw new Error(`${this.sourceName} ended before reading ${field}.`);
    }
    return value;
  }

  readU32BE(field) {
    const bytes = this.readBytes(4, field);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(
      0,
      false,
    );
  }

  readU64BE(field) {
    const bytes = this.readBytes(8, field);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(
      0,
      false,
    );
  }

  readU64LE(field) {
    const bytes = this.readBytes(8, field);
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(
      0,
      true,
    );
  }

  finish(label = "artifact") {
    if (this.offset !== this.bytes.length) {
      throw new Error(
        `${this.sourceName} has ${this.bytes.length - this.offset} trailing bytes after ${label}.`,
      );
    }
  }
}
