import type { SlotNumber } from '@aztec/foundation/branded-types';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { Offense, ProposerSlashAction } from '@aztec/stdlib/slashing';

/** Common interface for slasher clients used by the Aztec node. */
export interface SlasherClientInterface {
  /** Start the slasher client */
  start(): Promise<void>;

  /** Stop the slasher client */
  stop(): Promise<void>;

  /** Gather offenses for a given round, defaults to current. */
  gatherOffensesForRound(round?: bigint): Promise<Offense[]>;

  /** Returns all offenses */
  getOffenses(): Promise<Offense[]>;

  /** Update the configuration. */
  updateConfig(config: Partial<SlasherConfig>): void;

  /**
   * Get the actions the proposer should take for slashing.
   * @param slotNumber - The current slot number
   * @returns The actions to take
   */
  getProposerActions(slotNumber: SlotNumber): Promise<ProposerSlashAction[]>;

  /** Returns the current config */
  getConfig(): SlasherConfig;
}
