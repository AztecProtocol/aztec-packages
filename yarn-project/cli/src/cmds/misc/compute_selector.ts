import type { LogFn } from '@aztec/foundation/log';
import { FunctionSelector } from '@aztec/stdlib/abi';

export async function computeSelector(functionSignature: string, log: LogFn) {
  const selector = await FunctionSelector.fromSignature(functionSignature);
  log(`${selector}`);
}
