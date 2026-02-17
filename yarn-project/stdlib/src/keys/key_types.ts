import type { DomainSeparator } from '@aztec/constants';

export type KeyGenerator =
  | DomainSeparator.NHK_M
  | DomainSeparator.IVSK_M
  | DomainSeparator.OVSK_M
  | DomainSeparator.TSK_M;
export type KeyPrefix = 'n' | 'iv' | 'ov' | 't';
export const KEY_PREFIXES: KeyPrefix[] = ['n', 'iv', 'ov', 't'];
