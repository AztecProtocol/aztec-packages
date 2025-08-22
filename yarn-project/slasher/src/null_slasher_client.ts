import type { Offense, ProposerSlashAction, SlashPayloadRound } from '@aztec/stdlib/slashing';

import type { SlasherConfig } from './config.js';
import type { SlasherClientInterface } from './slasher_client_interface.js';

export class NullSlasherClient implements SlasherClientInterface {
  constructor(private config: SlasherConfig) {}

  public start(): Promise<void> {
    return Promise.resolve();
  }

  public stop(): Promise<void> {
    return Promise.resolve();
  }

  public getSlashPayloads(): Promise<SlashPayloadRound[]> {
    return Promise.resolve([]);
  }

  public gatherOffensesForRound(_round?: bigint): Promise<Offense[]> {
    return Promise.resolve([]);
  }

  public getPendingOffenses(): Promise<Offense[]> {
    return Promise.resolve([]);
  }

  public updateConfig(config: Partial<SlasherConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getProposerActions(_slotNumber: bigint): Promise<ProposerSlashAction[]> {
    return Promise.resolve([]);
  }

  public getConfig(): SlasherConfig {
    return this.config;
  }
}
