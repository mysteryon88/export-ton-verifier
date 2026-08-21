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
  proofToMessageCell,
  proofToMessageBoc,
  MAX_PLONK_PUBLIC_INPUTS,
} from "export-ton-verifier";
```

`exportPlonkFuncCalldata` returns the legacy Func-compatible calldata where public inputs are a dictionary cell. `exportPlonkTolkCalldata` returns the Tolk getter-compatible calldata where public inputs are already a tuple.
`inspectVerifierInput` powers the `doctor` command and reports format, protocol, curve, public input count, template availability, and TVM limit checks.
`proofToMessageBoc` converts proof/public-signal JSON into a base64 or hex BOC internal message body for supported generated verifier templates.
PLONK verifier generation supports at most `MAX_PLONK_PUBLIC_INPUTS` (currently 8) public inputs. This common FunC/Tolk limit keeps the measured full internal-message pairing boundary below 920,000 gas and reserves at least 8% under TVM's 1,000,000 transaction gas ceiling.

### PLONK point binding and message ABI

PLONK proof points have two representations: 48-byte compressed BLS12-381 points consumed by TVM BLS opcodes and 96-byte `x || y` coordinates consumed by the snarkjs Fiat-Shamir transcript. Generated FunC and Tolk verifiers bind every pair on-chain. They require canonical coordinates, a canonical non-identity prime-order compressed point, the same `x` and sign bit, and an exact signed curve-equation quotient witness. The contract checks the bounded integer equation with five pairwise-coprime CRT moduli; their product is larger than twice the maximum possible difference, so this is an exact check rather than a probabilistic one. Wrapper and calldata helpers perform the full equation check with `BigInt` before encoding.

The PLONK internal-message opcode is `0x76524659`. The root contains only the 32-bit opcode and one payload reference. The payload contains compressed points, six evaluations, public signals, and the nine transcript-point cells. FunC public signals use the existing 32-bit-key dictionary cell; Tolk public signals use `array<uint256>`. `proofToMessageCell` and `proofToMessageBoc` produce this same layout, and the generated TypeScript wrappers use it in `sendVerify`.

Both receivers require at least `0.07 TON`, which provides the protocol gas credit needed at the supported public-input limit. Malformed, truncated, or trailing message structure exits with `105`; a well-formed but invalid proof or mismatched point representation exits with `106`; a scalar outside `[0, r)` exits with `103`. The getter keeps the existing 25-item calldata interface and returns `false` for a well-formed cryptographically invalid proof.

The opt-in real-proof regression test expects an artifact directory containing `condition_js/condition.wasm`, `condition_0000.zkey`, and its matching `verification_key.json`:

```powershell
$env:PLONK_E2E_DIR = "C:\path\to\condition-artifacts"
npm test
```

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
