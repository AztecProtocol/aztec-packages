import { type L1ContractAddresses, L1ContractAddressesSchema } from '@aztec/ethereum/l1-contract-addresses';
import type { ZodFor } from '@aztec/foundation/schemas';

import { z } from 'zod';

import { type ProtocolContractAddresses, ProtocolContractAddressesSchema } from './protocol_contract_addresses.js';

/** Limits a single transaction may declare on a network. */
export interface TxsLimits {
  /** Maximum gas limits a single tx may declare: the smaller of the per-tx maximum and the per-block allocation. */
  gas: { daGas: number; l2Gas: number };
}

/** Provides basic information about the running node. */
export interface NodeInfo {
  /** Version as tracked in the aztec-packages repository. */
  nodeVersion: string;
  /** L1 chain id. */
  l1ChainId: number;
  /** Rollup version. */
  rollupVersion: number;
  /** The node's ENR. */
  enr: string | undefined;
  /** The deployed l1 contract addresses */
  l1ContractAddresses: L1ContractAddresses;
  /** Protocol contract addresses */
  protocolContractAddresses: ProtocolContractAddresses;
  /** Whether the node requires real proofs for transaction submission. */
  realProofs: boolean;
  /** Limits a single tx may declare on this network. Clients rely on this to set fallback gas limits. */
  txsLimits: TxsLimits;
}

export const NodeInfoSchema: ZodFor<NodeInfo> = z
  .object({
    nodeVersion: z.string(),
    l1ChainId: z.number().int().nonnegative(),
    rollupVersion: z.number().int().nonnegative(),
    enr: z.string().optional(),
    l1ContractAddresses: L1ContractAddressesSchema,
    protocolContractAddresses: ProtocolContractAddressesSchema,
    realProofs: z.boolean(),
    txsLimits: z.object({
      gas: z.object({ daGas: z.number().int().nonnegative(), l2Gas: z.number().int().nonnegative() }),
    }),
  })
  .transform(obj => ({ enr: undefined, ...obj }));
