import { Archiver, createArchiver } from '@aztec/archiver';
import { BBCircuitVerifier, QueuedIVCVerifier, TestCircuitVerifier } from '@aztec/bb-prover';
import { type BlobSinkClientInterface, createBlobSinkClient } from '@aztec/blob-sink/client';
import {
  ARCHIVE_HEIGHT,
  INITIAL_L2_BLOCK_NUM,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  type NOTE_HASH_TREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  type PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import { EpochCache } from '@aztec/epoch-cache';
import {
  type ExtendedViemWalletClient,
  type L1ContractAddresses,
  RegistryContract,
  RollupContract,
  createEthereumChain,
  createExtendedL1Client,
} from '@aztec/ethereum';
import { L1TxUtilsWithBlobs } from '@aztec/ethereum/l1-tx-utils-with-blobs';
import { compactArray } from '@aztec/foundation/collection';
import { EthAddress } from '@aztec/foundation/eth-address';
import { Fr } from '@aztec/foundation/fields';
import { BadRequestError } from '@aztec/foundation/json-rpc';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { SerialQueue } from '@aztec/foundation/queue';
import { count } from '@aztec/foundation/string';
import { DateProvider, Timer } from '@aztec/foundation/timer';
import { MembershipWitness, SiblingPath } from '@aztec/foundation/trees';
import { trySnapshotSync, uploadSnapshot } from '@aztec/node-lib/actions';
import {
  type P2P,
  type P2PClientDeps,
  TxCollector,
  createP2PClient,
  getDefaultAllowedSetupFunctions,
} from '@aztec/p2p';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import {
  BlockBuilder,
  GlobalVariableBuilder,
  SequencerClient,
  type SequencerPublisher,
  createValidatorForAcceptingTxs,
} from '@aztec/sequencer-client';
import { PublicProcessorFactory } from '@aztec/simulator/server';
import { EpochPruneWatcher, SlasherClient, type Watcher } from '@aztec/slasher';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { InBlock, L2Block, L2BlockNumber, L2BlockSource, PublishedL2Block } from '@aztec/stdlib/block';
import type {
  ContractClassPublic,
  ContractDataSource,
  ContractInstanceWithAddress,
  NodeInfo,
  ProtocolContractAddresses,
} from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type {
  AztecNode,
  AztecNodeAdmin,
  GetContractClassLogsResponse,
  GetPublicLogsResponse,
} from '@aztec/stdlib/interfaces/client';
import {
  type ClientProtocolCircuitVerifier,
  type L2LogsSource,
  type ProverConfig,
  type SequencerConfig,
  type Service,
  type WorldStateSyncStatus,
  type WorldStateSynchronizer,
  tryStop,
} from '@aztec/stdlib/interfaces/server';
import type { LogFilter, PrivateLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import type { L1ToL2MessageSource } from '@aztec/stdlib/messaging';
import { P2PClientType } from '@aztec/stdlib/p2p';
import type { NullifierLeafPreimage, PublicDataTreeLeaf, PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { MerkleTreeId, NullifierMembershipWitness, PublicDataWitness } from '@aztec/stdlib/trees';
import {
  type BlockHeader,
  type GlobalVariableBuilder as GlobalVariableBuilderInterface,
  type IndexedTxEffect,
  PublicSimulationOutput,
  Tx,
  type TxHash,
  TxReceipt,
  TxStatus,
  type TxValidationResult,
} from '@aztec/stdlib/tx';
import { getPackageVersion } from '@aztec/stdlib/update-checker';
import type { ValidatorsStats } from '@aztec/stdlib/validators';
import {
  Attributes,
  type TelemetryClient,
  type Traceable,
  type Tracer,
  getTelemetryClient,
  trackSpan,
} from '@aztec/telemetry-client';
import { createValidatorClient } from '@aztec/validator-client';
import { createWorldStateSynchronizer } from '@aztec/world-state';

import { createPublicClient, fallback, http } from 'viem';

import { createSentinel } from '../sentinel/factory.js';
import { Sentinel } from '../sentinel/sentinel.js';
import type { AztecNodeConfig } from './config.js';
import { NodeMetrics } from './node_metrics.js';

/**
 * The aztec node.
 */
export class AztecNodeService implements AztecNode, AztecNodeAdmin, Traceable {
  private metrics: NodeMetrics;

  // Prevent two snapshot operations to happen simultaneously
  private isUploadingSnapshot = false;

  // Serial queue to ensure that we only send one tx at a time
  private txQueue: SerialQueue = new SerialQueue();

  public readonly tracer: Tracer;

  constructor(
    protected config: AztecNodeConfig,
    protected readonly p2pClient: P2P,
    protected readonly blockSource: L2BlockSource & Partial<Service>,
    protected readonly logsSource: L2LogsSource,
    protected readonly contractDataSource: ContractDataSource,
    protected readonly l1ToL2MessageSource: L1ToL2MessageSource,
    protected readonly worldStateSynchronizer: WorldStateSynchronizer,
    protected readonly sequencer: SequencerClient | undefined,
    protected readonly slasherClient: SlasherClient | undefined,
    protected readonly validatorsSentinel: Sentinel | undefined,
    protected readonly epochPruneWatcher: EpochPruneWatcher | undefined,
    protected readonly l1ChainId: number,
    protected readonly version: number,
    protected readonly globalVariableBuilder: GlobalVariableBuilderInterface,
    private readonly packageVersion: string,
    private proofVerifier: ClientProtocolCircuitVerifier,
    private telemetry: TelemetryClient = getTelemetryClient(),
    private log = createLogger('node'),
  ) {
    this.metrics = new NodeMetrics(telemetry, 'AztecNodeService');
    this.tracer = telemetry.getTracer('AztecNodeService');
    this.txQueue.start();

    this.log.info(`Aztec Node version: ${this.packageVersion}`);
    this.log.info(`Aztec Node started on chain 0x${l1ChainId.toString(16)}`, config.l1Contracts);
  }

  public async getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    const status = await this.worldStateSynchronizer.status();
    return status.syncSummary;
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
    inputConfig: AztecNodeConfig,
    deps: {
      telemetry?: TelemetryClient;
      logger?: Logger;
      publisher?: SequencerPublisher;
      dateProvider?: DateProvider;
      blobSinkClient?: BlobSinkClientInterface;
      p2pClientDeps?: P2PClientDeps<P2PClientType.Full>;
    } = {},
    options: {
      prefilledPublicData?: PublicDataTreeLeaf[];
      dontStartSequencer?: boolean;
    } = {},
  ): Promise<AztecNodeService> {
    const config = { ...inputConfig }; // Copy the config so we dont mutate the input object
    const log = deps.logger ?? createLogger('node');
    const packageVersion = getPackageVersion() ?? '';
    const telemetry = deps.telemetry ?? getTelemetryClient();
    const dateProvider = deps.dateProvider ?? new DateProvider();
    const blobSinkClient =
      deps.blobSinkClient ?? createBlobSinkClient(config, { logger: createLogger('node:blob-sink:client') });
    const ethereumChain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);

    // validate that the actual chain id matches that specified in configuration
    if (config.l1ChainId !== ethereumChain.chainInfo.id) {
      throw new Error(
        `RPC URL configured for chain id ${ethereumChain.chainInfo.id} but expected id ${config.l1ChainId}`,
      );
    }

    const publicClient = createPublicClient({
      chain: ethereumChain.chainInfo,
      transport: fallback(config.l1RpcUrls.map((url: string) => http(url))),
      pollingInterval: config.viemPollingIntervalMS,
    });

    const l1ContractsAddresses = await RegistryContract.collectAddresses(
      publicClient,
      config.l1Contracts.registryAddress,
      config.rollupVersion ?? 'canonical',
    );

    // Overwrite the passed in vars.
    config.l1Contracts = { ...config.l1Contracts, ...l1ContractsAddresses };

    const rollupContract = new RollupContract(publicClient, config.l1Contracts.rollupAddress.toString());
    const [l1GenesisTime, slotDuration, rollupVersionFromRollup] = await Promise.all([
      rollupContract.getL1GenesisTime(),
      rollupContract.getSlotDuration(),
      rollupContract.getVersion(),
    ] as const);

    config.rollupVersion ??= Number(rollupVersionFromRollup);

    if (config.rollupVersion !== Number(rollupVersionFromRollup)) {
      log.warn(
        `Registry looked up and returned a rollup with version (${config.rollupVersion}), but this does not match with version detected from the rollup directly: (${rollupVersionFromRollup}).`,
      );
    }

    // attempt snapshot sync if possible
    await trySnapshotSync(config, log);

    const archiver = await createArchiver(config, blobSinkClient, { blockUntilSync: true }, telemetry);

    // now create the merkle trees and the world state synchronizer
    const worldStateSynchronizer = await createWorldStateSynchronizer(
      config,
      archiver,
      options.prefilledPublicData,
      telemetry,
    );
    const circuitVerifier = config.realProofs ? await BBCircuitVerifier.new(config) : new TestCircuitVerifier();
    if (!config.realProofs) {
      log.warn(`Aztec node is accepting fake proofs`);
    }
    const proofVerifier = new QueuedIVCVerifier(config, circuitVerifier);

    const epochCache = await EpochCache.create(config.l1Contracts.rollupAddress, config, { dateProvider });

    // create the tx pool and the p2p client, which will need the l2 block source
    const p2pClient = await createP2PClient(
      P2PClientType.Full,
      config,
      archiver,
      proofVerifier,
      worldStateSynchronizer,
      epochCache,
      packageVersion,
      telemetry,
      deps.p2pClientDeps,
    );

    // Start world state and wait for it to sync to the archiver.
    await worldStateSynchronizer.start();

    // Start p2p. Note that it depends on world state to be running.
    await p2pClient.start();

    config.txPublicSetupAllowList = config.txPublicSetupAllowList ?? (await getDefaultAllowedSetupFunctions());

    const blockBuilder = new BlockBuilder(
      {
        l1GenesisTime,
        slotDuration: Number(slotDuration),
        rollupVersion: config.rollupVersion,
        l1ChainId: config.l1ChainId,
        txPublicSetupAllowList: config.txPublicSetupAllowList,
      },
      archiver,
      worldStateSynchronizer,
      archiver,
      dateProvider,
      telemetry,
    );

    const watchers: Watcher[] = [];

    const validatorsSentinel = await createSentinel(epochCache, archiver, p2pClient, config);
    if (validatorsSentinel) {
      // we can run a sentinel without trying to slash.
      await validatorsSentinel.start();
      if (config.slashInactivityEnabled) {
        watchers.push(validatorsSentinel);
      }
    }

    let epochPruneWatcher: EpochPruneWatcher | undefined;
    if (config.slashPruneEnabled) {
      const txCollector = new TxCollector(p2pClient);
      epochPruneWatcher = new EpochPruneWatcher(
        archiver,
        epochCache,
        txCollector,
        blockBuilder,
        config.slashPrunePenalty,
        config.slashPruneMaxPenalty,
      );
      await epochPruneWatcher.start();
      watchers.push(epochPruneWatcher);
    }
    const validatorClient = createValidatorClient(config, {
      p2pClient,
      telemetry,
      dateProvider,
      epochCache,
      blockBuilder,
      blockSource: archiver,
    });

    if (validatorClient) {
      watchers.push(validatorClient);
    }

    log.verbose(`All Aztec Node subsystems synced`);

    let sequencer: SequencerClient | undefined;
    let slasherClient: SlasherClient | undefined;
    let l1TxUtils: L1TxUtilsWithBlobs | undefined;
    let l1Client: ExtendedViemWalletClient | undefined;

    if (config.publisherPrivateKey) {
      // we can still run a slasher client if a private key is provided
      l1Client = createExtendedL1Client(config.l1RpcUrls, config.publisherPrivateKey, ethereumChain.chainInfo);
      l1TxUtils = new L1TxUtilsWithBlobs(l1Client, log, config);
      slasherClient = await SlasherClient.new(config, config.l1Contracts, l1TxUtils, watchers, dateProvider);
      slasherClient.start();
    }

    // Validator enabled, create/start relevant service
    if (!config.disableValidator) {
      // This shouldn't happen, validators need a publisher private key.
      if (!config.publisherPrivateKey) {
        throw new Error('A publisher private key is required to run a validator');
      }

      sequencer = await SequencerClient.new(config, {
        // if deps were provided, they should override the defaults,
        // or things that we created in this function
        ...deps,
        epochCache,
        l1TxUtils,
        validatorClient,
        p2pClient,
        worldStateSynchronizer,
        slasherClient: slasherClient!,
        blockBuilder,
        l2BlockSource: archiver,
        l1ToL2MessageSource: archiver,
        telemetry,
        dateProvider,
        blobSinkClient,
      });
    }

    if (!options.dontStartSequencer && sequencer) {
      await sequencer.start();
      log.verbose(`Sequencer started`);
    }

    return new AztecNodeService(
      config,
      p2pClient,
      archiver,
      archiver,
      archiver,
      archiver,
      worldStateSynchronizer,
      sequencer,
      slasherClient,
      validatorsSentinel,
      epochPruneWatcher,
      ethereumChain.chainInfo.id,
      config.rollupVersion,
      new GlobalVariableBuilder(config),
      packageVersion,
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

  public getContractDataSource(): ContractDataSource {
    return this.contractDataSource;
  }

  public getP2P(): P2P {
    return this.p2pClient;
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
    const [nodeVersion, rollupVersion, chainId, enr, contractAddresses, protocolContractAddresses] = await Promise.all([
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
      rollupVersion,
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

  public async getPublishedBlocks(from: number, limit: number): Promise<PublishedL2Block[]> {
    return (await this.blockSource.getPublishedBlocks(from, limit)) ?? [];
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
   * @param logsPerTag - The maximum number of logs to return for each tag. By default no limit is set
   * @returns For each received tag, an array of matching logs is returned. An empty array implies no logs match
   * that tag.
   */
  public getLogsByTags(tags: Fr[], logsPerTag?: number): Promise<TxScopedL2Log[][]> {
    return this.logsSource.getLogsByTags(tags, logsPerTag);
  }

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(filter: LogFilter): Promise<GetPublicLogsResponse> {
    return this.logsSource.getPublicLogs(filter);
  }

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(filter: LogFilter): Promise<GetContractClassLogsResponse> {
    return this.logsSource.getContractClassLogs(filter);
  }

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   */
  public async sendTx(tx: Tx) {
    await this.txQueue.put(() => this.#sendTx(tx));
  }

  async #sendTx(tx: Tx) {
    const timer = new Timer();
    const txHash = (await tx.getTxHash()).toString();

    const valid = await this.isValidTx(tx);
    if (valid.result !== 'valid') {
      const reason = valid.reason.join(', ');
      this.metrics.receivedTx(timer.ms(), false);
      this.log.warn(`Received invalid tx ${txHash}: ${reason}`, { txHash });
      throw new Error(`Invalid tx: ${reason}`);
    }

    await this.p2pClient!.sendTx(tx);
    this.metrics.receivedTx(timer.ms(), true);
    this.log.info(`Received tx ${txHash}`, { txHash });
  }

  public async getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    let txReceipt = new TxReceipt(txHash, TxStatus.DROPPED, 'Tx dropped by P2P node.');

    // We first check if the tx is in pending (instead of first checking if it is mined) because if we first check
    // for mined and then for pending there could be a race condition where the tx is mined between the two checks
    // and we would incorrectly return a TxReceipt with status DROPPED
    if ((await this.p2pClient.getTxStatus(txHash)) === 'pending') {
      txReceipt = new TxReceipt(txHash, TxStatus.PENDING, '');
    }

    const settledTxReceipt = await this.blockSource.getSettledTxReceipt(txHash);
    if (settledTxReceipt) {
      txReceipt = settledTxReceipt;
    }

    return txReceipt;
  }

  public getTxEffect(txHash: TxHash): Promise<IndexedTxEffect | undefined> {
    return this.blockSource.getTxEffect(txHash);
  }

  /**
   * Method to stop the aztec node.
   */
  public async stop() {
    this.log.info(`Stopping Aztec Node`);
    await this.txQueue.end();
    await tryStop(this.validatorsSentinel);
    await tryStop(this.epochPruneWatcher);
    await tryStop(this.slasherClient);
    await tryStop(this.proofVerifier);
    await tryStop(this.sequencer);
    await tryStop(this.p2pClient);
    await tryStop(this.worldStateSynchronizer);
    await tryStop(this.blockSource);
    await tryStop(this.telemetry);
    this.log.info(`Stopped Aztec Node`);
  }

  /**
   * Method to retrieve pending txs.
   * @param limit - The number of items to returns
   * @param after - The last known pending tx. Used for pagination
   * @returns - The pending txs.
   */
  public getPendingTxs(limit?: number, after?: TxHash): Promise<Tx[]> {
    return this.p2pClient!.getPendingTxs(limit, after);
  }

  public getPendingTxCount(): Promise<number> {
    return this.p2pClient!.getPendingTxCount();
  }

  /**
   * Method to retrieve a single tx from the mempool or unfinalised chain.
   * @param txHash - The transaction hash to return.
   * @returns - The tx if it exists.
   */
  public getTxByHash(txHash: TxHash): Promise<Tx | undefined> {
    return Promise.resolve(this.p2pClient!.getTxByHashFromPool(txHash));
  }

  /**
   * Method to retrieve txs from the mempool or unfinalised chain.
   * @param txHash - The transaction hash to return.
   * @returns - The txs if it exists.
   */
  public async getTxsByHash(txHashes: TxHash[]): Promise<Tx[]> {
    return compactArray(await Promise.all(txHashes.map(txHash => this.getTxByHash(txHash))));
  }

  /**
   * Find the indexes of the given leaves in the given tree along with a block metadata pointing to the block in which
   * the leaves were inserted.
   * @param blockNumber - The block number at which to get the data or 'latest' for latest data.
   * @param treeId - The tree to search in.
   * @param leafValues - The values to search for.
   * @returns The indices of leaves and the block metadata of a block in which the leaves were inserted.
   */
  public async findLeavesIndexes(
    blockNumber: L2BlockNumber,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]> {
    const committedDb = await this.#getWorldState(blockNumber);
    const maybeIndices = await committedDb.findLeafIndices(
      treeId,
      leafValues.map(x => x.toBuffer()),
    );
    // We filter out undefined values
    const indices = maybeIndices.filter(x => x !== undefined) as bigint[];

    // Now we find the block numbers for the indices
    const blockNumbers = await committedDb.getBlockNumbersForLeafIndices(treeId, indices);

    // If any of the block numbers are undefined, we throw an error.
    for (let i = 0; i < indices.length; i++) {
      if (blockNumbers[i] === undefined) {
        throw new Error(`Block number is undefined for leaf index ${indices[i]} in tree ${MerkleTreeId[treeId]}`);
      }
    }

    // Get unique block numbers in order to optimize num calls to getLeafValue function.
    const uniqueBlockNumbers = [...new Set(blockNumbers.filter(x => x !== undefined))];

    // Now we obtain the block hashes from the archive tree by calling await `committedDb.getLeafValue(treeId, index)`
    // (note that block number corresponds to the leaf index in the archive tree).
    const blockHashes = await Promise.all(
      uniqueBlockNumbers.map(blockNumber => {
        return committedDb.getLeafValue(MerkleTreeId.ARCHIVE, blockNumber!);
      }),
    );

    // If any of the block hashes are undefined, we throw an error.
    for (let i = 0; i < uniqueBlockNumbers.length; i++) {
      if (blockHashes[i] === undefined) {
        throw new Error(`Block hash is undefined for block number ${uniqueBlockNumbers[i]}`);
      }
    }

    // Create InBlock objects by combining indices, blockNumbers and blockHashes and return them.
    return maybeIndices.map((index, i) => {
      if (index === undefined) {
        return undefined;
      }
      const blockNumber = blockNumbers[i];
      if (blockNumber === undefined) {
        return undefined;
      }
      const blockHashIndex = uniqueBlockNumbers.indexOf(blockNumber);
      const blockHash = blockHashes[blockHashIndex]?.toString();
      if (!blockHash) {
        return undefined;
      }
      return {
        l2BlockNumber: Number(blockNumber),
        l2BlockHash: blockHash,
        data: index,
      };
    });
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

  public async getArchiveMembershipWitness(
    blockNumber: L2BlockNumber,
    archive: Fr,
  ): Promise<MembershipWitness<typeof ARCHIVE_HEIGHT> | undefined> {
    const committedDb = await this.#getWorldState(blockNumber);
    const [pathAndIndex] = await committedDb.findSiblingPaths<MerkleTreeId.ARCHIVE, typeof ARCHIVE_HEIGHT>(
      MerkleTreeId.ARCHIVE,
      [archive],
    );
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
  }

  public async getNoteHashMembershipWitness(
    blockNumber: L2BlockNumber,
    noteHash: Fr,
  ): Promise<MembershipWitness<typeof NOTE_HASH_TREE_HEIGHT> | undefined> {
    const committedDb = await this.#getWorldState(blockNumber);
    const [pathAndIndex] = await committedDb.findSiblingPaths<
      MerkleTreeId.NOTE_HASH_TREE,
      typeof NOTE_HASH_TREE_HEIGHT
    >(MerkleTreeId.NOTE_HASH_TREE, [noteHash]);
    return pathAndIndex === undefined
      ? undefined
      : MembershipWitness.fromSiblingPath(pathAndIndex.index, pathAndIndex.path);
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
   * Returns all the L2 to L1 messages in a block.
   * @param blockNumber - The block number at which to get the data.
   * @returns The L2 to L1 messages (undefined if the block number is not found).
   */
  public async getL2ToL1Messages(blockNumber: L2BlockNumber): Promise<Fr[][] | undefined> {
    const block = await this.blockSource.getBlock(blockNumber === 'latest' ? await this.getBlockNumber() : blockNumber);
    return block?.body.txEffects.map(txEffect => txEffect.l2ToL1Msgs);
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
    const index = (await db.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]))[0];
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

  async getPublicDataWitness(blockNumber: L2BlockNumber, leafSlot: Fr): Promise<PublicDataWitness | undefined> {
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
  public async getPublicStorageAt(blockNumber: L2BlockNumber, contract: AztecAddress, slot: Fr): Promise<Fr> {
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
    return preimage.leaf.value;
  }

  /**
   * Returns the currently committed block header, or the initial header if no blocks have been produced.
   * @returns The current committed block header.
   */
  public async getBlockHeader(blockNumber: L2BlockNumber = 'latest'): Promise<BlockHeader | undefined> {
    return blockNumber === 0 || (blockNumber === 'latest' && (await this.blockSource.getBlockNumber()) === 0)
      ? this.worldStateSynchronizer.getCommitted().getInitialHeader()
      : this.blockSource.getBlockHeader(blockNumber);
  }

  /**
   * Simulates the public part of a transaction with the current state.
   * @param tx - The transaction to simulate.
   **/
  @trackSpan('AztecNodeService.simulatePublicCalls', async (tx: Tx) => ({
    [Attributes.TX_HASH]: (await tx.getTxHash()).toString(),
  }))
  public async simulatePublicCalls(tx: Tx, skipFeeEnforcement = false): Promise<PublicSimulationOutput> {
    // Check total gas limit for simulation
    const gasSettings = tx.data.constants.txContext.gasSettings;
    const txGasLimit = gasSettings.gasLimits.l2Gas;
    const teardownGasLimit = gasSettings.teardownGasLimits.l2Gas;
    if (txGasLimit + teardownGasLimit > this.config.rpcSimulatePublicMaxGasLimit) {
      throw new BadRequestError(
        `Transaction total gas limit ${
          txGasLimit + teardownGasLimit
        } (${txGasLimit} + ${teardownGasLimit}) exceeds maximum gas limit ${
          this.config.rpcSimulatePublicMaxGasLimit
        } for simulation`,
      );
    }

    const txHash = await tx.getTxHash();
    const blockNumber = (await this.blockSource.getBlockNumber()) + 1;

    // If sequencer is not initialized, we just set these values to zero for simulation.
    const coinbase = this.sequencer?.coinbase || EthAddress.ZERO;
    const feeRecipient = this.sequencer?.feeRecipient || AztecAddress.ZERO;

    const newGlobalVariables = await this.globalVariableBuilder.buildGlobalVariables(
      blockNumber,
      coinbase,
      feeRecipient,
    );
    const publicProcessorFactory = new PublicProcessorFactory(
      this.contractDataSource,
      new DateProvider(),
      this.telemetry,
    );

    this.log.verbose(`Simulating public calls for tx ${txHash}`, {
      globalVariables: newGlobalVariables.toInspect(),
      txHash,
      blockNumber,
    });

    const merkleTreeFork = await this.worldStateSynchronizer.fork();
    try {
      const processor = publicProcessorFactory.create(
        merkleTreeFork,
        newGlobalVariables,
        skipFeeEnforcement,
        /*clientInitiatedSimulation*/ true,
      );

      // REFACTOR: Consider merging ProcessReturnValues into ProcessedTx
      const [processedTxs, failedTxs, _usedTxs, returns] = await processor.process([tx]);
      // REFACTOR: Consider returning the error rather than throwing
      if (failedTxs.length) {
        this.log.warn(`Simulated tx ${txHash} fails: ${failedTxs[0].error}`, { txHash });
        throw failedTxs[0].error;
      }

      const [processedTx] = processedTxs;
      return new PublicSimulationOutput(
        processedTx.revertReason,
        processedTx.globalVariables,
        processedTx.txEffect,
        returns,
        processedTx.gasUsed,
      );
    } finally {
      await merkleTreeFork.close();
    }
  }

  public async isValidTx(
    tx: Tx,
    { isSimulation, skipFeeEnforcement }: { isSimulation?: boolean; skipFeeEnforcement?: boolean } = {},
  ): Promise<TxValidationResult> {
    const blockNumber = (await this.blockSource.getBlockNumber()) + 1;
    const db = this.worldStateSynchronizer.getCommitted();
    const verifier = isSimulation ? undefined : this.proofVerifier;
    const validator = createValidatorForAcceptingTxs(db, this.contractDataSource, verifier, {
      blockNumber,
      l1ChainId: this.l1ChainId,
      rollupVersion: this.version,
      setupAllowList: this.config.txPublicSetupAllowList ?? (await getDefaultAllowedSetupFunctions()),
      gasFees: await this.getCurrentBaseFees(),
      skipFeeEnforcement,
    });

    return await validator.validateTx(tx);
  }

  public async setConfig(config: Partial<SequencerConfig & ProverConfig>): Promise<void> {
    const newConfig = { ...this.config, ...config };
    this.sequencer?.updateSequencerConfig(config);
    // this.blockBuilder.updateConfig(config); // TODO: Spyros has a PR to add the builder to `this`, so we can do this
    await this.p2pClient.updateP2PConfig(config);

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

  public registerContractFunctionSignatures(signatures: string[]): Promise<void> {
    return this.contractDataSource.registerContractFunctionSignatures(signatures);
  }

  public flushTxs(): Promise<void> {
    if (!this.sequencer) {
      throw new Error(`Sequencer is not initialized`);
    }
    this.sequencer.flush();
    return Promise.resolve();
  }

  public getValidatorsStats(): Promise<ValidatorsStats> {
    return this.validatorsSentinel?.computeStats() ?? Promise.resolve({ stats: {}, slotWindow: 0 });
  }

  public async startSnapshotUpload(location: string): Promise<void> {
    // Note that we are forcefully casting the blocksource as an archiver
    // We break support for archiver running remotely to the node
    const archiver = this.blockSource as Archiver;
    if (!('backupTo' in archiver)) {
      throw new Error('Archiver implementation does not support backups. Cannot generate snapshot.');
    }

    // Test that the archiver has done an initial sync.
    if (!archiver.isInitialSyncComplete()) {
      throw new Error(`Archiver initial sync not complete. Cannot start snapshot.`);
    }

    // And it has an L2 block hash
    const l2BlockHash = await archiver.getL2Tips().then(tips => tips.latest.hash);
    if (!l2BlockHash) {
      throw new Error(`Archiver has no latest L2 block hash downloaded. Cannot start snapshot.`);
    }

    if (this.isUploadingSnapshot) {
      throw new Error(`Snapshot upload already in progress. Cannot start another one until complete.`);
    }

    // Do not wait for the upload to be complete to return to the caller, but flag that an operation is in progress
    this.isUploadingSnapshot = true;
    void uploadSnapshot(location, this.blockSource as Archiver, this.worldStateSynchronizer, this.config, this.log)
      .then(() => {
        this.isUploadingSnapshot = false;
      })
      .catch(err => {
        this.isUploadingSnapshot = false;
        this.log.error(`Error uploading snapshot: ${err}`);
      });

    return Promise.resolve();
  }

  public async rollbackTo(targetBlock: number, force?: boolean): Promise<void> {
    const archiver = this.blockSource as Archiver;
    if (!('rollbackTo' in archiver)) {
      throw new Error('Archiver implementation does not support rollbacks.');
    }

    const finalizedBlock = await archiver.getL2Tips().then(tips => tips.finalized.number);
    if (targetBlock < finalizedBlock) {
      if (force) {
        this.log.warn(`Clearing world state database to allow rolling back behind finalized block ${finalizedBlock}`);
        await this.worldStateSynchronizer.clear();
        await this.p2pClient.clear();
      } else {
        throw new Error(`Cannot rollback to block ${targetBlock} as it is before finalized ${finalizedBlock}`);
      }
    }

    try {
      this.log.info(`Pausing archiver and world state sync to start rollback`);
      await archiver.stop();
      await this.worldStateSynchronizer.stopSync();
      const currentBlock = await archiver.getBlockNumber();
      const blocksToUnwind = currentBlock - targetBlock;
      this.log.info(`Unwinding ${count(blocksToUnwind, 'block')} from L2 block ${currentBlock} to ${targetBlock}`);
      await archiver.rollbackTo(targetBlock);
      this.log.info(`Unwinding complete.`);
    } catch (err) {
      this.log.error(`Error during rollback`, err);
      throw err;
    } finally {
      this.log.info(`Resuming world state and archiver sync.`);
      this.worldStateSynchronizer.resumeSync();
      archiver.resume();
    }
  }

  public async pauseSync(): Promise<void> {
    this.log.info(`Pausing archiver and world state sync`);
    await (this.blockSource as Archiver).stop();
    await this.worldStateSynchronizer.stopSync();
  }

  public resumeSync(): Promise<void> {
    this.log.info(`Resuming world state and archiver sync.`);
    this.worldStateSynchronizer.resumeSync();
    (this.blockSource as Archiver).resume();
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
