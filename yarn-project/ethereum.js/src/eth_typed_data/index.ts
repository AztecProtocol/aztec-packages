import { getTypeHash } from './eip-712.js';
import { TypedData } from './typed_data.js';

export * from './typed_data.js';

export function getTypedDataHash(data: TypedData) {
  return getTypeHash(data, 'EIP712Domain');
}
