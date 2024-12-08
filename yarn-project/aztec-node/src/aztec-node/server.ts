import { createArchiver } from '@aztec/archiver';
import { BBCircuitVerifier, TestCircuitVerifier } from '@aztec/bb-prover';
import {
  type AztecNode,
  type ClientProtocolCircuitVerifier,
  type EpochProofQuote,
  type GetUnencryptedLogsResponse,
  type InBlock,
  type L1ToL2MessageSource,
  type L2Block,
  type L2BlockNumber,
  type L2BlockSource,
  type L2LogsSource,
  type LogFilter,
  MerkleTreeId,
  NullifierMembershipWitness,
  type NullifierWithBlockSource,
  type ProcessedTx,
  type ProverConfig,
  PublicDataWitness,
  PublicSimulationOutput,
  type SequencerConfig,
  type Service,
  SiblingPath,
  type Tx,
  type TxEffect,
  type TxHash,
  TxReceipt,
  type TxScopedL2Log,
  TxStatus,
  type TxValidator,
  type WorldStateSynchronizer,
  tryStop,
} from '@aztec/circuit-types';
import {
  type ARCHIVE_HEIGHT,
  type BlockHeader,
  type ContractClassPublic,
  type ContractDataSource,
  type ContractInstanceWithAddress,
  EthAddress,
  Fr,
  type GasFees,
  INITIAL_L2_BLOCK_NUM,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  type NOTE_HASH_TREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  type NodeInfo,
  type NullifierLeafPreimage,
  type PUBLIC_DATA_TREE_HEIGHT,
  type PrivateLog,
  type ProtocolContractAddresses,
  type PublicDataTreeLeafPreimage,
} from '@aztec/circuits.js';
import { computePublicDataTreeLeafSlot } from '@aztec/circuits.js/hash';
import { type L1ContractAddresses, createEthereumChain } from '@aztec/ethereum';
import { type ContractArtifact } from '@aztec/foundation/abi';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { padArrayEnd } from '@aztec/foundation/collection';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { Timer } from '@aztec/foundation/timer';
import { type AztecKVStore } from '@aztec/kv-store';
import { openTmpStore } from '@aztec/kv-store/utils';
import { SHA256Trunc, StandardTree, UnbalancedTree } from '@aztec/merkle-tree';
import {
  AggregateTxValidator,
  DataTxValidator,
  DoubleSpendTxValidator,
  MetadataTxValidator,
  type P2P,
  TxProofValidator,
  createP2PClient,
} from '@aztec/p2p';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { GlobalVariableBuilder, type L1Publisher, SequencerClient } from '@aztec/sequencer-client';
import { PublicProcessorFactory } from '@aztec/simulator';
import { type TelemetryClient } from '@aztec/telemetry-client';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { createValidatorClient } from '@aztec/validator-client';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { type AztecNodeConfig, getPackageInfo } from './config.js';
import { NodeMetrics } from './node_metrics.js';

/**
 * The aztec node.
 */
export class AztecNodeService implements AztecNode {
  private packageVersion: string;

  private metrics: NodeMetrics;

  constructor(
    protected config: AztecNodeConfig,
    protected readonly p2pClient: P2P,
    protected readonly blockSource: L2BlockSource & Partial<Service>,
    protected readonly logsSource: L2LogsSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly nullifierSource: NullifierWithBlockSource,
    protected readonly worldStateSynchronizer: WorldStateSynchronizer,
    protected readonly sequencer: SequencerClient | undefined,
    protected readonly l1ChainId: number,
    protected readonly version: number,
    protected readonly globalVariableBuilder: GlobalVariableBuilder,
    private proofVerifier: ClientProtocolCircuitVerifier,
    private telemetry: TelemetryClient,
    private log = createDebugLogger('aztec:node'),
  ) {
    this.packageVersion = getPackageInfo().version;
    this.metrics = new NodeMetrics(telemetry, 'AztecNodeService');

    const message =
      `Started Aztec Node against chain 0x${l1ChainId.toString(16)} with contracts - \n` +
      `Rollup: ${config.l1Contracts.rollupAddress.toString()}\n` +
      `Registry: ${config.l1Contracts.registryAddress.toString()}\n` +
      `Inbox: ${config.l1Contracts.inboxAddress.toString()}\n` +
      `Outbox: ${config.l1Contracts.outboxAddress.toString()}`;
    this.log.info(message);
  }

  public addEpochProofQuote(quote: EpochProofQuote): Promise<void> {
    return Promise.resolve(this.p2pClient.addEpochProofQuote(quote));
  }

  public getEpochProofQuotes(epoch: bigint): Promise<EpochProofQuote[]> {
    return this.p2pClient.getEpochProofQuotes(epoch);
  }

  public getL2Tips() {
    return this.blockSource.getL2Tips();
  }

  /**
   * initializes the Aztec Node, wait for component to sync.
   * @param config - The configuration to be used by the aztec node.
   * @returns - A fully synced Aztec Node for use in development/testing.
   */
  public static async createAndSync(
    config: AztecNodeConfig,
    deps: {
      telemetry?: TelemetryClient;
      logger?: DebugLogger;
      publisher?: L1Publisher;
    } = {},
  ): Promise<AztecNodeService> {
    const telemetry = deps.telemetry ?? new NoopTelemetryClient();
    const log = deps.logger ?? createDebugLogger('aztec:node');
    const ethereumChain = createEthereumChain(config.l1RpcUrl, config.l1ChainId);
    //validate that the actual chain id matches that specified in configuration
    if (config.l1ChainId !== ethereumChain.chainInfo.id) {
      throw new Error(
        `RPC URL configured for chain id ${ethereumChain.chainInfo.id} but expected id ${config.l1ChainId}`,
      );
    }

    const archiver = await createArchiver(config, telemetry, { blockUntilSync: true });

    // we identify the P2P transaction protocol by using the rollup contract address.
    // this may well change in future
    config.transactionProtocol = `/aztec/tx/${config.l1Contracts.rollupAddress.toString()}`;

    // now create the merkle trees and the world state synchronizer
    const worldStateSynchronizer = await createWorldStateSynchronizer(config, archiver, telemetry);
    const proofVerifier = config.realProofs ? await BBCircuitVerifier.new(config) : new TestCircuitVerifier();
    log.info(`Aztec node accepting ${config.realProofs ? 'real' : 'test'} proofs`);

    // create the tx pool and the p2p client, which will need the l2 block source
    const p2pClient = await createP2PClient(config, archiver, proofVerifier, worldStateSynchronizer, telemetry);

    // start both and wait for them to sync from the block source
    await Promise.all([p2pClient.start(), worldStateSynchronizer.start()]);

    const validatorClient = await createValidatorClient(config, config.l1Contracts.rollupAddress, p2pClient, telemetry);

    // now create the sequencer
    const sequencer = config.disableValidator
      ? undefined
      : await SequencerClient.new(config, {
          validatorClient,
          p2pClient,
          worldStateSynchronizer,
          contractDataSource: archiver,
          l2BlockSource: archiver,
          l1ToL2MessageSource: archiver,
          telemetry,
          ...deps,
        });

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
      new GlobalVariableBuilder(config),
      proofVerifier,
      telemetry,
      log,
    );
  }

  /**
   * Returns the sequencer client instance.
   * @returns The sequencer client instance.
   */
  public getSequencer(): SequencerClient | undefined {
    return this.sequencer;
  }

  public getBlockSource(): L2BlockSource {
    return this.blockSource;
  }

  /**
   * Method to return the currently deployed L1 contract addresses.
   * @returns - The currently deployed L1 contract addresses.
   */
  public getL1ContractAddresses(): Promise<L1ContractAddresses> {
    return Promise.resolve(this.config.l1Contracts);
  }

  public getEncodedEnr(): Promise<string | undefined> {
    return Promise.resolve(this.p2pClient.getEnr()?.encodeTxt());
  }

  /**
   * Method to determine if the node is ready to accept transactions.
   * @returns - Flag indicating the readiness for tx submission.
   */
  public isReady() {
    return Promise.resolve(this.p2pClient.isReady() ?? false);
  }

  public async getNodeInfo(): Promise<NodeInfo> {
    const [nodeVersion, protocolVersion, chainId, enr, contractAddresses, protocolContractAddresses] =
      await Promise.all([
        this.getNodeVersion(),
        this.getVersion(),
        this.getChainId(),
        this.getEncodedEnr(),
        this.getL1ContractAddresses(),
        this.getProtocolContractAddresses(),
      ]);

    const nodeInfo: NodeInfo = {
      nodeVersion,
      l1ChainId: chainId,
      protocolVersion,
      enr,
      l1ContractAddresses: contractAddresses,
      protocolContractAddresses: protocolContractAddresses,
    };

    return nodeInfo;
  }

  /**
   * Get a block specified by its number.
   * @param number - The block number being requested.
   * @returns The requested block.
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
   * Method to fetch the current base fees.
   * @returns The current base fees.
   */
  public async getCurrentBaseFees(): Promise<GasFees> {
    return await this.globalVariableBuilder.getCurrentBaseFees();
  }

  /**
   * Method to fetch the current block number.
   * @returns The block number.
   */
  public async getBlockNumber(): Promise<number> {
    return await this.blockSource.getBlockNumber();
  }

  public async getProvenBlockNumber(): Promise<number> {
    return await this.blockSource.getProvenBlockNumber();
  }

  /**
   * Method to fetch the version of the package.
   * @returns The node package version
   */
  public getNodeVersion(): Promise<string> {
    return Promise.resolve(this.packageVersion);
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
    return Promise.resolve(this.l1ChainId);
  }

  public getContractClass(id: Fr): Promise<ContractClassPublic | undefined> {
    return this.contractDataSource.getContractClass(id);
  }

  public getContract(address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    return this.contractDataSource.getContract(address);
  }

  /**
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `from`.
   * @param from - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  public getPrivateLogs(from: number, limit: number): Promise<PrivateLog[]> {
    return this.logsSource.getPrivateLogs(from, limit);
  }

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  public getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    return this.logsSource.getLogsByTags(tags);
  }

  /**
   * Gets unencrypted logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getUnencryptedLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    return this.logsSource.getUnencryptedLogs(filter);
  }

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    return this.logsSource.getContractClassLogs(filter);
  }

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   */
  public async sendTx(tx: Tx) {
    const timer = new Timer();
    this.log.info(`Received tx ${tx.getTxHash()}`);

    if (!(await this.isValidTx(tx))) {
      this.metrics.receivedTx(timer.ms(), false);
      return;
    }

    await this.p2pClient!.sendTx(tx);
    this.metrics.receivedTx(timer.ms(), true);
  }

  public async getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    let txReceipt = new TxReceipt(txHash, TxStatus.DROPPED, 'Tx dropped by P2P node.');

    // We first check if the tx is in pending (instead of first checking if it is mined) because if we first check
    // for mined and then for pending there could be a race condition where the tx is mined between the two checks
    // and we would incorrectly return a TxReceipt with status DROPPED
    if (this.p2pClient.getTxStatus(txHash) === 'pending') {
      txReceipt = new TxReceipt(txHash, TxStatus.PENDING, '');
    }

    const settledTxReceipt = await this.blockSource.getSettledTxReceipt(txHash);
    if (settledTxReceipt) {
      txReceipt = settledTxReceipt;
    }

    return txReceipt;
  }

  public getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined> {
    return this.blockSource.getTxEffect(txHash);
  }

  /**
   * Method to stop the aztec node.
   */
  public async stop() {
    this.log.info(`Stopping`);
    await this.sequencer?.stop();
    await this.p2pClient.stop();
    await this.worldStateSynchronizer.stop();
    await tryStop(this.blockSource);
    await this.telemetry.stop();
    this.log.info(`Stopped`);
  }

  /**
   * Method to retrieve pending txs.
   * @returns - The pending txs.
   */
  public getPendingTxs() {
    return Promise.resolve(this.p2pClient!.getTxs('pending'));
  }

  public getPendingTxCount() {
    return Promise.resolve(this.p2pClient!.getTxs('pending').length);
  }

  /**
   * Method to retrieve a single tx from the mempool or unfinalised chain.
   * @param txHash - The transaction hash to return.
   * @returns - The tx if it exists.
   */
  public getTxByHash(txHash: TxHash) {
    return Promise.resolve(this.p2pClient!.getTxByHashFromPool(txHash));
  }

  /**
   * Find the indexes of the given leaves in the given tree.
   * @param blockNumber - The block number at which to get the data or 'latest' for latest data
   * @param treeId - The tree to search in.
   * @param leafValue - The values to search for
   * @returns The indexes of the given leaves in the given tree or undefined if not found.
   */
  public async findLeavesIndexes(
    blockNumber: L2BlockNumber,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(bigint | undefined)[]> {
    const committedDb = await this.#getWorldState(blockNumber);
    return await Promise.all(leafValues.map(leafValue => committedDb.findLeafIndex(treeId, leafValue.toBuffer())));
  }

  /**
   * Find the block numbers of the given leaf indices in the given tree.
   * @param blockNumber - The block number at which to get the data or 'latest' for latest data
   * @param treeId - The tree to search in.
   * @param leafIndices - The values to search for
   * @returns The indexes of the given leaves in the given tree or undefined if not found.
   */
  public async findBlockNumbersForIndexes(
    blockNumber: L2BlockNumber,
    treeId: MerkleTreeId,
    leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]> {
    const committedDb = await this.#getWorldState(blockNumber);
    return await committedDb.getBlockNumbersForLeafIndices(treeId, leafIndices);
  }

  public async findNullifiersIndexesWithBlock(
    blockNumber: L2BlockNumber,
    nullifiers: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]> {
    if (blockNumber === 'latest') {
      blockNumber = await this.getBlockNumber();
    }
    return this.nullifierSource.findNullifiersIndexesWithBlock(blockNumber, nullifiers);
  }

  /**
   * Returns a sibling path for the given index in the nullifier tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  public async getNullifierSiblingPath(
    blockNumber: L2BlockNumber,
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof NULLIFIER_TREE_HEIGHT>> {
    const committedDb = await this.#getWorldState(blockNumber);
    return committedDb.getSiblingPath(MerkleTreeId.NULLIFIER_TREE, leafIndex);
  }

  /**
   * Returns a sibling path for the given index in the data tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  public async getNoteHashSiblingPath(
    blockNumber: L2BlockNumber,
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof NOTE_HASH_TREE_HEIGHT>> {
    const committedDb = await this.#getWorldState(blockNumber);
    return committedDb.getSiblingPath(MerkleTreeId.NOTE_HASH_TREE, leafIndex);
  }

  /**
   * Returns the index and a sibling path for a leaf in the committed l1 to l2 data tree.
   * @param blockNumber - The block number at which to get the data.
   * @param l1ToL2Message - The l1ToL2Message to get the index / sibling path for.
   * @returns A tuple of the index and the sibling path of the L1ToL2Message (undefined if not found).
   */
  public async getL1ToL2MessageMembershipWitness(
    blockNumber: L2BlockNumber,
    l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    const index = await this.l1ToL2MessageSource.getL1ToL2MessageIndex(l1ToL2Message);
    if (index === undefined) {
      return undefined;
    }
    const committedDb = await this.#getWorldState(blockNumber);
    const siblingPath = await committedDb.getSiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>(
      MerkleTreeId.L1_TO_L2_MESSAGE_TREE,
      index,
    );
    return [index, siblingPath];
  }

  /**
   * Returns whether an L1 to L2 message is synced by archiver and if it's ready to be included in a block.
   * @param l1ToL2Message - The L1 to L2 message to check.
   * @returns Whether the message is synced and ready to be included in a block.
   */
  public async isL1ToL2MessageSynced(l1ToL2Message: Fr): Promise<boolean> {
    return (await this.l1ToL2MessageSource.getL1ToL2MessageIndex(l1ToL2Message)) !== undefined;
  }

  /**
   * Returns the index of a l2ToL1Message in a ephemeral l2 to l1 data tree as well as its sibling path.
   * @remarks This tree is considered ephemeral because it is created on-demand by: taking all the l2ToL1 messages
   * in a single block, and then using them to make a variable depth append-only tree with these messages as leaves.
   * The tree is discarded immediately after calculating what we need from it.
   * TODO: Handle the case where two messages in the same tx have the same hash.
   * @param blockNumber - The block number at which to get the data.
   * @param l2ToL1Message - The l2ToL1Message get the index / sibling path for.
   * @returns A tuple of the index and the sibling path of the L2ToL1Message.
   */
  public async getL2ToL1MessageMembershipWitness(
    blockNumber: L2BlockNumber,
    l2ToL1Message: Fr,
  ): Promise<[bigint, SiblingPath<number>]> {
    const block = await this.blockSource.getBlock(blockNumber === 'latest' ? await this.getBlockNumber() : blockNumber);

    if (block === undefined) {
      throw new Error('Block is not defined');
    }

    const l2ToL1Messages = block.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs);

    // Find index of message
    let indexOfMsgInSubtree = -1;
    const indexOfMsgTx = l2ToL1Messages.findIndex(msgs => {
      const idx = msgs.findIndex(msg => msg.equals(l2ToL1Message));
      indexOfMsgInSubtree = Math.max(indexOfMsgInSubtree, idx);
      return idx !== -1;
    });

    if (indexOfMsgTx === -1) {
      throw new Error('The L2ToL1Message you are trying to prove inclusion of does not exist');
    }

    const tempStores: AztecKVStore[] = [];

    // Construct message subtrees
    const l2toL1Subtrees = await Promise.all(
      l2ToL1Messages.map(async (msgs, i) => {
        const store = openTmpStore(true);
        tempStores.push(store);
        const treeHeight = msgs.length <= 1 ? 1 : Math.ceil(Math.log2(msgs.length));
        const tree = new StandardTree(store, new SHA256Trunc(), `temp_msgs_subtrees_${i}`, treeHeight, 0n, Fr);
        await tree.appendLeaves(msgs);
        return tree;
      }),
    );

    // path of the input msg from leaf -> first out hash calculated in base rolllup
    const subtreePathOfL2ToL1Message = await l2toL1Subtrees[indexOfMsgTx].getSiblingPath(
      BigInt(indexOfMsgInSubtree),
      true,
    );

    let l2toL1SubtreeRoots = await Promise.all(l2toL1Subtrees.map(async t => Fr.fromBuffer(await t.getRoot(true))));
    if (l2toL1SubtreeRoots.length < 2) {
      l2toL1SubtreeRoots = padArrayEnd(l2toL1SubtreeRoots, Fr.ZERO, 2);
    }
    const maxTreeHeight = Math.ceil(Math.log2(l2toL1SubtreeRoots.length));
    // The root of this tree is the out_hash calculated in Noir => we truncate to match Noir's SHA
    const outHashTree = new UnbalancedTree(new SHA256Trunc(), 'temp_outhash_sibling_path', maxTreeHeight, Fr);
    await outHashTree.appendLeaves(l2toL1SubtreeRoots);

    const pathOfTxInOutHashTree = await outHashTree.getSiblingPath(l2toL1SubtreeRoots[indexOfMsgTx].toBigInt());
    // Append subtree path to out hash tree path
    const mergedPath = subtreePathOfL2ToL1Message.toBufferArray().concat(pathOfTxInOutHashTree.toBufferArray());
    // Append binary index of subtree path to binary index of out hash tree path
    const mergedIndex = parseInt(
      indexOfMsgTx
        .toString(2)
        .concat(indexOfMsgInSubtree.toString(2).padStart(l2toL1Subtrees[indexOfMsgTx].getDepth(), '0')),
      2,
    );

    // clear the tmp stores
    await Promise.all(tempStores.map(store => store.delete()));

    return [BigInt(mergedIndex), new SiblingPath(mergedPath.length, mergedPath)];
  }

  /**
   * Returns a sibling path for a leaf in the committed blocks tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  public async getArchiveSiblingPath(
    blockNumber: L2BlockNumber,
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof ARCHIVE_HEIGHT>> {
    const committedDb = await this.#getWorldState(blockNumber);
    return committedDb.getSiblingPath(MerkleTreeId.ARCHIVE, leafIndex);
  }

  /**
   * Returns a sibling path for a leaf in the committed public data tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  public async getPublicDataSiblingPath(
    blockNumber: L2BlockNumber,
    leafIndex: bigint,
  ): Promise<SiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>> {
    const committedDb = await this.#getWorldState(blockNumber);
    return committedDb.getSiblingPath(MerkleTreeId.PUBLIC_DATA_TREE, leafIndex);
  }

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  public async getNullifierMembershipWitness(
    blockNumber: L2BlockNumber,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const db = await this.#getWorldState(blockNumber);
    const index = await db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
    if (!index) {
      return undefined;
    }

    const leafPreimagePromise = db.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index);
    const siblingPathPromise = db.getSiblingPath<typeof NULLIFIER_TREE_HEIGHT>(
      MerkleTreeId.NULLIFIER_TREE,
      BigInt(index),
    );

    const [leafPreimage, siblingPath] = await Promise.all([leafPreimagePromise, siblingPathPromise]);

    if (!leafPreimage) {
      return undefined;
    }

    return new NullifierMembershipWitness(BigInt(index), leafPreimage as NullifierLeafPreimage, siblingPath);
  }

  /**
   * Returns a low nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the index.
   * @param nullifier - Nullifier we try to find the low nullifier witness for.
   * @returns The low nullifier membership witness (if found).
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   *
   * Note: This function returns the membership witness of the nullifier itself and not the low nullifier when
   * the nullifier already exists in the tree. This is because the `getPreviousValueIndex` function returns the
   * index of the nullifier itself when it already exists in the tree.
   * TODO: This is a confusing behavior and we should eventually address that.
   */
  public async getLowNullifierMembershipWitness(
    blockNumber: L2BlockNumber,
    nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    const committedDb = await this.#getWorldState(blockNumber);
    const findResult = await committedDb.getPreviousValueIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBigInt());
    if (!findResult) {
      return undefined;
    }
    const { index, alreadyPresent } = findResult;
    if (alreadyPresent) {
      this.log.warn(`Nullifier ${nullifier.toBigInt()} already exists in the tree`);
    }
    const preimageData = (await committedDb.getLeafPreimage(MerkleTreeId.NULLIFIER_TREE, index))!;

    const siblingPath = await committedDb.getSiblingPath<typeof NULLIFIER_TREE_HEIGHT>(
      MerkleTreeId.NULLIFIER_TREE,
      BigInt(index),
    );
    return new NullifierMembershipWitness(BigInt(index), preimageData as NullifierLeafPreimage, siblingPath);
  }

  async getPublicDataTreeWitness(blockNumber: L2BlockNumber, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    const committedDb = await this.#getWorldState(blockNumber);
    const lowLeafResult = await committedDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult) {
      return undefined;
    } else {
      const preimage = (await committedDb.getLeafPreimage(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      )) as PublicDataTreeLeafPreimage;
      const path = await committedDb.getSiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>(
        MerkleTreeId.PUBLIC_DATA_TREE,
        lowLeafResult.index,
      );
      return new PublicDataWitness(lowLeafResult.index, preimage, path);
    }
  }

  /**
   * Gets the storage value at the given contract storage slot.
   *
   * @remarks The storage slot here refers to the slot as it is defined in Noir not the index in the merkle tree.
   * Aztec's version of `eth_getStorageAt`.
   *
   * @param contract - Address of the contract to query.
   * @param slot - Slot to query.
   * @param blockNumber - The block number at which to get the data or 'latest'.
   * @returns Storage value at the given contract slot.
   */
  public async getPublicStorageAt(contract: AztecAddress, slot: Fr, blockNumber: L2BlockNumber): Promise<Fr> {
    const committedDb = await this.#getWorldState(blockNumber);
    const leafSlot = await computePublicDataTreeLeafSlot(contract, slot);

    const lowLeafResult = await committedDb.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }
    const preimage = (await committedDb.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;
    return preimage.value;
  }

  /**
   * Returns the currently committed block header, or the initial header if no blocks have been produced.
   * @returns The current committed block header.
   */
  public async getBlockHeader(blockNumber: L2BlockNumber = 'latest'): Promise<BlockHeader> {
    return (
      (await this.getBlock(blockNumber === 'latest' ? -1 : blockNumber))?.header ??
      this.worldStateSynchronizer.getCommitted().getInitialHeader()
    );
  }

  /**
   * Simulates the public part of a transaction with the current state.
   * @param tx - The transaction to simulate.
   **/
  public async simulatePublicCalls(tx: Tx): Promise<PublicSimulationOutput> {
    this.log.info(`Simulating tx ${tx.getTxHash()}`);
    const blockNumber = (await this.blockSource.getBlockNumber()) + 1;

    // If sequencer is not initialized, we just set these values to zero for simulation.
    const coinbase = this.sequencer?.coinbase || EthAddress.ZERO;
    const feeRecipient = this.sequencer?.feeRecipient || AztecAddress.ZERO;

    const newGlobalVariables = await this.globalVariableBuilder.buildGlobalVariables(
      new Fr(blockNumber),
      coinbase,
      feeRecipient,
    );
    const prevHeader = (await this.blockSource.getBlock(-1))?.header;
    const publicProcessorFactory = new PublicProcessorFactory(this.contractDataSource, this.telemetry);

    const fork = await this.worldStateSynchronizer.fork();

    try {
      const processor = publicProcessorFactory.create(fork, prevHeader, newGlobalVariables);

      // REFACTOR: Consider merging ProcessReturnValues into ProcessedTx
      const [processedTxs, failedTxs, returns] = await processor.process([tx]);
      // REFACTOR: Consider returning the error rather than throwing
      if (failedTxs.length) {
        this.log.warn(`Simulated tx ${tx.getTxHash()} fails: ${failedTxs[0].error}`);
        throw failedTxs[0].error;
      }

      const [processedTx] = processedTxs;
      this.log.debug(`Simulated tx ${tx.getTxHash()} ${processedTx.revertReason ? 'Reverts' : 'Succeeds'}`);

      return new PublicSimulationOutput(
        processedTx.revertReason,
        processedTx.constants,
        processedTx.txEffect,
        returns,
        processedTx.gasUsed,
      );
    } finally {
      await fork.close();
    }
  }

  public async isValidTx(tx: Tx, isSimulation: boolean = false): Promise<boolean> {
    const blockNumber = (await this.blockSource.getBlockNumber()) + 1;
    const db = this.worldStateSynchronizer.getCommitted();
    // These validators are taken from the sequencer, and should match.
    // The reason why `phases` and `gas` tx validator is in the sequencer and not here is because
    // those tx validators are customizable by the sequencer.
    const txValidators: TxValidator<Tx | ProcessedTx>[] = [
      new DataTxValidator(),
      new MetadataTxValidator(new Fr(this.l1ChainId), new Fr(blockNumber)),
      new DoubleSpendTxValidator({
        getNullifierIndex(nullifier) {
          return db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer());
        },
      }),
    ];

    if (!isSimulation) {
      txValidators.push(new TxProofValidator(this.proofVerifier));
    }

    const txValidator = new AggregateTxValidator(...txValidators);

    const [_, invalidTxs] = await txValidator.validateTxs([tx]);
    if (invalidTxs.length > 0) {
      this.log.warn(`Rejecting tx ${tx.getTxHash()} because of validation errors`);

      return false;
    }

    return true;
  }

  public async setConfig(config: Partial<SequencerConfig & ProverConfig>): Promise<void> {
    const newConfig = { ...this.config, ...config };
    this.sequencer?.updateSequencerConfig(config);

    if (newConfig.realProofs !== this.config.realProofs) {
      this.proofVerifier = config.realProofs ? await BBCircuitVerifier.new(newConfig) : new TestCircuitVerifier();
    }

    this.config = newConfig;
  }

  public getProtocolContractAddresses(): Promise<ProtocolContractAddresses> {
    return Promise.resolve({
      classRegisterer: ProtocolContractAddress.ContractClassRegisterer,
      feeJuice: ProtocolContractAddress.FeeJuice,
      instanceDeployer: ProtocolContractAddress.ContractInstanceDeployer,
      multiCallEntrypoint: ProtocolContractAddress.MultiCallEntrypoint,
    });
  }

  // TODO(#10007): Remove this method
  public addContractClass(contractClass: ContractClassPublic): Promise<void> {
    this.log.info(`Adding contract class via API ${contractClass.id}`);
    return this.contractDataSource.addContractClass(contractClass);
  }

  public addContractArtifact(address: AztecAddress, artifact: ContractArtifact): Promise<void> {
    this.log.info(`Adding contract artifact ${artifact.name} for ${address.toString()} via API`);
    // TODO: Node should validate the artifact before accepting it
    return this.contractDataSource.addContractArtifact(address, artifact);
  }

  public flushTxs(): Promise<void> {
    if (!this.sequencer) {
      throw new Error(`Sequencer is not initialized`);
    }
    this.sequencer.flush();
    return Promise.resolve();
  }

  /**
   * Returns an instance of MerkleTreeOperations having first ensured the world state is fully synched
   * @param blockNumber - The block number at which to get the data.
   * @returns An instance of a committed MerkleTreeOperations
   */
  async #getWorldState(blockNumber: L2BlockNumber) {
    if (typeof blockNumber === 'number' && blockNumber < INITIAL_L2_BLOCK_NUM - 1) {
      throw new Error('Invalid block number to get world state for: ' + blockNumber);
    }

    let blockSyncedTo: number = 0;
    try {
      // Attempt to sync the world state if necessary
      blockSyncedTo = await this.#syncWorldState();
    } catch (err) {
      this.log.error(`Error getting world state: ${err}`);
    }

    // using a snapshot could be less efficient than using the committed db
    if (blockNumber === 'latest' /*|| blockNumber === blockSyncedTo*/) {
      this.log.debug(`Using committed db for block ${blockNumber}, world state synced upto ${blockSyncedTo}`);
      return this.worldStateSynchronizer.getCommitted();
    } else if (blockNumber <= blockSyncedTo) {
      this.log.debug(`Using snapshot for block ${blockNumber}, world state synced upto ${blockSyncedTo}`);
      return this.worldStateSynchronizer.getSnapshot(blockNumber);
    } else {
      throw new Error(`Block ${blockNumber} not yet synced`);
    }
  }

  /**
   * Ensure we fully sync the world state
   * @returns A promise that fulfils once the world state is synced
   */
  async #syncWorldState(): Promise<number> {
    const blockSourceHeight = await this.blockSource.getBlockNumber();
    return this.worldStateSynchronizer.syncImmediate(blockSourceHeight);
  }
}
