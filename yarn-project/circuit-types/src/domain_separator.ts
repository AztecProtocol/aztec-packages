import { Buffer32 } from '@aztec/foundation/buffer';

import { type TypedDataDomain, domainSeparator } from 'viem';

export const DOMAIN: TypedDataDomain = {
  name: 'Aztec Rollup',
  version: '1',
};

export const DOMAIN_SEPARATOR = Buffer32.fromString(domainSeparator({ domain: DOMAIN }));
