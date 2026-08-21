// SPDX-License-Identifier: GPL-3.0-or-later
import { beginCell } from "@ton/core";

export const BLS12_381_BASE_FIELD = BigInt(
  "0x1a0111ea397fe69a4b1ba7b6434bacd7" +
    "64774b84f38512bf6730d2a0f6b0f624" +
    "1eabfffeb153ffffb9feffffffffaaab",
);

export const BLS12_381_SCALAR_FIELD = BigInt(
  "0x73eda753299d7d483339d80809a1d805" +
    "53bda402fffe5bfeffffffff00000001",
);

const BLS12_381_HALF_BASE_FIELD = (BLS12_381_BASE_FIELD + 1n) / 2n;
const MAX_POSITIVE_QUOTIENT =
  BLS12_381_BASE_FIELD ** 2n - 3n * BLS12_381_BASE_FIELD + 3n;
const MAX_NEGATIVE_QUOTIENT = BLS12_381_BASE_FIELD - 3n;

function parseUnsignedInteger(value, field) {
  if (typeof value === "bigint") {
    if (value >= 0n) return value;
  } else if (typeof value === "number") {
    if (Number.isSafeInteger(value) && value >= 0) return BigInt(value);
  } else if (typeof value === "string" && /^[0-9]+$/.test(value)) {
    return BigInt(value);
  }

  throw new Error(`${field}: expected a canonical non-negative integer.`);
}

export function parseCanonicalPlonkScalar(value, field) {
  const scalar = parseUnsignedInteger(value, field);
  if (scalar >= BLS12_381_SCALAR_FIELD) {
    throw new Error(`${field}: field element must be in the range [0, r).`);
  }
  return scalar;
}

function parseProofPoint(rawPoint, field) {
  if (!Array.isArray(rawPoint) || rawPoint.length !== 3) {
    throw new Error(`${field}: expected canonical snarkjs projective coordinates.`);
  }

  const x = parseUnsignedInteger(rawPoint[0], `${field}.x`);
  const y = parseUnsignedInteger(rawPoint[1], `${field}.y`);
  const z = parseUnsignedInteger(rawPoint[2], `${field}.z`);

  if (z === 0n) {
    throw new Error(`${field}: identity point is not allowed.`);
  }
  if (
    x >= BLS12_381_BASE_FIELD ||
    y >= BLS12_381_BASE_FIELD ||
    z >= BLS12_381_BASE_FIELD
  ) {
    throw new Error(`${field}: point coordinates must be in the canonical field range.`);
  }

  return { x, y, z };
}

function bigIntToBuffer(value, byteLength, field) {
  const hex = value.toString(16);
  if (hex.length > byteLength * 2) {
    throw new Error(`${field}: integer does not fit in ${byteLength} bytes.`);
  }
  return Buffer.from(hex.padStart(byteLength * 2, "0"), "hex");
}

function bufferToBigInt(buffer) {
  const hex = Buffer.from(buffer).toString("hex");
  return hex.length === 0 ? 0n : BigInt(`0x${hex}`);
}

function pointWitness(x, y, field) {
  const numerator = x ** 3n + 4n - y ** 2n;
  if (numerator % BLS12_381_BASE_FIELD !== 0n) {
    throw new Error(`${field}: point is not on BLS12-381.`);
  }

  const quotient = numerator / BLS12_381_BASE_FIELD;
  const negative = quotient < 0n;
  const magnitude = negative ? -quotient : quotient;
  if (
    (negative && magnitude > MAX_NEGATIVE_QUOTIENT) ||
    (!negative && magnitude > MAX_POSITIVE_QUOTIENT)
  ) {
    throw new Error(`${field}: curve-equation witness is outside its canonical range.`);
  }
  return { negative, magnitude };
}

function compressedPoint(x, y) {
  const compressed = bigIntToBuffer(x, 48, "point.x");
  compressed[0] |= 0x80;
  if (y >= BLS12_381_HALF_BASE_FIELD) compressed[0] |= 0x20;
  return compressed;
}

export function encodePlonkG1Point(curve, rawPoint, field) {
  const projective = parseProofPoint(rawPoint, field);
  const point = curve.G1.fromObject([projective.x, projective.y, projective.z]);
  if (!curve.G1.isValid(point)) {
    throw new Error(`${field}: point is not on BLS12-381.`);
  }
  if (curve.G1.isZero(point)) {
    throw new Error(`${field}: identity point is not allowed.`);
  }
  if (!curve.G1.isZero(curve.G1.timesScalar(point, curve.r))) {
    throw new Error(`${field}: point is not in the BLS12-381 prime-order subgroup.`);
  }

  const [x, y] = curve.G1.toObject(curve.G1.toAffine(point));

  const coordinates = Buffer.concat([
    bigIntToBuffer(x, 48, `${field}.x`),
    bigIntToBuffer(y, 48, `${field}.y`),
  ]);
  const compressed = compressedPoint(x, y);
  const witness = pointWitness(x, y, field);
  const witnessCell = beginCell()
    .storeBit(witness.negative)
    .storeUint(witness.magnitude, 768)
    .endCell();
  const transcriptCell = beginCell()
    .storeBuffer(coordinates)
    .storeRef(witnessCell)
    .endCell();

  return { compressed, coordinates, witness, transcriptCell };
}

function exactCellSlice(cell, bits, refs, field) {
  if (!cell || typeof cell.beginParse !== "function") {
    throw new Error(`${field}: expected a TON cell.`);
  }
  const slice = cell.beginParse();
  if (slice.remainingBits !== bits || slice.remainingRefs !== refs) {
    throw new Error(
      `${field}: expected exactly ${bits} bits and ${refs} reference${refs === 1 ? "" : "s"}.`,
    );
  }
  return slice;
}

export function assertPlonkPointBindingCells(
  compressedCell,
  transcriptCell,
  field,
) {
  const compressedSlice = exactCellSlice(
    compressedCell,
    384,
    0,
    `${field}.compressed`,
  );
  const transcriptSlice = exactCellSlice(
    transcriptCell,
    768,
    1,
    `${field}.transcript`,
  );

  const compressed = compressedSlice.loadBuffer(48);
  const coordinates = transcriptSlice.loadBuffer(96);
  const witnessCell = transcriptSlice.loadRef();
  const witnessSlice = exactCellSlice(
    witnessCell,
    769,
    0,
    `${field}.witness`,
  );
  const negative = witnessSlice.loadBit();
  const magnitude = witnessSlice.loadUintBig(768);

  const flags = compressed[0] & 0xe0;
  if (flags !== 0x80 && flags !== 0xa0) {
    throw new Error(`${field}: compressed proof point is not canonical non-identity G1.`);
  }

  const xBytes = Buffer.from(compressed);
  xBytes[0] &= 0x1f;
  const compressedX = bufferToBigInt(xBytes);
  const x = bufferToBigInt(coordinates.subarray(0, 48));
  const y = bufferToBigInt(coordinates.subarray(48));
  if (x >= BLS12_381_BASE_FIELD || y >= BLS12_381_BASE_FIELD) {
    throw new Error(`${field}: transcript coordinates are not canonical.`);
  }
  if (compressedX !== x) {
    throw new Error(`${field}: compressed and transcript representations do not match.`);
  }
  const expectedSign = y >= BLS12_381_HALF_BASE_FIELD;
  if (((flags & 0x20) !== 0) !== expectedSign) {
    throw new Error(`${field}: compressed and transcript representations do not match.`);
  }
  if (negative && magnitude === 0n) {
    throw new Error(`${field}: curve-equation witness uses negative zero.`);
  }
  if (
    (negative && magnitude > MAX_NEGATIVE_QUOTIENT) ||
    (!negative && magnitude > MAX_POSITIVE_QUOTIENT)
  ) {
    throw new Error(`${field}: curve-equation witness is outside its canonical range.`);
  }

  const signedQuotient = negative ? -magnitude : magnitude;
  if (
    x ** 3n + 4n - y ** 2n !==
    signedQuotient * BLS12_381_BASE_FIELD
  ) {
    throw new Error(`${field}: invalid curve-equation witness.`);
  }
}
