import { type EthAddress } from '@aztec/circuits.js';

export type EpochProofClaim = {
  epochToProve: bigint;
  basisPointFee: bigint;
  bondAmount: bigint;
  bondProvider: EthAddress;
  proposerClaimant: EthAddress;
};
