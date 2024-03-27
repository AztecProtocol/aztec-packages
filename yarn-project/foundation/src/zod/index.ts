import { z } from 'zod';

import { AztecAddress } from '../aztec-address/index.js';
import { EthAddress } from '../eth-address/index.js';
import { Fr } from '../fields/fields.js';

export const ethAddress = z
  .custom<`0x${string}` | EthAddress>(
    val => (typeof val === 'string' && EthAddress.isAddress(val)) || EthAddress.isEthAddress(val),
  )
  .transform(val => (typeof val === 'string' ? EthAddress.fromString(val) : val));

export const optionalEthAddress = ethAddress.optional().default(EthAddress.ZERO);

export const aztecAddress = z
  .custom<`0x${string}` | AztecAddress>(
    val => (typeof val === 'string' && AztecAddress.isAddress(val)) || AztecAddress.isAztecAddress(val),
  )
  .transform(val => (typeof val === 'string' ? AztecAddress.fromString(val) : val));

export const stringlyNumber = z.number().or(z.string()).pipe(z.coerce.number());

export const fr = z
  .number()
  .or(z.string())
  .or(z.bigint())
  .or(z.instanceof(Fr))
  .transform(val => (typeof val === 'string' ? Fr.fromString(val) : new Fr(val)));

export { z };
