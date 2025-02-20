import { type L1ContractAddresses, L1ContractAddressesSchema } from '@aztec/ethereum/l1-contract-addresses';
import { type ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type ProtocolContractAddresses, ProtocolContractAddressesSchema } from './protocol_contract_addresses.js';

/** Provides basic information about the running node. */
export interface NodeInfo {
  /** Version as tracked in the aztec-packages repository. */
  nodeVersion: string;
  /** L1 chain id. */
  l1ChainId: number;
  /** Protocol version. */
  protocolVersion: number;
  /** The node's ENR. */
  enr: string | undefined;
  /** The deployed l1 contract addresses */
  l1ContractAddresses: L1ContractAddresses;
  /** Protocol contract addresses */
  protocolContractAddresses: ProtocolContractAddresses;
}

export const NodeInfoSchema = z
  .object({
    nodeVersion: z.string(),
    l1ChainId: z.number(),
    protocolVersion: z.number(),
    enr: z.string().optional(),
    l1ContractAddresses: L1ContractAddressesSchema,
    protocolContractAddresses: ProtocolContractAddressesSchema,
  })
  .transform(obj => ({ enr: undefined, ...obj })) satisfies ZodFor<NodeInfo>;
