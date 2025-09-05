import { EpochCache } from '@aztec/epoch-cache';
import type { ViemClient } from '@aztec/ethereum';
import { RollupContract } from '@aztec/ethereum/contracts';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';
import type { DataStoreConfig } from '@aztec/kv-store/config';
import { AztecLMDBStoreV2 } from '@aztec/kv-store/lmdb-v2';
import type { SlasherConfig } from '@aztec/stdlib/interfaces/server';
import type { Offense, ProposerSlashAction, SlashPayloadRound } from '@aztec/stdlib/slashing';

import { createSlasherImplementation } from './factory/create_implementation.js';
import type { SlasherClientInterface } from './slasher_client_interface.js';
import type { Watcher } from './watcher.js';

/**
 * Facade for the Slasher client. This class forwards all requests to the actual Slasher client implementation.
 * This class also monitors via the rollup contract when the underlying slasher proposer contract changes, and when it
 * does, it stops the current slasher client, recreates a new one with the new contract address, and starts it again.
 */
export class SlasherClientFacade implements SlasherClientInterface {
  private client: SlasherClientInterface | undefined;
  private unwatch: (() => void) | undefined;

  constructor(
    private config: SlasherConfig & DataStoreConfig & { ethereumSlotDuration: number },
    private rollup: RollupContract,
    private l1Client: ViemClient,
    private slashFactoryAddress: EthAddress | undefined,
    private watchers: Watcher[],
    private epochCache: EpochCache,
    private dateProvider: DateProvider,
    private kvStore: AztecLMDBStoreV2,
    private logger = createLogger('slasher'),
  ) {}

  public async start(): Promise<void> {
    this.client = await this.createSlasherClient();
    await this.client?.start();

    this.unwatch = this.rollup.listenToSlasherChanged(() => {
      void this.handleSlasherChange().catch(error => {
        this.logger.error('Error handling slasher change', error);
      });
    });
  }

  public async stop(): Promise<void> {
    await this.client?.stop();
    this.unwatch?.();
    this.unwatch = undefined;
  }

  public getConfig(): SlasherConfig {
    return this.config;
  }

  public updateConfig(config: Partial<SlasherConfig>): void {
    this.config = { ...this.config, ...config };
    this.client?.updateConfig(config);
    this.watchers.forEach(watcher => watcher.updateConfig?.(config));
  }

  public getSlashPayloads(): Promise<SlashPayloadRound[]> {
    return this.client?.getSlashPayloads() ?? Promise.reject(new Error('Slasher client not initialized'));
  }

  public gatherOffensesForRound(round?: bigint): Promise<Offense[]> {
    return this.client?.gatherOffensesForRound(round) ?? Promise.reject(new Error('Slasher client not initialized'));
  }

  public getPendingOffenses(): Promise<Offense[]> {
    return this.client?.getPendingOffenses() ?? Promise.reject(new Error('Slasher client not initialized'));
  }

  public getProposerActions(slotNumber: bigint): Promise<ProposerSlashAction[]> {
    return this.client?.getProposerActions(slotNumber) ?? Promise.reject(new Error('Slasher client not initialized'));
  }

  private createSlasherClient() {
    return createSlasherImplementation(
      this.config,
      this.rollup,
      this.l1Client,
      this.slashFactoryAddress,
      this.watchers,
      this.epochCache,
      this.dateProvider,
      this.kvStore,
      this.logger,
    );
  }

  private async handleSlasherChange() {
    this.logger.warn('Slasher contract changed, recreating slasher client');
    await this.client?.stop();
    this.client = await this.createSlasherClient();
    await this.client?.start();
  }
}
