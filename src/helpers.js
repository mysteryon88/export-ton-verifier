import fs from "fs/promises";
import path from "path";
import * as binFileUtils from "@iden3/binfileutils";
import { getCurveFromQ } from "./curves.js";

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

function log2(V) {
  return (
    ((V & 0xffff0000) !== 0 ? ((V &= 0xffff0000), 16) : 0) |
    ((V & 0xff00ff00) !== 0 ? ((V &= 0xff00ff00), 8) : 0) |
    ((V & 0xf0f0f0f0) !== 0 ? ((V &= 0xf0f0f0f0), 4) : 0) |
    ((V & 0xcccccccc) !== 0 ? ((V &= 0xcccccccc), 2) : 0) |
    ((V & 0xaaaaaaaa) !== 0)
  );
}

async function readG1(fd, curve, toObject) {
  const buff = await fd.read(curve.G1.F.n8 * 2);
  const res = curve.G1.fromRprLEM(buff, 0);
  return toObject ? curve.G1.toObject(res) : res;
}

async function readG2(fd, curve, toObject) {
  const buff = await fd.read(curve.G2.F.n8 * 2);
  const res = curve.G2.fromRprLEM(buff, 0);
  return toObject ? curve.G2.toObject(res) : res;
}

export async function readHeaderPlonk(fd, sections, toObject) {
  const zkey = {};

  zkey.protocol = "plonk";

  await binFileUtils.startReadUniqueSection(fd, sections, 2);
  const n8q = await fd.readULE32();
  zkey.n8q = n8q;
  zkey.q = await binFileUtils.readBigInt(fd, n8q);

  const n8r = await fd.readULE32();
  zkey.n8r = n8r;
  zkey.r = await binFileUtils.readBigInt(fd, n8r);
  zkey.curve = await getCurveFromQ(zkey.q);
  zkey.nVars = await fd.readULE32();
  zkey.nPublic = await fd.readULE32();
  zkey.domainSize = await fd.readULE32();
  zkey.power = log2(zkey.domainSize);
  zkey.nAdditions = await fd.readULE32();
  zkey.nConstraints = await fd.readULE32();
  zkey.k1 = await fd.read(n8r);
  zkey.k2 = await fd.read(n8r);

  zkey.Qm = await readG1(fd, zkey.curve, toObject);
  zkey.Ql = await readG1(fd, zkey.curve, toObject);
  zkey.Qr = await readG1(fd, zkey.curve, toObject);
  zkey.Qo = await readG1(fd, zkey.curve, toObject);
  zkey.Qc = await readG1(fd, zkey.curve, toObject);
  zkey.S1 = await readG1(fd, zkey.curve, toObject);
  zkey.S2 = await readG1(fd, zkey.curve, toObject);
  zkey.S3 = await readG1(fd, zkey.curve, toObject);
  zkey.X_2 = await readG2(fd, zkey.curve, toObject);

  await binFileUtils.endReadSection(fd);

  return zkey;
}
