import { getCurveFromName } from "./curves.js";
import { utils } from "ffjavascript";
const { unstringifyBigInts } = utils;
import { beginCell, Cell, Dictionary } from "@ton/core";

export function calldataToTupleItems(calldata) {
  return calldata.map((item) => {
    if ((item.type === "slice" || item.type === "cell") && item.cell != null) {
      const c = item.cell;
      if (typeof c.toBoc === "function") {
        const ourCell = Cell.fromBoc(c.toBoc())[0];
        return { type: item.type, cell: ourCell };
      }
    }
    return item;
  });
}

export async function exportPlonkFuncCalldata(_proof, _pub) {
  let proof = unstringifyBigInts(_proof);
  const pub = unstringifyBigInts(_pub);

  const curve = await getCurveFromName(proof.curve);
  proof = fromObjectProof(curve, proof);

  if (typeof curve.terminate === "function") {
    await curve.terminate();
  }

  const hexToCell = (hex) =>
    beginCell().storeBuffer(Buffer.from(hex, "hex")).endCell();

  const calldata = [
    {
      type: "slice",
      cell: beginCell().storeBuffer(Buffer.from(proof.A, "hex")).endCell(),
    },
    {
      type: "slice",
      cell: beginCell().storeBuffer(Buffer.from(proof.B, "hex")).endCell(),
    },
    {
      type: "slice",
      cell: beginCell().storeBuffer(Buffer.from(proof.C, "hex")).endCell(),
    },
    {
      type: "slice",
      cell: beginCell().storeBuffer(Buffer.from(proof.Z, "hex")).endCell(),
    },
    {
      type: "slice",
      cell: beginCell().storeBuffer(Buffer.from(proof.T1, "hex")).endCell(),
    },
    {
      type: "slice",
      cell: beginCell().storeBuffer(Buffer.from(proof.T2, "hex")).endCell(),
    },
    {
      type: "slice",
      cell: beginCell().storeBuffer(Buffer.from(proof.T3, "hex")).endCell(),
    },
    { type: "int", value: proof.eval_a },
    { type: "int", value: proof.eval_b },
    { type: "int", value: proof.eval_c },
    { type: "int", value: proof.eval_s1 },
    { type: "int", value: proof.eval_s2 },
    { type: "int", value: proof.eval_zw },
    {
      type: "slice",
      cell: beginCell().storeBuffer(Buffer.from(proof.Wxi, "hex")).endCell(),
    },
    {
      type: "slice",
      cell: beginCell().storeBuffer(Buffer.from(proof.Wxiw, "hex")).endCell(),
    },
    {
      type: "cell",
      cell: ((vs) => {
        const d = Dictionary.empty(
          Dictionary.Keys.Uint(32),
          Dictionary.Values.BigUint(256),
        );
        for (let i = 0; i < vs.length; i++) {
          d.set(i, vs[i]);
        }
        const b = beginCell();
        d.storeDirect(b);
        return b.endCell();
      })(pub),
    },
    {
      type: "slice",
      cell: hexToCell(proof.A_uc),
    },
    {
      type: "slice",
      cell: hexToCell(proof.B_uc),
    },
    {
      type: "slice",
      cell: hexToCell(proof.C_uc),
    },
    {
      type: "slice",
      cell: hexToCell(proof.Z_uc),
    },
    {
      type: "slice",
      cell: hexToCell(proof.T1_uc),
    },
    {
      type: "slice",
      cell: hexToCell(proof.T2_uc),
    },
    {
      type: "slice",
      cell: hexToCell(proof.T3_uc),
    },
    {
      type: "slice",
      cell: hexToCell(proof.Wxi_uc),
    },
    {
      type: "slice",
      cell: hexToCell(proof.Wxiw_uc),
    },
  ];

  return calldataToTupleItems(calldata);
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

function fromObjectProof(curve, proof) {
  const G1 = curve.G1;
  const Fr = curve.Fr;
  const res = {};

  const A = G1.fromObject(proof.A);
  const B = G1.fromObject(proof.B);
  const C = G1.fromObject(proof.C);
  const Z = G1.fromObject(proof.Z);
  const T1 = G1.fromObject(proof.T1);
  const T2 = G1.fromObject(proof.T2);
  const T3 = G1.fromObject(proof.T3);
  const Wxi = G1.fromObject(proof.Wxi);
  const Wxiw = G1.fromObject(proof.Wxiw);

  res.A = pointToBlstCHex(curve.G1, A);
  res.B = pointToBlstCHex(curve.G1, B);
  res.C = pointToBlstCHex(curve.G1, C);
  res.Z = pointToBlstCHex(curve.G1, Z);
  res.T1 = pointToBlstCHex(curve.G1, T1);
  res.T2 = pointToBlstCHex(curve.G1, T2);
  res.T3 = pointToBlstCHex(curve.G1, T3);
  res.Wxi = pointToBlstCHex(curve.G1, Wxi);
  res.Wxiw = pointToBlstCHex(curve.G1, Wxiw);

  res.A_uc = pointToUncompressedHex(curve.G1, A);
  res.B_uc = pointToUncompressedHex(curve.G1, B);
  res.C_uc = pointToUncompressedHex(curve.G1, C);
  res.Z_uc = pointToUncompressedHex(curve.G1, Z);
  res.T1_uc = pointToUncompressedHex(curve.G1, T1);
  res.T2_uc = pointToUncompressedHex(curve.G1, T2);
  res.T3_uc = pointToUncompressedHex(curve.G1, T3);
  res.Wxi_uc = pointToUncompressedHex(curve.G1, Wxi);
  res.Wxiw_uc = pointToUncompressedHex(curve.G1, Wxiw);

  res.eval_a = Fr.toObject(Fr.fromObject(proof.eval_a));
  res.eval_b = Fr.toObject(Fr.fromObject(proof.eval_b));
  res.eval_c = Fr.toObject(Fr.fromObject(proof.eval_c));
  res.eval_s1 = Fr.toObject(Fr.fromObject(proof.eval_s1));
  res.eval_s2 = Fr.toObject(Fr.fromObject(proof.eval_s2));
  res.eval_zw = Fr.toObject(Fr.fromObject(proof.eval_zw));

  return res;
}
