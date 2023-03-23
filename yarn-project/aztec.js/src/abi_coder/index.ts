import { ABIParameter } from '../noir.js';
import { keccak256 } from './keccak256.js';

export * from './hex_string.js';

function pack(parameter: ABIParameter, value: any) {
  return Buffer.alloc(32);
}

export function generateFunctionSignature(name: string, parameters: ABIParameter[]) {
  return `${name}(${parameters.map(p => p.type.kind).join(',')})`;
}

export function encodeFunctionSignature(signature: string) {
  return keccak256(Buffer.from(signature)).slice(0, 4);
}

export function encodeParameters(parameters: ABIParameter[], args: any[]) {
  if (parameters.length !== args.length) {
    throw new Error(`Incorrect number of args. Expect ${parameters.length}. Got ${args.length}.`);
  }

  return parameters.map((p, i) => pack(p, args[i]));
}
