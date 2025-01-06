import { createLogger } from '@aztec/aztec.js';
import {
  type AztecNode,
  type EpochProofQuote,
  type GetUnencryptedLogsResponse,
  type InBlock,
  type L2Block,
  type L2BlockNumber,
  type L2Tips,
  type LogFilter,
  type MerkleTreeId,
  type NullifierMembershipWitness,
  type ProverConfig,
  type PublicDataWitness,
  type PublicSimulationOutput,
  type SequencerConfig,
  type SiblingPath,
  type Tx,
  type TxEffect,
  TxHash,
  type TxReceipt,
  TxScopedL2Log,
  type UnencryptedL2Log,
} from '@aztec/circuit-types';
import {
  type ARCHIVE_HEIGHT,
  type AztecAddress,
  type BlockHeader,
  type ContractClassPublic,
  type ContractInstanceWithAddress,
  type GasFees,
  type L1_TO_L2_MSG_TREE_HEIGHT,
  type NOTE_HASH_TREE_HEIGHT,
  type NULLIFIER_TREE_HEIGHT,
  type NodeInfo,
  type PUBLIC_DATA_TREE_HEIGHT,
  type PrivateLog,
  type ProtocolContractAddresses,
} from '@aztec/circuits.js';
import { type L1ContractAddresses } from '@aztec/ethereum';
import { Fr } from '@aztec/foundation/fields';

export class TXENode implements AztecNode {
  #logsByTags = new Map<string, TxScopedL2Log[]>();
  #txEffectsByTxHash = new Map<string, InBlock<TxEffect> | undefined>();
  #blockNumberToNullifiers = new Map<number, Fr[]>();
  #noteIndex = 0;

  #blockNumber: number;
  #logger = createLogger('aztec:txe_node');

  constructor(blockNumber: number) {
    this.#blockNumber = blockNumber;
  }

  /**
   * Fetches the current block number.
   * @returns The block number.
   */
  getBlockNumber(): Promise<number> {
    return Promise.resolve(this.#blockNumber);
  }

  /**
   * Sets the current block number of the node.
   * @param - The block number to set.
   */
  setBlockNumber(blockNumber: number) {
    this.#blockNumber = blockNumber;
  }

  /**
   * Get a tx effect.
   * @param txHash - The hash of a transaction which resulted in the returned tx effect.
   * @returns The requested tx effect.
   */
  getTxEffect(txHash: TxHash): Promise<InBlock<TxEffect> | undefined> {
    const txEffect = this.#txEffectsByTxHash.get(new Fr(txHash.toBuffer()).toString());

    return Promise.resolve(txEffect);
  }

  /**
   * Sets a tx effect for a given block number.
   * @param blockNumber - The block number that this tx effect resides.
   * @param txHash - The transaction hash of the transaction.
   * @param effect - The tx effect to set.
   */
  setTxEffect(blockNumber: number, txHash: TxHash, effect: TxEffect) {
    this.#txEffectsByTxHash.set(new Fr(txHash.toBuffer()).toString(), {
      l2BlockHash: blockNumber.toString(),
      l2BlockNumber: blockNumber,
      data: effect,
    });
  }

  /**
   * Returns the indexes of the given nullifiers in the nullifier tree,
   * scoped to the block they were included in.
   * @param blockNumber - The block number at which to get the data.
   * @param nullifiers - The nullifiers to search for.
   * @returns The block scoped indexes of the given nullifiers in the nullifier tree, or undefined if not found.
   */
  async findNullifiersIndexesWithBlock(
    blockNumber: L2BlockNumber,
    nullifiers: Fr[],
  ): Promise<(InBlock<bigint> | undefined)[]> {
    const parsedBlockNumber = blockNumber === 'latest' ? await this.getBlockNumber() : blockNumber;

    const nullifiersInBlock: Fr[] = [];
    for (const [key, val] of this.#blockNumberToNullifiers.entries()) {
      if (key < parsedBlockNumber) {
        nullifiersInBlock.push(...val);
      }
    }

    return nullifiers.map(nullifier => {
      const possibleNullifierIndex = nullifiersInBlock.findIndex(nullifierInBlock =>
        nullifierInBlock.equals(nullifier),
      );
      return possibleNullifierIndex === -1
        ? undefined
        : {
            l2BlockNumber: parsedBlockNumber,
            l2BlockHash: new Fr(parsedBlockNumber).toString(),
            data: BigInt(possibleNullifierIndex),
          };
    });
  }

  /**
   * Returns the indexes of the given nullifiers in the nullifier tree,
   * scoped to the block they were included in.
   * @param blockNumber - The block number at which to get the data.
   * @param nullifiers - The nullifiers to search for.
   * @returns The block scoped indexes of the given nullifiers in the nullifier tree, or undefined if not found.
   */
  setNullifiersIndexesWithBlock(blockNumber: number, nullifiers: Fr[]) {
    this.#blockNumberToNullifiers.set(blockNumber, nullifiers);
  }

  /**
   * Adds note logs to the txe node, given a block
   * @param blockNumber - The block number at which to add the note logs.
   * @param privateLogs - The privateLogs that contain the note logs to be added.
   */
  addNoteLogsByTags(blockNumber: number, privateLogs: PrivateLog[]) {
    privateLogs.forEach(log => {
      const tag = log.fields[0];
      const currentLogs = this.#logsByTags.get(tag.toString()) ?? [];
      const scopedLog = new TxScopedL2Log(
        new TxHash(new Fr(blockNumber)),
        this.#noteIndex,
        blockNumber,
        false,
        log.toBuffer(),
      );
      currentLogs.push(scopedLog);
      this.#logsByTags.set(tag.toString(), currentLogs);
    });

    // TODO: DISTINGUISH BETWEEN EVENT LOGS AND NOTE LOGS ?
    this.#noteIndex += privateLogs.length;
  }

  /**
   * Adds public logs to the txe node, given a block
   * @param blockNumber - The block number at which to add the public logs.
   * @param privateLogs - The unencrypted logs to be added.
   */
  addPublicLogsByTags(blockNumber: number, unencryptedLogs: UnencryptedL2Log[]) {
    unencryptedLogs.forEach(log => {
      if (log.data.length < 32 * 33) {
        // TODO remove when #9835 and #9836 are fixed
        this.#logger.warn(`Skipping unencrypted log with insufficient data length: ${log.data.length}`);
        return;
      }
      try {
        // TODO remove when #9835 and #9836 are fixed. The partial note logs are emitted as bytes, but encoded as Fields.
        // This means that for every 32 bytes of payload, we only have 1 byte of data.
        // Also, the tag is not stored in the first 32 bytes of the log, (that's the length of public fields now) but in the next 32.
        const correctedBuffer = Buffer.alloc(32);
        const initialOffset = 32;
        for (let i = 0; i < 32; i++) {
          const byte = Fr.fromBuffer(log.data.subarray(i * 32 + initialOffset, i * 32 + 32 + initialOffset)).toNumber();
          correctedBuffer.writeUInt8(byte, i);
        }
        const tag = new Fr(correctedBuffer);

        this.#logger.verbose(
          `Found tagged unencrypted log with tag ${tag.toString()} in block ${this.getBlockNumber()}`,
        );

        const currentLogs = this.#logsByTags.get(tag.toString()) ?? [];
        const scopedLog = new TxScopedL2Log(
          new TxHash(new Fr(blockNumber)),
          this.#noteIndex,
          blockNumber,
          true,
          log.toBuffer(),
        );

        currentLogs.push(scopedLog);
        this.#logsByTags.set(tag.toString(), currentLogs);
      } catch (err) {
        this.#logger.warn(`Failed to add tagged log to store: ${err}`);
      }
    });
  }
  /**
   * Gets all logs that match any of the received tags (i.e. logs with their first field equal to a tag).
   * @param tags - The tags to filter the logs by.
   * @returns For each received tag, an array of matching logs and metadata (e.g. tx hash) is returned. An empty
   array implies no logs match that tag.
   */
  getLogsByTags(tags: Fr[]): Promise<TxScopedL2Log[][]> {
    const noteLogs = tags.map(tag => this.#logsByTags.get(tag.toString()) ?? []);

    return Promise.resolve(noteLogs);
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
   * @returns The indexes of the given leaves in the given tree or undefined if not found.
   */
  findLeavesIndexes(
    _blockNumber: L2BlockNumber,
    _treeId: MerkleTreeId,
    _leafValues: Fr[],
  ): Promise<(bigint | undefined)[]> {
    throw new Error('TXE Node method findLeavesIndexes not implemented');
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
  getPublicDataTreeWitness(_blockNumber: L2BlockNumber, _leafSlot: Fr): Promise<PublicDataWitness | undefined> {
    throw new Error('TXE Node method getPublicDataTreeWitness not implemented');
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
    throw new Error('TXE Node method getVersion not implemented');
  }

  /**
   * Method to fetch the chain id of the base-layer for the rollup.
   * @returns The chain id.
   */
  getChainId(): Promise<number> {
    throw new Error('TXE Node method getChainId not implemented');
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
  registerContractFunctionNames(_address: AztecAddress, _names: Record<string, string>): Promise<void> {
    throw new Error('TXE Node method addContractArtifact not implemented');
  }

  /**
   * Gets unencrypted logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getUnencryptedLogs(_filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
    throw new Error('TXE Node method getUnencryptedLogs not implemented');
  }

  /**
   * Gets contract class logs based on the provided filter.
   * @param filter - The filter to apply to the logs.
   * @returns The requested logs.
   */
  getContractClassLogs(_filter: LogFilter): Promise<GetUnencryptedLogsResponse> {
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
  getTxReceipt(_txHash: TxHash): Promise<TxReceipt> {
    throw new Error('TXE Node method getTxReceipt not implemented');
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
  getPublicStorageAt(_contract: AztecAddress, _slot: Fr, _blockNumber: L2BlockNumber): Promise<Fr> {
    throw new Error('TXE Node method getPublicStorageAt not implemented');
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
  isValidTx(_tx: Tx, _isSimulation?: boolean): Promise<boolean> {
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
   * Receives a quote for an epoch proof and stores it in its EpochProofQuotePool
   * @param quote - The quote to store
   */
  addEpochProofQuote(_quote: EpochProofQuote): Promise<void> {
    throw new Error('TXE Node method addEpochProofQuote not implemented');
  }

  /**
   * Returns the received quotes for a given epoch
   * @param epoch - The epoch for which to get the quotes
   */
  getEpochProofQuotes(_epoch: bigint): Promise<EpochProofQuote[]> {
    throw new Error('TXE Node method getEpochProofQuotes not implemented');
  }

  /**
   * Adds a contract class bypassing the registerer.
   * TODO(#10007): Remove this method.
   * @param contractClass - The class to register.
   */
  addContractClass(_contractClass: ContractClassPublic): Promise<void> {
    throw new Error('TXE Node method addContractClass not implemented');
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
   * Find the block numbers of the given leaf indices in the given tree.
   * @param blockNumber - The block number at which to get the data or 'latest' for latest data
   * @param treeId - The tree to search in.
   * @param leafIndices - The values to search for
   * @returns The indexes of the given leaves in the given tree or undefined if not found.
   */
  findBlockNumbersForIndexes(
    _blockNumber: L2BlockNumber,
    _treeId: MerkleTreeId,
    _leafIndices: bigint[],
  ): Promise<(bigint | undefined)[]> {
    throw new Error('TXE Node method findBlockNumbersForIndexes not implemented');
  }

  /**
   * Returns the information about the server's node. Includes current Node version, compatible Noir version,
   * L1 chain identifier, protocol version, and L1 address of the rollup contract.
   * @returns - The node information.
   */
  getNodeInfo(): Promise<NodeInfo> {
    throw new Error('TXE Node method getNodeInfo not implemented');
  }
}
