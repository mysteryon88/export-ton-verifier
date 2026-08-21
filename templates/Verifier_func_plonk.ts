import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  TupleItem,
} from "@ton/core";

export type VerifierConfig = {};

const VERIFY_PROOF_OP = 0x76524659;
const BLS12_381_P = BigInt(
  "0x1a0111ea397fe69a4b1ba7b6434bacd764774b84f38512bf6730d2a0f6b0f6241eabfffeb153ffffb9feffffffffaaab",
);
const BLS12_381_R = BigInt(
  "0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001",
);

function canonicalScalar(value: bigint, field: string): bigint {
  if (value < 0n || value >= BLS12_381_R) {
    throw new Error(`${field} must be in the range [0, r)`);
  }
  return value;
}

function bytesToBigInt(value: Buffer): bigint {
  return BigInt(`0x${value.toString("hex")}`);
}

function assertPointBinding(compressed: Cell, transcript: Cell, field: string) {
  if (compressed.bits.length !== 384 || compressed.refs.length !== 0) {
    throw new Error(`${field}.compressed must contain exactly 384 bits and no refs`);
  }
  if (transcript.bits.length !== 768 || transcript.refs.length !== 1) {
    throw new Error(`${field}.transcript must contain exactly 768 bits and one witness ref`);
  }
  const witnessCell = transcript.refs[0];
  if (witnessCell.bits.length !== 769 || witnessCell.refs.length !== 0) {
    throw new Error(`${field}.witness must contain exactly 769 bits and no refs`);
  }

  const compressedBytes = compressed.beginParse().loadBuffer(48);
  const coordinates = transcript.beginParse().loadBuffer(96);
  const witness = witnessCell.beginParse();
  const negative = witness.loadBit();
  const magnitude = witness.loadUintBig(768);
  const flags = compressedBytes[0] & 0xe0;
  if (flags !== 0x80 && flags !== 0xa0) {
    throw new Error(`${field}.compressed is not a canonical non-identity G1 encoding`);
  }

  const compressedXBytes = Buffer.from(compressedBytes);
  compressedXBytes[0] &= 0x1f;
  const compressedX = bytesToBigInt(compressedXBytes);
  const x = bytesToBigInt(coordinates.subarray(0, 48));
  const y = bytesToBigInt(coordinates.subarray(48));
  if (x >= BLS12_381_P || y >= BLS12_381_P) {
    throw new Error(`${field}.transcript coordinates are not canonical`);
  }
  if (
    compressedX !== x ||
    ((flags & 0x20) !== 0) !== (y >= (BLS12_381_P + 1n) / 2n)
  ) {
    throw new Error(`${field} representations do not match`);
  }
  if (negative && magnitude === 0n) {
    throw new Error(`${field}.witness uses negative zero`);
  }
  const signedWitness = negative ? -magnitude : magnitude;
  if (x ** 3n + 4n - y ** 2n !== signedWitness * BLS12_381_P) {
    throw new Error(`${field}.witness does not prove the curve equation`);
  }
}

export function verifierConfigToCell(config: VerifierConfig): Cell {
  return beginCell().endCell();
}

function requireTupleCell(
  args: TupleItem[],
  index: number,
  type: "slice" | "cell",
): Cell {
  const item = args[index];
  if (item?.type !== type) {
    throw new Error(`Expected calldata[${index}] to be ${type}`);
  }
  return item.cell;
}

function requireTupleInt(args: TupleItem[], index: number): bigint {
  const item = args[index];
  if (item?.type !== "int") {
    throw new Error(`Expected calldata[${index}] to be int`);
  }
  return canonicalScalar(item.value, `calldata[${index}]`);
}

function storePair(first: Cell, second: Cell): Cell {
  return beginCell()
    .storeSlice(first.beginParse())
    .storeSlice(second.beginParse())
    .endCell();
}

export function proofMessageToCell(args: TupleItem[]): Cell {
  if (args.length !== 25) {
    throw new Error(`Expected exactly 25 PLONK calldata arguments, got ${args.length}`);
  }
  const a = requireTupleCell(args, 0, "slice");
  const b = requireTupleCell(args, 1, "slice");
  const c = requireTupleCell(args, 2, "slice");
  const z = requireTupleCell(args, 3, "slice");
  const t1 = requireTupleCell(args, 4, "slice");
  const t2 = requireTupleCell(args, 5, "slice");
  const t3 = requireTupleCell(args, 6, "slice");
  const wxi = requireTupleCell(args, 13, "slice");
  const wxiw = requireTupleCell(args, 14, "slice");
  const publicInputs = requireTupleCell(args, 15, "cell");
  const aUc = requireTupleCell(args, 16, "slice");
  const bUc = requireTupleCell(args, 17, "slice");
  const cUc = requireTupleCell(args, 18, "slice");
  const zUc = requireTupleCell(args, 19, "slice");
  const t1Uc = requireTupleCell(args, 20, "slice");
  const t2Uc = requireTupleCell(args, 21, "slice");
  const t3Uc = requireTupleCell(args, 22, "slice");
  const wxiUc = requireTupleCell(args, 23, "slice");
  const wxiwUc = requireTupleCell(args, 24, "slice");

  for (const [compressedPoint, transcriptPoint, index] of [
    [a, aUc, 16], [b, bUc, 17], [c, cUc, 18],
    [z, zUc, 19], [t1, t1Uc, 20], [t2, t2Uc, 21],
    [t3, t3Uc, 22], [wxi, wxiUc, 23], [wxiw, wxiwUc, 24],
  ] as const) {
    assertPointBinding(compressedPoint, transcriptPoint, `calldata[${index}]`);
  }

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

  const payload = beginCell()
    .storeRef(compressed)
    .storeRef(evaluations)
    .storeRef(publicInputs)
    .storeRef(uncompressed)
    .endCell();

  return beginCell().storeUint(VERIFY_PROOF_OP, 32).storeRef(payload).endCell();
}

export class Verifier implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new Verifier(address);
  }

  static createFromConfig(config: VerifierConfig, code: Cell, workchain = 0) {
    const data = verifierConfigToCell(config);
    const init = { code, data };
    return new Verifier(contractAddress(workchain, init), init);
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendVerify(
    provider: ContractProvider,
    via: Sender,
    value: bigint,
    args: TupleItem[],
  ) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: proofMessageToCell(args),
    });
  }

  async getVerify(provider: ContractProvider, args: TupleItem[]) {
    const res = await provider.get("verify", args);
    return res.stack.readBoolean();
  }
}
