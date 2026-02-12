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

export function verifierConfigToCell(config: VerifierConfig): Cell {
  return beginCell().endCell();
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

  async getVerify(provider: ContractProvider, args: TupleItem[]) {
    const res = await provider.get("verify", args);
    return res.stack.readBoolean();
  }
}
