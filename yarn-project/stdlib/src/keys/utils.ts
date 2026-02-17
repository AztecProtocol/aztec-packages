import { DomainSeparator } from '@aztec/constants';

import type { KeyGenerator, KeyPrefix } from './key_types.js';

export function getKeyGenerator(prefix: KeyPrefix): KeyGenerator {
  const map: Record<KeyPrefix, KeyGenerator> = {
    n: DomainSeparator.NHK_M,
    iv: DomainSeparator.IVSK_M,
    ov: DomainSeparator.OVSK_M,
    t: DomainSeparator.TSK_M,
  };
  return map[prefix];
}
