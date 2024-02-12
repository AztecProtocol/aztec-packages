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

import { ContractData } from './contract_data.js';
import { L2Tx } from './l2_tx.js';
import { LogType, TxL2Logs } from './logs/index.js';
import { L2BlockL2Logs } from './logs/l2_block_l2_logs.js';
import { PublicDataWrite } from './public_data_write.js';
import { TxHash } from './tx/tx_hash.js';

export class TxEffectLogs {
  constructor(
    /**
     * Encrypted logs emitted by txs in this block.
     * @remarks `L2BlockL2Logs.txLogs` array has to match number of txs in this block and has to be in the same order
     *          (e.g. logs from the first tx on the first place...).
     * @remarks Only private function can emit encrypted logs and for this reason length of
     *          `newEncryptedLogs.txLogs.functionLogs` is equal to the number of private function invocations in the tx.
     */
    public encryptedLogs: TxL2Logs,
    /**
     * Unencrypted logs emitted by txs in this block.
     * @remarks `L2BlockL2Logs.txLogs` array has to match number of txs in this block and has to be in the same order
     *          (e.g. logs from the first tx on the first place...).
     * @remarks Both private and public functions can emit unencrypted logs and for this reason length of
     *          `newUnencryptedLogs.txLogs.functionLogs` is equal to the number of all function invocations in the tx.
     */
    public unencryptedLogs: TxL2Logs,
  ) {}
}

export class TxEffect {
  constructor(
    /**
     * The commitments to be inserted into the note hash tree.
     */
    public newNoteHashes: Fr[],
    /**
     * The nullifiers to be inserted into the nullifier tree.
     */
    public newNullifiers: Fr[],
    /**
     * The L2 to L1 messages to be inserted into the messagebox on L1.
     */
    public newL2ToL1Msgs: Fr[],
    /**
     * The public data writes to be inserted into the public data tree.
     */
    public newPublicDataWrites: PublicDataWrite[],
    public contractLeaves: Fr[],
    public contractData: ContractData[],
    public logs?: TxEffectLogs,
  ) {
    if (newNoteHashes.length % MAX_NEW_COMMITMENTS_PER_TX !== 0) {
      throw new Error(`The number of new commitments must be a multiple of ${MAX_NEW_COMMITMENTS_PER_TX}.`);
    }
  }
}

export class L2BlockBody {
  constructor(public l1ToL2Messages: Fr[], public txEffects: TxEffect[]) {}
}

/**
 * The data that makes up the rollup proof, with encoder decoder functions.
 * TODO: Reuse data types and serialization functions from circuits package.
 */
export class L2Block {
  /* Having logger static to avoid issues with comparing 2 blocks */
  private static logger = createDebugLogger('aztec:l2_block');

  /**
   * The number of L2Tx in this L2Block.
   */
  public numberOfTxs: number;

  #l1BlockNumber?: bigint;

  constructor(
    /** Snapshot of archive tree after the block is applied. */
    public archive: AppendOnlyTreeSnapshot,
    /** L2 block header. */
    public header: Header,
    public body: L2BlockBody,
    l1BlockNumber?: bigint,
  ) {
    const newNullifiers = body.txEffects.flatMap(txEffect => txEffect.newNullifiers);
    let numberOfRealTransactions = 0;
    for (
      let i = 0;
      i < body.txEffects.flatMap(txEffect => txEffect.newNullifiers).length;
      i += MAX_NEW_NULLIFIERS_PER_TX
    ) {
      if (!newNullifiers[i].equals(Fr.ZERO)) {
        numberOfRealTransactions++;
      }
    }
    this.numberOfTxs = numberOfRealTransactions;
    this.#l1BlockNumber = l1BlockNumber;
  }

  get number(): number {
    return Number(this.header.globalVariables.blockNumber.toBigInt());
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
   * Serializes a block
   * @remarks This is used specifying no logs, and a header when the block is being served via JSON-RPC because the logs are expected to be served
   * separately.
   * Otherwise it is used with logs, and no header when serializing a block to be published on L1
   * @returns A serialized L2 block without logs.
   */
  toBuffer(includeLogs: boolean = false, includeHeader: boolean = true) {
    let logs: [L2BlockL2Logs, L2BlockL2Logs] | [] = [];

    if (includeLogs) {
      this.assertLogsAttached();

      const newEncryptedLogs = this.body.txEffects.flatMap(txEffect => txEffect.logs!.encryptedLogs);
      const newUnencryptedLogs = this.body.txEffects.flatMap(txEffect => txEffect.logs!.unencryptedLogs);
      logs = [new L2BlockL2Logs(newEncryptedLogs), new L2BlockL2Logs(newUnencryptedLogs)];
    }

    const newCommitments = this.body.txEffects.flatMap(txEffect => txEffect.newNoteHashes);
    const newNullifiers = this.body.txEffects.flatMap(txEffect => txEffect.newNullifiers);
    const newPublicDataWrites = this.body.txEffects.flatMap(txEffect => txEffect.newPublicDataWrites);
    const newL2ToL1Msgs = this.body.txEffects.flatMap(txEffect => txEffect.newL2ToL1Msgs);
    const newContracts = this.body.txEffects.flatMap(txEffect => txEffect.contractLeaves);
    const newContractData = this.body.txEffects.flatMap(txEffect => txEffect.contractData);
    const newL1ToL2Messages = this.body.l1ToL2Messages;

    const header: [Header, AppendOnlyTreeSnapshot] | [] = includeHeader ? [this.header, this.archive] : [];

    return serializeToBuffer(
      ...header,
      newCommitments.length,
      newCommitments,
      newNullifiers.length,
      newNullifiers,
      newPublicDataWrites.length,
      newPublicDataWrites,
      newL2ToL1Msgs.length,
      newL2ToL1Msgs,
      newContracts.length,
      newContracts,
      newContractData,
      newL1ToL2Messages.length,
      newL1ToL2Messages,
      ...logs,
    );
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

  static fromBuffer(buf: Buffer | BufferReader, withLogs: boolean = false) {
    const reader = BufferReader.asReader(buf);
    const header = reader.readObject(Header);
    const archive = reader.readObject(AppendOnlyTreeSnapshot);
    const newCommitments = reader.readVector(Fr);
    const newNullifiers = reader.readVector(Fr);
    const newPublicDataWrites = reader.readVector(PublicDataWrite);
    const newL2ToL1Msgs = reader.readVector(Fr);
    const newContracts = reader.readVector(Fr);
    const newContractData = reader.readArray(newContracts.length, ContractData);
    // TODO(sean): could an optimization of this be that it is encoded such that zeros are assumed
    // It seems the da/ tx hash would be fine, would only need to edit circuits ?
    const newL1ToL2Messages = reader.readVector(Fr);

    let newEncryptedLogs: L2BlockL2Logs;
    let newUnencryptedLogs: L2BlockL2Logs;

    // Because TX's in a block are padded to nearest power of 2, this is finding the nearest nonzero tx filled with 1 nullifier
    let numberOfRealTransactions = 0;
    for (let i = 0; i < newNullifiers.length; i += MAX_NEW_NULLIFIERS_PER_TX) {
      if (!newNullifiers[i].equals(Fr.ZERO)) {
        numberOfRealTransactions++;
      }
    }

    const numberOfTransactionsIncludingPadded = newNullifiers.length / MAX_NEW_NULLIFIERS_PER_TX;

    if (withLogs) {
      newEncryptedLogs = reader.readObject(L2BlockL2Logs);
      newUnencryptedLogs = reader.readObject(L2BlockL2Logs);

      if (
        new L2BlockL2Logs(newEncryptedLogs.txLogs.slice(numberOfRealTransactions)).getTotalLogCount() !== 0 ||
        new L2BlockL2Logs(newUnencryptedLogs.txLogs.slice(numberOfRealTransactions)).getTotalLogCount() !== 0
      ) {
        throw new Error('Logs exist in the padded area');
      }
    }

    const txEffects: TxEffect[] = [];

    for (let i = 0; i < numberOfTransactionsIncludingPadded; i += 1) {
      const logs: TxEffectLogs[] = withLogs
        ? [new TxEffectLogs(newEncryptedLogs!.txLogs[i], newUnencryptedLogs!.txLogs[i])]
        : [];

      txEffects.push(
        new TxEffect(
          newCommitments.slice(i * MAX_NEW_COMMITMENTS_PER_TX, (i + 1) * MAX_NEW_COMMITMENTS_PER_TX),
          newNullifiers.slice(i * MAX_NEW_NULLIFIERS_PER_TX, (i + 1) * MAX_NEW_NULLIFIERS_PER_TX),
          newL2ToL1Msgs.slice(i * MAX_NEW_L2_TO_L1_MSGS_PER_TX, (i + 1) * MAX_NEW_L2_TO_L1_MSGS_PER_TX),
          newPublicDataWrites.slice(
            i * MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
            (i + 1) * MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
          ),
          newContracts.slice(i * MAX_NEW_CONTRACTS_PER_TX, (i + 1) * MAX_NEW_CONTRACTS_PER_TX),
          newContractData.slice(i * MAX_NEW_CONTRACTS_PER_TX, (i + 1) * MAX_NEW_CONTRACTS_PER_TX),
          ...logs,
        ),
      );
    }

    const body = new L2BlockBody(newL1ToL2Messages, txEffects);

    return L2Block.fromFields({
      archive,
      header,
      body,
    });
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
   * Helper function to attach logs related to a block.
   * @param logs - The logs to be attached to a block.
   * @param logType - The type of logs to be attached.
   * @remarks Here, because we can have L2 blocks without logs and those logs can be attached later.
   */
  attachLogs(encryptedLogs: L2BlockL2Logs, unencrypedLogs: L2BlockL2Logs) {
    if (
      new L2BlockL2Logs(encryptedLogs.txLogs.slice(this.numberOfTxs)).getTotalLogCount() !== 0 ||
      new L2BlockL2Logs(unencrypedLogs.txLogs.slice(this.numberOfTxs)).getTotalLogCount() !== 0
    ) {
      throw new Error('Logs exist in the padded area');
    }

    const txEffects = this.body.txEffects;

    if (this.areLogsAttached()) {
      if (
        txEffects.every(
          (txEffect, i) =>
            txEffect.logs?.encryptedLogs.equals(encryptedLogs.txLogs[i]) &&
            txEffect.logs?.unencryptedLogs.equals(unencrypedLogs.txLogs[i]),
        )
      ) {
        L2Block.logger(`Logs already attached`);
        return;
      } else {
        throw new Error(`Trying to attach different logs to block ${this.header.globalVariables.blockNumber}.`);
      }
    }

    txEffects.forEach((txEffect, i) => {
      txEffect.logs = new TxEffectLogs(encryptedLogs.txLogs[i], unencrypedLogs.txLogs[i]);
    });
  }

  /**
   * Sets the L1 block number that included this block
   * @param l1BlockNumber - The block number of the L1 block that contains this L2 block.
   */
  public setL1BlockNumber(l1BlockNumber: bigint) {
    this.#l1BlockNumber = l1BlockNumber;
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
      this.getCalldataHash(),
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
   * Computes the calldata hash for the L2 block
   * This calldata hash is also computed by the rollup contract when the block is submitted,
   * and inside the circuit, it is part of the public inputs.
   * @returns The calldata hash.
   */
  getCalldataHash() {
    this.assertLogsAttached();

    const computeRoot = (leafs: Buffer[]): Buffer => {
      const layers: Buffer[][] = [leafs];
      let activeLayer = 0;

      while (layers[activeLayer].length > 1) {
        const layer: Buffer[] = [];
        const layerLength = layers[activeLayer].length;

        for (let i = 0; i < layerLength; i += 2) {
          const left = layers[activeLayer][i];
          const right = layers[activeLayer][i + 1];

          layer.push(sha256(Buffer.concat([left, right])));
        }

        layers.push(layer);
        activeLayer++;
      }

      return layers[layers.length - 1][0];
    };

    const leafs: Buffer[] = [];

    for (let i = 0; i < this.body.txEffects.length; i++) {
      const txEffect = this.body.txEffects[i];

      const commitmentsBuffer = Buffer.concat(txEffect.newNoteHashes.map(x => x.toBuffer()));
      const nullifiersBuffer = Buffer.concat(txEffect.newNullifiers.map(x => x.toBuffer()));
      const publicDataUpdateRequestsBuffer = Buffer.concat(txEffect.newPublicDataWrites.map(x => x.toBuffer()));
      const newL2ToL1MsgsBuffer = Buffer.concat(txEffect.newL2ToL1Msgs.map(x => x.toBuffer()));
      const encryptedLogsHashKernel0 = L2Block.computeKernelLogsHash(txEffect.logs!.encryptedLogs);
      const unencryptedLogsHashKernel0 = L2Block.computeKernelLogsHash(txEffect.logs!.unencryptedLogs);

      const inputValue = Buffer.concat([
        commitmentsBuffer,
        nullifiersBuffer,
        publicDataUpdateRequestsBuffer,
        newL2ToL1MsgsBuffer,
        // We get the first one because we only support 1 new contract per tx
        txEffect.contractLeaves[0].toBuffer(),
        txEffect.contractData[0].contractAddress.toBuffer(),
        // TODO(#3938): make portal address 20 bytes here when updating the hashing
        txEffect.contractData[0].portalContractAddress.toBuffer32(),
        encryptedLogsHashKernel0,
        unencryptedLogsHashKernel0,
      ]);
      leafs.push(sha256(inputValue));
    }

    return computeRoot(leafs);
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

    const newCommitments = txEffect.newNoteHashes.filter(x => !x.isZero());
    const newNullifiers = txEffect.newNullifiers.filter(x => !x.isZero());
    const newPublicDataWrites = txEffect.newPublicDataWrites.filter(x => !x.isEmpty());
    const newL2ToL1Msgs = txEffect.newL2ToL1Msgs.filter(x => !x.isZero());
    const newContracts = txEffect.contractLeaves.filter(x => !x.isZero());
    const newContractData = txEffect.contractData.filter(x => !x.isEmpty());

    // console.log('FROM GETTX', newCommitments[0].toBuffer());

    return new L2Tx(
      newCommitments,
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
    const logsStats = this.areLogsAttached() && {
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

  private assertLogsAttached() {
    if (!this.areLogsAttached()) {
      throw new Error(
        `newEncryptedLogs and newUnencryptedLogs must be defined (block ${this.header.globalVariables.blockNumber})`,
      );
    }
  }

  private areLogsAttached() {
    return this.body.txEffects.every(txEffect => txEffect.logs !== undefined);
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

  /**
   * Computes logs hash as is done in the kernel and app circuits.
   * @param logs - Logs to be hashed.
   * @returns The hash of the logs.
   * Note: This is a TS implementation of `computeKernelLogsHash` function in Decoder.sol. See that function documentation
   *       for more details.
   */
  static computeKernelLogsHash(logs: TxL2Logs): Buffer {
    const logsHashes: [Buffer, Buffer] = [Buffer.alloc(32), Buffer.alloc(32)];
    let kernelPublicInputsLogsHash = Buffer.alloc(32);

    for (const functionLogs of logs.functionLogs) {
      logsHashes[0] = kernelPublicInputsLogsHash;
      logsHashes[1] = functionLogs.hash(); // privateCircuitPublicInputsLogsHash

      // Hash logs hash from the public inputs of previous kernel iteration and logs hash from private circuit public inputs
      kernelPublicInputsLogsHash = sha256(Buffer.concat(logsHashes));
    }

    return kernelPublicInputsLogsHash;
  }
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
