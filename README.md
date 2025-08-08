# Export TON Verifier

Export TON Verifier — a CLI tool and JavaScript library for generating a Groth16 smart contract verifier for the TON blockchain in FunC or Tolk from Circom .zkey files.
It supports automatic compression of keys into TON format, EJS-based templating, and selecting the target language (--func or --tolk).
A ready-to-use TypeScript wrapper template is included, making it easier to interact with the contract from your application.

## Installation

```bash
npm install export-ton-verifier

# Help
npx  export-ton-verifier --help
```

## Import as a library

```ts
import {
  g1Compressed,
  g2Compressed,
  toHexString,
  generateVerifier,
} from "export-ton-verifier";

// OR

const { g1Compressed, g2Compressed } = require("export-ton-verifier");
```

## Usage CLI

```sh
# Just generate FunC verifier from .zkey (default template)
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc

# Generate Tolk verifier
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tolk --tolk

# Generate and also drop the TypeScript wrapper into ./wrappers/
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc --func --wrapper-dest ./wrappers/ --force

# Only copy the TypeScript wrapper
npx export-ton-verifier import-wrapper ./wrappers/Verifier.ts --force
```

## References

- [TON Docs — Zero-Knowledge Proofs Tutorial](https://docs.ton.org/v3/guidelines/dapps/tutorials/zero-knowledge-proofs)
- [kroist/snarkjs repository](https://github.com/kroist/snarkjs)
- [ton-zk-verifier repository](https://github.com/SaberDoTcodeR/ton-zk-verifier)
