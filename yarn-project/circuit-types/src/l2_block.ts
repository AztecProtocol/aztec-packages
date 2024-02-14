import {
  ContractData,
  L2BlockBody,
  L2BlockL2Logs,
  L2Tx,
  LogType,
  PublicDataWrite,
  TxEffect,
  TxEffectLogs,
  TxHash,
  TxL2Logs,
} from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  Header,
  MAX_NEW_COMMITMENTS_PER_TX,
  MAX_NEW_CONTRACTS_PER_TX,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  STRING_ENCODING,
} from '@aztec/circuits.js';
import { makeAppendOnlyTreeSnapshot, makeHeader } from '@aztec/circuits.js/factories';
import { times } from '@aztec/foundation/collection';
import { sha256 } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { createDebugLogger } from '@aztec/foundation/log';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

/**
 * The data that makes up the rollup proof, with encoder decoder functions.
 * TODO: Reuse data types and serialization functions from circuits package.
 */
export class L2Block {
  /* Having logger static to avoid issues with comparing 2 blocks */
  private static logger = createDebugLogger('aztec:l2_block');

  /**
   * The number of L2Tx in this L2Block not including padded txs
   */
  public numberOfTxs: number;

  #l1BlockNumber?: bigint;

  constructor(
    /** Snapshot of archive tree after the block is applied. */
    public archive: AppendOnlyTreeSnapshot,
    /** L2 block header. */
    public header: Header,
    /** L2 block body. */
    public body: L2BlockBody,
    /** Associated L1 block num */
    l1BlockNumber?: bigint,
  ) {
    const newNullifiers = body.txEffects.flatMap(txEffect => txEffect.newNullifiers);

    this.numberOfTxs = calculateNumTxsFromNullifiers(newNullifiers);
    this.#l1BlockNumber = l1BlockNumber;
  }

  /**
   * Constructs a new instance from named fields.
   * @param fields - Fields to pass to the constructor.
   * @param blockHash - Hash of the block.
   * @param l1BlockNumber - The block number of the L1 block that contains this L2 block.
   * @returns A new instance.
   */
  static fromFields(
    fields: {
      /** Snapshot of archive tree after the block is applied. */
      archive: AppendOnlyTreeSnapshot;
      /** L2 block header. */
      header: Header;
      body: L2BlockBody;
    },
    l1BlockNumber?: bigint,
  ) {
    return new this(fields.archive, fields.header, fields.body, l1BlockNumber);
  }

  /**
   * Deserializes a block from a buffer
   * @returns A deserialized L2 block.
   */
  static fromBuffer(buf: Buffer | BufferReader, withLogs: boolean = false) {
    const reader = BufferReader.asReader(buf);
    const header = reader.readObject(Header);
    const archive = reader.readObject(AppendOnlyTreeSnapshot);
    const body = reader.readObject(L2BlockBody, withLogs);

    return L2Block.fromFields({
      archive,
      header,
      body,
    });
  }

  /**
   * Serializes a block
   * @remarks This can be used specifying no logs, which is used when the block is being served via JSON-RPC because the logs are expected to be served
   * separately.
   * @returns A serialized L2 block logs.
   */
  toBuffer(includeLogs: boolean = false) {
    return serializeToBuffer(this.header, this.archive, this.body.toBuffer(includeLogs));
  }

  /**
   * Deserializes L2 block without logs from a buffer.
   * @param str - A serialized L2 block.
   * @returns Deserialized L2 block.
   */
  static fromString(str: string): L2Block {
    return L2Block.fromBuffer(Buffer.from(str, STRING_ENCODING));
  }

  /**
   * Serializes a block without logs to a string.
   * @remarks This is used when the block is being served via JSON-RPC because the logs are expected to be served
   * separately.
   * @returns A serialized L2 block without logs.
   */
  toString(): string {
    return this.toBuffer().toString(STRING_ENCODING);
  }

  /**
   * Helper function to attach logs related to a block.
   * @param logs - The logs to be attached to a block.
   * @param logType - The type of logs to be attached.
   * @remarks Here, because we can have L2 blocks without logs and those logs can be attached later.
   */
  attachLogs(encryptedLogs: L2BlockL2Logs, unencryptedLogs: L2BlockL2Logs) {
    if (
      new L2BlockL2Logs(encryptedLogs.txLogs.slice(this.numberOfTxs)).getTotalLogCount() !== 0 ||
      new L2BlockL2Logs(unencryptedLogs.txLogs.slice(this.numberOfTxs)).getTotalLogCount() !== 0
    ) {
      throw new Error('Logs exist in the padded area');
    }

    if (this.body.areLogsAttached()) {
      if (this.body.areLogsEqual(encryptedLogs, unencryptedLogs)) {
        L2Block.logger(`Logs already attached`);

        return;
      }

      throw new Error(`Trying to attach different logs to block ${this.header.globalVariables.blockNumber}.`);
    }

    this.body.attachLogs(encryptedLogs, unencryptedLogs);
  }

  /**
   * Creates an L2 block containing random data.
   * @param l2BlockNum - The number of the L2 block.
   * @param txsPerBlock - The number of transactions to include in the block.
   * @param numPrivateCallsPerTx - The number of private function calls to include in each transaction.
   * @param numPublicCallsPerTx - The number of public function calls to include in each transaction.
   * @param numEncryptedLogsPerCall - The number of encrypted logs per 1 private function invocation.
   * @param numUnencryptedLogsPerCall - The number of unencrypted logs per 1 public function invocation.
   * @returns The L2 block.
   */
  static random(
    l2BlockNum: number,
    txsPerBlock = 4,
    numPrivateCallsPerTx = 2,
    numPublicCallsPerTx = 3,
    numEncryptedLogsPerCall = 2,
    numUnencryptedLogsPerCall = 1,
    withLogs = true,
  ): L2Block {
    const txEffects = [...new Array(txsPerBlock)].map(
      _ =>
        new TxEffect(
          times(MAX_NEW_COMMITMENTS_PER_TX, Fr.random),
          times(MAX_NEW_NULLIFIERS_PER_TX, Fr.random),
          times(MAX_NEW_L2_TO_L1_MSGS_PER_TX, Fr.random),
          times(MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite.random),
          times(MAX_NEW_CONTRACTS_PER_TX, Fr.random),
          times(MAX_NEW_CONTRACTS_PER_TX, ContractData.random),
          withLogs
            ? new TxEffectLogs(
                TxL2Logs.random(numPrivateCallsPerTx, numEncryptedLogsPerCall, LogType.ENCRYPTED),
                TxL2Logs.random(numPublicCallsPerTx, numUnencryptedLogsPerCall, LogType.UNENCRYPTED),
              )
            : undefined,
        ),
    );

    const newL1ToL2Messages = times(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, Fr.random);

    const body = new L2BlockBody(newL1ToL2Messages, txEffects);

    return L2Block.fromFields(
      {
        archive: makeAppendOnlyTreeSnapshot(1),
        header: makeHeader(0, l2BlockNum),
        body,
      },
      // just for testing purposes, each random L2 block got emitted in the equivalent L1 block
      BigInt(l2BlockNum),
    );
  }

  get number(): number {
    return Number(this.header.globalVariables.blockNumber.toBigInt());
  }

  /**
   * Gets the L1 block number that included this block
   */
  public getL1BlockNumber(): bigint {
    if (typeof this.#l1BlockNumber === 'undefined') {
      throw new Error('L1 block number has to be attached before calling "getL1BlockNumber"');
    }

    return this.#l1BlockNumber;
  }

  /**
   * Sets the L1 block number that included this block
   * @param l1BlockNumber - The block number of the L1 block that contains this L2 block.
   */
  public setL1BlockNumber(l1BlockNumber: bigint) {
    this.#l1BlockNumber = l1BlockNumber;
  }

  /**
   * Returns the block's hash (hash of block header).
   * @returns The block's hash.
   */
  public hash(): Fr {
    return this.header.hash();
  }

  /**
   * Computes the public inputs hash for the L2 block.
   * The same output as the hash of RootRollupPublicInputs.
   * @returns The public input hash for the L2 block as a field element.
   */
  getPublicInputsHash(): Fr {
    const buf = serializeToBuffer(
      this.header.globalVariables,
      // TODO(#3868)
      AppendOnlyTreeSnapshot.zero(), // this.startNoteHashTreeSnapshot / committments,
      AppendOnlyTreeSnapshot.zero(), // this.startNullifierTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startContractTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startPublicDataTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startL1ToL2MessageTreeSnapshot,
      this.header.lastArchive,
      this.header.state.partial.noteHashTree,
      this.header.state.partial.nullifierTree,
      this.header.state.partial.contractTree,
      this.header.state.partial.publicDataTree,
      this.header.state.l1ToL2MessageTree,
      this.archive,
      this.body.getCalldataHash(),
      this.getL1ToL2MessagesHash(),
    );

    return Fr.fromBufferReduce(sha256(buf));
  }

  /**
   * Computes the start state hash (should equal contract data before block).
   * @returns The start state hash for the L2 block.
   */
  getStartStateHash() {
    const inputValue = serializeToBuffer(
      new Fr(Number(this.header.globalVariables.blockNumber.toBigInt()) - 1),
      // TODO(#3868)
      AppendOnlyTreeSnapshot.zero(), // this.startNoteHashTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startNullifierTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startContractTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startPublicDataTreeSnapshot,
      AppendOnlyTreeSnapshot.zero(), // this.startL1ToL2MessageTreeSnapshot,
      this.header.lastArchive,
    );
    return sha256(inputValue);
  }

  /**
   * Computes the end state hash (should equal contract data after block).
   * @returns The end state hash for the L2 block.
   */
  getEndStateHash() {
    const inputValue = serializeToBuffer(
      this.header.globalVariables.blockNumber,
      this.header.state.partial.noteHashTree,
      this.header.state.partial.nullifierTree,
      this.header.state.partial.contractTree,
      this.header.state.partial.publicDataTree,
      this.header.state.l1ToL2MessageTree,
      this.archive,
    );
    return sha256(inputValue);
  }

  /**
   * Compute the hash of all of this blocks l1 to l2 messages,
   * The hash is also calculated within the contract when the block is submitted.
   * @returns The hash of all of the l1 to l2 messages.
   */
  getL1ToL2MessagesHash(): Buffer {
    // Create a long buffer of all of the l1 to l2 messages
    const l1ToL2Messages = Buffer.concat(this.body.l1ToL2Messages.map(message => message.toBuffer()));
    return sha256(l1ToL2Messages);
  }

  /**
   * Get the ith transaction in an L2 block.
   * @param txIndex - The index of the tx in the block.
   * @returns The tx.
   */
  getTx(txIndex: number) {
    this.assertIndexInRange(txIndex);

    const txEffect = this.body.txEffects[txIndex];

    const newNoteHashes = txEffect.newNoteHashes.filter(x => !x.isZero());
    const newNullifiers = txEffect.newNullifiers.filter(x => !x.isZero());
    const newPublicDataWrites = txEffect.newPublicDataWrites.filter(x => !x.isEmpty());
    const newL2ToL1Msgs = txEffect.newL2ToL1Msgs.filter(x => !x.isZero());
    const newContracts = txEffect.contractLeaves.filter(x => !x.isZero());
    const newContractData = txEffect.contractData.filter(x => !x.isEmpty());

    return new L2Tx(
      newNoteHashes,
      newNullifiers,
      newPublicDataWrites,
      newL2ToL1Msgs,
      newContracts,
      newContractData,
      this.hash(),
      Number(this.header.globalVariables.blockNumber.toBigInt()),
    );
  }

  /**
   * A lightweight method to get the tx hash of a tx in the block.
   * @param txIndex - the index of the tx in the block
   * @returns a hash of the tx, which is the first nullifier in the tx
   */
  getTxHash(txIndex: number): TxHash {
    this.assertIndexInRange(txIndex);

    // Gets the first nullifier of the tx specified by txIndex
    const firstNullifier = this.body.txEffects[txIndex].newNullifiers[0];

    return new TxHash(firstNullifier.toBuffer());
  }

  /**
   * Get all the transaction in an L2 block.
   * @returns The tx.
   */
  getTxs() {
    return Array(this.numberOfTxs)
      .fill(0)
      .map((_, i) => this.getTx(i));
  }

  /**
   * Returns stats used for logging.
   * @returns Stats on tx count, number, and log size and count.
   */
  getStats() {
    const logsStats = this.body.areLogsAttached() && {
      encryptedLogLength: this.body.txEffects.reduce(
        (logCount, txEffect) => logCount + txEffect.logs!.encryptedLogs.getSerializedLength(),
        0,
      ),
      encryptedLogCount: this.body.txEffects.reduce(
        (logCount, txEffect) => logCount + txEffect.logs!.encryptedLogs.getTotalLogCount(),
        0,
      ),
      unencryptedLogCount: this.body.txEffects.reduce(
        (logCount, txEffect) => logCount + txEffect.logs!.unencryptedLogs.getSerializedLength(),
        0,
      ),
      unencryptedLogSize: this.body.txEffects.reduce(
        (logCount, txEffect) => logCount + txEffect.logs!.unencryptedLogs.getTotalLogCount(),
        0,
      ),
    };

    return {
      txCount: this.numberOfTxs,
      blockNumber: this.number,
      ...logsStats,
    };
  }

  assertIndexInRange(txIndex: number) {
    if (txIndex < 0 || txIndex >= this.numberOfTxs) {
      throw new IndexOutOfRangeError({
        txIndex,
        numberOfTxs: this.numberOfTxs,
        blockNumber: this.number,
      });
    }
  }
  // /**
  //  * Inspect for debugging purposes..
  //  * @param maxBufferSize - The number of bytes to be extracted from buffer.
  //  * @returns A human-friendly string representation of the l2Block.
  //  */
  // inspect(maxBufferSize = 4): string {
  //   const inspectHex = (fr: {
  //     /**
  //      * A function used to serialize the field element to a buffer.
  //      */
  //     toBuffer: () => Buffer;
  //   }): string => `0x${fr.toBuffer().subarray(0, maxBufferSize).toString('hex')}`;
  //   const inspectArray = <T>(arr: T[], inspector: (t: T) => string) => '[' + arr.map(inspector).join(', ') + ']';

  //   const inspectTreeSnapshot = (s: AppendOnlyTreeSnapshot): string =>
  //     `(${s.nextAvailableLeafIndex}, ${inspectHex(s.root)})`;
  //   const inspectGlobalVariables = (gv: GlobalVariables): string => {
  //     return `(${gv.chainId}, ${gv.version}, ${gv.blockNumber}, ${gv.timestamp}))`;
  //   };
  //   const inspectFrArray = (arr: Fr[]): string => inspectArray(arr, inspectHex);
  //   const inspectContractDataArray = (arr: ContractData[]): string =>
  //     inspectArray(arr, cd => `(${inspectHex(cd.contractAddress)}, ${inspectHex(cd.portalContractAddress)})`);
  //   const inspectPublicDataWriteArray = (arr: PublicDataWrite[]): string =>
  //     inspectArray(arr, pdw => `(${inspectHex(pdw.leafIndex)}, ${inspectHex(pdw.newValue)})`);

  //   return [
  //     `L2Block`,
  //     `number: ${this.header.globalVariables.blockNumber}`,
  //     `globalVariables: ${inspectGlobalVariables(this.globalVariables)}`,
  //     `startNoteHashTreeSnapshot: ${inspectTreeSnapshot(this.startNoteHashTreeSnapshot)}`,
  //     `startNullifierTreeSnapshot: ${inspectTreeSnapshot(this.startNullifierTreeSnapshot)}`,
  //     `startContractTreeSnapshot: ${inspectTreeSnapshot(this.startContractTreeSnapshot)}`,
  //     `startPublicDataTreeSnapshot: ${this.startPublicDataTreeSnapshot.toString()}`,
  //     `startL1ToL2MessageTreeSnapshot: ${inspectTreeSnapshot(this.startL1ToL2MessageTreeSnapshot)}`,
  //     `startArchiveSnapshot: ${inspectTreeSnapshot(this.startArchiveSnapshot)}`,
  //     `endNoteHashTreeSnapshot: ${inspectTreeSnapshot(this.endNoteHashTreeSnapshot)}`,
  //     `endNullifierTreeSnapshot: ${inspectTreeSnapshot(this.endNullifierTreeSnapshot)}`,
  //     `endContractTreeSnapshot: ${inspectTreeSnapshot(this.endContractTreeSnapshot)}`,
  //     `endPublicDataTreeSnapshot: ${this.endPublicDataTreeSnapshot.toString()}`,
  //     `endPublicDataTreeSnapshot: ${this.endPublicDataTreeSnapshot.toString()}`,
  //     `endL1ToL2MessageTreeSnapshot: ${inspectTreeSnapshot(this.endL1ToL2MessageTreeSnapshot)}`,
  //     `endArchiveSnapshot: ${inspectTreeSnapshot(this.endArchiveSnapshot)}`,
  //     `newCommitments: ${inspectFrArray(this.newCommitments)}`,
  //     `newNullifiers: ${inspectFrArray(this.newNullifiers)}`,
  //     `newPublicDataWrite: ${inspectPublicDataWriteArray(this.newPublicDataWrites)}`,
  //     `newL2ToL1Msgs: ${inspectFrArray(this.newL2ToL1Msgs)}`,
  //     `newContracts: ${inspectFrArray(this.newContracts)}`,
  //     `newContractData: ${inspectContractDataArray(this.newContractData)}`,
  //     `newPublicDataWrite: ${inspectPublicDataWriteArray(this.newPublicDataWrites)}`,
  //     `newL1ToL2Messages: ${inspectFrArray(this.newL1ToL2Messages)}`,
  //   ].join('\n');
  // }
}

function calculateNumTxsFromNullifiers(nullifiers: Fr[]) {
  let numberOfNonEmptyTxs = 0;
  for (let i = 0; i < nullifiers.length; i += MAX_NEW_NULLIFIERS_PER_TX) {
    if (!nullifiers[i].equals(Fr.ZERO)) {
      numberOfNonEmptyTxs++;
    }
  }

  return numberOfNonEmptyTxs;
}

/**
 * Custom error class for when a requested tx index is out of range.
 */
export class IndexOutOfRangeError extends Error {
  constructor({
    txIndex,
    numberOfTxs,
    blockNumber,
  }: {
    /**
     * The requested index of the tx in the block.
     */
    txIndex: number;
    /**
     * The number of txs in the block.
     */
    numberOfTxs: number;
    /**
     * The number of the block.
     */
    blockNumber: number;
  }) {
    super(`IndexOutOfRangeError: Failed to get tx at index ${txIndex}. Block ${blockNumber} has ${numberOfTxs} txs.`);
  }
}
