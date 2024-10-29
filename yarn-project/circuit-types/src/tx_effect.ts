import {
  type EncryptedL2Log,
  EncryptedL2NoteLog,
  EncryptedNoteTxL2Logs,
  EncryptedTxL2Logs,
  PublicDataWrite,
  TxHash,
  type TxL2Logs,
  type UnencryptedL2Log,
  UnencryptedTxL2Logs,
} from '@aztec/circuit-types';
import {
  ENCRYPTED_LOGS_PREFIX,
  Fr,
  L2_L1_MSGS_PREFIX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTES_PREFIX,
  NOTE_ENCRYPTED_LOGS_PREFIX,
  NULLIFIERS_PREFIX,
  PUBLIC_DATA_UPDATE_REQUESTS_PREFIX,
  REVERT_CODE_PREFIX,
  RevertCode,
  TX_FEE_PREFIX,
  UNENCRYPTED_LOGS_PREFIX,
} from '@aztec/circuits.js';
import { makeTuple } from '@aztec/foundation/array';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256Trunc } from '@aztec/foundation/crypto';
import {
  BufferReader,
  FieldReader,
  serializeArrayOfBufferableToVector,
  serializeToBuffer,
} from '@aztec/foundation/serialize';

import { inspect } from 'util';

export class TxEffect {
  constructor(
    /**
     * Whether the transaction reverted during public app logic.
     */
    public revertCode: RevertCode,
    /**
     * The transaction fee, denominated in FPA.
     */
    public transactionFee: Fr,
    /**
     * The note hashes to be inserted into the note hash tree.
     */
    public noteHashes: Fr[],
    /**
     * The nullifiers to be inserted into the nullifier tree.
     */
    public nullifiers: Fr[],
    /**
     * The hash of L2 to L1 messages to be inserted into the messagebox on L1.
     * TODO(just-mitch): rename to l2ToL1MsgHashes
     */
    public l2ToL1Msgs: Fr[],
    /**
     * The public data writes to be inserted into the public data tree.
     */
    public publicDataWrites: PublicDataWrite[],
    /**
     * The logs and logs lengths of the txEffect
     */
    public noteEncryptedLogsLength: Fr,
    public encryptedLogsLength: Fr,
    public unencryptedLogsLength: Fr,
    public noteEncryptedLogs: EncryptedNoteTxL2Logs,
    public encryptedLogs: EncryptedTxL2Logs,
    public unencryptedLogs: UnencryptedTxL2Logs,
  ) {
    // TODO(#4638): Clean this up once we have isDefault() everywhere --> then we don't have to deal with 2 different
    // functions (isZero and isEmpty)
    if (noteHashes.length > MAX_NOTE_HASHES_PER_TX) {
      throw new Error(`Too many note hashes: ${noteHashes.length}, max: ${MAX_NOTE_HASHES_PER_TX}`);
    }
    noteHashes.forEach(h => {
      if (h.isZero()) {
        throw new Error('Note hash is zero');
      }
    });

    if (nullifiers.length > MAX_NULLIFIERS_PER_TX) {
      throw new Error(`Too many nullifiers: ${nullifiers.length}, max: ${MAX_NULLIFIERS_PER_TX}`);
    }
    nullifiers.forEach(h => {
      if (h.isZero()) {
        throw new Error('Nullifier is zero');
      }
    });

    if (l2ToL1Msgs.length > MAX_L2_TO_L1_MSGS_PER_TX) {
      throw new Error(`Too many L2 to L1 messages: ${l2ToL1Msgs.length}, max: ${MAX_L2_TO_L1_MSGS_PER_TX}`);
    }
    l2ToL1Msgs.forEach(h => {
      if (h.isZero()) {
        throw new Error('L2 to L1 message is zero');
      }
    });

    if (publicDataWrites.length > MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX) {
      throw new Error(
        `Too many public data writes: ${publicDataWrites.length}, max: ${MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX}`,
      );
    }
    publicDataWrites.forEach(h => {
      if (h.isEmpty()) {
        throw new Error('Public data write is empty');
      }
    });
  }

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.revertCode,
      this.transactionFee,
      serializeArrayOfBufferableToVector(this.noteHashes, 1),
      serializeArrayOfBufferableToVector(this.nullifiers, 1),
      serializeArrayOfBufferableToVector(this.l2ToL1Msgs, 1),
      serializeArrayOfBufferableToVector(this.publicDataWrites, 1),
      this.noteEncryptedLogsLength,
      this.encryptedLogsLength,
      this.unencryptedLogsLength,
      this.noteEncryptedLogs,
      this.encryptedLogs,
      this.unencryptedLogs,
    ]);
  }

  /**
   * Deserializes the TxEffect object from a Buffer.
   * @param buffer - Buffer or BufferReader object to deserialize.
   * @returns An instance of TxEffect.
   */
  static fromBuffer(buffer: Buffer | BufferReader): TxEffect {
    const reader = BufferReader.asReader(buffer);

    return new TxEffect(
      RevertCode.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readVectorUint8Prefix(Fr),
      reader.readVectorUint8Prefix(Fr),
      reader.readVectorUint8Prefix(Fr),
      reader.readVectorUint8Prefix(PublicDataWrite),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readObject(EncryptedNoteTxL2Logs),
      reader.readObject(EncryptedTxL2Logs),
      reader.readObject(UnencryptedTxL2Logs),
    );
  }

  /**
   * Computes txOutHash of this tx effect.
   * TODO(#7218): Revert to fixed height tree for outbox
   * @dev Follows computeTxOutHash in TxsDecoder.sol and new_sha in variable_merkle_tree.nr
   */
  txOutHash() {
    const { l2ToL1Msgs } = this;
    if (l2ToL1Msgs.length == 0) {
      return Buffer.alloc(32);
    }
    const depth = l2ToL1Msgs.length == 1 ? 1 : Math.ceil(Math.log2(l2ToL1Msgs.length));
    let thisLayer = padArrayEnd(
      l2ToL1Msgs.map(msg => msg.toBuffer()),
      Buffer.alloc(32),
      2 ** depth,
    );
    let nextLayer = [];
    for (let i = 0; i < depth; i++) {
      for (let j = 0; j < thisLayer.length; j += 2) {
        // Store the hash of each pair one layer up
        nextLayer[j / 2] = sha256Trunc(Buffer.concat([thisLayer[j], thisLayer[j + 1]]));
      }
      thisLayer = nextLayer;
      nextLayer = [];
    }
    return thisLayer[0];
  }

  static random(
    numPrivateCallsPerTx = 2,
    numPublicCallsPerTx = 3,
    numEncryptedLogsPerCall = 2,
    numUnencryptedLogsPerCall = 1,
  ): TxEffect {
    const noteEncryptedLogs = EncryptedNoteTxL2Logs.random(numPrivateCallsPerTx, numEncryptedLogsPerCall);
    const encryptedLogs = EncryptedTxL2Logs.random(numPrivateCallsPerTx, numEncryptedLogsPerCall);
    const unencryptedLogs = UnencryptedTxL2Logs.random(numPublicCallsPerTx, numUnencryptedLogsPerCall);
    return new TxEffect(
      RevertCode.random(),
      new Fr(Math.floor(Math.random() * 100_000)),
      makeTuple(MAX_NOTE_HASHES_PER_TX, Fr.random),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.random),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, Fr.random),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite.random),
      new Fr(noteEncryptedLogs.getKernelLength()),
      new Fr(encryptedLogs.getKernelLength()),
      new Fr(unencryptedLogs.getKernelLength()),
      noteEncryptedLogs,
      encryptedLogs,
      unencryptedLogs,
    );
  }

  static empty(): TxEffect {
    return new TxEffect(
      RevertCode.OK,
      Fr.ZERO,
      [],
      [],
      [],
      [],
      Fr.ZERO,
      Fr.ZERO,
      Fr.ZERO,
      EncryptedNoteTxL2Logs.empty(),
      EncryptedTxL2Logs.empty(),
      UnencryptedTxL2Logs.empty(),
    );
  }

  isEmpty(): boolean {
    return this.nullifiers.length === 0;
  }

  /**
   * Returns a string representation of the TxEffect object.
   */
  toString(): string {
    return this.toBuffer().toString('hex');
  }

  /**
   * Returns the prefix as used in a blob.
   * Used to prefix a 'block' of tx effects with its type and length.
   */
  private toPrefix(type: number, length: number): Fr {
    const buf = Buffer.alloc(3);
    buf.writeUint8(type);
    buf.writeUint8(length, 2);
    return new Fr(buf);
  }

  /**
   * Decodes the prefix as used in a blob to tx effect type and length.
   */
  static fromPrefix(prefix: Fr) {
    const buf = prefix.toBuffer().subarray(-3);
    return { type: buf[0], length: buf[2] };
  }

  /**
   * Returns a flat packed array of prefixed fields of all tx effects, used for blobs.
   */
  toFields(): Fr[] {
    // TODO(Miranda): Check this nullifier trick is sufficient
    if (this.isEmpty()) {
      return [];
    }
    const flattened: Fr[] = [];
    // Since the revert code and tx fee are always included and < 31 bytes,
    // we don't need an extra prefix, so we push one value:
    flattened.push(this.toPrefix(REVERT_CODE_PREFIX, this.revertCode.toField().toNumber()));
    // TODO: how long should tx fee be? For now, not using toPrefix()
    flattened.push(
      new Fr(
        Buffer.concat([Buffer.from([TX_FEE_PREFIX]), Buffer.alloc(1), this.transactionFee.toBuffer().subarray(3)]),
      ),
    );
    if (this.noteHashes.length) {
      flattened.push(this.toPrefix(NOTES_PREFIX, this.noteHashes.length));
      flattened.push(...this.noteHashes);
    }
    if (this.nullifiers.length) {
      flattened.push(this.toPrefix(NULLIFIERS_PREFIX, this.nullifiers.length));
      flattened.push(...this.nullifiers);
    }
    if (this.l2ToL1Msgs.length) {
      flattened.push(this.toPrefix(L2_L1_MSGS_PREFIX, this.l2ToL1Msgs.length));
      flattened.push(...this.l2ToL1Msgs);
    }
    if (this.publicDataWrites.length) {
      flattened.push(this.toPrefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, this.publicDataWrites.length * 2));
      flattened.push(...this.publicDataWrites.map(w => [w.leafIndex, w.newValue]).flat());
    }
    // TODO(#8954): When logs are refactored into fields, we will append the values here
    // Currently appending the single log hash as an interim solution
    if (this.noteEncryptedLogs.unrollLogs().length) {
      flattened.push(this.toPrefix(NOTE_ENCRYPTED_LOGS_PREFIX, this.noteEncryptedLogs.unrollLogs().length));
      flattened.push(...this.noteEncryptedLogs.unrollLogs().map(log => Fr.fromBuffer(log.hash())));
    }
    if (this.encryptedLogs.unrollLogs().length) {
      flattened.push(this.toPrefix(ENCRYPTED_LOGS_PREFIX, this.encryptedLogs.unrollLogs().length));
      flattened.push(...this.encryptedLogs.unrollLogs().map(log => Fr.fromBuffer(log.getSiloedHash())));
    }
    if (this.unencryptedLogs.unrollLogs().length) {
      flattened.push(this.toPrefix(UNENCRYPTED_LOGS_PREFIX, this.unencryptedLogs.unrollLogs().length));
      flattened.push(...this.unencryptedLogs.unrollLogs().map(log => Fr.fromBuffer(log.getSiloedHash())));
    }
    return flattened;
  }

  /**
   * Decodes a flat packed array of prefixed fields to TxEffect
   * TODO(#8954): When logs are refactored into fields, we won't need to inject them here, instead just reading from fields as below
   */
  static fromFields(
    fields: Fr[] | FieldReader,
    noteEncryptedLogs?: EncryptedNoteTxL2Logs,
    encryptedLogs?: EncryptedTxL2Logs,
    unencryptedLogs?: UnencryptedTxL2Logs,
  ) {
    const reader = FieldReader.asReader(fields);
    const effect = this.empty();
    const { type: _, length: revertCode } = this.fromPrefix(reader.readField());
    effect.revertCode = RevertCode.fromField(new Fr(revertCode));
    // TODO: how long should tx fee be? For now, not using fromPrefix()
    const prefixedFee = reader.readField();
    // NB: Fr.fromBuffer hangs here if you provide a buffer less than 32 in len
    effect.transactionFee = Fr.fromBuffer(Buffer.concat([Buffer.alloc(3), prefixedFee.toBuffer().subarray(3)]));
    // TODO(Miranda): cleanup, use enum
    while (!reader.isFinished()) {
      const { type, length } = this.fromPrefix(reader.readField());
      switch (type) {
        case NOTES_PREFIX:
          effect.noteHashes = reader.readFieldArray(length);
          break;
        case NULLIFIERS_PREFIX:
          effect.nullifiers = reader.readFieldArray(length);
          break;
        case L2_L1_MSGS_PREFIX:
          effect.l2ToL1Msgs = reader.readFieldArray(length);
          break;
        case PUBLIC_DATA_UPDATE_REQUESTS_PREFIX: {
          const publicDataPairs = reader.readFieldArray(length);
          for (let i = 0; i < length; i += 2) {
            effect.publicDataWrites.push(new PublicDataWrite(publicDataPairs[i], publicDataPairs[i + 1]));
          }
          break;
        }
        // TODO(#8954): When logs are refactored into fields, we will append the read fields here
        case NOTE_ENCRYPTED_LOGS_PREFIX:
          // effect.noteEncryptedLogs = EncryptedNoteTxL2Logs.fromFields(reader.readFieldArray(length));
          if (!noteEncryptedLogs) {
            throw new Error(`Tx effect has note logs, but they were not passed raw to .fromFields()`);
          }
          this.checkInjectedLogs(noteEncryptedLogs, reader.readFieldArray(length));
          effect.noteEncryptedLogs = noteEncryptedLogs;
          effect.noteEncryptedLogsLength = new Fr(noteEncryptedLogs.getKernelLength());
          break;
        case ENCRYPTED_LOGS_PREFIX:
          // effect.encryptedLogs = EncryptedTxL2Logs.fromFields(reader.readFieldArray(length));
          if (!encryptedLogs) {
            throw new Error(`Tx effect has encrypted logs, but they were not passed raw to .fromFields()`);
          }
          this.checkInjectedLogs(encryptedLogs, reader.readFieldArray(length));
          effect.encryptedLogs = encryptedLogs;
          effect.encryptedLogsLength = new Fr(encryptedLogs.getKernelLength());
          break;
        case UNENCRYPTED_LOGS_PREFIX:
          // effect.unencryptedLogs = UnencryptedTxL2Logs.fromFields(reader.readFieldArray(length));
          if (!unencryptedLogs) {
            throw new Error(`Tx effect has unencrypted logs, but they were not passed raw to .fromFields()`);
          }
          this.checkInjectedLogs(unencryptedLogs, reader.readFieldArray(length));
          effect.unencryptedLogs = unencryptedLogs;
          effect.unencryptedLogsLength = new Fr(unencryptedLogs.getKernelLength());
          break;
        case REVERT_CODE_PREFIX:
        default:
          throw new Error(`Too many fields to decode given to TxEffect.fromFields()`);
      }
    }
    return effect;
  }

  // TODO(#8954): Remove below when logs are refactored into fields
  private static checkInjectedLogs<TLog extends UnencryptedL2Log | EncryptedL2NoteLog | EncryptedL2Log>(
    injected: TxL2Logs<TLog>,
    expectedHashes: Fr[],
  ) {
    injected.unrollLogs().forEach((log, i) => {
      const logHash = log instanceof EncryptedL2NoteLog ? log.hash() : log.getSiloedHash();
      if (!Fr.fromBuffer(logHash).equals(expectedHashes[i])) {
        throw new Error(
          `Log hash mismatch when reconstructing tx effect. Expected: ${Fr.fromBuffer(logHash)}, Got: ${
            expectedHashes[i]
          }`,
        );
      }
    });
  }

  [inspect.custom]() {
    // print out the non-empty fields

    return `TxEffect {
      revertCode: ${this.revertCode},
      transactionFee: ${this.transactionFee},
      note hashes: [${this.noteHashes.map(h => h.toString()).join(', ')}],
      nullifiers: [${this.nullifiers.map(h => h.toString()).join(', ')}],
      l2ToL1Msgs: [${this.l2ToL1Msgs.map(h => h.toString()).join(', ')}],
      publicDataWrites: [${this.publicDataWrites.map(h => h.toString()).join(', ')}],
      noteEncryptedLogsLength: ${this.noteEncryptedLogsLength},
      encryptedLogsLength: ${this.encryptedLogsLength},
      unencryptedLogsLength: ${this.unencryptedLogsLength},
      noteEncryptedLogs: ${JSON.stringify(this.noteEncryptedLogs.toJSON())},
      encryptedLogs: ${JSON.stringify(this.encryptedLogs.toJSON())},
      unencryptedLogs: ${JSON.stringify(this.unencryptedLogs.toJSON())}
     }`;
  }

  /**
   * Deserializes an TxEffect object from a string.
   * @param str - String to deserialize.
   * @returns An instance of TxEffect.
   */
  static fromString(str: string) {
    return TxEffect.fromBuffer(Buffer.from(str, 'hex'));
  }

  get txHash(): TxHash {
    return new TxHash(this.nullifiers[0].toBuffer());
  }
}
