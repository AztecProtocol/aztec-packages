import { type AztecAddress } from '@aztec/foundation/aztec-address';
import { schemas } from '@aztec/foundation/schemas';

import { z } from 'zod';

export const ProtocolContractsNames = [
  'classRegisterer',
  'feeJuice',
  'instanceDeployer',
  'multiCallEntrypoint',
] as const;

export type ProtocolContractAddresses = {
  classRegisterer: AztecAddress;
  feeJuice: AztecAddress;
  instanceDeployer: AztecAddress;
  multiCallEntrypoint: AztecAddress;
};

export const ProtocolContractAddressesSchema = z.object({
  classRegisterer: schemas.AztecAddress,
  feeJuice: schemas.AztecAddress,
  instanceDeployer: schemas.AztecAddress,
  multiCallEntrypoint: schemas.AztecAddress,
});
