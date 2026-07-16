// SPDX-License-Identifier: GPL-3.0-or-later
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
import {
  assertPlonkPublicInputCount,
  assertTonBlsCurve,
} from "./limits.js";
import {
  assertBls12381Point,
  decodeBls12381G1,
  decodeBls12381G2,
  decodeHex,
  parseBls12381Point,
} from "./formats/common.js";

const { stringifyBigInts, unstringifyBigInts } = utils;

const G1_KEYS = ["Qm", "Ql", "Qr", "Qo", "Qc", "S1", "S2", "S3"];
const G1_UC_KEYS = ["Qm_uc", "Ql_uc", "Qr_uc", "Qo_uc", "Qc_uc", "S1_uc", "S2_uc", "S3_uc"];

export default async function zkeyExportPlonkVerificationKey(zkeyName) {
  const { fd, sections } = await binFileUtils.readBinFile(zkeyName, "zkey", 2);

  try {
    const zkey = await readHeaderPlonk(fd, sections);
    return await plonkVk(zkey);
  } finally {
    await fd.close();
  }
}

export async function normalizePlonkVerificationKey(vkRaw) {
  if (vkRaw.protocol !== "plonk") {
    throw new Error(`Expected PLONK verification key (got '${vkRaw.protocol}').`);
  }

  const nPublic = numberField(vkRaw, "nPublic");
  assertPlonkPublicInputCount(nPublic, "verification_key.nPublic");
  assertTonBlsCurve(vkRaw.curve, "verification_key.curve");

  const vk = unstringifyBigInts(vkRaw);
  const curve = await getCurveFromName(vkRaw.curve);

  try {
    if (isTemplateReadyPlonkVerificationKey(vkRaw)) {
      validateTemplateReadyPlonkVerificationKey(curve, vkRaw);
      return stringifyBigInts({ ...vkRaw, nPublic });
    }

    const x2 = parseBls12381Point(
      curve.G2,
      curve.r,
      vk.X_2,
      "verification_key.X_2",
      { allowIdentity: false },
    );
    const res = {
      protocol: "plonk",
      curve: curve.name,
      nPublic,
      power: numberField(vkRaw, "power"),
      k1: scalarToString(curve, vk.k1, "k1"),
      k2: scalarToString(curve, vk.k2, "k2"),
      w:
        vk.w === undefined
          ? scalarToString(curve, curve.Fr.w[numberField(vkRaw, "power")], "w")
          : scalarToString(curve, vk.w, "w"),
      X_2: pointToBlstCHex(curve.G2, x2),
    };

    for (const key of G1_KEYS) {
      const point = parseBls12381Point(
        curve.G1,
        curve.r,
        vk[key],
        `verification_key.${key}`,
      );
      res[key] = pointToBlstCHex(curve.G1, point);
      res[`${key}_uc`] = pointToUncompressedHex(curve.G1, point);
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

function validateTemplateReadyPlonkVerificationKey(curve, vkRaw) {
  for (const key of G1_KEYS) {
    const compressed = curve.G1.fromObject(
      decodeBls12381G1(
        curve,
        decodeHex(vkRaw[key], `verification_key.${key}`),
        `verification_key.${key}`,
      ),
    );
    const uncompressed = curve.G1.fromObject(
      decodeBls12381G1(
        curve,
        decodeHex(vkRaw[`${key}_uc`], `verification_key.${key}_uc`),
        `verification_key.${key}_uc`,
      ),
    );
    if (!curve.G1.eq(compressed, uncompressed)) {
      throw new Error(
        `verification_key.${key}: compressed and uncompressed encodings must describe the same point.`,
      );
    }
  }

  const x2 = curve.G2.fromObject(
    decodeBls12381G2(
      curve,
      decodeHex(vkRaw.X_2, "verification_key.X_2"),
      "verification_key.X_2",
    ),
  );
  assertBls12381Point(curve.G2, curve.r, x2, "verification_key.X_2", {
    allowIdentity: false,
  });
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

function pointToBlstCHex(curve, p) {
  const tmp = new Uint8Array(curve.F.n8);

  curve.toRprCompressed(tmp, 0, p);
  ffC2blstC(tmp, 0);

  return Buffer.from(tmp).toString("hex");
}

function pointToUncompressedHex(curve, p) {
  const tmp = new Uint8Array(curve.F.n8 * 2);
  curve.toRprUncompressed(tmp, 0, p);
  return Buffer.from(tmp).toString("hex");
}

async function plonkVk(zkey) {
  const curve = zkey.curve;

  try {
    assertPlonkPublicInputCount(zkey.nPublic, "verification_key.nPublic");
    assertTonBlsCurve(curve.name, "verification_key.curve");
    assertBls12381Point(curve.G2, curve.r, zkey.X_2, "verification_key.X_2", {
      allowIdentity: false,
    });
    for (const key of G1_KEYS) {
      assertBls12381Point(
        curve.G1,
        curve.r,
        zkey[key],
        `verification_key.${key}`,
      );
    }

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
    return vKey;
  } finally {
    if (typeof curve.terminate === "function") {
      await curve.terminate();
    }
  }
}
