import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

export type SequencerRollupConstants = Pick<
  L1RollupConstants,
  'ethereumSlotDuration' | 'l1GenesisTime' | 'slotDuration' | 'rollupManaLimit' | 'epochDuration'
>;
