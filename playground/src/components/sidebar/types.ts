import type { AztecAddress, Fr } from '@aztec/aztec.js';

export type Network = {
  nodeURL: string;
  name: string;
  description: string;
};

export const PREDEFINED_CONTRACTS = {
  SIMPLE_VOTING: 'simple_voting',
  SIMPLE_TOKEN: 'simple_token',
  CUSTOM_UPLOAD: 'custom_upload'
};

export type AliasedItem = {
  key: string;
  value: string;
}; 