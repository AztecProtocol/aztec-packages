import type { ProposerSlashAction } from './types.js';

export interface ProposerSlashActionProvider {
  /**
   * Returns the actions to take for the proposer in the current slot.
   * This can include creating a slash payload or other actions.
   * @param slotNumber - The current slot number
   * @returns The actions to take
   */
  getProposerActions(slotNumber: bigint): Promise<ProposerSlashAction[]>;
}
