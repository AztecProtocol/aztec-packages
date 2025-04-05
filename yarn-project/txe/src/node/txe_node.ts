import type {
  ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_TREE_HEIGHT,
  NOTE_HASH_TREE_HEIGHT,
  NULLIFIER_TREE_HEIGHT,
  PUBLIC_DATA_TREE_HEIGHT,
} from '@aztec/constants';
import type { L1ContractAddresses } from '@aztec/ethereum';
import { poseidon2Hash } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createLogger } from '@aztec/foundation/log';
import type { SiblingPath } from '@aztec/foundation/trees';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import {
  type InBlock,
  L2Block,
  L2BlockHash,
  type L2BlockNumber,
  type L2Tips,
  type PublishedL2Block,
} from '@aztec/stdlib/block';
import type {
  ContractClassPublic,
  ContractInstanceWithAddress,
  NodeInfo,
  ProtocolContractAddresses,
} from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type { AztecNode, GetContractClassLogsResponse, GetPublicLogsResponse } from '@aztec/stdlib/interfaces/client';
import type {
  MerkleTreeReadOperations,
  MerkleTreeWriteOperations,
  ProverConfig,
  SequencerConfig,
  WorldStateSyncStatus,
} from '@aztec/stdlib/interfaces/server';
import { type LogFilter, type PrivateLog, TxScopedL2Log } from '@aztec/stdlib/logs';
import {
  MerkleTreeId,
  type NullifierMembershipWitness,
  type PublicDataTreeLeafPreimage,
  PublicDataWitness,
} from '@aztec/stdlib/trees';
import {
  BlockHeader,
  type PublicSimulationOutput,
  type Tx,
  type TxEffect,
  TxHash,
  TxReceipt,
  type TxValidationResult,
} from '@aztec/stdlib/tx';
import type { ValidatorsStats } from '@aztec/stdlib/validators';
import type { NativeWorldStateService } from '@aztec/world-state';

export class TXENode implements AztecNode {
  #logsByTags = new Map<string, TxScopedL2Log[]>();
  #txEffectsByTxHash = new Map<string, InBlock<TxEffect> & { txIndexInBlock: number }>();
  #txReceiptsByTxHash = new Map<string, TxReceipt>();
  #noteIndex = 0;

  #logger = createLogger('aztec:txe_node');

  constructor(
    private blockNumber: number,
    private version: number,
    private chainId: number,
    private nativeWorldStateService: NativeWorldStateService,
    private baseFork: MerkleTreeWriteOperations,
  ) {}

  /**
   * Fetches the current block number.
   * @returns The block number.
   */
  getBlockNumber(): Promise<number> {
    return Promise.resolve(this.blockNumber);
  }

  /**
   * Sets the current block number of the node.
   * @param - The block number to set.
   */
  setBlockNumber(blockNumber: number) {
    this.blockNumber = blockNumber;
  }

  /**
   * Gets a tx effect.
   * @param txHash - The txHash of the tx corresponding to the tx effect.
   * @returns The requested tx effect (or undefined if not found) along with its index in the block.
   */
  getTxEffect(txHash: TxHash): Promise<(InBlock<TxEffect> & { txIndexInBlock: number }) | undefined> {
    const txEffect = this.#txEffectsByTxHash.get(txHash.toString());

    return Promise.resolve(txEffect);
  }

  /**
   * Processes a tx effect and receipt for a given block number.
   * @param blockNumber - The block number that this tx effect resides.
   * @param txIndexInBlock - The index of the tx in the block.
   * @param txHash - The transaction hash of the transaction.
   * @param effect - The tx effect to set.
   */
  async processTxEffect(blockNumber: number, txIndexInBlock: number, txHash: TxHash, effect: TxEffect) {
    // We are not creating real blocks on which membership proofs can be constructed - we instead define its hash as
    // simply the hash of the block number.
    const blockHash = await poseidon2Hash([blockNumber]);

    this.#txEffectsByTxHash.set(txHash.toString(), {
      l2BlockHash: blockHash.toString(),
      l2BlockNumber: blockNumber,
      data: effect,
      txIndexInBlock,
    });

    // We also set the receipt since we want to be able to serve `getTxReceipt` - we don't care about most values here,
    // but we do need to be able to retrieve the block number of a given txHash.
    this.#txReceiptsByTxHash.set(
      txHash.toString(),
      new TxReceipt(
        txHash,
        TxReceipt.statusFromRevertCode(effect.revertCode),
        '',
        undefined,
        new L2BlockHash(blockHash.toBuffer()),
        blockNumber,
      ),
    );

    // Store the private logs
    effect.privateLogs.forEach((log, logIndexInTx) => {
      const tag = log.fields[0];
      this.#logger.verbose(`Found private log with tag ${tag.toString()} in block ${this.getBlockNumber()}`);

      const currentLogs = this.#logsByTags.get(tag.toString()) ?? [];
      const scopedLog = new TxScopedL2Log(
        new TxHash(new Fr(blockNumber)),
        this.#noteIndex,
        logIndexInTx,
        blockNumber,
        log,
      );
      currentLogs.push(scopedLog);
      this.#logsByTags.set(tag.toString(), currentLogs);
    });

    this.#noteIndex += effect.privateLogs.length;

    // Store the public logs
    effect.publicLogs.forEach((log, logIndexInTx) => {
      const tag = log.log[0];
      this.#logger.verbose(`Found public log with tag ${tag.toString()} in block ${this.getBlockNumber()}`);

      const currentLogs = this.#logsByTags.get(tag.toString()) ?? [];
      const scopedLog = new TxScopedL2Log(
        new TxHash(new Fr(blockNumber)),
        this.#noteIndex,
        logIndexInTx,
        blockNumber,
        log,
      );

      currentLogs.push(scopedLog);
      this.#logsByTags.set(tag.toString(), currentLogs);
    });
  }

  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs and metadata (e.g. tx hash) is returned. An empty
   array implies no logs match that tag.
   */
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    const logs = tags.map(tag => this.#logsByTags.get(tag.toString()) ?? []);

    return Promise.resolve(logs);
  }

  /**
   * Returns the tips of the L2 chain.
   */
  getL2Tips(): Promise<L2Tips> {
    throw new Error('TXE Node method getL2Tips not implemented');
  }

  /**
   * Find the indexes of the given leaves in the given tree.
   * @param blockNumber - The block number at which to get the data or 'latest' for latest data
   * @param treeId - The tree to search in.
   * @param leafValue - The values to search for
   * @returns The indices of leaves and the block metadata of a block in which the leaf was inserted.
   */
  async findLeavesIndexes(
    blockNumber: L2BlockNumber,
    treeId: MerkleTreeId,
    leafValues: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]> {
    // Temporary workaround to be able to respond this query: the trees are currently stored in the TXE oracle, but we
    // hold a reference to them.
    // We should likely migrate this so that the trees are owned by the node.

    // TODO: blockNumber is being passed as undefined, figure out why
    const db: MerkleTreeReadOperations =
      blockNumber === (await this.getBlockNumber()) || blockNumber === 'latest' || blockNumber === undefined
        ? this.baseFork
        : this.nativeWorldStateService.getSnapshot(blockNumber);

    const maybeIndices = await db.findLeafIndices(
      treeId,
      leafValues.map(x => x.toBuffer()),
    );

    // We filter out undefined values
    const indices = maybeIndices.filter(x => x !== undefined) as bigint[];

    // Now we find the block numbers for the indices
    const blockNumbers = await db.getBlockNumbersForLeafIndices(treeId, indices);

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
        return db.getLeafValue(MerkleTreeId.ARCHIVE, blockNumber!);
      }),
    );

    // If any of the block hashes are undefined, we throw an error.
    for (let i = 0; i < uniqueBlockNumbers.length; i++) {
      if (blockHashes[i] === undefined) {
        throw new Error(`Block hash is undefined for block number ${uniqueBlockNumbers[i]}`);
      }
    }

    // Create InBlock objects by combining indices, blockNumbers and blockHashes
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
  getNullifierSiblingPath(
    _blockNumber: L2BlockNumber,
    _leafIndex: bigint,
  ): Promise<SiblingPath<typeof NULLIFIER_TREE_HEIGHT>> {
    throw new Error('TXE Node method getNullifierSiblingPath not implemented');
  }

  /**
   * Returns a sibling path for the given index in the note hash tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - The index of the leaf for which the sibling path is required.
   * @returns The sibling path for the leaf index.
   */
  getNoteHashSiblingPath(
    _blockNumber: L2BlockNumber,
    _leafIndex: bigint,
  ): Promise<SiblingPath<typeof NOTE_HASH_TREE_HEIGHT>> {
    throw new Error('TXE Node method getNoteHashSiblingPath not implemented');
  }

  /**
   * Returns the index and a sibling path for a leaf in the committed l1 to l2 data tree.
   * @param blockNumber - The block number at which to get the data.
   * @param l1ToL2Message - The l1ToL2Message to get the index / sibling path for.
   * @returns A tuple of the index and the sibling path of the L1ToL2Message (undefined if not found).
   */
  getL1ToL2MessageMembershipWitness(
    _blockNumber: L2BlockNumber,
    _l1ToL2Message: Fr,
  ): Promise<[bigint, SiblingPath<typeof L1_TO_L2_MSG_TREE_HEIGHT>] | undefined> {
    throw new Error('TXE Node method getL1ToL2MessageMembershipWitness not implemented');
  }

  /**
   * Returns whether an L1 to L2 message is synced by archiver and if it's ready to be included in a block.
   * @param l1ToL2Message - The L1 to L2 message to check.
   * @returns Whether the message is synced and ready to be included in a block.
   */
  isL1ToL2MessageSynced(_l1ToL2Message: Fr): Promise<boolean> {
    throw new Error('TXE Node method isL1ToL2MessageSynced not implemented');
  }

  /**
   * Returns a membership witness of an l2ToL1Message in an ephemeral l2 to l1 message tree.
   * @dev Membership witness is a consists of the index and the sibling path of the l2ToL1Message.
   * @remarks This tree is considered ephemeral because it is created on-demand by: taking all the l2ToL1 messages
   * in a single block, and then using them to make a variable depth append-only tree with these messages as leaves.
   * The tree is discarded immediately after calculating what we need from it.
   * @param blockNumber - The block number at which to get the data.
   * @param l2ToL1Message - The l2ToL1Message to get the membership witness for.
   * @returns A tuple of the index and the sibling path of the L2ToL1Message.
   */
  getL2ToL1MessageMembershipWitness(
    _blockNumber: L2BlockNumber,
    _l2ToL1Message: Fr,
  ): Promise<[bigint, SiblingPath<number>]> {
    throw new Error('TXE Node method getL2ToL1MessageMembershipWitness not implemented');
  }

  /**
   * Returns a sibling path for a leaf in the committed historic blocks tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  getArchiveSiblingPath(_blockNumber: L2BlockNumber, _leafIndex: bigint): Promise<SiblingPath<typeof ARCHIVE_HEIGHT>> {
    throw new Error('TXE Node method getArchiveSiblingPath not implemented');
  }

  /**
   * Returns a sibling path for a leaf in the committed public data tree.
   * @param blockNumber - The block number at which to get the data.
   * @param leafIndex - Index of the leaf in the tree.
   * @returns The sibling path.
   */
  getPublicDataSiblingPath(
    _blockNumber: L2BlockNumber,
    _leafIndex: bigint,
  ): Promise<SiblingPath<typeof PUBLIC_DATA_TREE_HEIGHT>> {
    throw new Error('TXE Node method getPublicDataSiblingPath not implemented');
  }

  /**
   * Returns a nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the data.
   * @param nullifier - Nullifier we try to find witness for.
   * @returns The nullifier membership witness (if found).
   */
  getNullifierMembershipWitness(
    _blockNumber: L2BlockNumber,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    throw new Error('TXE Node method getNullifierMembershipWitness not implemented');
  }

  /**
   * Returns a low nullifier membership witness for a given nullifier at a given block.
   * @param blockNumber - The block number at which to get the data.
   * @param nullifier - Nullifier we try to find the low nullifier witness for.
   * @returns The low nullifier membership witness (if found).
   * @remarks Low nullifier witness can be used to perform a nullifier non-inclusion proof by leveraging the "linked
   * list structure" of leaves and proving that a lower nullifier is pointing to a bigger next value than the nullifier
   * we are trying to prove non-inclusion for.
   */
  getLowNullifierMembershipWitness(
    _blockNumber: L2BlockNumber,
    _nullifier: Fr,
  ): Promise<NullifierMembershipWitness | undefined> {
    throw new Error('TXE Node method getLowNullifierMembershipWitness not implemented');
  }

  /**
   * Returns a public data tree witness for a given leaf slot at a given block.
   * @param blockNumber - The block number at which to get the data.
   * @param leafSlot - The leaf slot we try to find the witness for.
   * @returns The public data witness (if found).
   * @remarks The witness can be used to compute the current value of the public data tree leaf. If the low leaf preimage corresponds to an
   * "in range" slot, means that the slot doesn't exist and the value is 0. If the low leaf preimage corresponds to the exact slot, the current value
   * is contained in the leaf preimage.
   */
  getPublicDataWitness(_blockNumber: L2BlockNumber, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    throw new Error('TXE Node method getPublicDataWitness not implemented');
  }

  /**
   * Get a block specified by its number.
   * @param number - The block number being requested.
   * @returns The requested block.
   */
  getBlock(_number: number): Promise<L2Block | undefined> {
    throw new Error('TXE Node method getBlock not implemented');
  }

  /**
   * Fetches the latest proven block number.
   * @returns The block number.
   */
  getProvenBlockNumber(): Promise<number> {
    throw new Error('TXE Node method getProvenBlockNumber not implemented');
  }

  /**
   * Method to determine if the node is ready to accept transactions.
   * @returns - Flag indicating the readiness for tx submission.
   */
  isReady(): Promise<boolean> {
    throw new Error('TXE Node method isReady not implemented');
  }

  /**
   * Method to request blocks. Will attempt to return all requested blocks but will return only those available.
   * @param from - The start of the range of blocks to return.
   * @param limit - The maximum number of blocks to return.
   * @returns The blocks requested.
   */
  getBlocks(_from: number, _limit: number): Promise<L2Block[]> {
    throw new Error('TXE Node method getBlocks not implemented');
  }

  getPublishedBlocks(_from: number, _limit: number): Promise<PublishedL2Block[]> {
    throw new Error('TXE Node method getPublishedBlocks not implemented');
  }

  /**
   * Method to fetch the version of the package.
   * @returns The node package version
   */
  getNodeVersion(): Promise<string> {
    throw new Error('TXE Node method getNodeVersion not implemented');
  }

  /**
   * Method to fetch the version of the rollup the node is connected to.
   * @returns The rollup version.
   */
  getVersion(): Promise<number> {
    return Promise.resolve(this.version);
  }

  /**
   * Method to fetch the chain id of the base-layer for the rollup.
   * @returns The chain id.
   */
  getChainId(): Promise<number> {
    return Promise.resolve(this.chainId);
  }

  /**
   * Method to fetch the currently deployed l1 contract addresses.
   * @returns The deployed contract addresses.
   */
  getL1ContractAddresses(): Promise<L1ContractAddresses> {
    throw new Error('TXE Node method getL1ContractAddresses not implemented');
  }

  /**
   * Method to fetch the protocol contract addresses.
   */
  getProtocolContractAddresses(): Promise<ProtocolContractAddresses> {
    throw new Error('TXE Node method getProtocolContractAddresses not implemented');
  }

  /**
   * Method to add a contract artifact to the database.
   * @param aztecAddress
   * @param artifact
   */
  registerContractFunctionSignatures(_address: AztecAddress, _signatures: string[]): Promise<void> {
    throw new Error('TXE Node method addContractArtifact not implemented');
  }

  /**
   * Gets public logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getPublicLogs(_filter: LogFilter): Promise<GetPublicLogsResponse> {
    throw new Error('TXE Node method getPublicLogs not implemented');
  }

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(_filter: LogFilter): Promise<GetContractClassLogsResponse> {
    throw new Error('TXE Node method getContractClassLogs not implemented');
  }

  /**
   * Method to submit a transaction to the p2p pool.
   * @param tx - The transaction to be submitted.
   * @returns Nothing.
   */
  sendTx(_tx: Tx): Promise<void> {
    throw new Error('TXE Node method sendTx not implemented');
  }

  /**
   * Fetches a transaction receipt for a given transaction hash. Returns a mined receipt if it was added
   * to the chain, a pending receipt if it's still in the mempool of the connected Aztec node, or a dropped
   * receipt if not found in the connected Aztec node.
   *
   * @param txHash - The transaction hash.
   * @returns A receipt of the transaction.
   */
  getTxReceipt(txHash: TxHash): Promise<TxReceipt> {
    const txEffect = this.#txReceiptsByTxHash.get(txHash.toString());
    if (!txEffect) {
      throw new Error('Unknown txHash');
    }

    return Promise.resolve(txEffect);
  }

  /**
   * Method to retrieve pending txs.
   * @returns The pending txs.
   */
  getPendingTxs(): Promise<Tx[]> {
    throw new Error('TXE Node method getPendingTxs not implemented');
  }

  /**
   * Retrieves the number of pending txs
   * @returns The number of pending txs.
   */
  getPendingTxCount(): Promise<number> {
    throw new Error('TXE Node method getPendingTxCount not implemented');
  }

  /**
   * Method to retrieve a single pending tx.
   * @param txHash - The transaction hash to return.
   * @returns The pending tx if it exists.
   */
  getTxByHash(_txHash: TxHash): Promise<Tx | undefined> {
    throw new Error('TXE Node method getTxByHash not implemented');
  }

  getTxsByHash(_txHashes: TxHash[]): Promise<Tx[]> {
    throw new Error('TXE Node method getTxByHash not implemented');
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
  async getPublicStorageAt(blockNumber: L2BlockNumber, contract: AztecAddress, slot: Fr): Promise<Fr> {
    const db: MerkleTreeReadOperations =
      blockNumber === (await this.getBlockNumber()) || blockNumber === 'latest' || blockNumber === undefined
        ? this.baseFork
        : this.nativeWorldStateService.getSnapshot(blockNumber);

    const leafSlot = await computePublicDataTreeLeafSlot(contract, slot);

    const lowLeafResult = await db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot.toBigInt());
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }
    const preimage = (await db.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;
    return preimage.leaf.value;
  }

  /**
   * Returns the currently committed block header.
   * @returns The current committed block header.
   */
  getBlockHeader(_blockNumber?: L2BlockNumber): Promise<BlockHeader> {
    throw new Error('TXE Node method getBlockHeader not implemented');
  }

  /**
   * Simulates the public part of a transaction with the current state.
   * This currently just checks that the transaction execution succeeds.
   * @param tx - The transaction to simulate.
   **/
  simulatePublicCalls(_tx: Tx, _enforceFeePayment = false): Promise<PublicSimulationOutput> {
    throw new Error('TXE Node method simulatePublicCalls not implemented');
  }

  /**
   * Returns true if the transaction is valid for inclusion at the current state. Valid transactions can be
   * made invalid by *other* transactions if e.g. they emit the same nullifiers, or come become invalid
   * due to e.g. the max_block_number property.
   * @param tx - The transaction to validate for correctness.
   * @param isSimulation - True if the transaction is a simulated one without generated proofs. (Optional)
   */
  isValidTx(_tx: Tx): Promise<TxValidationResult> {
    throw new Error('TXE Node method isValidTx not implemented');
  }

  /**
   * Updates the configuration of this node.
   * @param config - Updated configuration to be merged with the current one.
   */
  setConfig(_config: Partial<SequencerConfig & ProverConfig>): Promise<void> {
    throw new Error('TXE Node method setConfig not implemented');
  }

  /**
   * Returns a registered contract class given its id.
   * @param id - Id of the contract class.
   */
  getContractClass(_id: Fr): Promise<ContractClassPublic | undefined> {
    throw new Error('TXE Node method getContractClass not implemented');
  }

  /**
   * Returns a publicly deployed contract instance given its address.
   * @param address - Address of the deployed contract.
   */
  getContract(_address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> {
    throw new Error('TXE Node method getContract not implemented');
  }

  /** Forces the next block to be built bypassing all time and pending checks. Useful for testing. */
  flushTxs(): Promise<void> {
    throw new Error('TXE Node method flushTxs not implemented');
  }

  /**
   * Returns the ENR of this node for peer discovery, if available.
   */
  getEncodedEnr(): Promise<string | undefined> {
    throw new Error('TXE Node method getEncodedEnr not implemented');
  }

  /**
   * Method to fetch the current base fees.
   * @returns The current base fees.
   */
  getCurrentBaseFees(): Promise<GasFees> {
    throw new Error('TXE Node method getCurrentBaseFees not implemented');
  }

  /**
   * Retrieves all private logs from up to `limit` blocks, starting from the block number `from`.
   * @param from - The block number from which to begin retrieving logs.
   * @param limit - The maximum number of blocks to retrieve logs from.
   * @returns An array of private logs from the specified range of blocks.
   */
  getPrivateLogs(_from: number, _limit: number): Promise<PrivateLog[]> {
    throw new Error('TXE Node method getPrivateLogs not implemented');
  }

  /**
   * Returns the information about the server's node. Includes current Node version, compatible Noir version,
   * L1 chain identifier, protocol version, and L1 address of the rollup contract.
   * @returns - The node information.
   */
  getNodeInfo(): Promise<NodeInfo> {
    throw new Error('TXE Node method getNodeInfo not implemented');
  }

  /**
   * Returns the sync status of the node's world state
   */
  getWorldStateSyncStatus(): Promise<WorldStateSyncStatus> {
    throw new Error('TXE Node method getWorldStateSyncStatus not implemented');
  }

  getValidatorsStats(): Promise<ValidatorsStats> {
    throw new Error('TXE Node method getValidatorsStats not implemented');
  }
}
