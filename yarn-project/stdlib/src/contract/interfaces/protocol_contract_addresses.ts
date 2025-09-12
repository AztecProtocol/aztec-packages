import { z } from 'zod';

import type { AztecAddress } from '../../aztec-address/index.js';
import { schemas } from '../../schemas/index.js';

export const ProtocolContractsNames = ['classRegistry', 'feeJuice', 'instanceRegistry', 'multiCallEntrypoint'] as const;

export type ProtocolContractAddresses = {
  classRegistry: AztecAddress;
  feeJuice: AztecAddress;
  instanceRegistry: AztecAddress;
  multiCallEntrypoint: AztecAddress;
};

export const ProtocolContractAddressesSchema = z.object({
  classRegistry: schemas.AztecAddress,
  feeJuice: schemas.AztecAddress,
  instanceRegistry: schemas.AztecAddress,
  multiCallEntrypoint: schemas.AztecAddress,
});
