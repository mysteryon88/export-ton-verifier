// @ts-ignore
import { Dictionary } from "@ton/core";

export function g1Compressed(curve: any, p1Raw: unknown): string;
export function g2Compressed(curve: any, p2Raw: unknown): string;
export function groth16CompressProof(
  proof: snarkjs.Groth16Proof,
  publicSignals: snarkjs.PublicSignals
): Promise<{
  pi_a: Buffer;
  pi_b: Buffer;
  pi_c: Buffer;
  pubInputs: bigint[];
}>;
export function dictFromInputList(list: bigint[]): Dictionary<number, bigint>;
