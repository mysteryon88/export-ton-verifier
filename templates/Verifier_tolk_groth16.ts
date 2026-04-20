import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  TupleBuilder,
} from "@ton/core";

export type VerifierConfig = {};

export function verifierConfigToCell(config: VerifierConfig): Cell {
  return beginCell().endCell();
}

export const Opcodes = {
  verify: 0x3b3cca17,
};

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
    opts: {
      pi_a: Buffer;
      pi_b: Buffer;
      pi_c: Buffer;
      pubInputs: bigint[];
      value: bigint;
      queryID?: number;
    },
  ) {
    await provider.internal(via, {
      value: opts.value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: this.buildVerifyBody(opts),
    });
  }

  tupleFromInputList(list: bigint[]) {
    const tuple = new TupleBuilder();
    for (const value of list) {
      tuple.writeNumber(value);
    }
    return tuple.build();
  }

  serializeIntArray(list: bigint[]): Cell {
    if (list.length > 255) {
      throw new Error("Tolk array<int> wrapper supports at most 255 items.");
    }

    // Tolk serializes arrays as uint8 length plus Snake-style continuation cells.
    let tail: Cell | null = null;
    for (let i = list.length; i > 0; i -= 3) {
      const chunk = list.slice(Math.max(0, i - 3), i);
      const cell = beginCell();
      for (const value of chunk) {
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

  buildVerifyBody(opts: {
    pi_a: Buffer;
    pi_b: Buffer;
    pi_c: Buffer;
    pubInputs: bigint[];
  }) {
    const piAcell = beginCell().storeBuffer(opts.pi_a).endCell();
    const piBcell = beginCell().storeBuffer(opts.pi_b).endCell();
    const piCcell = beginCell().storeBuffer(opts.pi_c).endCell();
    const pubInputs = this.serializeIntArray(opts.pubInputs);

    const body = beginCell()
      .storeUint(Opcodes.verify, 32)
      .storeRef(piAcell)
      .storeRef(piBcell)
      .storeRef(piCcell)
      .storeSlice(pubInputs.beginParse())
      .endCell();

    return body;
  }

  async getVerify(
    provider: ContractProvider,
    opts: {
      pi_a: Buffer;
      pi_b: Buffer;
      pi_c: Buffer;
      pubInputs: bigint[];
    },
  ): Promise<boolean> {
    const args = new TupleBuilder();
    args.writeSlice(beginCell().storeBuffer(opts.pi_a).endCell());
    args.writeSlice(beginCell().storeBuffer(opts.pi_b).endCell());
    args.writeSlice(beginCell().storeBuffer(opts.pi_c).endCell());
    args.writeTuple(this.tupleFromInputList(opts.pubInputs));

    const result = await provider.get("verify", args.build());
    return result.stack.readBoolean();
  }
}
