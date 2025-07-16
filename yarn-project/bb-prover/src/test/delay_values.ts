import { ProvingRequestType } from '@aztec/stdlib/proofs';

export const WITGEN_DELAY_MS: Record<ProvingRequestType, number> = {
  [ProvingRequestType.BASE_PARITY]: 60,
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: 650,
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: 60_000,
  [ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP]: 0,
  [ProvingRequestType.PADDING_BLOCK_ROOT_ROLLUP]: 0,
  [ProvingRequestType.MERGE_ROLLUP]: 0,
  [ProvingRequestType.PRIVATE_BASE_ROLLUP]: 400_000,
  [ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP]: 0, // TBD
  [ProvingRequestType.PUBLIC_BASE_ROLLUP]: 470_000,
  [ProvingRequestType.ROOT_PARITY]: 100,
  [ProvingRequestType.ROOT_ROLLUP]: 650,
  [ProvingRequestType.TUBE_PROOF]: 0,
  [ProvingRequestType.PUBLIC_VM]: 0,
};

export const PROOF_DELAY_MS: Record<ProvingRequestType, number> = {
  [ProvingRequestType.BASE_PARITY]: 3_000,
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: 15_000,
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: 55_000,
  [ProvingRequestType.EMPTY_BLOCK_ROOT_ROLLUP]: 0,
  [ProvingRequestType.PADDING_BLOCK_ROOT_ROLLUP]: 0,
  [ProvingRequestType.MERGE_ROLLUP]: 0,
  [ProvingRequestType.PRIVATE_BASE_ROLLUP]: 145_000,
  [ProvingRequestType.SINGLE_TX_BLOCK_ROOT_ROLLUP]: 0, // TBD
  [ProvingRequestType.PUBLIC_BASE_ROLLUP]: 160_000,
  [ProvingRequestType.ROOT_PARITY]: 30_000,
  [ProvingRequestType.ROOT_ROLLUP]: 15_000,
  [ProvingRequestType.TUBE_PROOF]: 30_000,
  [ProvingRequestType.PUBLIC_VM]: 0,
};
