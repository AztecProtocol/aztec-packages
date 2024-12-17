import {
  type L2Block,
  type L2BlockId,
  type L2BlockSource,
  L2BlockStream,
  type L2BlockStreamEvent,
  type L2Tips,
} from '@aztec/circuit-types';
import { INITIAL_L2_BLOCK_NUM } from '@aztec/circuits.js/constants';
import { type L1ContractsConfig, type L1ReaderConfig, createEthereumChain } from '@aztec/ethereum';
import { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { type AztecKVStore, type AztecMap, type AztecSingleton } from '@aztec/kv-store';
import { SlashFactoryAbi } from '@aztec/l1-artifacts';
import { type TelemetryClient, WithTracer } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';

import {
  type Chain,
  type GetContractReturnType,
  type HttpTransport,
  type PublicClient,
  createPublicClient,
  getAddress,
  getContract,
  http,
} from 'viem';

/**
 * Enum defining the possible states of the Slasher client.
 */
export enum SlasherClientState {
  IDLE,
  SYNCHING,
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
  private currentState = SlasherClientState.IDLE;
  private syncPromise = Promise.resolve();
  private syncResolve?: () => void = undefined;
  private latestBlockNumberAtStart = -1;
  private provenBlockNumberAtStart = -1;

  private synchedBlockHashes: AztecMap<number, string>;
  private synchedLatestBlockNumber: AztecSingleton<number>;
  private synchedProvenBlockNumber: AztecSingleton<number>;

  private blockStream;

  private slashEvents: SlashEvent[] = [];

  protected slashFactoryContract?: GetContractReturnType<typeof SlashFactoryAbi, PublicClient<HttpTransport, Chain>> =
    undefined;

  // The amount to slash for a prune.
  // Note that we set it to 0, such that no actual slashing will happen, but the event will be fired,
  // showing that the slashing mechanism is working.
  private slashingAmount: bigint = 0n;

  constructor(
    private config: SlasherConfig & L1ContractsConfig & L1ReaderConfig,
    private store: AztecKVStore,
    private l2BlockSource: L2BlockSource,
    telemetry: TelemetryClient = new NoopTelemetryClient(),
    private log = createLogger('slasher'),
  ) {
    super(telemetry, 'slasher');

    this.blockStream = new L2BlockStream(l2BlockSource, this, this, createLogger('slasher:block_stream'), {
      batchSize: config.blockRequestBatchSize,
      pollIntervalMS: config.blockCheckIntervalMS,
    });

    this.synchedBlockHashes = store.openMap('slasher_block_hashes');
    this.synchedLatestBlockNumber = store.openSingleton('slasher_last_l2_block');
    this.synchedProvenBlockNumber = store.openSingleton('slasher_last_proven_l2_block');

    if (config.l1Contracts.slashFactoryAddress && config.l1Contracts.slashFactoryAddress !== EthAddress.ZERO) {
      const chain = createEthereumChain(config.l1RpcUrl, config.l1ChainId);
      const publicClient = createPublicClient({
        chain: chain.chainInfo,
        transport: http(chain.rpcUrl),
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

  // This is where we should put a bunch of the improvements mentioned earlier.
  public async getSlashPayload(slotNumber: bigint): Promise<EthAddress | undefined> {
    if (!this.slashFactoryContract) {
      return undefined;
    }

    // As long as the slot is greater than the lifetime, we want to keep deleting the first element
    // since it will not make sense to include anymore.
    while (this.slashEvents.length > 0 && this.slashEvents[0].lifetime < slotNumber) {
      this.slashEvents.shift();
    }

    if (this.slashEvents.length == 0) {
      return undefined;
    }

    const slashEvent = this.slashEvents[0];

    const [payloadAddress, isDeployed] = await this.slashFactoryContract.read.getAddressAndIsDeployed([
      slashEvent.epoch,
      slashEvent.amount,
    ]);

    if (!isDeployed) {
      // The proposal cannot be executed until it is deployed
      this.log.verbose(`Voting on not yet deployed payload: ${payloadAddress}`);
    }

    return EthAddress.fromString(payloadAddress);
  }

  public getL2BlockHash(number: number): Promise<string | undefined> {
    return Promise.resolve(this.synchedBlockHashes.get(number));
  }

  public getL2Tips(): Promise<L2Tips> {
    const latestBlockNumber = this.getSyncedLatestBlockNum();
    let latestBlockHash: string | undefined;
    const provenBlockNumber = this.getSyncedProvenBlockNum();
    let provenBlockHash: string | undefined;

    if (latestBlockNumber > 0) {
      latestBlockHash = this.synchedBlockHashes.get(latestBlockNumber);
      if (typeof latestBlockHash === 'undefined') {
        this.log.warn(`Block hash for latest block ${latestBlockNumber} not found`);
        throw new Error();
      }
    }

    if (provenBlockNumber > 0) {
      provenBlockHash = this.synchedBlockHashes.get(provenBlockNumber);
      if (typeof provenBlockHash === 'undefined') {
        this.log.warn(`Block hash for proven block ${provenBlockNumber} not found`);
        throw new Error();
      }
    }

    return Promise.resolve({
      latest: { hash: latestBlockHash!, number: latestBlockNumber },
      proven: { hash: provenBlockHash!, number: provenBlockNumber },
      finalized: { hash: provenBlockHash!, number: provenBlockNumber },
    });
  }

  public async handleBlockStreamEvent(event: L2BlockStreamEvent): Promise<void> {
    this.log.debug(`Handling block stream event ${event.type}`);
    switch (event.type) {
      case 'blocks-added':
        await this.handleLatestL2Blocks(event.blocks);
        break;
      case 'chain-finalized':
        // TODO (alexg): I think we can prune the block hashes map here
        break;
      case 'chain-proven': {
        const from = this.getSyncedProvenBlockNum() + 1;
        const limit = event.blockNumber - from + 1;
        await this.handleProvenL2Blocks(await this.l2BlockSource.getBlocks(from, limit));
        break;
      }
      case 'chain-pruned':
        await this.handlePruneL2Blocks(event.blockNumber);
        break;
      default: {
        const _: never = event;
        break;
      }
    }
  }

  public async start() {
    if (this.currentState === SlasherClientState.STOPPED) {
      throw new Error('Slasher already stopped');
    }
    if (this.currentState !== SlasherClientState.IDLE) {
      return this.syncPromise;
    }

    // get the current latest block numbers
    this.latestBlockNumberAtStart = await this.l2BlockSource.getBlockNumber();
    this.provenBlockNumberAtStart = await this.l2BlockSource.getProvenBlockNumber();

    const syncedLatestBlock = this.getSyncedLatestBlockNum() + 1;
    const syncedProvenBlock = this.getSyncedProvenBlockNum() + 1;

    // if there are blocks to be retrieved, go to a synching state
    if (syncedLatestBlock <= this.latestBlockNumberAtStart || syncedProvenBlock <= this.provenBlockNumberAtStart) {
      this.setCurrentState(SlasherClientState.SYNCHING);
      this.syncPromise = new Promise(resolve => {
        this.syncResolve = resolve;
      });
      this.log.verbose(`Starting sync from ${syncedLatestBlock} (last proven ${syncedProvenBlock})`);
    } else {
      // if no blocks to be retrieved, go straight to running
      this.setCurrentState(SlasherClientState.RUNNING);
      this.syncPromise = Promise.resolve();
      this.log.verbose(`Block ${syncedLatestBlock} (proven ${syncedProvenBlock}) already beyond current block`);
    }

    this.blockStream.start();
    this.log.verbose(`Started block downloader from block ${syncedLatestBlock}`);

    return this.syncPromise;
  }

  /**
   * Allows consumers to stop the instance of the slasher client.
   * 'ready' will now return 'false' and the running promise that keeps the client synced is interrupted.
   */
  public async stop() {
    this.log.debug('Stopping Slasher client...');
    await this.blockStream.stop();
    this.log.debug('Stopped block downloader');
    this.setCurrentState(SlasherClientState.STOPPED);
    this.log.info('Slasher client stopped.');
  }

  /**
   * Public function to check if the slasher client is fully synced and ready to receive txs.
   * @returns True if the slasher client is ready to receive txs.
   */
  public isReady() {
    return this.currentState === SlasherClientState.RUNNING;
  }

  /**
   * Public function to check the latest block number that the slasher client is synced to.
   * @returns Block number of latest L2 Block we've synced with.
   */
  public getSyncedLatestBlockNum() {
    return this.synchedLatestBlockNumber.get() ?? INITIAL_L2_BLOCK_NUM - 1;
  }

  /**
   * Public function to check the latest proven block number that the slasher client is synced to.
   * @returns Block number of latest proven L2 Block we've synced with.
   */
  public getSyncedProvenBlockNum() {
    return this.synchedProvenBlockNumber.get() ?? INITIAL_L2_BLOCK_NUM - 1;
  }

  /**
   * Method to check the status of the slasher client.
   * @returns Information about slasher client status: state & syncedToBlockNum.
   */
  public async getStatus(): Promise<SlasherSyncState> {
    const blockNumber = this.getSyncedLatestBlockNum();
    const blockHash =
      blockNumber == 0
        ? ''
        : await this.l2BlockSource.getBlockHeader(blockNumber).then(header => header?.hash().toString());
    return Promise.resolve({
      state: this.currentState,
      syncedToL2Block: { number: blockNumber, hash: blockHash },
    } as SlasherSyncState);
  }

  /**
   * Handles new blocks
   * @param blocks - A list of blocks that the slasher client needs to store block hashes for
   * @returns Empty promise.
   */
  private async handleLatestL2Blocks(blocks: L2Block[]): Promise<void> {
    if (!blocks.length) {
      return Promise.resolve();
    }

    const lastBlockNum = blocks[blocks.length - 1].number;
    await Promise.all(blocks.map(block => this.synchedBlockHashes.set(block.number, block.hash().toString())));
    await this.synchedLatestBlockNumber.set(lastBlockNum);
    this.log.debug(`Synched to latest block ${lastBlockNum}`);
    this.startServiceIfSynched();
  }

  /**
   * Handles new proven blocks by updating the proven block number
   * @param blocks - A list of proven L2 blocks.
   * @returns Empty promise.
   */
  private async handleProvenL2Blocks(blocks: L2Block[]): Promise<void> {
    if (!blocks.length) {
      return Promise.resolve();
    }
    const lastBlockNum = blocks[blocks.length - 1].number;
    await this.synchedProvenBlockNumber.set(lastBlockNum);
    this.log.debug(`Synched to proven block ${lastBlockNum}`);

    this.startServiceIfSynched();
  }

  private async handlePruneL2Blocks(latestBlock: number): Promise<void> {
    const blockHeader = await this.l2BlockSource.getBlockHeader(latestBlock);
    const slotNumber = blockHeader ? blockHeader.globalVariables.slotNumber.toBigInt() : BigInt(0);
    const epochNumber = slotNumber / BigInt(this.config.aztecEpochDuration);
    this.log.info(`Detected chain prune. Punishing the validators at epoch ${epochNumber}`);

    // Set the lifetime such that we have a full round that we could vote throughout.
    const slotsIntoRound = slotNumber % BigInt(this.config.slashingRoundSize);
    const toNext = slotsIntoRound == 0n ? 0n : BigInt(this.config.slashingRoundSize) - slotsIntoRound;

    const lifetime = slotNumber + toNext + BigInt(this.config.slashingRoundSize);

    this.slashEvents.push({
      epoch: epochNumber,
      amount: this.slashingAmount,
      lifetime,
    });

    await this.synchedLatestBlockNumber.set(latestBlock);
  }

  private startServiceIfSynched() {
    if (
      this.currentState === SlasherClientState.SYNCHING &&
      this.getSyncedLatestBlockNum() >= this.latestBlockNumberAtStart &&
      this.getSyncedProvenBlockNum() >= this.provenBlockNumberAtStart
    ) {
      this.log.debug(`Synched to blocks at start`);
      this.setCurrentState(SlasherClientState.RUNNING);
      if (this.syncResolve !== undefined) {
        this.syncResolve();
      }
    }
  }

  /**
   * Method to set the value of the current state.
   * @param newState - New state value.
   */
  private setCurrentState(newState: SlasherClientState) {
    this.currentState = newState;
    this.log.debug(`Moved to state ${SlasherClientState[this.currentState]}`);
  }
}
