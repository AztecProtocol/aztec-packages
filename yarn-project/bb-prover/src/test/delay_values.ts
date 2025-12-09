import { ProvingRequestType } from '@aztec/stdlib/proofs';

export const WITGEN_DELAY_MS: Record<ProvingRequestType, number> = {
  [ProvingRequestType.PARITY_BASE]: 2_000,
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: 30,
  [ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP]: 45,
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP]: 27,
  [ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP]: 18,
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: 40_000,
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP]: 20_000,
  [ProvingRequestType.CHECKPOINT_ROOT_ROLLUP]: 40_000,
  [ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP]: 36_600,
  [ProvingRequestType.CHECKPOINT_PADDING_ROLLUP]: 0,
  [ProvingRequestType.CHECKPOINT_MERGE_ROLLUP]: 30,
  [ProvingRequestType.TX_MERGE_ROLLUP]: 0,
  [ProvingRequestType.PRIVATE_TX_BASE_ROLLUP]: 2_500, // Guess based on public
  [ProvingRequestType.PUBLIC_TX_BASE_ROLLUP]: 2_500,
  [ProvingRequestType.PARITY_ROOT]: 40,
  [ProvingRequestType.ROOT_ROLLUP]: 35,
  [ProvingRequestType.PUBLIC_CHONK_VERIFIER]: 60,
  [ProvingRequestType.PUBLIC_VM]: 0,
};

export const PROOF_DELAY_MS: Record<ProvingRequestType, number> = {
  [ProvingRequestType.PARITY_BASE]: 16_300,
  [ProvingRequestType.BLOCK_MERGE_ROLLUP]: 15_000,
  [ProvingRequestType.BLOCK_ROOT_FIRST_ROLLUP]: 16_500,
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_FIRST_ROLLUP]: 9_210,
  [ProvingRequestType.BLOCK_ROOT_EMPTY_TX_FIRST_ROLLUP]: 4_560,
  [ProvingRequestType.BLOCK_ROOT_ROLLUP]: 35_000,
  [ProvingRequestType.BLOCK_ROOT_SINGLE_TX_ROLLUP]: 15_000,
  [ProvingRequestType.CHECKPOINT_ROOT_ROLLUP]: 35_000,
  [ProvingRequestType.CHECKPOINT_ROOT_SINGLE_BLOCK_ROLLUP]: 38_800,
  [ProvingRequestType.CHECKPOINT_PADDING_ROLLUP]: 0,
  [ProvingRequestType.CHECKPOINT_MERGE_ROLLUP]: 9_760,
  [ProvingRequestType.TX_MERGE_ROLLUP]: 0,
  [ProvingRequestType.PRIVATE_TX_BASE_ROLLUP]: 45_000, // Guess based on public
  [ProvingRequestType.PUBLIC_TX_BASE_ROLLUP]: 45_000,
  [ProvingRequestType.PARITY_ROOT]: 18_600,
  [ProvingRequestType.ROOT_ROLLUP]: 84_000,
  [ProvingRequestType.PUBLIC_CHONK_VERIFIER]: 16_300,
  [ProvingRequestType.PUBLIC_VM]: 0,
};
