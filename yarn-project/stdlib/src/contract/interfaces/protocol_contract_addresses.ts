import { z } from 'zod';

import type { AztecAddress } from '../../aztec-address/index.js';
import { schemas } from '../../schemas/index.js';

export const ProtocolContractsNames = ['feeJuice', 'classRegistry', 'instanceRegistry', 'authRegistry'] as const;

export type ProtocolContractAddresses = {
  feeJuice: AztecAddress;
  classRegistry: AztecAddress;
  instanceRegistry: AztecAddress;
  authRegistry: AztecAddress;
};

export const ProtocolContractAddressesSchema = z.object({
  feeJuice: schemas.AztecAddress,
  classRegistry: schemas.AztecAddress,
  instanceRegistry: schemas.AztecAddress,
  authRegistry: schemas.AztecAddress,
});
