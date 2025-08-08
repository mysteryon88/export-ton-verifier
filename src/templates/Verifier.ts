import {
    Address,
    beginCell,
    Cell,
    Contract,
    contractAddress,
    ContractProvider,
    Sender,
    SendMode,
    Slice,
    TupleItem,
} from '@ton/core';

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

    cellFromInputList(list: bigint[]): Cell {
        var builder = beginCell();
        builder.storeUint(list[0], 256);
        if (list.length > 1) {
            builder.storeRef(this.cellFromInputList(list.slice(1)));
        }
        return builder.endCell();
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
            body: beginCell()
                .storeUint(Opcodes.verify, 32)
                .storeUint(opts.queryID ?? 0, 64)
                .storeRef(
                    beginCell()
                        .storeBuffer(opts.pi_a)
                        .storeRef(
                            beginCell()
                                .storeBuffer(opts.pi_b)
                                .storeRef(
                                    beginCell().storeBuffer(opts.pi_c).storeRef(this.cellFromInputList(opts.pubInputs)),
                                ),
                        ),
                )
                .endCell(),
        });
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
        const pi_a = { type: 'slice', cell: beginCell().storeBuffer(opts.pi_a).endCell() } as TupleItem;
        const pi_b = { type: 'slice', cell: beginCell().storeBuffer(opts.pi_b).endCell() } as TupleItem;
        const pi_c = { type: 'slice', cell: beginCell().storeBuffer(opts.pi_c).endCell() } as TupleItem;

        let pubInputs = [];
        for (let i = 0; i < opts.pubInputs.length; i++) {
            pubInputs[i] = { type: 'int', value: opts.pubInputs[i] } as TupleItem;
        }

        const result = await provider.get('get_verify', [pi_a, pi_b, pi_c, ...pubInputs]);
        return result.stack.readBoolean();
    }
}
