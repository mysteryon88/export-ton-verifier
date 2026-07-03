// SPDX-License-Identifier: GPL-3.0-or-later
import type { Cell, Dictionary, TupleItem } from "@ton/core";
import { dictFromInputList as dictFromInputListImpl } from "./dictFromInputList";
import { groth16CompressProof as groth16CompressProofImpl } from "./groth16CompressProof.js";
import {
  g1Compressed as g1CompressedImpl,
  g2Compressed as g2CompressedImpl,
  getCurveFromName as getCurveFromNameImpl,
} from "./utils.js";
import { generateVerifier as generateVerifierImpl } from "./generateVerifiers.js";
import zkeyExportPlonkVerificationKeyImpl from "./export_plonk_vk.js";
import {
  calldataToTupleItems as calldataToTupleItemsImpl,
  exportPlonkFuncCalldata as exportPlonkFuncCalldataImpl,
  exportPlonkTolkCalldata as exportPlonkTolkCalldataImpl,
} from "./export_plonk_calldata.js";
import {
  formatDoctorReport as formatDoctorReportImpl,
  inspectVerifierInput as inspectVerifierInputImpl,
} from "./artifactInfo.js";
import {
  proofToMessageBoc as proofToMessageBocImpl,
  proofToMessageCell as proofToMessageCellImpl,
} from "./proofMessages.js";
import {
  MAX_PLONK_PUBLIC_INPUTS as MAX_PLONK_PUBLIC_INPUTS_IMPL,
  normalizeTonBlsCurveName as normalizeTonBlsCurveNameImpl,
} from "./limits.js";

export type VerifierProtocol = "groth16" | "plonk";
export type VerifierLanguage = "func" | "tolk" | "tact";
export type MessageLanguage = "func" | "tolk";
export type BocFormat = "base64" | "hex";

export type PublicSignals = Array<string | number | bigint>;
export type ProofJson = Record<string, unknown>;
export type VerifierLogger =
  | false
  | null
  | ((message: string) => void)
  | { log(message: string): void };

export interface GenerateVerifierOptions {
  lang?: VerifierLanguage;
  templatesDir?: string;
  contractName?: string | null;
  logger?: VerifierLogger;
  quiet?: boolean;
}

export interface Groth16CompressedProof {
  pi_a: Buffer;
  pi_b: Buffer;
  pi_c: Buffer;
  pubInputs: bigint[];
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  inputPath: string;
  sourceFormat: string;
  protocol: VerifierProtocol;
  curve: string;
  nPublic: number | null;
  language: VerifierLanguage;
  template: string | null;
  checks: DoctorCheck[];
}

export interface InspectVerifierInputOptions {
  lang?: VerifierLanguage;
  templatesDir?: string;
}

export interface ProofToMessageOptions {
  proof: ProofJson;
  publicSignals: PublicSignals;
  protocol?: VerifierProtocol;
  lang?: MessageLanguage;
}

export interface ProofToMessageBocOptions extends ProofToMessageOptions {
  format?: BocFormat;
}

export const MAX_PLONK_PUBLIC_INPUTS = MAX_PLONK_PUBLIC_INPUTS_IMPL as 244;

export const dictFromInputList: (
  list: bigint[],
) => Dictionary<number, bigint> = dictFromInputListImpl;

export const groth16CompressProof: (
  proof: ProofJson,
  publicSignals: PublicSignals,
) => Promise<Groth16CompressedProof> = groth16CompressProofImpl;

export const getCurveFromName: (
  name: string,
  options?: { singleThread?: boolean },
) => Promise<unknown> = getCurveFromNameImpl;

export const g1Compressed: (curve: unknown, p1Raw: unknown) => string =
  g1CompressedImpl;

export const g2Compressed: (curve: unknown, p2Raw: unknown) => string =
  g2CompressedImpl;

export const generateVerifier: (
  inputPath: string,
  outputPath: string,
  opts?: GenerateVerifierOptions,
) => Promise<VerifierProtocol> = generateVerifierImpl;

export const zkeyExportPlonkVerificationKey: (
  zkeyName: string,
) => Promise<Record<string, unknown>> = zkeyExportPlonkVerificationKeyImpl;

export const calldataToTupleItems: (
  calldata: TupleItem[],
) => TupleItem[] = calldataToTupleItemsImpl;

export const exportPlonkFuncCalldata: (
  proof: ProofJson,
  publicSignals: PublicSignals,
) => Promise<TupleItem[]> = exportPlonkFuncCalldataImpl;

export const exportPlonkTolkCalldata: (
  proof: ProofJson,
  publicSignals: PublicSignals,
) => Promise<TupleItem[]> = exportPlonkTolkCalldataImpl;

export const inspectVerifierInput: (
  inputPath: string,
  opts?: InspectVerifierInputOptions,
) => Promise<DoctorReport> = inspectVerifierInputImpl as unknown as (
  inputPath: string,
  opts?: InspectVerifierInputOptions,
) => Promise<DoctorReport>;

export const formatDoctorReport: (report: DoctorReport) => string =
  formatDoctorReportImpl;

export const proofToMessageCell: (
  opts: ProofToMessageOptions,
) => Promise<Cell> = proofToMessageCellImpl as unknown as (
  opts: ProofToMessageOptions,
) => Promise<Cell>;

export const proofToMessageBoc: (
  opts: ProofToMessageBocOptions,
) => Promise<string> = proofToMessageBocImpl as unknown as (
  opts: ProofToMessageBocOptions,
) => Promise<string>;

export const normalizeTonBlsCurveName: (
  raw: string,
  field?: string,
) => "bls12381" = normalizeTonBlsCurveNameImpl as unknown as (
  raw: string,
  field?: string,
) => "bls12381";
