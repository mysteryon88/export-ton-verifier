// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "fs/promises";
import path from "path";
import * as binFileUtils from "@iden3/binfileutils";
import { getCurveFromQ } from "./utils.js";
import {
  assertPlonkPower,
  MAX_VERIFICATION_KEY_BYTES,
} from "./limits.js";

export async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a template path based on language and protocol.
 * Tries <lang>_verifier_<protocol>.ejs first; for groth16 falls back to <lang>_verifier.ejs.
 */
export async function resolveTemplatePath(templatesDir, lang, protocol) {
  const withProtocol = `${lang}_verifier_${protocol}.ejs`;
  const fallback = `${lang}_verifier.ejs`;
  const pathWithProtocol = path.join(templatesDir, withProtocol);
  const pathFallback = path.join(templatesDir, fallback);

  if (await fileExists(pathWithProtocol)) {
    return pathWithProtocol;
  }
  if (protocol === "groth16" && (await fileExists(pathFallback))) {
    return pathFallback;
  }
  throw new Error(
    `Template not found: '${withProtocol}' (or '${fallback}' for groth16) in ${templatesDir}`,
  );
}

export function normalizeContractName(name = "MyVerifier") {
  const raw = String(name ?? "").trim();
  if (!raw) return "MyVerifier";

  const parts = raw.match(/[A-Za-z0-9]+/g) ?? [];
  if (parts.length === 0) return "MyVerifier";

  let normalized = parts
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  if (!/^[A-Za-z_]/.test(normalized)) {
    normalized = `_${normalized}`;
  }

  return normalized;
}

async function readG1(fd, curve, toObject, field) {
  assertSectionRemaining(fd, curve.G1.F.n8 * 2, field);
  const buff = await fd.read(curve.G1.F.n8 * 2);
  const res = curve.G1.fromRprLEM(buff, 0);
  return toObject ? curve.G1.toObject(res) : res;
}

async function readG2(fd, curve, toObject, field) {
  assertSectionRemaining(fd, curve.G2.F.n8 * 2, field);
  const buff = await fd.read(curve.G2.F.n8 * 2);
  const res = curve.G2.fromRprLEM(buff, 0);
  return toObject ? curve.G2.toObject(res) : res;
}

export async function readHeaderPlonk(fd, sections, toObject) {
  const zkey = {};

  zkey.protocol = "plonk";

  await binFileUtils.startReadUniqueSection(fd, sections, 2);
  const n8q = requireWidth(await fd.readULE32(), 48, "n8q");
  zkey.n8q = n8q;
  assertSectionRemaining(fd, n8q, "q");
  zkey.q = await binFileUtils.readBigInt(fd, n8q);

  const n8r = requireWidth(await fd.readULE32(), 32, "n8r");
  zkey.n8r = n8r;
  assertSectionRemaining(fd, n8r, "r");
  zkey.r = await binFileUtils.readBigInt(fd, n8r);
  zkey.curve = await getCurveFromQ(zkey.q);
  zkey.nVars = await fd.readULE32();
  zkey.nPublic = await fd.readULE32();
  zkey.domainSize = await fd.readULE32();
  zkey.power = Math.log2(zkey.domainSize);
  if (!Number.isInteger(zkey.power)) {
    throw new Error("Invalid PLONK domainSize: expected a power of two.");
  }
  assertPlonkPower(zkey.power, "PLONK domain power");
  zkey.nAdditions = await fd.readULE32();
  zkey.nConstraints = await fd.readULE32();
  assertSectionRemaining(fd, n8r, "k1");
  zkey.k1 = await fd.read(n8r);
  assertSectionRemaining(fd, n8r, "k2");
  zkey.k2 = await fd.read(n8r);

  zkey.Qm = await readG1(fd, zkey.curve, toObject, "Qm");
  zkey.Ql = await readG1(fd, zkey.curve, toObject, "Ql");
  zkey.Qr = await readG1(fd, zkey.curve, toObject, "Qr");
  zkey.Qo = await readG1(fd, zkey.curve, toObject, "Qo");
  zkey.Qc = await readG1(fd, zkey.curve, toObject, "Qc");
  zkey.S1 = await readG1(fd, zkey.curve, toObject, "S1");
  zkey.S2 = await readG1(fd, zkey.curve, toObject, "S2");
  zkey.S3 = await readG1(fd, zkey.curve, toObject, "S3");
  zkey.X_2 = await readG2(fd, zkey.curve, toObject, "X_2");

  await binFileUtils.endReadSection(fd);

  return zkey;
}

export async function assertZkeyFieldWidths(zkeyName) {
  const { size } = await fs.stat(zkeyName);
  if (!Number.isSafeInteger(size) || size > MAX_VERIFICATION_KEY_BYTES) {
    const error = new Error(
      `.zkey artifact is too large: maximum is ${MAX_VERIFICATION_KEY_BYTES} bytes.`,
    );
    error.code = "ERR_VERIFICATION_KEY_LIMIT";
    throw error;
  }

  const { fd, sections } = await binFileUtils.readBinFile(zkeyName, "zkey", 2);
  try {
    await binFileUtils.startReadUniqueSection(fd, sections, 2);
    const n8q = requireWidth(await fd.readULE32(), 48, "n8q");
    assertSectionRemaining(fd, n8q, "q");
    await fd.read(n8q);
    requireWidth(await fd.readULE32(), 32, "n8r");
  } finally {
    await fd.close();
  }
}

function requireWidth(width, expected, field) {
  if (width !== expected) {
    throw new Error(`Invalid PLONK ${field}: expected ${expected} bytes.`);
  }
  return width;
}

function assertSectionRemaining(fd, length, field) {
  const section = fd.readingSection;
  const used = section && fd.pos - section.p;
  if (
    !section ||
    !Number.isSafeInteger(section.size) ||
    !Number.isSafeInteger(used) ||
    used < 0 ||
    length > section.size - used
  ) {
    throw new Error(`Invalid PLONK section while reading ${field}.`);
  }
}
