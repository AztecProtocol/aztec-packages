import type { EpochCache } from '@aztec/epoch-cache';
import {
  type L1ContractsConfig,
  type L1ReaderConfig,
  type ViemPublicClient,
  createEthereumChain,
} from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { createLogger } from '@aztec/foundation/log';
import { SlashFactoryAbi } from '@aztec/l1-artifacts';
import { type L2BlockId, type L2BlockSource, L2BlockStream, type L2BlockStreamEvent } from '@aztec/stdlib/block';
import { type TelemetryClient, WithTracer, getTelemetryClient } from '@aztec/telemetry-client';

import { type GetContractReturnType, createPublicClient, fallback, getAddress, getContract, http } from 'viem';

/**
 * Enum defining the possible states of the Slasher client.
 */
export enum SlasherClientState {
  IDLE,
  RUNNING,
  STOPPED,
}

/**
 * The synchronization status of the Slasher client.
 */
export interface SlasherSyncState {
  /**
   * The current state of the slasher client.
   */
  state: SlasherClientState;
  /**
   * The block number that the slasher client is synced to.
   */
  syncedToL2Block: L2BlockId;
}

export interface SlasherConfig {
  blockCheckIntervalMS: number;
  blockRequestBatchSize: number;
}

type SlashEvent = {
  epoch: bigint;
  amount: bigint;
  lifetime: bigint;
};

/**
 * @notice A Hypomeiones slasher client implementation
 *
 * Hypomeiones: a class of individuals in ancient Sparta who were considered inferior or lesser citizens compared
 * to the full Spartan citizens.
 *
 * The implementation here is less than ideal. It exists, not to be the end all be all, but to show that
 * slashing can be done with this mechanism.
 *
 * The implementation is VERY brute in the sense that it only looks for pruned blocks and then tries to slash
 * the full committee of that.
 * If it sees a prune, it will mark the full epoch as "to be slashed".
 *
 * Also, it is not particularly smart around what it should if there were to be multiple slashing events.
 *
 * A few improvements:
 * - Only vote on the proposal if it is possible to reach, e.g., if 6 votes are needed and only 4 slots are left don't vote.
 * - Stop voting on a payload once it is processed.
 * - Only vote on the proposal if it have not already been executed
 *  - Caveat, we need to fully decide if it is acceptable to have the same payload address multiple times. In the current
 *    slash factory that could mean slashing the same committee for the same error multiple times.
 * - Decide how to deal with multiple slashing events in the same round.
 *  - This could be that multiple epochs are pruned in the same round, but with the current naive implementation we could end up
 *    slashing only the first, because the "lifetime" of the second would have passed after that vote
 */
export class SlasherClient extends WithTracer {
  private blockStream;

  private slashEvents: SlashEvent[] = [];

  protected slashFactoryContract?: GetContractReturnType<typeof SlashFactoryAbi, ViemPublicClient> = undefined;

  // The amount to slash for a prune.
  // Note that we set it to 0, such that no actual slashing will happen, but the event will be fired,
  // showing that the slashing mechanism is working.
  private slashingAmount: bigint = 0n;

  constructor(
    private config: SlasherConfig & L1ContractsConfig & L1ReaderConfig,
    private l2BlockSource: L2BlockSource,
    private epochCache: EpochCache,
    telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('slasher'),
  ) {
    super(telemetry, 'slasher');

    this.blockStream = new L2BlockStream(
      this.l2BlockSource,
      this.l2BlockSource,
      this,
      createLogger('slasher:block_stream'),
      {
        batchSize: config.blockRequestBatchSize,
        pollIntervalMS: config.blockCheckIntervalMS,
      },
    );

    if (config.l1Contracts.slashFactoryAddress && config.l1Contracts.slashFactoryAddress !== EthAddress.ZERO) {
      const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);
      const publicClient = createPublicClient({
        chain: chain.chainInfo,
        transport: fallback(chain.rpcUrls.map(url => http(url))),
        pollingInterval: config.viemPollingIntervalMS,
      });

      this.slashFactoryContract = getContract({
        address: getAddress(config.l1Contracts.slashFactoryAddress.toString()),
        abi: SlashFactoryAbi,
        client: publicClient,
      });
    } else {
      this.log.warn('No slash factory address found, slashing will not be enabled');
    }

    this.log.info(`Slasher client initialized`);
  }

  public start() {
    this.log.info('Starting Slasher client...');
    this.blockStream.start();
  }

  // This is where we should put a bunch of the improvements mentioned earlier.
  public async getSlashPayload(slotNumber: bigint): Promise<EthAddress | undefined> {
    if (!this.slashFactoryContract) {
      // temp
      this.log.warn('No slash factory contract found, skipping slash payload retrieval');
      return undefined;
    }

    // As long as the slot is greater than the lifetime, we want to keep deleting the first element
    // since it will not make sense to include anymore.
    while (this.slashEvents.length > 0 && this.slashEvents[0].lifetime < slotNumber) {
      this.log.info(`SLASH EVENTS LIFETIME: ${this.slashEvents[0].lifetime} < ${slotNumber}`);
      this.log.info(`REMOVING SLASH EVENT ${this.slashEvents[0].epoch} ${this.slashEvents[0].amount}`);
      this.slashEvents.shift();
    }

    if (this.slashEvents.length == 0) {
      // temp
      this.log.warn('No slash events found, skipping slash payload retrieval');
      return undefined;
    }

    const slashEvent = this.slashEvents[0];
    this.log.info(`Getting slash payload for event ${slashEvent.epoch} ${slashEvent.amount}`);

    // The address of the proposal that does this exact thing will be found in this setting
    this.log.info(`SLASH FACTORY CONTRACT: ${this.slashFactoryContract}`);
    const [payloadAddress, isDeployed] = await this.slashFactoryContract.read.getAddressAndIsDeployed([
      slashEvent.epoch,
      slashEvent.amount,
    ]);
    // temp
    this.log.info(`Got slash payload for event ${slashEvent.epoch} ${slashEvent.amount}: ${payloadAddress}`);

    if (!isDeployed) {
      //tmp
      this.log.info(`Voting on not yet deployed payload: ${payloadAddress}`);

      // The proposal cannot be executed until it is deployed
      this.log.verbose(`Voting on not yet deployed payload: ${payloadAddress}`);
    }

    return EthAddress.fromString(payloadAddress);
  }

  public handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    this.log.debug(`Handling block stream event ${event.type}`);
    switch (event.type) {
      case 'chain-pruned':
        this.handlePruneL2Blocks();
        break;
      default: {
        break;
      }
    }
    return Promise.resolve();
  }

  /**
   * Allows consumers to stop the instance of the slasher client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.log.debug('Stopping Slasher client...');
    await this.blockStream.stop();
    this.log.debug('Stopped block downloader');
    this.log.info('Slasher client stopped.');
  }

  private handlePruneL2Blocks(): void {
    // Get the slot number from another source - i think this block is being pruned so its always incorrect
    // todo: should not be zero
    const { epoch, slot } = this.epochCache.getEpochAndSlotNow();
    this.log.info(`Detected chain prune. Punishing the validators at epoch ${epoch}`);

    // Set the lifetime such that we have a full round that we could vote throughout.
    this.log.info(`SLASHING ROUND SIZE: ${this.config.slashingRoundSize}`);
    this.log.info(`SLOT NUMBER: ${slot}`);
    this.log.info(`EPOCH NUMBER: ${epoch}`);

    const slotsIntoRound = slot % BigInt(this.config.slashingRoundSize);
    const toNext = slotsIntoRound == 0n ? 0n : BigInt(this.config.slashingRoundSize) - slotsIntoRound;

    const lifetime = slot + toNext + BigInt(this.config.slashingRoundSize);

    this.slashEvents.push({
      epoch,
      amount: this.slashingAmount,
      lifetime,
    });
    // temp
    this.log.info(`Slashing event added: ${jsonStringify(this.slashEvents[this.slashEvents.length - 1])}`);
  }
}
