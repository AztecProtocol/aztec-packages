import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { RunningPromise } from '@aztec/foundation/running-promise';
import { P2P } from '@aztec/p2p';
import {
  ContractData,
  ContractPublicData,
  L1ToL2MessageSource,
  L2Block,
  L2BlockSource,
  MerkleTreeId,
  Tx,
} from '@aztec/types';
import { WorldStateStatus, WorldStateSynchroniser } from '@aztec/world-state';
import times from 'lodash.times';
import { BlockBuilder } from '../block_builder/index.js';
import { L1Publisher } from '../publisher/l1-publisher.js';
import { ceilPowerOfTwo } from '../utils.js';
import { SequencerConfig } from './config.js';
import { ProcessedTx } from './processed_tx.js';
import { PublicProcessorFactory } from './public_processor.js';
import { GlobalVariables } from '@aztec/circuits.js';
import { GlobalVariableBuilder } from '../global_variable_builder/global_builder.js';

/**
 * Sequencer client
 * - Wins a period of time to become the sequencer (depending on finalised protocol).
 * - Chooses a set of txs from the tx pool to be in the rollup.
 * - Simulate the rollup of txs.
 * - Adds proof requests to the request pool (not for this milestone).
 * - Receives results to those proofs from the network (repeats as necessary) (not for this milestone).
 * - Publishes L1 tx(s) to the rollup contract via RollupPublisher.
 */
export class Sequencer {
  private runningPromise?: RunningPromise;
  private pollingIntervalMs: number;
  private maxTxsPerBlock = 32;
  private minTxsPerBLock = 1;
  private lastPublishedBlock = 0;
  private state = SequencerState.STOPPED;
  private chainId: Fr;
  private version: Fr;

  constructor(
    private publisher: L1Publisher,
    private globalsBuilder: GlobalVariableBuilder,
    private p2pClient: P2P,
    private worldState: WorldStateSynchroniser,
    private blockBuilder: BlockBuilder,
    private l2BlockSource: L2BlockSource,
    private l1ToL2MessageSource: L1ToL2MessageSource,
    private publicProcessorFactory: PublicProcessorFactory,
    config: SequencerConfig,
    private log = createDebugLogger('aztec:sequencer'),
  ) {
    this.pollingIntervalMs = config.transactionPollingInterval ?? 1_000;
    if (config.maxTxsPerBlock) {
      this.maxTxsPerBlock = config.maxTxsPerBlock;
    }
    if (config.minTxsPerBlock) {
      this.minTxsPerBLock = config.minTxsPerBlock;
    }
    this.chainId = new Fr(config.chainId);
    this.version = new Fr(config.version);
  }

  /**
   * Starts the sequencer and moves to IDLE state. Blocks until the initial sync is complete.
   */
  public async start() {
    await this.initialSync();

    this.runningPromise = new RunningPromise(this.work.bind(this), this.pollingIntervalMs);
    this.runningPromise.start();
    this.state = SequencerState.IDLE;
    this.log('Sequencer started');
  }

  /**
   * Stops the sequencer from processing txs and moves to STOPPED state.
   */
  public async stop(): Promise<void> {
    await this.runningPromise?.stop();
    this.publisher.interrupt();
    this.state = SequencerState.STOPPED;
    this.log('Stopped sequencer');
  }

  /**
   * Starts a previously stopped sequencer.
   */
  public restart() {
    this.log('Restarting sequencer');
    this.runningPromise!.start();
    this.state = SequencerState.IDLE;
  }

  /**
   * Returns the current state of the sequencer.
   * @returns An object with a state entry with one of SequencerState.
   */
  public status() {
    return { state: this.state };
  }

  protected async initialSync() {
    // TODO: Should we wait for worldstate to be ready, or is the caller expected to run await start?
    this.lastPublishedBlock = await this.worldState.status().then((s: WorldStateStatus) => s.syncedToL2Block);
  }

  /**
   * Grabs up to maxTxsPerBlock from the p2p client, constructs a block, and pushes it to L1.
   */
  protected async work() {
    try {
      // Update state when the previous block has been synced
      const prevBlockSynced = await this.isBlockSynced();
      if (prevBlockSynced && this.state === SequencerState.PUBLISHING_BLOCK) {
        this.log(`Block has been synced`);
        this.state = SequencerState.IDLE;
      }

      // Do not go forward with new block if the previous one has not been mined and processed
      if (!prevBlockSynced) return;

      this.state = SequencerState.WAITING_FOR_TXS;

      // Get txs to build the new block
      const pendingTxs = await this.p2pClient.getTxs();
      if (pendingTxs.length < this.minTxsPerBLock) return;

      // Filter out invalid txs
      const validTxs = await this.takeValidTxs(pendingTxs);
      if (validTxs.length < this.minTxsPerBLock) {
        return;
      }

      this.log(`Processing ${validTxs.length} txs...`);
      this.state = SequencerState.CREATING_BLOCK;

      const blockNumber = (await this.l2BlockSource.getBlockHeight()) + 1;
      const globalVariables = await this.globalsBuilder.buildGlobalVariables(new Fr(blockNumber));

      // Process public txs and drop the ones that fail processing
      // We create a fresh processor each time to reset any cached state (eg storage writes)
      const processor = this.publicProcessorFactory.create();
      const [processedTxs, failedTxs] = await processor.process(validTxs, globalVariables);
      if (failedTxs.length > 0) {
        this.log(`Dropping failed txs ${(await Tx.getHashes(failedTxs)).join(', ')}`);
        await this.p2pClient.deleteTxs(await Tx.getHashes(failedTxs));
      }

      if (processedTxs.length === 0) {
        this.log('No txs processed correctly to build block. Exiting');
        return;
      }

      // Get l1 to l2 messages from the contract
      this.log('Requesting L1 to L2 messages from contract');
      const l1ToL2Messages = await this.getPendingL1ToL2Messages();
      this.log('Successfully retrieved L1 to L2 messages from contract');

      // Build the new block by running the rollup circuits
      this.log(`Assembling block with txs ${processedTxs.map(tx => tx.hash).join(', ')}`);
      const emptyTx = await processor.makeEmptyProcessedTx(this.chainId, this.version);

      const block = await this.buildBlock(processedTxs, l1ToL2Messages, emptyTx, globalVariables);
      this.log(`Assembled block ${block.number}`);

      await this.publishContractPublicData(validTxs, block);

      await this.publishL2Block(block);
    } catch (err) {
      this.log(err);
      this.log(`Rolling back world state DB`);
      await this.worldState.getLatest().rollback();
    }
  }

  /**
   * Gets new contract public data from the txs and publishes it on chain.
   * @param validTxs - The set of real transactions being published as part of the block.
   * @param block - The L2Block to be published.
   */
  protected async publishContractPublicData(validTxs: Tx[], block: L2Block) {
    // Publishes new encrypted logs & contract data for private txs to the network and awaits the tx to be mined
    this.state = SequencerState.PUBLISHING_CONTRACT_DATA;
    const newContractData = validTxs
      .map(tx => {
        // Currently can only have 1 new contract per tx
        const newContract = tx.data?.end.newContracts[0];
        if (newContract && tx.newContractPublicFunctions?.length) {
          return new ContractPublicData(
            new ContractData(newContract.contractAddress, newContract.portalContractAddress),
            tx.newContractPublicFunctions,
          );
        }
      })
      .filter((cd): cd is Exclude<typeof cd, undefined> => cd !== undefined);

    const blockHash = block.getCalldataHash();
    this.log(`Publishing contract public data with block hash ${blockHash.toString('hex')}`);

    const publishedContractData = await this.publisher.processNewContractData(block.number, blockHash, newContractData);
    if (publishedContractData) {
      this.log(`Successfully published new contract data for block ${block.number}`);
    } else if (!publishedContractData && newContractData.length) {
      this.log(`Failed to publish new contract data for block ${block.number}`);
    }
  }

  /**
   * Publishes the L2Block to the rollup contract.
   * @param block - The L2Block to be published.
   */
  protected async publishL2Block(block: L2Block) {
    // Publishes new block to the network and awaits the tx to be mined
    this.state = SequencerState.PUBLISHING_BLOCK;
    const publishedL2Block = await this.publisher.processL2Block(block);
    if (publishedL2Block) {
      this.log(`Successfully published block ${block.number}`);
      this.lastPublishedBlock = block.number;
    } else {
      throw new Error(`Failed to publish block`);
    }
  }

  // TODO: It should be responsibility of the P2P layer to validate txs before passing them on here
  protected async takeValidTxs(txs: Tx[]) {
    const validTxs = [];
    const doubleSpendTxs = [];

    // Process txs until we get to maxTxsPerBlock, rejecting double spends in the process
    for (const tx of txs) {
      // TODO(AD) - eventually we should add a limit to how many transactions we
      // skip in this manner and do something more DDOS-proof (like letting the transaction fail and pay a fee).
      if (await this.isTxDoubleSpend(tx)) {
        this.log(`Deleting double spend tx ${await tx.getTxHash()}`);
        doubleSpendTxs.push(tx);
        continue;
      }

      validTxs.push(tx);
      if (validTxs.length >= this.maxTxsPerBlock) {
        break;
      }
    }

    // Make sure we remove these from the tx pool so we do not consider it again
    if (doubleSpendTxs.length > 0) {
      await this.p2pClient.deleteTxs(await Tx.getHashes([...doubleSpendTxs]));
    }

    return validTxs;
  }

  /**
   * Returns whether the previous block sent has been mined, and all dependencies have caught up with it.
   * @returns Boolean indicating if our dependencies are synced to the latest block.
   */
  protected async isBlockSynced() {
    const syncedBlocks = await Promise.all([
      this.worldState.status().then((s: WorldStateStatus) => s.syncedToL2Block),
      this.p2pClient.getStatus().then(s => s.syncedToL2Block),
    ]);
    const min = Math.min(...syncedBlocks);
    return min >= this.lastPublishedBlock;
  }

  /**
   * Pads the set of txs to a power of two and assembles a block by calling the block builder.
   * @param txs - Processed txs to include in the next block.
   * @param newL1ToL2Messages - L1 to L2 messages to be part of the block.
   * @param emptyTx - Empty tx to repeat at the end of the block to pad to a power of two.
   * @param globalVariables - Global variables to use in the block.
   * @returns The new block.
   */
  protected async buildBlock(
    txs: ProcessedTx[],
    newL1ToL2Messages: Fr[],
    emptyTx: ProcessedTx,
    globalVariables: GlobalVariables,
  ) {
    // Pad the txs array with empty txs to be a power of two, at least 4
    const txsTargetSize = Math.max(ceilPowerOfTwo(txs.length), 4);
    const emptyTxCount = txsTargetSize - txs.length;

    const allTxs = [...txs, ...times(emptyTxCount, () => emptyTx)];
    this.log(`Building block ${globalVariables.blockNumber}`);

    const [block] = await this.blockBuilder.buildL2Block(globalVariables, allTxs, newL1ToL2Messages);
    return block;
  }

  /**
   * Calls the archiver to pull upto `NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP` message keys
   * (archiver returns the top messages sorted by fees)
   * @returns An array of L1 to L2 messages' messageKeys
   */
  protected async getPendingL1ToL2Messages(): Promise<Fr[]> {
    return await this.l1ToL2MessageSource.getPendingL1ToL2Messages();
  }

  /**
   * Returns true if one of the transaction nullifiers exist.
   * Nullifiers prevent double spends in a private context.
   * @param tx - The transaction.
   * @returns Whether this is a problematic double spend that the L1 contract would reject.
   */
  protected async isTxDoubleSpend(tx: Tx): Promise<boolean> {
    // eslint-disable-next-line @typescript-eslint/await-thenable
    for (const nullifier of tx.data.end.newNullifiers) {
      // Skip nullifier if it's empty
      if (nullifier.isZero()) continue;
      // TODO(AD): this is an exhaustive search currently
      if (
        (await this.worldState.getLatest().findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer())) !==
        undefined
      ) {
        // Our nullifier tree has this nullifier already - this transaction is a double spend / not well-formed
        return true;
      }
    }
    return false;
  }
}

/**
 * State of the sequencer.
 */
export enum SequencerState {
  /**
   * Will move to WAITING_FOR_TXS after a configured amount of time.
   */
  IDLE,
  /**
   * Polling the P2P module for txs to include in a block. Will move to CREATING_BLOCK if there are valid txs to include, or back to IDLE otherwise.
   */
  WAITING_FOR_TXS,
  /**
   * Creating a new L2 block. Includes processing public function calls and running rollup circuits. Will move to PUBLISHING_CONTRACT_DATA.
   */
  CREATING_BLOCK,
  /**
   * Sending the tx to L1 with encrypted logs and awaiting it to be mined. Will move back to PUBLISHING_BLOCK once finished.
   */
  PUBLISHING_CONTRACT_DATA,
  /**
   * Sending the tx to L1 with the L2 block data and awaiting it to be mined. Will move to IDLE.
   */
  PUBLISHING_BLOCK,
  /**
   * Sequencer is stopped and not processing any txs from the pool.
   */
  STOPPED,
}
