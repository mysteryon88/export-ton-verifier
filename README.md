# Export TON Verifier

**Export TON Verifier** is a CLI tool and JavaScript library for generating **Groth16** and **PLONK** (experimental, **Circom**) smart contract verifiers for the TON blockchain from `.zkey`, `.bin`, or `.json` verification key files.

It integrates with the **snarkjs** library and supports circuits built with **Circom**, **Noname**, **Gnark**, and **Arkworks**.
The protocol (Groth16 or PLONK) is auto-detected from `.zkey` and snarkjs-compatible `verification_key.json` inputs.
Groth16 BLS12-381 verification keys are also supported natively from gnark JSON (`verification_key_gnark.json`), gnark binary (`verification_key.bin`), and arkworks compressed JSON/bundle files (`groth16_artifacts.json` or VK-only JSON with `curve` and `vk`/`verification_key`/`verifying_key`).
TON verifier templates use TVM BLS12-381 opcodes, so generated on-chain verifiers require BLS12-381 verification keys. Native gnark and arkworks loaders accept BLS12-381 artifacts only, and snarkjs-compatible inputs are rejected before rendering when their curve is not BLS12-381.

Verifier code can be generated for **FunC** and **Tolk** for both Groth16 and PLONK. **Tact** generation is available for Groth16. **Tolk is the default** for both Groth16 and PLONK verifier generation; pass `--func` explicitly when you need FunC output, or `--tact` for the Tact Groth16 template. TypeScript wrapper templates are selected by language and protocol for `import-wrapper` and `--wrapper-dest`.

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
  exportPlonkTolkCalldata,
  calldataToTupleItems,
  inspectVerifierInput,
  proofToMessageBoc,
  MAX_PLONK_PUBLIC_INPUTS,
} from "export-ton-verifier";
```

`exportPlonkFuncCalldata` returns the legacy Func-compatible calldata where public inputs are a dictionary cell. `exportPlonkTolkCalldata` returns the Tolk getter-compatible calldata where public inputs are already a tuple.
`inspectVerifierInput` powers the `doctor` command and reports format, protocol, curve, public input count, template availability, and TVM limit checks.
`proofToMessageBoc` converts proof/public-signal JSON into a base64 or hex BOC internal message body for supported generated verifier templates.
PLONK verifier generation supports at most `MAX_PLONK_PUBLIC_INPUTS` public inputs because the TVM Keccak transcript helper is limited to 255 tuple items.

## Security and integration

Generated Groth16 verifiers require TVM global version 4 or newer. Every public verification path
checks the exact compressed proof-point shape (`piA = 384` bits, `piB = 768` bits, `piC = 384`
bits, with no refs), subgroup membership, and non-identity before scalar multiplication or pairing.
Malformed proofs and non-canonical public inputs are rejected with the template's controlled
`InvalidInputs` error (`258` in Tolk, `262` in FunC/Tact). Scalar multiplication modulo the
BLS12-381 scalar order is not accepted as an alias for an out-of-range public input.

Verification keys are validated before code generation: the curve must be BLS12-381, `IC.length`
must equal `nPublic + 1` when that metadata is present, all points must be valid and in the required
subgroup, and alpha/beta/gamma/delta must be non-identity. Emitted constants use canonical
compressed encoding and preserve the VK's public-input order. Supported VK sources are the
snarkjs-compatible, native gnark, and arkworks formats listed above.

Tolk Groth16 internal messages use one proof cell and one public-input cell. The proof cell has no
bits and exactly three ordinary point-cell refs. The public-input cell contains an 8-bit count and
a canonical linear chain of up to three signed 257-bit values per ordinary cell. Sibling refs,
exotic cells, empty continuation cells, alternate chunking, and trailing data are rejected.
`proofToMessageBoc` and the generated TypeScript wrapper emit this layout. Internal verification
messages for generated FunC, Tolk, and Tact contracts must attach at least `0.05 TON`; getters run
the same proof and public-input checks. Both Tolk and FunC PLONK templates also support internal
verification messages through `proofToMessageBoc`.

This verifier is stateless. It does not provide:

- nullifier replay protection;
- nonce or query-id protection;
- known-root validation;
- recipient binding;
- chain-id or contract-address domain separation;
- state-transition validation.

Put those protocol rules in a stateful typed wrapper. In particular, accept a full recipient
address and derive the field inside the contract; do not accept an independently supplied
`recipientField`. The following integration sketch shows the required ordering (application-specific
storage and proof fields are abbreviated):

## Usage CLI

```sh
# From .zkey, Tolk by default for Groth16 and PLONK:
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tolk

# From verification_key.json (auto-detected by .json):
npx export-ton-verifier ./circuits/verification_key.json ./verifier.tolk

# From native BLS12-381 gnark JSON:
npx export-ton-verifier ./circuits/verification_key_gnark.json ./verifier.tolk

# From native BLS12-381 gnark binary:
npx export-ton-verifier ./circuits/verification_key.bin ./verifier.tolk

# From native BLS12-381 arkworks compressed bundle/VK JSON:
npx export-ton-verifier ./circuits/groth16_artifacts.json ./verifier.tolk

# Generate FunC verifier (requires --func):
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc --func

# Generate Tact verifier:
npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tact --tact

# Generate and also drop the TypeScript wrapper:
npx export-ton-verifier ./circuits/verification_key.json ./verifier.tolk --wrapper-dest ./wrappers/ --force

# Generate a named Tolk verifier receiver:
npx export-ton-verifier ./circuits/verifier.zkey ./second-verifier.tolk --contract-name secondVerifier

# Diagnose whether an artifact can be generated for a language:
npx export-ton-verifier doctor ./circuits/verification_key.json --tolk
npx export-ton-verifier doctor ./circuits/verification_key.json --json

# Convert proof/public JSON into an internal message body BOC:
npx export-ton-verifier proof-to-message ./circuits/proof.json ./circuits/public.json --groth16 --tolk
npx export-ton-verifier proof-to-message ./circuits/proof.json ./circuits/public.json --plonk --tolk --format hex --output ./body.hex
npx export-ton-verifier proof-to-message ./circuits/proof.json ./circuits/public.json --plonk --func

# Only copy the TypeScript wrapper (protocol required; Tolk/default selection when language is omitted):
npx export-ton-verifier import-wrapper ./wrappers/ --groth16 --force
npx export-ton-verifier import-wrapper ./wrappers/ --groth16 --func --force
npx export-ton-verifier import-wrapper ./wrappers/ --plonk --force
npx export-ton-verifier import-wrapper ./wrappers/ --plonk --func --force

# Copy both PLONK wrappers without overwriting each other:
npx export-ton-verifier import-wrapper ./wrappers/Verifier_tolk_plonk.ts --plonk --tolk --force
npx export-ton-verifier import-wrapper ./wrappers/Verifier_func_plonk.ts --plonk --func --force
```

## License

GNU GPL v3.0 or later.

This package depends on and includes code derived from **snarkJS**, which is licensed under GPL-3.0.

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
