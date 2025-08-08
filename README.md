# Export TON Verifier

Export TON Verifier — a CLI tool and JavaScript library for generating a Groth16 verifier in the FunC language for the TON blockchain from Circom `.zkey` files.
It comes with a TypeScript wrapper template for convenient interaction with the contract from your application.

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
# Just generate FunC verifier from .zkey
npx  export-ton-verifier ./circuits/verifier.zkey ./verifier.fc

# Generate and also drop the TypeScript wrapper into src/zk/
npx  export-ton-verifier ./circuits/verifier.zkey ./verifier.fc --wrapper-dest ./wrappers/ --force

# Only copy the TypeScript wrapper
npx  export-ton-verifier import-wrapper ./wrappers/Verifier.ts --force
```

## References

- [TON Docs — Zero-Knowledge Proofs Tutorial](https://docs.ton.org/v3/guidelines/dapps/tutorials/zero-knowledge-proofs)
- [kroist/snarkjs repository](https://github.com/kroist/snarkjs)
- [ton-zk-verifier repository](https://github.com/SaberDoTcodeR/ton-zk-verifier)
