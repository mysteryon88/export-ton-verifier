export function toHexString(byteArray: Uint8Array | number[]): string;

export function g1Compressed(curve: any, p1Raw: unknown): string;
export function g2Compressed(curve: any, p2Raw: unknown): string;

export function generateVerifier(
  zkeyPath: string,
  templatePath: string,
  outputPath: string
): Promise<void>;
