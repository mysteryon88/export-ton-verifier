// https://github.com/ton-circom-integration/snarkjs/blob/master/src/zkey_export_blst_verificationkey.js

/*
    Copyright 2018 0KIMS association.

    This file is part of snarkJS.

    snarkJS is a free software: you can redistribute it and/or modify it
    under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    snarkJS is distributed in the hope that it will be useful, but WITHOUT
    ANY WARRANTY; without even the implied warranty of MERCHANTABILITY
    or FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public
    License for more details.

    You should have received a copy of the GNU General Public License
    along with snarkJS. If not, see <https://www.gnu.org/licenses/>.
*/

import * as binFileUtils from "@iden3/binfileutils";
import { utils } from "ffjavascript";

import { readHeaderPlonk } from "./helpers.js";
import { getCurveFromName } from "./utils.js";

const { stringifyBigInts, unstringifyBigInts } = utils;

const G1_KEYS = ["Qm", "Ql", "Qr", "Qo", "Qc", "S1", "S2", "S3"];
const G1_UC_KEYS = ["Qm_uc", "Ql_uc", "Qr_uc", "Qo_uc", "Qc_uc", "S1_uc", "S2_uc", "S3_uc"];

export default async function zkeyExportPlonkVerificationKey(zkeyName) {
  const { fd, sections } = await binFileUtils.readBinFile(zkeyName, "zkey", 2);

  const zkey = await readHeaderPlonk(fd, sections);

  const res = await plonkVk(zkey);

  await fd.close();

  return res;
}

export async function normalizePlonkVerificationKey(vkRaw) {
  if (vkRaw.protocol !== "plonk") {
    throw new Error(`Expected PLONK verification key (got '${vkRaw.protocol}').`);
  }

  if (isTemplateReadyPlonkVerificationKey(vkRaw)) {
    return stringifyBigInts(vkRaw);
  }

  const vk = unstringifyBigInts(vkRaw);
  const curve = await getCurveFromName(vkRaw.curve);

  try {
    const res = {
      protocol: "plonk",
      curve: curve.name,
      nPublic: numberField(vkRaw, "nPublic"),
      power: numberField(vkRaw, "power"),
      k1: scalarToString(curve, vk.k1, "k1"),
      k2: scalarToString(curve, vk.k2, "k2"),
      w:
        vk.w === undefined
          ? scalarToString(curve, curve.Fr.w[numberField(vkRaw, "power")], "w")
          : scalarToString(curve, vk.w, "w"),
      X_2: pointObjectToBlstCHex(curve.G2, vk.X_2, "X_2"),
    };

    for (const key of G1_KEYS) {
      res[key] = pointObjectToBlstCHex(curve.G1, vk[key], key);
      res[`${key}_uc`] = pointObjectToUncompressedHex(curve.G1, vk[key], key);
    }

    return stringifyBigInts(res);
  } finally {
    if (typeof curve.terminate === "function") {
      await curve.terminate();
    }
  }
}

function isTemplateReadyPlonkVerificationKey(vkRaw) {
  return (
    G1_KEYS.every((key) => typeof vkRaw[key] === "string") &&
    G1_UC_KEYS.every((key) => typeof vkRaw[key] === "string") &&
    typeof vkRaw.X_2 === "string"
  );
}

function numberField(vkRaw, key) {
  const value = Number(vkRaw[key]);
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`verification_key: invalid '${key}'.`);
  }
  return value;
}

function scalarToString(curve, value, key) {
  if (value === undefined || value === null) {
    throw new Error(`verification_key: missing '${key}'.`);
  }
  return curve.Fr.toObject(curve.Fr.fromObject(value)).toString();
}

function ffC2blstC(a, offset = 0) {
  if (a[offset] & 0x80) {
    a[offset] |= 0x20;
  }
  a[offset] |= 0x80;
}

function pointObjectToBlstCHex(curve, p, key) {
  if (p === undefined || p === null) {
    throw new Error(`verification_key: missing '${key}'.`);
  }
  return pointToBlstCHex(curve, curve.fromObject(p));
}

function pointToBlstCHex(curve, p) {
  const tmp = new Uint8Array(curve.F.n8);

  curve.toRprCompressed(tmp, 0, p);
  ffC2blstC(tmp, 0);

  return Buffer.from(tmp).toString("hex");
}

function pointObjectToUncompressedHex(curve, p, key) {
  if (p === undefined || p === null) {
    throw new Error(`verification_key: missing '${key}'.`);
  }
  return pointToUncompressedHex(curve, curve.fromObject(p));
}

function pointToUncompressedHex(curve, p) {
  const tmp = new Uint8Array(curve.F.n8 * 2);
  curve.toRprUncompressed(tmp, 0, p);
  return Buffer.from(tmp).toString("hex");
}

async function plonkVk(zkey) {
  const curve = zkey.curve;

  let vKey = {
    protocol: zkey.protocol,
    curve: curve.name,
    nPublic: zkey.nPublic,
    power: zkey.power,

    k1: curve.Fr.toObject(zkey.k1),
    k2: curve.Fr.toObject(zkey.k2),

    Qm: pointToBlstCHex(curve.G1, zkey.Qm),
    Ql: pointToBlstCHex(curve.G1, zkey.Ql),
    Qr: pointToBlstCHex(curve.G1, zkey.Qr),
    Qo: pointToBlstCHex(curve.G1, zkey.Qo),
    Qc: pointToBlstCHex(curve.G1, zkey.Qc),
    S1: pointToBlstCHex(curve.G1, zkey.S1),
    S2: pointToBlstCHex(curve.G1, zkey.S2),
    S3: pointToBlstCHex(curve.G1, zkey.S3),

    Qm_uc: pointToUncompressedHex(curve.G1, zkey.Qm),
    Ql_uc: pointToUncompressedHex(curve.G1, zkey.Ql),
    Qr_uc: pointToUncompressedHex(curve.G1, zkey.Qr),
    Qo_uc: pointToUncompressedHex(curve.G1, zkey.Qo),
    Qc_uc: pointToUncompressedHex(curve.G1, zkey.Qc),
    S1_uc: pointToUncompressedHex(curve.G1, zkey.S1),
    S2_uc: pointToUncompressedHex(curve.G1, zkey.S2),
    S3_uc: pointToUncompressedHex(curve.G1, zkey.S3),

    X_2: pointToBlstCHex(curve.G2, zkey.X_2),

    w: curve.Fr.toObject(curve.Fr.w[zkey.power]),
  };

  vKey = stringifyBigInts(vKey);

  if (typeof curve.terminate === "function") {
    await curve.terminate();
  }

  return vKey;
}
