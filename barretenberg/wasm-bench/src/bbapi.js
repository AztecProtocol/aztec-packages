import { Decoder, Encoder } from 'msgpackr';

const encoder = new Encoder({ useRecords: false });
const decoder = new Decoder({ useRecords: false });

export function bbapiCall(wasm, commandName, command, responseName) {
  const input = encoder.pack([[commandName, command]]);
  const [variantName, result] = decoder.unpack(wasm.cbindCall(input));
  if (variantName === 'ErrorResponse') {
    throw new Error(result?.message || 'Unknown ErrorResponse from bbapi');
  }
  if (variantName !== responseName) {
    throw new Error(`Expected ${responseName}, got ${variantName}`);
  }
  return result;
}

export function proofFieldCount(proof) {
  if (!proof || typeof proof !== 'object') {
    return 0;
  }
  return ['hiding_oink_proof', 'merge_proof', 'eccvm_proof', 'ipa_proof', 'joint_proof']
    .map(key => proof[key])
    .filter(Array.isArray)
    .reduce((sum, values) => sum + values.length, 0);
}
