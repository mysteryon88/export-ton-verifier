// @ts-ignore
import { Dictionary, TupleItem } from "@ton/core";

export function g1Compressed(curve: any, p1Raw: unknown): string;
export function g2Compressed(curve: any, p2Raw: unknown): string;
export function groth16CompressProof(
  proof: snarkjs.Groth16Proof,
  publicSignals: snarkjs.PublicSignals,
): Promise<{
  pi_a: Buffer;
  pi_b: Buffer;
  pi_c: Buffer;
  pubInputs: bigint[];
}>;
export function dictFromInputList(list: bigint[]): Dictionary<number, bigint>;
export function generateVerifier(
  inputPath: string,
  outputPath: string,
  opts?: {
    lang?: "func" | "tolk" | "tact";
    templatesDir?: string;
    contractName?: string | null;
  },
): Promise<"groth16" | "plonk">;
export function zkeyExportPlonkVerificationKey(
  zkeyName: string,
): Promise<Record<string, unknown>>;
export function exportPlonkFuncCalldata(
  proof: unknown,
  publicSignals: unknown,
): Promise<TupleItem[]>;
export function calldataToTupleItems(calldata: TupleItem[]): TupleItem[];
