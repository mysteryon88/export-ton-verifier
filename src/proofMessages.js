// SPDX-License-Identifier: GPL-3.0-or-later
import { beginCell, Cell, Dictionary } from "@ton/core";
import { groth16CompressProof } from "./groth16CompressProof.js";
import {
  exportPlonkFuncCalldata,
  exportPlonkTolkCalldata,
} from "./export_plonk_calldata.js";

const GROTH16_VERIFY_OP = 0x3b3cca17;
const PLONK_VERIFY_PROOF_OP = 0x76524659;
const UINT256_ARRAY_CHUNK_SIZE = 3;

function normalizeProtocol(proof, protocol) {
  const detected = protocol ?? proof?.protocol;
  if (detected !== "groth16" && detected !== "plonk") {
    throw new Error("proof protocol must be 'groth16' or 'plonk'.");
  }
  return detected;
}

function normalizeLang(lang = "tolk") {
  if (lang !== "tolk" && lang !== "func") {
    throw new Error("proof-to-message supports --tolk and --func.");
  }
  return lang;
}

function serializeTolkIntArray(list) {
  if (list.length > 255) {
    throw new Error("Tolk array<int> wrapper supports at most 255 items.");
  }

  const chunks = [];
  for (let i = 0; i < list.length; i += 3) {
    chunks.push(list.slice(i, i + 3));
  }

  let tail = null;
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    const cell = beginCell();
    for (const value of chunks[i]) {
      cell.storeInt(value, 257);
    }
    if (tail) {
      cell.storeRef(tail);
    }
    tail = cell.endCell();
  }

  const root = beginCell().storeUint(list.length, 8);
  if (tail) {
    root.storeSlice(tail.beginParse());
  }
  return root.endCell();
}

function groth16FuncPublicInputs(list) {
  const dict = Dictionary.empty(
    Dictionary.Keys.BigUint(32),
    Dictionary.Values.BigInt(256),
  );
  for (let i = 0; i < list.length; i += 1) {
    dict.set(BigInt(i), list[i]);
  }
  return dict;
}

async function groth16MessageCell(proof, publicSignals, lang) {
  const compressed = await groth16CompressProof(proof, publicSignals);
  const piA = beginCell().storeBuffer(compressed.pi_a).endCell();
  const piB = beginCell().storeBuffer(compressed.pi_b).endCell();
  const piC = beginCell().storeBuffer(compressed.pi_c).endCell();

  if (lang === "tolk") {
    const proof = beginCell().storeRef(piA).storeRef(piB).storeRef(piC).endCell();
    return beginCell()
      .storeUint(GROTH16_VERIFY_OP, 32)
      .storeRef(proof)
      .storeRef(serializeTolkIntArray(compressed.pubInputs))
      .endCell();
  }

  return beginCell()
    .storeUint(GROTH16_VERIFY_OP, 32)
    .storeRef(piA)
    .storeRef(piB)
    .storeRef(piC)
    .storeDict(groth16FuncPublicInputs(compressed.pubInputs))
    .endCell();
}

function requireTupleCell(args, index, type = "slice") {
  const item = args[index];
  if (item?.type !== type) {
    throw new Error(`Expected calldata[${index}] to be ${type}.`);
  }
  return item.cell;
}

function requireTupleInt(args, index) {
  const item = args[index];
  if (item?.type !== "int") {
    throw new Error(`Expected calldata[${index}] to be int.`);
  }
  return item.value;
}

function requirePublicInputTuple(args) {
  const item = args[15];
  if (item?.type !== "tuple") {
    throw new Error("Expected PLONK Tolk calldata[15] to be tuple.");
  }
  return item.items.map((publicInput, index) => {
    if (publicInput.type !== "int") {
      throw new Error(`Expected PLONK public input ${index} to be int.`);
    }
    return publicInput.value;
  });
}

function uint256ArrayToCell(values) {
  const chunks = [];
  for (let i = 0; i < values.length; i += UINT256_ARRAY_CHUNK_SIZE) {
    chunks.push(values.slice(i, i + UINT256_ARRAY_CHUNK_SIZE));
  }

  const buildChunk = (index) => {
    const hasNext = index + 1 < chunks.length;
    const builder = beginCell().storeBit(hasNext);
    for (const value of chunks[index]) {
      builder.storeUint(value, 256);
    }
    if (hasNext) {
      builder.storeRef(buildChunk(index + 1));
    }
    return builder.endCell();
  };

  const builder = beginCell().storeUint(values.length, 8);
  if (chunks.length === 0) {
    builder.storeBit(false);
  } else {
    builder.storeBit(true).storeRef(buildChunk(0));
  }
  return builder.endCell();
}

function storePair(first, second) {
  return beginCell()
    .storeSlice(first.beginParse())
    .storeSlice(second.beginParse())
    .endCell();
}

function plonkTolkMessageFromCalldata(args) {
  const { compressed, evaluations, uncompressed } = plonkProofCells(args);
  const publicInputs = uint256ArrayToCell(requirePublicInputTuple(args));
  const payload = beginCell()
    .storeRef(compressed)
    .storeRef(evaluations)
    .storeSlice(publicInputs.beginParse())
    .storeRef(uncompressed)
    .endCell();

  return beginCell().storeUint(PLONK_VERIFY_PROOF_OP, 32).storeRef(payload).endCell();
}

function plonkFuncMessageFromCalldata(args) {
  const { compressed, evaluations, uncompressed } = plonkProofCells(args);
  const publicInputs = requireTupleCell(args, 15, "cell");
  const payload = beginCell()
    .storeRef(compressed)
    .storeRef(evaluations)
    .storeRef(publicInputs)
    .storeRef(uncompressed)
    .endCell();

  return beginCell().storeUint(PLONK_VERIFY_PROOF_OP, 32).storeRef(payload).endCell();
}

function plonkProofCells(args) {
  const a = requireTupleCell(args, 0);
  const b = requireTupleCell(args, 1);
  const c = requireTupleCell(args, 2);
  const z = requireTupleCell(args, 3);
  const t1 = requireTupleCell(args, 4);
  const t2 = requireTupleCell(args, 5);
  const t3 = requireTupleCell(args, 6);
  const wxi = requireTupleCell(args, 13);
  const wxiw = requireTupleCell(args, 14);
  const aUc = requireTupleCell(args, 16);
  const bUc = requireTupleCell(args, 17);
  const cUc = requireTupleCell(args, 18);
  const zUc = requireTupleCell(args, 19);
  const t1Uc = requireTupleCell(args, 20);
  const t2Uc = requireTupleCell(args, 21);
  const t3Uc = requireTupleCell(args, 22);
  const wxiUc = requireTupleCell(args, 23);
  const wxiwUc = requireTupleCell(args, 24);

  const compressedTail = beginCell()
    .storeRef(storePair(t3, wxi))
    .storeRef(wxiw)
    .endCell();
  const compressed = beginCell()
    .storeRef(storePair(a, b))
    .storeRef(storePair(c, z))
    .storeRef(storePair(t1, t2))
    .storeRef(compressedTail)
    .endCell();

  const evaluations = beginCell()
    .storeRef(
      beginCell()
        .storeUint(requireTupleInt(args, 7), 256)
        .storeUint(requireTupleInt(args, 8), 256)
        .storeUint(requireTupleInt(args, 9), 256),
    )
    .storeRef(
      beginCell()
        .storeUint(requireTupleInt(args, 10), 256)
        .storeUint(requireTupleInt(args, 11), 256)
        .storeUint(requireTupleInt(args, 12), 256),
    )
    .endCell();

  const uncompressedTail2 = beginCell()
    .storeRef(t3Uc)
    .storeRef(wxiUc)
    .storeRef(wxiwUc)
    .endCell();
  const uncompressedTail = beginCell()
    .storeRef(zUc)
    .storeRef(t1Uc)
    .storeRef(t2Uc)
    .storeRef(uncompressedTail2)
    .endCell();
  const uncompressed = beginCell()
    .storeRef(aUc)
    .storeRef(bUc)
    .storeRef(cUc)
    .storeRef(uncompressedTail)
    .endCell();

  return { compressed, evaluations, uncompressed };
}

async function plonkMessageCell(proof, publicSignals, lang) {
  if (lang === "func") {
    return plonkFuncMessageFromCalldata(
      await exportPlonkFuncCalldata(proof, publicSignals),
    );
  }

  const calldata = await exportPlonkTolkCalldata(proof, publicSignals);
  return plonkTolkMessageFromCalldata(calldata);
}

export async function proofToMessageCell({
  proof,
  publicSignals,
  protocol,
  lang = "tolk",
}) {
  const normalizedProtocol = normalizeProtocol(proof, protocol);
  const normalizedLang = normalizeLang(lang);

  if (!Array.isArray(publicSignals)) {
    throw new Error("publicSignals must be an array.");
  }

  if (normalizedProtocol === "groth16") {
    return groth16MessageCell(proof, publicSignals, normalizedLang);
  }

  return plonkMessageCell(proof, publicSignals, normalizedLang);
}

export async function proofToMessageBoc({
  proof,
  publicSignals,
  protocol,
  lang = "tolk",
  format = "base64",
}) {
  if (format !== "base64" && format !== "hex") {
    throw new Error("proof-to-message format must be 'base64' or 'hex'.");
  }
  const cell = await proofToMessageCell({ proof, publicSignals, protocol, lang });
  return Buffer.from(cell.toBoc()).toString(format);
}
