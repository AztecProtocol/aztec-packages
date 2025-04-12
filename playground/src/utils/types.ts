import type { AbiType } from '@aztec/aztec.js';

export const PREDEFINED_CONTRACTS = {
  SIMPLE_VOTING: 'SimpleVoting',
  SIMPLE_TOKEN: 'SimpleToken',
  CUSTOM_UPLOAD: 'custom_upload',
};

export type AliasedItem = {
  key: string;
  value: string;
};

export const AztecAddressTypeLike: AbiType = {
  kind: 'struct',
  path: 'address::AztecAddress',
  fields: [{ name: 'inner', type: { kind: 'field' } }],
};
