import { FunctionSelector } from '@aztec/circuits.js/abi';
import { type LogFn } from '@aztec/foundation/log';

export async function computeSelector(functionSignature: string, log: LogFn) {
  const selector = await FunctionSelector.fromSignature(functionSignature);
  log(`${selector}`);
}
