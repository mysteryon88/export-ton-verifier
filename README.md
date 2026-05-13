# Export TON Verifier

**Export TON Verifier** is a CLI tool and JavaScript library for generating **Groth16** and **PLONK** (experimental, **Circom**) smart contract verifiers for the TON blockchain from `.zkey` or `.json` verification key files.

It integrates with the **snarkjs** library and supports circuits built with **Circom**, **Noname**, **Gnark**, and **Arkworks** (via `verification_key.json`).
The protocol (Groth16 or PLONK) is auto-detected from the `.zkey` file.

Verifier code can be generated for three TON languages: **FunC**, **Tolk**, and **Tact**. **Tolk is the default** for both Groth16 and PLONK verifier generation; pass `--func` explicitly when you need FunC output, or `--tact` for Tact. TypeScript wrapper templates are selected by language and protocol for `import-wrapper` and `--wrapper-dest`.

By default, the Tolk Groth16 template is generated as a flat contract without a verifier receiver struct. If you pass `--contract-name <name>`, the template switches to struct mode, normalizes names like `secondVerifier` to `SecondVerifier`, and emits the getter as `verify_<Name>`.

## Installation

```bash
npm install export-ton-verifier

# Help
npx export-ton-verifier --help
```

## Import as a library

```ts
import {
  dictFromInputList,
  groth16CompressProof,
  generateVerifier,
  zkeyExportPlonkVerificationKey,
  exportPlonkFuncCalldata,
  calldataToTupleItems,
} from "export-ton-verifier";
```

## Usage CLI

```sh
# From .zkey, Tolk by default for Groth16 and PLONK:
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tolk

# From verification_key.json (auto-detected by .json):
npx export-ton-verifier ./circuits/verification_key.json ./verifier.tolk

# Generate FunC verifier (requires --func):
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc --func

# Generate Tact verifier:
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tact --tact

# Generate and also drop the TypeScript wrapper:
npx export-ton-verifier ./circuits/verification_key.json ./verifier.tolk --wrapper-dest ./wrappers/ --force

# Generate a named Tolk verifier receiver:
npx export-ton-verifier ./circuits/verifier.zkey ./second-verifier.tolk --contract-name secondVerifier

# Only copy the TypeScript wrapper (protocol required; Tolk/default selection when language is omitted):
npx export-ton-verifier import-wrapper ./wrappers/ --groth16 --force
npx export-ton-verifier import-wrapper ./wrappers/ --groth16 --func --force
npx export-ton-verifier import-wrapper ./wrappers/ --plonk --force
npx export-ton-verifier import-wrapper ./wrappers/ --plonk --func --force
```

## References

- [TON Documentation](https://docs.ton.org/contract-dev/zero-knowledge)
- [Tact Documentation](https://docs.tact-lang.org/cookbook/zk-proofs/)
- Examples
  - [zk-examples/zk-ton-examples (Groth16)](https://github.com/zk-examples/zk-ton-examples)
  - [zk-examples/zk-ton-plonk (PLONK)](https://github.com/zk-examples/zk-ton-plonk)
  - [zk-examples/zkJetton](https://github.com/zk-examples/zkJetton)
- Export of proof and verification key in JSON format compatible with snarkjs
  - [gnark-to-snarkjs](https://github.com/mysteryon88/gnark-to-snarkjs)
  - [ark-snarkjs](https://github.com/mysteryon88/ark-snarkjs)
- Frameworks verified for compatibility
  - [Circom](https://docs.circom.io/)
  - [Noname](https://github.com/zksecurity/noname)
  - [Gnark](https://github.com/Consensys/gnark)
  - [Arkworks](https://github.com/arkworks-rs)
