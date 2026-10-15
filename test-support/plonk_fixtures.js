// SPDX-License-Identifier: GPL-3.0-or-later
import fs from "fs/promises";
import path from "path";
import { beginCell } from "@ton/core";
import { utils } from "ffjavascript";
import { getCurveFromName } from "../src/utils.js";

const { stringifyBigInts } = utils;
const GAS_BOUNDARY_POINT_SCALARS = [
  50916109517175266503558523219887323923571274000853750801091278434669014013606n,
  15196286005408635417834397136113578268035780568673066023375782179383664568600n,
  15621810029831814445277559204893052940273344700366105678066281833719598588141n,
  14435829131475316105368651183331733443867866210919537647922506079903936178720n,
  8524976667748464845817996835030051479635428698713792448942762027445187293348n,
  48928640595579239036040181681679858491941317621668149444631161915574822518880n,
  42513001712974512546854079958147303300012343085313367052791910999179382734714n,
  21319702541254155645077490416820185631314128952606055379147150052579587763710n,
  12797336275846957843884373625825056986001827341243715887396320952821273908861n,
];
const GAS_BOUNDARY_EVALUATIONS = [
  22159261517167154269647235771342439101981790977778319122101756543140579077189n,
  20668703858645708566895241052552816901444104474518923861009027012547223702339n,
  25684910626801141064270761638772924901524972789290700345616193718868286884270n,
  12297663011568994251647929605307410077313212443576466254722810941373337743339n,
  10891316139632037623502342446047946434820789801445004203716245159630157153255n,
  10561075245925702910880933390168560511578089812631905884535547166353667622034n,
];
const GAS_BOUNDARY_PUBLIC_INPUTS = [
  16340562073278941416831612165628560107426626149021088969716066934275589187295n,
  44848186906117793618284884826246005445002148770207598148475735342608199563403n,
  8387239482916463682063212098674862429918350147167800582071213291258037439671n,
  36074327104474219406434381665782725488477113981170380625359150079243472959781n,
  25306781145950119862351237167092082161895273882275770963301726261208929230395n,
  14069372771925503355236889477738611535521386346359708394033710075363746331203n,
  22179537813115141036237796579282502420739529730322708562564393558157578670719n,
  5134737791827963101940161987800521203334593753003546617686777119855855921226n,
];

export async function writeGasBoundaryArtifacts(tempDir) {
  const curve = await getCurveFromName("bls12381");
  try {
    const g1 = curve.G1.toObject(curve.G1.g);
    const g2 = curve.G2.toObject(curve.G2.g);
    const points = GAS_BOUNDARY_POINT_SCALARS.map((scalar) =>
      curve.G1.toObject(curve.G1.timesScalar(curve.G1.g, scalar)),
    );
    const verificationKey = stringifyBigInts({
      protocol: "plonk",
      curve: "bls12381",
      nPublic: 8,
      power: 4,
      k1: 2n,
      k2: 3n,
      Qm: g1,
      Ql: g1,
      Qr: g1,
      Qo: g1,
      Qc: g1,
      S1: g1,
      S2: g1,
      S3: g1,
      X_2: g2,
      w: curve.Fr.toObject(curve.Fr.w[4]),
    });
    const proof = stringifyBigInts({
      protocol: "plonk",
      curve: "bls12381",
      A: points[0],
      B: points[1],
      C: points[2],
      Z: points[3],
      T1: points[4],
      T2: points[5],
      T3: points[6],
      Wxi: points[7],
      Wxiw: points[8],
      eval_a: GAS_BOUNDARY_EVALUATIONS[0],
      eval_b: GAS_BOUNDARY_EVALUATIONS[1],
      eval_c: GAS_BOUNDARY_EVALUATIONS[2],
      eval_s1: GAS_BOUNDARY_EVALUATIONS[3],
      eval_s2: GAS_BOUNDARY_EVALUATIONS[4],
      eval_zw: GAS_BOUNDARY_EVALUATIONS[5],
    });
    const verificationKeyPath = path.join(tempDir, "gas-boundary-vk.json");
    await fs.writeFile(
      verificationKeyPath,
      JSON.stringify(verificationKey),
      "utf8",
    );
    return {
      proof,
      publicSignals: GAS_BOUNDARY_PUBLIC_INPUTS.map(String),
      verificationKeyPath,
    };
  } finally {
    await curve.terminate();
  }
}

export function mismatchFirstCompressedPoint(body) {
  const root = body.beginParse();
  const op = root.loadUint(32);
  const payload = root.loadRef().beginParse();
  root.endParse();
  const compressed = payload.loadRef().beginParse();
  const firstPair = compressed.loadRef().beginParse();
  const a = firstPair.loadBuffer(48);
  const b = firstPair.loadBuffer(48);
  firstPair.endParse();
  a[0] ^= 0x20;
  const changedPair = beginCell().storeBuffer(a).storeBuffer(b).endCell();
  const changedCompressed = beginCell()
    .storeRef(changedPair)
    .storeSlice(compressed)
    .endCell();
  const changedPayload = beginCell()
    .storeRef(changedCompressed)
    .storeSlice(payload)
    .endCell();
  return beginCell().storeUint(op, 32).storeRef(changedPayload).endCell();
}

export function addTrailingBit(body) {
  const root = body.beginParse();
  const op = root.loadUint(32);
  const payload = root.loadRef();
  root.endParse();
  return beginCell().storeUint(op, 32).storeBit(true).storeRef(payload).endCell();
}

export function emptyCompressedTree(body) {
  const root = body.beginParse();
  const op = root.loadUint(32);
  const payload = root.loadRef().beginParse();
  root.endParse();
  payload.loadRef();
  const changedPayload = beginCell()
    .storeRef(beginCell().endCell())
    .storeSlice(payload)
    .endCell();
  return beginCell().storeUint(op, 32).storeRef(changedPayload).endCell();
}

export function replaceCellRef(cell, index, replacement) {
  const builder = beginCell().storeBits(cell.bits);
  cell.refs.forEach((ref, refIndex) =>
    builder.storeRef(refIndex === index ? replacement : ref),
  );
  return builder.endCell();
}

export function malformedPublicInputs(body) {
  const payload = body.refs[0];
  const malformed = beginCell().storeBit(true).endCell();
  return replaceCellRef(body, 0, replaceCellRef(payload, 2, malformed));
}

export function malformedTranscriptWitness(body) {
  const payload = body.refs[0];
  const uncompressed = payload.refs[3];
  const a = uncompressed.refs[0];
  const malformedWitness = beginCell().storeUint(0n, 768).endCell();
  const malformedA = replaceCellRef(a, 0, malformedWitness);
  const malformedUncompressed = replaceCellRef(uncompressed, 0, malformedA);
  return replaceCellRef(
    body,
    0,
    replaceCellRef(payload, 3, malformedUncompressed),
  );
}

