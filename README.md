# Export TON Verifier

Export TON Verifier is a CLI tool and JavaScript library for generating **Groth16 bls12-381** smart contract verifiers for the TON blockchain from `.zkey` files.

It is essentially an integration with the **snarkjs** library and supports circuits generated in **Circom** and **Noname**.

Target languages **FunC**, **Tolk**, and **Tact** are supported, selectable via the `--func`, `--tolk`, or `--tact` flags.

## Installation

```bash
npm install export-ton-verifier

# Help
npx export-ton-verifier --help
```

## Import as a library

```ts
import { dictFromInputList, groth16CompressProof } from 'export-ton-verifier';
```

## Usage CLI

```sh
# Just generate FunC verifier from .zkey (default template)
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc

# Generate Tolk verifier
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tolk --tolk

# Generate Tact verifier
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tact --tact

# Generate and also drop the TypeScript wrapper into ./wrappers/
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.func --func --wrapper-dest ./wrappers/ --force

# Only copy the TypeScript wrapper
npx export-ton-verifier import-wrapper ./wrappers/Verifier.ts --force
```

## References

- [zkTokenTip/zk-ton-examples](https://github.com/zkTokenTip/zk-ton-examples)
- [Circom](https://docs.circom.io/)
- [Noname](https://github.com/zksecurity/noname)