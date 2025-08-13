import { buildBn128, buildBls12381 } from "ffjavascript";

// from node_modules/snarkjs/src/curves.js
export async function getCurveFromName(name, options) {
  let curve;
  let singleThread = options && options.singleThread;
  const normName = normalizeName(name);
  if (["BN128", "BN254", "ALTBN128"].indexOf(normName) >= 0) {
    curve = await buildBn128(singleThread);
  } else if (["BLS12381"].indexOf(normName) >= 0) {
    curve = await buildBls12381(singleThread);
  } else {
    throw new Error(`Curve not supported: ${name}`);
  }
  return curve;

  function normalizeName(n) {
    return n
      .toUpperCase()
      .match(/[A-Za-z0-9]+/g)
      .join("");
  }
}

function toHexString(byteArray) {
  return Array.from(byteArray, (byte) =>
    ("0" + (byte & 0xff).toString(16)).slice(-2)
  ).join("");
}

export function g1Compressed(curve, p1Raw) {
  const p1 = curve.G1.fromObject(p1Raw);
  const buff = new Uint8Array(48);
  curve.G1.toRprCompressed(buff, 0, p1);
  if (buff[0] & 0x80) buff[0] |= 32;
  buff[0] |= 0x80;
  return toHexString(buff);
}

export function g2Compressed(curve, p2Raw) {
  const p2 = curve.G2.fromObject(p2Raw);
  const buff = new Uint8Array(96);
  curve.G2.toRprCompressed(buff, 0, p2);
  if (buff[0] & 0x80) buff[0] |= 32;
  buff[0] |= 0x80;
  return toHexString(buff);
}
