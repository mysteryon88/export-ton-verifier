// SPDX-License-Identifier: GPL-3.0-or-later
export const HELP_TEXT = `
Usage:
  export-ton-verifier <inputPath> <outputPath> [--func | --tolk | --tact] [--contract-name <name>] [--wrapper-dest <destPath>] [--groth16 | --plonk] [--force]
  export-ton-verifier doctor <inputPath> [--func | --tolk | --tact] [--json]
  export-ton-verifier proof-to-message <proof.json> <public.json> [--func | --tolk] [--groth16 | --plonk] [--format base64|hex] [--output <file>]
  export-ton-verifier import-wrapper <destPath> [--func | --tolk] [--groth16 | --plonk] [--force]

Description:
  1) Generates a TON verifier smart contract from .zkey, snarkjs JSON, gnark, or arkworks artifacts.
     Protocol (Groth16/PLONK) is auto-detected from the input artifact.
  2) Diagnoses verifier artifacts before generation with the 'doctor' subcommand.
  3) Converts proof/public JSON into supported internal message body BOCs.
  4) (Optional) Can also copy a TypeScript wrapper template to your project.
     Wrapper selection supports language- and protocol-specific files.

Notes:
  - Tolk is the default for Groth16 and PLONK verifier generation.
    Use --func to generate FunC output.
  - If language is Tact (--tact), wrapper copy is skipped even if --wrapper-dest is provided.
  - Internal proof verification messages must attach at least 0.05 TON for Groth16
    or 0.07 TON for PLONK.
  - Groth16 public inputs must be canonical BLS12-381 scalars.

Arguments:
  inputPath       Path to .zkey, snarkjs verification_key.json, gnark JSON/.bin, or arkworks JSON
  outputPath      Path to save the generated verifier file

Subcommands:
  doctor          Reports input format, protocol, curve, public input count, template support, and TVM limits.
  proof-to-message
                  Converts proof/public JSON into a base64 or hex internal message body BOC.
  import-wrapper  Copies a language-specific wrapper to <destPath> (file or directory).
                  If <destPath> is a directory, the file will be saved as <destPath>/Verifier.ts.
                  Requires one of --groth16 or --plonk.

Options:
  -h, --help                Show this help message and exit
  --func                    Use FunC language template for the verifier
  --tolk                    Use Tolk language template for the verifier [default]
  --tact                    Use Tact language template for the verifier
  --contract-name <name>    Wrap the generated Tolk verifier in a named struct receiver
  --wrapper-dest <destPath> After generation, copy a language-specific TypeScript wrapper to <destPath>
  --groth16                 Protocol hint for wrapper selection (wrapper only; verifier protocol is auto-detected)
  --plonk                   Protocol hint for wrapper selection (wrapper only; verifier protocol is auto-detected)
  --json                    Print machine-readable JSON for 'doctor'
  --format <base64|hex>     Encoding for 'proof-to-message' output [default: base64]
  --output <file>           Write 'proof-to-message' output to a file
  --force                   Overwrite existing file when used with 'import-wrapper' or '--wrapper-dest'

Examples:
  # Generate Tolk verifier from .zkey (default language for Groth16 and PLONK)
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tolk

  # Generate from verification_key.json
  npx export-ton-verifier ./circuits/verification_key.json ./verifier.tolk

  # Generate from native BLS12-381 gnark JSON or binary
  npx export-ton-verifier ./circuits/verification_key_gnark.json ./verifier.tolk
  npx export-ton-verifier ./circuits/verification_key.bin ./verifier.tolk

  # Generate from native BLS12-381 arkworks compressed JSON/bundle
  npx export-ton-verifier ./circuits/groth16_artifacts.json ./verifier.tolk

  # Generate FunC verifier (requires --func)
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.fc --func

  # Generate Tact verifier
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tact --tact

  # Generate and also drop a wrapper (auto-detect protocol from the input artifact)
  npx export-ton-verifier ./circuits/verification_key.json ./verifier.tolk --wrapper-dest ./wrappers/ --force

  # Generate a named Tolk verifier receiver with getter verify_MultiplierVerifier
  npx export-ton-verifier ./circuits/verifier.zkey ./verifier.tolk --contract-name multiplierVerifier

  # Diagnose generation support
  npx export-ton-verifier doctor ./circuits/verification_key.json --tolk
  npx export-ton-verifier doctor ./circuits/verification_key.json --json

  # Build internal message body BOC from proof/public JSON
  npx export-ton-verifier proof-to-message ./circuits/proof.json ./circuits/public.json --groth16 --tolk
  npx export-ton-verifier proof-to-message ./circuits/proof.json ./circuits/public.json --plonk --tolk --format hex --output ./body.hex
  npx export-ton-verifier proof-to-message ./circuits/proof.json ./circuits/public.json --plonk --func

  # Copy the Tolk Groth16 wrapper (default wrapper language)
  npx export-ton-verifier import-wrapper ./wrappers/ --groth16 --force

  # Copy the PLONK TypeScript wrapper with the default language selection
  npx export-ton-verifier import-wrapper ./wrappers/ --plonk --force

  # Copy the PLONK TypeScript wrapper for FunC
  npx export-ton-verifier import-wrapper ./wrappers/ --plonk --func --force
`;

export function printHelp(stdout = process.stdout) {
  stdout.write(`${HELP_TEXT}\n`);
}
