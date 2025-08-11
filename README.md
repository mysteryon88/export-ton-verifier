# Export TON Verifier

Export TON Verifier is a CLI tool and JavaScript library for generating a Groth16 smart contract verifier for the TON blockchain from Circom `.zkey` files.
It supports FunC, Tolk, and Tact as target languages, selectable via the `--func`, `--tolk`, or `--tact` flags.

The tool automatically compresses keys into TON format, uses EJS-based templating, and lets you choose the contract’s target language.
A ready-to-use TypeScript wrapper template is included, making it easy to interact with the contract from your application.

## Installation

```bash
npm install export-ton-verifier

# Help
npx  export-ton-verifier --help
```

## Import as a library

```ts
import { g1Compressed, g2Compressed } from "export-ton-verifier";

// OR

const { g1Compressed, g2Compressed } = require("export-ton-verifier");
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

- [TON Docs — Zero-Knowledge Proofs Tutorial](https://docs.ton.org/v3/guidelines/dapps/tutorials/zero-knowledge-proofs)
- [zkTokenTip/zk-ton-example](https://github.com/zkTokenTip/zk-ton-example)
- [kroist/snarkjs repository](https://github.com/kroist/snarkjs)
- [SaberDoTcodeR/ton-zk-verifier repository](https://github.com/SaberDoTcodeR/ton-zk-verifier)
