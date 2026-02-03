import { GeneratorIndex } from '@aztec/constants';

import type { KeyGenerator, KeyPrefix } from './key_types.js';

export function getKeyGenerator(prefix: KeyPrefix): KeyGenerator {
  const map: Record<KeyPrefix, KeyGenerator> = {
    n: GeneratorIndex.NHK_M,
    iv: GeneratorIndex.IVSK_M,
    ov: GeneratorIndex.OVSK_M,
    t: GeneratorIndex.TSK_M,
  };
  return map[prefix];
}
