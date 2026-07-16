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
  return item.value;
}

function storePair(first: Cell, second: Cell): Cell {
  return beginCell()
    .storeSlice(first.beginParse())
    .storeSlice(second.beginParse())
    .endCell();
}

export function proofMessageToCell(args: TupleItem[]): Cell {
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
