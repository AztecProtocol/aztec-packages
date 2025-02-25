import { z } from 'zod';

import { type AztecAddress } from '../../aztec-address/index.js';
import { schemas } from '../../schemas/index.js';

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
