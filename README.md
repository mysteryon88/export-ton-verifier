# Export TON Verifier

**Export TON Verifier** is a CLI tool and JavaScript library for generating **Groth16 bls12-381** smart contract verifiers for the TON blockchain from `.zkey` or `.json` verification key files.

It integrates with the **snarkjs** library and supports circuits built with **Circom**, **Noname**, **Gnark** and **Arkworks** (via `verification_key.json`).
This allows you, for example, to generate a verifier contract that checks **Gnark** or **Arkworks** proofs.

Verifier code can be generated for three TON languages: **FunC**, **Tolk**, and **Tact** (selected via the `--func`, `--tolk`, or `--tact` flags).

## Installation

```bash
npm install export-ton-verifier

# Help
npx export-ton-verifier --help
```

## Import as a library

```ts
import { dictFromInputList, groth16CompressProof } from "export-ton-verifier";
```

## Usage CLI

```sh
# From .zkey, FunC by default:
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc

# From verification_key.json (auto-detected by .json):
npx export-ton-verifier ./circuits/verification_key.json ./verifier.fc

# Force JSON mode (even if extension is not .json):
npx export-ton-verifier ./vk.txt ./verifier.tolk --tolk --vk

# Generate Tact verifier:
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tact --tact

# Generate and also drop the TypeScript wrapper:
npx export-ton-verifier ./circuits/verification_key.json ./verifier.fc --func --wrapper-dest ./wrappers/ --force

# Only copy the TypeScript wrapper:
npx export-ton-verifier import-wrapper ./wrappers/Verifier.ts --force
```

## References
- [TON Documentation](https://docs.ton.org/contract-dev/zero-knowledge)
- [Tact Documentation](https://docs.tact-lang.org/cookbook/zk-proofs/)
- Examples
  - [zk-examples/zk-ton-examples](https://github.com/zk-examples/zk-ton-examples)
  - [zk-examples/zkJetton](https://github.com/zk-examples/zkJetton)
- Export of proof and verification key in JSON format compatible with snarkjs
  - [gnark-to-snarkjs](https://github.com/mysteryon88/gnark-to-snarkjs)
  - [ark-snarkjs](https://github.com/mysteryon88/ark-snarkjs)
- Frameworks verified for compatibility
  - [Circom](https://docs.circom.io/)
  - [Noname](https://github.com/zksecurity/noname)
  - [Gnark](https://github.com/Consensys/gnark)
  - [Arkworks](https://github.com/arkworks-rs)
