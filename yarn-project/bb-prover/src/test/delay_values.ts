import { ProvingRequestType } from '@aztec/stdlib/proofs';

export const WITGEN_DELAY_MS: Record<ProvingRequestType, number> = {
  [ProvingRequestType.PUBLIC_CHONK_VERIFIER]: 60,
  [ProvingRequestType.PARITY_BASE]: 1_600,
  [ProvingRequestType.PARITY_ROOT]: 40,
  [ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP]: 45,
  [ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP]: 18,
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP]: 27,
  [ProvingRequestType.CHECKPOINT_MERGE_ROLLUP]: 30,
  [ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP]: 36_000,
  [ProvingRequestType.ROOT_ROLLUP]: 35,
  [ProvingRequestType.PUBLIC_TX_BASE_ROLLUP]: 2_500,
  [ProvingRequestType.TX_MERGE_ROLLUP]: 25,
  [ProvingRequestType.PUBLIC_VM]: 0,

  // TBD
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: 30,
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: 40_000,
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP]: 20_000,
  [ProvingRequestType.CHECKPOINT_ROOT_ROLLUP]: 40_000,
  [ProvingRequestType.CHECKPOINT_PADDING_ROLLUP]: 0,
  [ProvingRequestType.PRIVATE_TX_BASE_ROLLUP]: 2_500, // Guess based on public
};

export const PROOF_DELAY_MS: Record<ProvingRequestType, number> = {
  [ProvingRequestType.PUBLIC_CHONK_VERIFIER]: 16_300,
  [ProvingRequestType.PARITY_BASE]: 15_300,
  [ProvingRequestType.PARITY_ROOT]: 18_600,
  [ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP]: 17_400,
  [ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP]: 4_500,
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP]: 9_200,
  [ProvingRequestType.CHECKPOINT_MERGE_ROLLUP]: 10_200,
  [ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP]: 37_100,
  [ProvingRequestType.ROOT_ROLLUP]: 93_000,
  [ProvingRequestType.TX_MERGE_ROLLUP]: 10_000,
  [ProvingRequestType.PUBLIC_TX_BASE_ROLLUP]: 44_500,
  [ProvingRequestType.PUBLIC_VM]: 180_000,

  // TBD
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: 15_000,
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: 35_000,
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP]: 15_000,
  [ProvingRequestType.CHECKPOINT_ROOT_ROLLUP]: 35_000,
  [ProvingRequestType.CHECKPOINT_PADDING_ROLLUP]: 0,
  [ProvingRequestType.PRIVATE_TX_BASE_ROLLUP]: 22_000,
};
