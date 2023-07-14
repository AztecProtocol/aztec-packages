import { Archiver } from '@aztec/archiver';
import {
  CONTRACT_TREE_HEIGHT,
  CircuitsWasm,
  Fr,
  L1_TO_L2_MSG_TREE_HEIGHT,
  PRIVATE_DATA_TREE_HEIGHT,
} from '@aztec/circuits.js';
import { AztecAddress } from '@aztec/foundation/aztec-address';
import { InMemoryTxPool, P2P, createP2PClient } from '@aztec/p2p';
import { SequencerClient, getCombinedHistoricTreeRoots } from '@aztec/sequencer-client';
import {
  AztecNode,
  ContractData,
  ContractDataSource,
  ContractPublicData,
  L1ToL2MessageAndIndex,
  L1ToL2MessageSource,
  L2Block,
  L2BlockL2Logs,
  L2BlockSource,
  L2LogsSource,
  LogType,
  MerkleTreeId,
  SiblingPath,
  Tx,
  TxHash,
} from '@aztec/types';
import {
  MerkleTrees,
  ServerWorldStateSynchroniser,
  WorldStateSynchroniser,
  computePublicDataTreeLeafIndex,
} from '@aztec/world-state';

import { default as levelup } from 'levelup';
import { MemDown, default as memdown } from 'memdown';

import { AztecNodeConfig } from './config.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

/**
 * The aztec node.
 */
export class AztecNodeService implements AztecNode {
  constructor(
    protected p2pClient: P2P,
    protected blockSource: L2BlockSource,
    protected encryptedLogsSource: L2LogsSource,
    protected unencryptedLogsSource: L2LogsSource,
    protected contractDataSource: ContractDataSource,
    protected l1ToL2MessageSource: L1ToL2MessageSource,
    protected merkleTreeDB: MerkleTrees,
    protected worldStateSynchroniser: WorldStateSynchroniser,
    protected sequencer: SequencerClient,
    protected chainId: number,
    protected version: number,
  ) {}

  /**
   * Initialises the Aztec Node, wait for component to sync.
   * @param config - The configuration to be used by the aztec node.
   * @returns - A fully synced Aztec Node for use in development/testing.
   */
  public static async createAndSync(config: AztecNodeConfig) {
    // first create and sync the archiver
    const archiver = await Archiver.createAndSync(config);

    // we idenfity the P2P transaction protocol by using the rollup contract address.
    // this may well change in future
    config.transactionProtocol = `/aztec/tx/${config.rollupContract.toString()}`;

    // create the tx pool and the p2p client, which will need the l2 block source
    const p2pClient = await createP2PClient(config, new InMemoryTxPool(), archiver);

    // now create the merkle trees and the world state syncher
    const merkleTreeDB = await MerkleTrees.new(levelup(createMemDown()), await CircuitsWasm.get());
    const worldStateSynchroniser = new ServerWorldStateSynchroniser(merkleTreeDB, archiver);

    // start both and wait for them to sync from the block source
    await Promise.all([p2pClient.start(), worldStateSynchroniser.start()]);

    // now create the sequencer
    const sequencer = await SequencerClient.new(
      config,
      p2pClient,
      worldStateSynchroniser,
      archiver,
      archiver,
      archiver,
    );
    return new AztecNodeService(
      p2pClient,
      archiver,
      archiver,
      archiver,
      archiver,
      archiver,
      merkleTreeDB,
      worldStateSynchroniser,
      sequencer,
      config.chainId,
      config.version,
    );
  }

  /**
   * Method to determine if the node is ready to accept transactions.
   * @returns - Flag indicating the readiness for tx submission.
   */
  public async isReady() {
    return (await this.p2pClient.isReady()) ?? false;
  }

  /**
   * Method to request blocks. Will attempt to return all requested blocks but will return only those available.
   * @param from - The start of the range of blocks to return.
   * @param take - The number of blocks desired.
   * @returns The blocks requested.
   */
  public async getBlocks(from: number, take: number): Promise<L2Block[]> {
    return (await this.blockSource.getL2Blocks(from, take)) ?? [];
  }

  /**
   * Method to fetch the current block height.
   * @returns The block height as a number.
   */
  public async getBlockHeight(): Promise<number> {
    return await this.blockSource.getBlockHeight();
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
   * Lookup the L2 contract data for this contract.
   * Contains the ethereum portal address and bytecode.
   * @param contractAddress - The contract data address.
   * @returns The complete contract data including portal address & bytecode (if we didn't throw an error).
   */
  public async getContractData(contractAddress: AztecAddress): Promise<ContractPublicData | undefined> {
    return await this.contractDataSource.getL2ContractPublicData(contractAddress);
  }

  /**
   * Lookup the L2 contract info for this contract.
   * Contains the ethereum portal address .
   * @param contractAddress - The contract data address.
   * @returns The contract's address & portal address.
   */
  public async getContractInfo(contractAddress: AztecAddress): Promise<ContractData | undefined> {
    return await this.contractDataSource.getL2ContractInfo(contractAddress);
  }

  /**
   * Gets the `take` amount of logs starting from `from`.
   * @param from - Number of the L2 block to which corresponds the first logs to be returned.
   * @param take - The number of logs to return.
   * @param logType - Specifies whether to return encrypted or unencrypted logs.
   * @returns The requested logs.
   */
  public getLogs(from: number, take: number, logType: LogType): Promise<L2BlockL2Logs[]> {
    const logSource = logType === LogType.ENCRYPTED ? this.encryptedLogsSource : this.unencryptedLogsSource;
    return logSource.getLogs(from, take, logType);
  }

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   */
  public async sendTx(tx: Tx) {
    // TODO: Patch tx to inject historic tree roots until the private kernel circuit supplies this value
    if (tx.data.constants.historicTreeRoots.privateHistoricTreeRoots.isEmpty()) {
      tx.data.constants.historicTreeRoots = await getCombinedHistoricTreeRoots(this.merkleTreeDB.asLatest());
    }

    await this.p2pClient!.sendTx(tx);
  }

  /**
   * Method to stop the aztec node.
   */
  public async stop() {
    await this.sequencer.stop();
    await this.p2pClient.stop();
    await this.worldStateSynchroniser.stop();
    await this.merkleTreeDB.stop();
    await this.blockSource.stop();
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
    return await this.p2pClient!.getTxByhash(txHash);
  }

  /**
   * Find the index of the given contract.
   * @param leafValue - The value to search for.
   * @returns The index of the given leaf in the contracts tree or undefined if not found.
   */
  public findContractIndex(leafValue: Buffer): Promise<bigint | undefined> {
    return this.merkleTreeDB.findLeafIndex(MerkleTreeId.CONTRACT_TREE, leafValue, false);
  }

  /**
   * Returns the sibling path for the given index in the contract tree.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  public getContractPath(leafIndex: bigint): Promise<SiblingPath<typeof CONTRACT_TREE_HEIGHT>> {
    return this.merkleTreeDB.getSiblingPath(MerkleTreeId.CONTRACT_TREE, leafIndex, false);
  }

  /**
   * Find the index of the given commitment.
   * @param leafValue - The value to search for.
   * @returns The index of the given leaf in the private data tree or undefined if not found.
   */
  public findCommitmentIndex(leafValue: Buffer): Promise<bigint | undefined> {
    return this.merkleTreeDB.findLeafIndex(MerkleTreeId.PRIVATE_DATA_TREE, leafValue, false);
  }

  /**
   * Returns the sibling path for the given index in the data tree.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  public getDataTreePath(leafIndex: bigint): Promise<SiblingPath<typeof PRIVATE_DATA_TREE_HEIGHT>> {
    return this.merkleTreeDB.getSiblingPath(MerkleTreeId.PRIVATE_DATA_TREE, leafIndex, false);
  }

  /**
   * Gets a confirmed/consumed L1 to L2 message for the given message key
   * and its index in the merkle tree.
   * @param messageKey - The message key.
   * @returns The map containing the message and index.
   */
  public async getL1ToL2MessageAndIndex(messageKey: Fr): Promise<L1ToL2MessageAndIndex> {
    // todo: #697 - make this one lookup.
    const message = await this.l1ToL2MessageSource.getConfirmedL1ToL2Message(messageKey);
    const index = (await this.merkleTreeDB.findLeafIndex(
      MerkleTreeId.L1_TO_L2_MESSAGES_TREE,
      messageKey.toBuffer(),
      false,
    ))!;
    return Promise.resolve({ message, index });
  }

  /**
   * Returns the sibling path for a leaf in the committed l1 to l2 data tree.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  public getL1ToL2MessagesTreePath(leafIndex: bigint): Promise<SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>> {
    return this.merkleTreeDB.getSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGES_TREE, leafIndex, false);
  }

  /**
   * Gets the storage value at the given contract slot.
   * @param contract - Address of the contract to query.
   * @param slot - Slot to query.
   * @returns Storage value at the given contract slot (or undefined if not found).
   * Note: Aztec's version of `eth_getStorageAt`.
   */
  public async getStorageAt(contract: AztecAddress, slot: bigint): Promise<Buffer | undefined> {
    const leafIndex = computePublicDataTreeLeafIndex(contract, new Fr(slot), await CircuitsWasm.get());
    return this.merkleTreeDB.getLeafValue(MerkleTreeId.PUBLIC_DATA_TREE, leafIndex, false);
  }

  /**
   * Returns the current committed roots for the data trees.
   * @returns The current committed roots for the data trees.
   */
  public async getTreeRoots(): Promise<Record<MerkleTreeId, Fr>> {
    const getTreeRoot = async (id: MerkleTreeId) =>
      Fr.fromBuffer((await this.merkleTreeDB.getTreeInfo(id, false)).root);

    return {
      [MerkleTreeId.CONTRACT_TREE]: await getTreeRoot(MerkleTreeId.CONTRACT_TREE),
      [MerkleTreeId.PRIVATE_DATA_TREE]: await getTreeRoot(MerkleTreeId.PRIVATE_DATA_TREE),
      [MerkleTreeId.NULLIFIER_TREE]: await getTreeRoot(MerkleTreeId.NULLIFIER_TREE),
      [MerkleTreeId.PUBLIC_DATA_TREE]: await getTreeRoot(MerkleTreeId.PUBLIC_DATA_TREE),
      [MerkleTreeId.L1_TO_L2_MESSAGES_TREE]: await getTreeRoot(MerkleTreeId.L1_TO_L2_MESSAGES_TREE),
      [MerkleTreeId.L1_TO_L2_MESSAGES_ROOTS_TREE]: await getTreeRoot(MerkleTreeId.L1_TO_L2_MESSAGES_ROOTS_TREE),
      [MerkleTreeId.CONTRACT_TREE_ROOTS_TREE]: await getTreeRoot(MerkleTreeId.CONTRACT_TREE_ROOTS_TREE),
      [MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE]: await getTreeRoot(MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE),
    };
  }
}
