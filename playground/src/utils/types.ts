import type { AbiType } from '@aztec/aztec.js';

export const PREDEFINED_CONTRACTS = {
  SIMPLE_VOTING: 'Easy Private Voting',
  SIMPLE_TOKEN: 'Simple Token',
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


export const logLevel = ['silent', 'fatal', 'error', 'warn', 'info', 'verbose', 'debug', 'trace'] as const;
export type LogLevel = (typeof logLevel)[number];

export type Log = {
  id: string;
  type: LogLevel;
  timestamp: number;
  prefix: string;
  message: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
};
