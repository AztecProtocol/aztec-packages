import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { Offense, ProposerSlashAction, SlashPayloadRound } from '@aztec/stdlib/slashing';

/**
 * Common interface for slasher clients used by the Aztec node.
 * Both Empire and Consensus slasher clients implement this interface.
 */
export interface SlasherClientInterface {
  /** Start the slasher client */
  start(): Promise<void>;

  /** Stop the slasher client */
  stop(): Promise<void>;

  /**
   * Get slash payloads for the Empire model.
   * The Consensus model should throw an error when this is called.
   */
  getSlashPayloads(): Promise<SlashPayloadRound[]>;

  /**
   * Gather offenses for a given round, defaults to current.
   * Used by both Empire and Consensus models.
   */
  gatherOffensesForRound(round?: bigint): Promise<Offense[]>;

  /** Returns all pending offenses */
  getPendingOffenses(): Promise<Offense[]>;

  /**
   * Update the configuration.
   * Used by both Empire and Consensus models.
   */
  updateConfig(config: Partial<SlasherConfig>): void;

  /**
   * Get the actions the proposer should take for slashing.
   * @param slotNumber - The current slot number
   * @returns The actions to take
   */
  getProposerActions(slotNumber: bigint): Promise<ProposerSlashAction[]>;

  /** Returns the current config */
  getConfig(): SlasherConfig;
}
