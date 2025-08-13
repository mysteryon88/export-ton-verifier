// @ts-ignore
import { Dictionary } from "@ton/core";

export function dictFromInputList(list: bigint[]): Dictionary<number, bigint> {
  const dict: Dictionary<number, bigint> = Dictionary.empty(
    Dictionary.Keys.Int(32),
    Dictionary.Values.BigInt(256)
  );
  for (let i = 0; i < list.length; i++) {
    dict.set(i, list[i]);
  }
  return dict;
}
