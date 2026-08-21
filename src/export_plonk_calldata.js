// SPDX-License-Identifier: GPL-3.0-or-later
import { getCurveFromName } from "./utils.js";
import { beginCell, Cell, Dictionary } from "@ton/core";
import {
  assertPlonkPublicInputCount,
  assertTonBlsCurve,
} from "./limits.js";
import {
  encodePlonkG1Point,
  parseCanonicalPlonkScalar,
} from "./plonkEncoding.js";

const POINT_FIELDS = ["A", "B", "C", "Z", "T1", "T2", "T3", "Wxi", "Wxiw"];
const EVALUATION_FIELDS = [
  "eval_a",
  "eval_b",
  "eval_c",
  "eval_s1",
  "eval_s2",
  "eval_zw",
];

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
  return exportPlonkCalldataWithPublicInputs(_proof, _pub, funcPublicInputs);
}

export async function exportPlonkTolkCalldata(_proof, _pub) {
  return exportPlonkCalldataWithPublicInputs(_proof, _pub, tolkPublicInputs);
}

async function exportPlonkCalldataWithPublicInputs(
  _proof,
  _pub,
  publicInputItem,
) {
  if (!_proof || typeof _proof !== "object") {
    throw new Error("proof must be an object.");
  }
  if (!Array.isArray(_pub)) {
    throw new Error("public inputs must be an array.");
  }
  assertPlonkPublicInputCount(_pub.length, "public inputs");
  assertTonBlsCurve(_proof.curve, "proof.curve");

  const publicInputs = _pub.map((value, index) =>
    parseCanonicalPlonkScalar(value, `public inputs[${index}]`),
  );

  const curve = await getCurveFromName(_proof.curve);
  let points;
  let evaluations;
  try {
    points = Object.fromEntries(
      POINT_FIELDS.map((field) => [
        field,
        encodePlonkG1Point(curve, _proof[field], `proof.${field}`),
      ]),
    );
    evaluations = Object.fromEntries(
      EVALUATION_FIELDS.map((field) => [
        field,
        parseCanonicalPlonkScalar(_proof[field], `proof.${field}`),
      ]),
    );
  } finally {
    if (typeof curve.terminate === "function") {
      await curve.terminate();
    }
  }

  const compressedItem = (field) => ({
    type: "slice",
    cell: beginCell().storeBuffer(points[field].compressed).endCell(),
  });
  const transcriptItem = (field) => ({
    type: "slice",
    cell: points[field].transcriptCell,
  });

  const calldata = [
    ...POINT_FIELDS.slice(0, 7).map(compressedItem),
    ...EVALUATION_FIELDS.map((field) => ({
      type: "int",
      value: evaluations[field],
    })),
    compressedItem("Wxi"),
    compressedItem("Wxiw"),
    publicInputItem(publicInputs),
    ...POINT_FIELDS.map(transcriptItem),
  ];

  return calldataToTupleItems(calldata);
}

function funcPublicInputs(vs) {
  if (vs.length === 0) {
    return {
      type: "cell",
      cell: beginCell().endCell(),
    };
  }
  const d = Dictionary.empty(
    Dictionary.Keys.Uint(32),
    Dictionary.Values.BigUint(256),
  );
  for (let i = 0; i < vs.length; i++) {
    d.set(i, vs[i]);
  }
  const b = beginCell();
  d.storeDirect(b);
  return {
    type: "cell",
    cell: b.endCell(),
  };
}

function tolkPublicInputs(vs) {
  return {
    type: "tuple",
    items: vs.map((value) => ({ type: "int", value })),
  };
}
