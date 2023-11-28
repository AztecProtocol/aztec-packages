import { Archiver } from '@aztec/archiver';
import {
  CONTRACT_TREE_HEIGHT,
  Fr,
  GlobalVariables,
  HISTORIC_BLOCKS_TREE_HEIGHT,
  HistoricBlockData,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { computePublicDataTreeIndex } from '@aztec/circuits.js/abis';
import { L1ContractAddresses, createEthereumChain } from '@aztec/ethereum';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { createDebugLogger } from '@aztec/foundation/log';
import { InMemoryTxPool, P2P, createP2PClient } from '@aztec/p2p';
import {
  GlobalVariableBuilder,
  PublicProcessorFactory,
  SequencerClient,
  getGlobalVariableBuilder,
} from '@aztec/sequencer-client';
import {
  AztecNode,
  ContractData,
  ContractDataSource,
  ExtendedContractData,
  GetUnencryptedLogsResponse,
  L1ToL2MessageAndIndex,
  L1ToL2MessageSource,
  L2Block,
  L2BlockL2Logs,
  L2BlockSource,
  L2LogsSource,
  L2Tx,
  LogFilter,
  LogType,
  LowNullifierWitness,
  MerkleTreeId,
  SequencerConfig,
  SiblingPath,
  Tx,
  TxHash,
} from '@aztec/types';
import {
  MerkleTrees,
  ServerWorldStateSynchronizer,
  WorldStateConfig,
  WorldStateSynchronizer,
  getConfigEnvVars as getWorldStateConfig,
} from '@aztec/world-state';

import levelup from 'levelup';

import { AztecNodeConfig } from './config.js';
import { openDb } from './db.js';

/**
 * The aztec node.
 */
export class AztecNodeService implements AztecNode {
  constructor(
    protected readonly config: AztecNodeConfig,
    protected readonly p2pClient: P2P,
    protected readonly blockSource: L2BlockSource,
    protected readonly encryptedLogsSource: L2LogsSource,
    protected readonly unencryptedLogsSource: L2LogsSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly worldStateSynchronizer: WorldStateSynchronizer,
    protected readonly sequencer: SequencerClient | undefined,
    protected readonly chainId: number,
    protected readonly version: number,
    protected readonly globalVariableBuilder: GlobalVariableBuilder,
    protected readonly merkleTreesDb: levelup.LevelUp,
    private log = createDebugLogger('aztec:node'),
  ) {
    const message =
      `Started Aztec Node against chain 0x${chainId.toString(16)} with contracts - \n` +
      `Rollup: ${config.l1Contracts.rollupAddress.toString()}\n` +
      `Registry: ${config.l1Contracts.registryAddress.toString()}\n` +
      `Inbox: ${config.l1Contracts.inboxAddress.toString()}\n` +
      `Outbox: ${config.l1Contracts.outboxAddress.toString()}\n` +
      `Contract Emitter: ${config.l1Contracts.contractDeploymentEmitterAddress.toString()}`;
    this.log(message);
  }

  /**
   * initializes the Aztec Node, wait for component to sync.
   * @param config - The configuration to be used by the aztec node.
   * @returns - A fully synced Aztec Node for use in development/testing.
   */
  public static async createAndSync(config: AztecNodeConfig) {
    const ethereumChain = createEthereumChain(config.rpcUrl, config.apiKey);
    //validate that the actual chain id matches that specified in configuration
    if (config.chainId !== ethereumChain.chainInfo.id) {
      throw new Error(
        `RPC URL configured for chain id ${ethereumChain.chainInfo.id} but expected id ${config.chainId}`,
      );
    }
    // first create and sync the archiver
    const archiver = await Archiver.createAndSync(config);

    // we identify the P2P transaction protocol by using the rollup contract address.
    // this may well change in future
    config.transactionProtocol = `/aztec/tx/${config.l1Contracts.rollupAddress.toString()}`;

    // create the tx pool and the p2p client, which will need the l2 block source
    const p2pClient = await createP2PClient(config, new InMemoryTxPool(), archiver);

    // now create the merkle trees and the world state synchronizer
    const db = await openDb(config);
    const merkleTrees = await MerkleTrees.new(db);
    const worldStateConfig: WorldStateConfig = getWorldStateConfig();
    const worldStateSynchronizer = await ServerWorldStateSynchronizer.new(db, merkleTrees, archiver, worldStateConfig);

    // start both and wait for them to sync from the block source
    await Promise.all([p2pClient.start(), worldStateSynchronizer.start()]);

    // now create the sequencer
    const sequencer = config.disableSequencer
      ? undefined
      : await SequencerClient.new(config, p2pClient, worldStateSynchronizer, archiver, archiver, archiver);

    return new AztecNodeService(
      config,
      p2pClient,
      archiver,
      archiver,
      archiver,
      archiver,
      archiver,
      worldStateSynchronizer,
      sequencer,
      ethereumChain.chainInfo.id,
      config.version,
      getGlobalVariableBuilder(config),
      db,
    );
  }

  /**
   * Returns the sequencer client instance.
   * @returns The sequencer client instance.
   */
  public getSequencer(): SequencerClient | undefined {
    return this.sequencer;
  }

  /**
   * Method to return the currently deployed L1 contract addresses.
   * @returns - The currently deployed L1 contract addresses.
   */
  public getL1ContractAddresses(): Promise<L1ContractAddresses> {
    return Promise.resolve(this.config.l1Contracts);
  }

  /**
   * Method to determine if the node is ready to accept transactions.
   * @returns - Flag indicating the readiness for tx submission.
   */
  public async isReady() {
    return (await this.p2pClient.isReady()) ?? false;
  }

  /**
   * Get the a given block.
   * @param number - The block number being requested.
   * @returns The blocks requested.
   */
  public async getBlock(number: number): Promise<L2Block | undefined> {
    return await this.blockSource.getBlock(number);
  }

  /**
   * Method to request blocks. Will attempt to return all requested blocks but will return only those available.
   * @param from - The start of the range of blocks to return.
   * @param limit - The maximum number of blocks to obtain.
   * @returns The blocks requested.
   */
  public async getBlocks(from: number, limit: number): Promise<L2Block[]> {
    return (await this.blockSource.getBlocks(from, limit)) ?? [];
  }

  /**
   * Method to fetch the current block number.
   * @returns The block number.
   */
  public async getBlockNumber(): Promise<number> {
    return await this.blockSource.getBlockNumber();
  }

  /**
   * Method to fetch the version of the rollup the node is connected to.
   * @returns The rollup version.
   */
  public getVersion(): Promise<number> {
    return Promise.resolve(this.version);
  }

  /**
   * Method to fetch the chain id of the base-layer for the rollup.
   * @returns The chain id.
   */
  public getChainId(): Promise<number> {
    return Promise.resolve(this.chainId);
  }

  /**
   * Get the extended contract data for this contract.
   * @param contractAddress - The contract data address.
   * @returns The extended contract data or undefined if not found.
   */
  async getExtendedContractData(contractAddress: AztecAddress): Promise<ExtendedContractData | undefined> {
    return await this.contractDataSource.getExtendedContractData(contractAddress);
  }

  /**
   * Lookup the contract data for this contract.
   * Contains the ethereum portal address .
   * @param contractAddress - The contract data address.
   * @returns The contract's address & portal address.
   */
  public async getContractData(contractAddress: AztecAddress): Promise<ContractData | undefined> {
    return await this.contractDataSource.getContractData(contractAddress);
  }

  /**
   * Gets up to `limit` amount of logs starting from `from`.
   * @param from - Number of the L2 block to which corresponds the first logs to be returned.
   * @param limit - The maximum number of logs to return.
   * @param logType - Specifies whether to return encrypted or unencrypted logs.
   * @returns The requested logs.
   */
  public getLogs(from: number, limit: number, logType: LogType): Promise<L2BlockL2Logs[]> {
    const logSource = logType === LogType.ENCRYPTED ? this.encryptedLogsSource : this.unencryptedLogsSource;
    return logSource.getLogs(from, limit, logType);
  }

  /**
   * Gets unencrypted logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    return this.unencryptedLogsSource.getUnencryptedLogs(filter);
  }

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   */
  public async sendTx(tx: Tx) {
    this.log.info(`Received tx ${await tx.getTxHash()}`);
    await this.p2pClient!.sendTx(tx);
  }

  public getTx(txHash: TxHash): Promise<L2Tx | undefined> {
    return this.blockSource.getL2Tx(txHash);
  }

  /**
   * Method to stop the aztec node.
   */
  public async stop() {
    this.log.info(`Stopping`);
    await this.sequencer?.stop();
    await this.p2pClient.stop();
    await this.worldStateSynchronizer.stop();
    await this.blockSource.stop();
    this.log.info(`Stopped`);
  }

  /**
   * Method to retrieve pending txs.
   * @returns - The pending txs.
   */
  public async getPendingTxs() {
    return await this.p2pClient!.getTxs();
  }

  /**
   * Method to retrieve a single pending tx.
   * @param txHash - The transaction hash to return.
   * @returns - The pending tx if it exists.
   */
  public async getPendingTxByHash(txHash: TxHash) {
    return await this.p2pClient!.getTxByHash(txHash);
  }

  /**
   * Find the index of the given leaf in the given tree.
   * @param treeId - The tree to search in.
   * @param leafValue - The value to search for
   * @returns The index of the given leaf in the given tree or undefined if not found.
   */
  public async findLeafIndex(treeId: MerkleTreeId, leafValue: Fr): Promise<bigint | undefined> {
    const committedDb = await this.#getWorldState();
    return committedDb.findLeafIndex(treeId, leafValue.toBuffer());
  }

  /**
   * Returns the sibling path for the given index in the contract tree.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  public async getContractSiblingPath(leafIndex: bigint): Promise<SiblingPath<typeof CONTRACT_TREE_HEIGHT>> {
    const committedDb = await this.#getWorldState();
    return committedDb.getSiblingPath(MerkleTreeId.CONTRACT_TREE, leafIndex);
  }

  /**
   * Returns the sibling path for the given index in the data tree.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  public async getNoteHashSiblingPath(leafIndex: bigint): Promise<SiblingPath<typeof NOTE_HASH_TREE_HEIGHT>> {
    const committedDb = await this.#getWorldState();
    return committedDb.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex);
  }

  /**
   * Gets a confirmed/consumed L1 to L2 message for the given message key
   * and its index in the merkle tree.
   * @param messageKey - The message key.
   * @returns The map containing the message and index.
   */
  public async getL1ToL2MessageAndIndex(messageKey: Fr): Promise<L1ToL2MessageAndIndex> {
    // todo: #697 - make this one lookup.
    const index = (await this.findLeafIndex(MerkleTreeId.L1_TO_L2_MESSAGES_TREE, messageKey))!;
    const message = await this.l1ToL2MessageSource.getConfirmedL1ToL2Message(messageKey);
    return Promise.resolve(new L1ToL2MessageAndIndex(index, message));
  }

  /**
   * Returns the sibling path for a leaf in the committed l1 to l2 data tree.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  public async getL1ToL2MessageSiblingPath(leafIndex: bigint): Promise<SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    const committedDb = await this.#getWorldState();
    return committedDb.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGES_TREE, leafIndex);
  }

  /**
   * Returns the sibling path for a leaf in the committed historic blocks tree.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  public async getHistoricBlocksTreeSiblingPath(
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof HISTORIC_BLOCKS_TREE_HEIGHT>> {
    const committedDb = await this.#getWorldState();
    return committedDb.getSiblingPath(MerkleTreeId.BLOCKS_TREE, leafIndex);
  }

  /**
   * Returns a low nullifier witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param nullifier - Nullifier we try to find the low nullifier index for.
   * @returns The low nullifier witness.
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   */
  public async getLowNullifierWitness(blockNumber: number, nullifier: Fr): Promise<LowNullifierWitness | undefined> {
    const committedDb = await this.#getWorldState();
    const { index } = await committedDb.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    const leafData = await committedDb.getLeafData(MerkleTreeId.NULLIFIER_TREE, index);
    if (!leafData) {
      return undefined;
    }
    const siblingPath = await committedDb.getSiblingPath<typeof NULLIFIER_TREE_HEIGHT>(
      MerkleTreeId.NULLIFIER_TREE,
      BigInt(index),
    );
    return new LowNullifierWitness(BigInt(index), leafData, siblingPath);
  }

  /**
   * Gets the storage value at the given contract storage slot.
   *
   * @remarks The storage slot here refers to the slot as it is defined in Noir not the index in the merkle tree.
   * Aztec's version of `eth_getStorageAt`.
   *
   * @param contract - Address of the contract to query.
   * @param slot - Slot to query.
   * @returns Storage value at the given contract slot (or undefined if not found).
   */
  public async getPublicStorageAt(contract: AztecAddress, slot: Fr): Promise<Fr | undefined> {
    const committedDb = await this.#getWorldState();
    const leafIndex = computePublicDataTreeIndex(contract, slot);
    const value = await committedDb.getLeafValue(MerkleTreeId.PUBLIC_DATA_TREE, leafIndex.value);
    return value ? Fr.fromBuffer(value) : undefined;
  }

  /**
   * Returns the current committed roots for the data trees.
   * @returns The current committed roots for the data trees.
   */
  public async getTreeRoots(): Promise<Record<MerkleTreeId, Fr>> {
    const committedDb = await this.#getWorldState();
    const getTreeRoot = async (id: MerkleTreeId) => Fr.fromBuffer((await committedDb.getTreeInfo(id)).root);

    const [noteHashTree, nullifierTree, contractTree, l1ToL2MessagesTree, blocksTree, publicDataTree] =
      await Promise.all([
        getTreeRoot(MerkleTreeId.NOTE_HASH_TREE),
        getTreeRoot(MerkleTreeId.NULLIFIER_TREE),
        getTreeRoot(MerkleTreeId.CONTRACT_TREE),
        getTreeRoot(MerkleTreeId.L1_TO_L2_MESSAGES_TREE),
        getTreeRoot(MerkleTreeId.BLOCKS_TREE),
        getTreeRoot(MerkleTreeId.PUBLIC_DATA_TREE),
      ]);

    return {
      [MerkleTreeId.CONTRACT_TREE]: contractTree,
      [MerkleTreeId.NOTE_HASH_TREE]: noteHashTree,
      [MerkleTreeId.NULLIFIER_TREE]: nullifierTree,
      [MerkleTreeId.PUBLIC_DATA_TREE]: publicDataTree,
      [MerkleTreeId.L1_TO_L2_MESSAGES_TREE]: l1ToL2MessagesTree,
      [MerkleTreeId.BLOCKS_TREE]: blocksTree,
    };
  }

  /**
   * Returns the currently committed historic block data.
   * @returns The current committed block data.
   */
  public async getHistoricBlockData(): Promise<HistoricBlockData> {
    const committedDb = await this.#getWorldState();
    const [roots, globalsHash] = await Promise.all([this.getTreeRoots(), committedDb.getLatestGlobalVariablesHash()]);

    return new HistoricBlockData(
      roots[MerkleTreeId.NOTE_HASH_TREE],
      roots[MerkleTreeId.NULLIFIER_TREE],
      roots[MerkleTreeId.CONTRACT_TREE],
      roots[MerkleTreeId.L1_TO_L2_MESSAGES_TREE],
      roots[MerkleTreeId.BLOCKS_TREE],
      Fr.ZERO,
      roots[MerkleTreeId.PUBLIC_DATA_TREE],
      globalsHash,
    );
  }

  /**
   * Simulates the public part of a transaction with the current state.
   * @param tx - The transaction to simulate.
   **/
  public async simulatePublicCalls(tx: Tx) {
    this.log.info(`Simulating tx ${await tx.getTxHash()}`);
    const blockNumber = (await this.blockSource.getBlockNumber()) + 1;
    const newGlobalVariables = await this.globalVariableBuilder.buildGlobalVariables(new Fr(blockNumber));
    const prevGlobalVariables = (await this.blockSource.getBlock(-1))?.globalVariables ?? GlobalVariables.empty();

    // Instantiate merkle trees so uncommitted updates by this simulation are local to it.
    // TODO we should be able to remove this after https://github.com/AztecProtocol/aztec-packages/issues/1869
    // So simulation of public functions doesn't affect the merkle trees.
    const merkleTrees = new MerkleTrees(this.merkleTreesDb, this.log);
    await merkleTrees.init({
      globalVariables: prevGlobalVariables,
    });

    const publicProcessorFactory = new PublicProcessorFactory(
      merkleTrees.asLatest(),
      this.contractDataSource,
      this.l1ToL2MessageSource,
    );
    const processor = await publicProcessorFactory.create(prevGlobalVariables, newGlobalVariables);
    const [, failedTxs] = await processor.process([tx]);
    if (failedTxs.length) {
      throw failedTxs[0].error;
    }
    this.log.info(`Simulated tx ${await tx.getTxHash()} succeeds`);
  }

  public setConfig(config: Partial<SequencerConfig>): Promise<void> {
    this.sequencer?.updateSequencerConfig(config);
    return Promise.resolve();
  }

  /**
   * Returns an instance of MerkleTreeOperations having first ensured the world state is fully synched
   * @returns An instance of a committed MerkleTreeOperations
   */
  async #getWorldState() {
    try {
      // Attempt to sync the world state if necessary
      await this.#syncWorldState();
    } catch (err) {
      this.log.error(`Error getting world state: ${err}`);
    }
    return this.worldStateSynchronizer.getCommitted();
  }

  /**
   * Ensure we fully sync the world state
   * @returns A promise that fulfils once the world state is synced
   */
  async #syncWorldState() {
    const blockSourceHeight = await this.blockSource.getBlockNumber();
    await this.worldStateSynchronizer.syncImmediate(blockSourceHeight);
  }
}
