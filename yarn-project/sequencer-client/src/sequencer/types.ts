import type { L1RollupConstants } from '@aztec/stdlib/epoch-helpers';

export type SequencerRollupConstants = Pick<
  L1RollupConstants,
  'ethereumSlotDuration' | 'l1GenesisTime' | 'slotDuration'
> & {
  /** Total L2 gas (mana) allowed per checkpoint. Fetched from L1 getManaLimit(). */
  rollupManaLimit: number;
};
