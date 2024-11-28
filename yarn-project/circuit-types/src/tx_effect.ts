import {
  CONTRACT_CLASS_LOGS_PREFIX,
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
  PublicDataWrite,
  REVERT_CODE_PREFIX,
  RevertCode,
  TX_FEE_PREFIX,
  TX_START_PREFIX,
  UNENCRYPTED_LOGS_PREFIX,
} from '@aztec/circuits.js';
import { type FieldsOf, makeTuple } from '@aztec/foundation/array';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256Trunc } from '@aztec/foundation/crypto';
import { jsonStringify } from '@aztec/foundation/json-rpc';
import { schemas } from '@aztec/foundation/schemas';
import {
  BufferReader,
  FieldReader,
  serializeArrayOfBufferableToVector,
  serializeToBuffer,
} from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';
import { z } from 'zod';

import {
  ContractClassTxL2Logs,
  type EncryptedL2Log,
  EncryptedL2NoteLog,
  EncryptedNoteTxL2Logs,
  EncryptedTxL2Logs,
  type TxL2Logs,
  type UnencryptedL2Log,
  UnencryptedTxL2Logs,
} from './logs/index.js';
import { TxHash } from './tx/tx_hash.js';

// These are helper constants to decode tx effects from blob encoded fields
const TX_START_PREFIX_BYTES_LENGTH = TX_START_PREFIX.toString(16).length / 2;
// 7 bytes for: | 0 | txlen[0] | txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revertCode |
const TX_EFFECT_PREFIX_BYTE_LENGTH = TX_START_PREFIX_BYTES_LENGTH + 7;
export { RevertCodeEnum } from '@aztec/circuits.js';

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
    public contractClassLogsLength: Fr,
    public noteEncryptedLogs: EncryptedNoteTxL2Logs,
    public encryptedLogs: EncryptedTxL2Logs,
    public unencryptedLogs: UnencryptedTxL2Logs,
    public contractClassLogs: ContractClassTxL2Logs,
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
      this.contractClassLogsLength,
      this.noteEncryptedLogs,
      this.encryptedLogs,
      this.unencryptedLogs,
      this.contractClassLogs,
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
      Fr.fromBuffer(reader),
      reader.readObject(EncryptedNoteTxL2Logs),
      reader.readObject(EncryptedTxL2Logs),
      reader.readObject(UnencryptedTxL2Logs),
      reader.readObject(ContractClassTxL2Logs),
    );
  }

  /**
   * Computes txOutHash of this tx effect.
   * TODO(#7218): Revert to fixed height tree for outbox
   * @dev Follows new_sha in variable_merkle_tree.nr
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
    const contractClassLogs = ContractClassTxL2Logs.random(1, 1);
    return new TxEffect(
      RevertCode.random(),
      new Fr(Math.floor(Math.random() * 100_000)),
      makeTuple(MAX_NOTE_HASHES_PER_TX, Fr.random),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.random),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, Fr.random),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, () => new PublicDataWrite(Fr.random(), Fr.random())),
      new Fr(noteEncryptedLogs.getKernelLength()),
      new Fr(encryptedLogs.getKernelLength()),
      new Fr(unencryptedLogs.getKernelLength()),
      new Fr(contractClassLogs.getKernelLength()),
      noteEncryptedLogs,
      encryptedLogs,
      unencryptedLogs,
      contractClassLogs,
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
      Fr.ZERO,
      EncryptedNoteTxL2Logs.empty(),
      EncryptedTxL2Logs.empty(),
      UnencryptedTxL2Logs.empty(),
      ContractClassTxL2Logs.empty(),
    );
  }

  isEmpty(): boolean {
    return this.nullifiers.length === 0;
  }

  /** Returns a hex representation of the TxEffect object. */
  toString() {
    return bufferToHex(this.toBuffer());
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
   * Encodes the first field of a tx effect as used in a blob:
   * TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
   */
  private encodeFirstField(length: number, revertCode: RevertCode) {
    const lengthBuf = Buffer.alloc(2);
    lengthBuf.writeUInt16BE(length, 0);
    return new Fr(
      Buffer.concat([
        toBufferBE(TX_START_PREFIX, TX_START_PREFIX_BYTES_LENGTH),
        Buffer.alloc(1),
        lengthBuf,
        Buffer.alloc(1),
        Buffer.from([REVERT_CODE_PREFIX]),
        Buffer.alloc(1),
        revertCode.toBuffer(),
      ]),
    );
  }

  /**
   * Decodes the first field of a tx effect as used in a blob:
   * TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
   * Assumes that isFirstField has been called already.
   */
  static decodeFirstField(field: Fr) {
    const buf = field.toBuffer().subarray(-TX_EFFECT_PREFIX_BYTE_LENGTH);
    return {
      length: new Fr(buf.subarray(TX_START_PREFIX_BYTES_LENGTH + 1, TX_START_PREFIX_BYTES_LENGTH + 3)).toNumber(),
      revertCode: buf[buf.length - 1],
    };
  }

  /**
   * Determines whether a field is the first field of a tx effect
   */
  static isFirstField(field: Fr) {
    const buf = field.toBuffer();
    if (
      !buf
        .subarray(0, field.size - TX_EFFECT_PREFIX_BYTE_LENGTH)
        .equals(Buffer.alloc(field.size - TX_EFFECT_PREFIX_BYTE_LENGTH))
    ) {
      return false;
    }
    const sliced = buf.subarray(-TX_EFFECT_PREFIX_BYTE_LENGTH);
    if (
      // Checking we start with the correct prefix...
      !new Fr(sliced.subarray(0, TX_START_PREFIX_BYTES_LENGTH)).equals(new Fr(TX_START_PREFIX)) ||
      // ...and include the revert code prefix..
      sliced[sliced.length - 3] !== REVERT_CODE_PREFIX ||
      // ...and the following revert code is valid.
      sliced[sliced.length - 1] > 4
    ) {
      return false;
    }
    return true;
  }

  /**
   * Returns a flat packed array of prefixed fields of all tx effects, used for blobs.
   */
  toBlobFields(): Fr[] {
    if (this.isEmpty()) {
      return [];
    }
    const flattened: Fr[] = [];
    // We reassign the first field when we know the length of all effects - see below
    flattened.push(Fr.ZERO);
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
      flattened.push(...this.publicDataWrites.map(w => [w.leafSlot, w.value]).flat());
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
    if (this.contractClassLogs.unrollLogs().length) {
      flattened.push(this.toPrefix(CONTRACT_CLASS_LOGS_PREFIX, this.contractClassLogs.unrollLogs().length));
      flattened.push(...this.contractClassLogs.unrollLogs().map(log => Fr.fromBuffer(log.getSiloedHash())));
    }

    // The first value appended to each list of fields representing a tx effect is:
    // TX_START_PREFIX | 0 | txlen[0] txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revert_code
    // Tx start and len are to aid decomposing/ identifying when we reach a new tx effect
    // The remaining bytes are used for revert code, since that only requires 3 bytes
    flattened[0] = this.encodeFirstField(flattened.length, this.revertCode);
    return flattened;
  }

  /**
   * Decodes a flat packed array of prefixed fields to TxEffect
   * TODO(#8954): When logs are refactored into fields, we won't need to inject them here, instead just reading from fields as below
   */
  static fromBlobFields(
    fields: Fr[] | FieldReader,
    noteEncryptedLogs?: EncryptedNoteTxL2Logs,
    encryptedLogs?: EncryptedTxL2Logs,
    unencryptedLogs?: UnencryptedTxL2Logs,
    contractClassLogs?: ContractClassTxL2Logs,
  ) {
    const ensureEmpty = <T>(arr: Array<T>) => {
      if (arr.length) {
        throw new Error('Invalid fields given to TxEffect.fromBlobFields(): Attempted to assign property twice.');
      }
    };
    const effect = this.empty();
    if (!(fields instanceof FieldReader) && !fields.length) {
      return effect;
    }
    const reader = FieldReader.asReader(fields);
    const firstField = reader.readField();
    if (!this.isFirstField(firstField)) {
      throw new Error('Invalid fields given to TxEffect.fromBlobFields(): First field invalid.');
    }
    const { length: _, revertCode } = this.decodeFirstField(firstField);
    effect.revertCode = RevertCode.fromField(new Fr(revertCode));
    // TODO: how long should tx fee be? For now, not using fromPrefix()
    const prefixedFee = reader.readField();
    // NB: Fr.fromBuffer hangs here if you provide a buffer less than 32 in len
    effect.transactionFee = Fr.fromBuffer(Buffer.concat([Buffer.alloc(3), prefixedFee.toBuffer().subarray(3)]));
    while (!reader.isFinished()) {
      const { type, length } = this.fromPrefix(reader.readField());
      switch (type) {
        case NOTES_PREFIX:
          ensureEmpty(effect.noteHashes);
          effect.noteHashes = reader.readFieldArray(length);
          break;
        case NULLIFIERS_PREFIX:
          ensureEmpty(effect.nullifiers);
          effect.nullifiers = reader.readFieldArray(length);
          break;
        case L2_L1_MSGS_PREFIX:
          ensureEmpty(effect.l2ToL1Msgs);
          effect.l2ToL1Msgs = reader.readFieldArray(length);
          break;
        case PUBLIC_DATA_UPDATE_REQUESTS_PREFIX: {
          ensureEmpty(effect.publicDataWrites);
          const publicDataPairs = reader.readFieldArray(length);
          for (let i = 0; i < length; i += 2) {
            effect.publicDataWrites.push(new PublicDataWrite(publicDataPairs[i], publicDataPairs[i + 1]));
          }
          break;
        }
        // TODO(#8954): When logs are refactored into fields, we will append the read fields here
        case NOTE_ENCRYPTED_LOGS_PREFIX:
          // effect.noteEncryptedLogs = EncryptedNoteTxL2Logs.fromFields(reader.readFieldArray(length));
          ensureEmpty(effect.noteEncryptedLogs.functionLogs);
          if (!noteEncryptedLogs) {
            throw new Error(`Tx effect has note logs, but they were not passed raw to .fromBlobFields()`);
          }
          this.checkInjectedLogs(noteEncryptedLogs, reader.readFieldArray(length));
          effect.noteEncryptedLogs = noteEncryptedLogs;
          effect.noteEncryptedLogsLength = new Fr(noteEncryptedLogs.getKernelLength());
          break;
        case ENCRYPTED_LOGS_PREFIX:
          // effect.encryptedLogs = EncryptedTxL2Logs.fromFields(reader.readFieldArray(length));
          ensureEmpty(effect.encryptedLogs.functionLogs);
          if (!encryptedLogs) {
            throw new Error(`Tx effect has encrypted logs, but they were not passed raw to .fromBlobFields()`);
          }
          this.checkInjectedLogs(encryptedLogs, reader.readFieldArray(length));
          effect.encryptedLogs = encryptedLogs;
          effect.encryptedLogsLength = new Fr(encryptedLogs.getKernelLength());
          break;
        case UNENCRYPTED_LOGS_PREFIX:
          // effect.unencryptedLogs = UnencryptedTxL2Logs.fromFields(reader.readFieldArray(length));
          ensureEmpty(effect.unencryptedLogs.functionLogs);
          if (!unencryptedLogs) {
            throw new Error(`Tx effect has unencrypted logs, but they were not passed raw to .fromBlobFields()`);
          }
          this.checkInjectedLogs(unencryptedLogs, reader.readFieldArray(length));
          effect.unencryptedLogs = unencryptedLogs;
          effect.unencryptedLogsLength = new Fr(unencryptedLogs.getKernelLength());
          break;
        case CONTRACT_CLASS_LOGS_PREFIX:
          // effect.contractClassLogs = ContractClassTxL2Logs.fromFields(reader.readFieldArray(length));
          ensureEmpty(effect.contractClassLogs.functionLogs);
          if (!contractClassLogs) {
            throw new Error(`Tx effect has contractClassLogs logs, but they were not passed raw to .fromBlobFields()`);
          }
          this.checkInjectedLogs(contractClassLogs, reader.readFieldArray(length));
          effect.contractClassLogs = contractClassLogs;
          effect.contractClassLogsLength = new Fr(contractClassLogs.getKernelLength());
          break;
        case REVERT_CODE_PREFIX:
        default:
          throw new Error(`Too many fields to decode given to TxEffect.fromBlobFields()`);
      }
    }

    // If the input fields have no logs, ensure we match the original struct by reassigning injected logs
    effect.noteEncryptedLogs =
      !effect.noteEncryptedLogs.getTotalLogCount() && noteEncryptedLogs ? noteEncryptedLogs : effect.noteEncryptedLogs;
    effect.encryptedLogs =
      !effect.encryptedLogs.getTotalLogCount() && encryptedLogs ? encryptedLogs : effect.encryptedLogs;
    effect.unencryptedLogs =
      !effect.unencryptedLogs.getTotalLogCount() && unencryptedLogs ? unencryptedLogs : effect.unencryptedLogs;
    effect.contractClassLogs =
      !effect.contractClassLogs.getTotalLogCount() && contractClassLogs ? contractClassLogs : effect.contractClassLogs;
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

  toJSON() {
    return this.toString();
  }

  static from(fields: Omit<FieldsOf<TxEffect>, 'txHash'>) {
    return new TxEffect(
      fields.revertCode,
      fields.transactionFee,
      fields.noteHashes,
      fields.nullifiers,
      fields.l2ToL1Msgs,
      fields.publicDataWrites,
      fields.noteEncryptedLogsLength,
      fields.encryptedLogsLength,
      fields.unencryptedLogsLength,
      fields.contractClassLogsLength,
      fields.noteEncryptedLogs,
      fields.encryptedLogs,
      fields.unencryptedLogs,
      fields.contractClassLogs,
    );
  }

  static get schema() {
    return z
      .object({
        revertCode: RevertCode.schema,
        transactionFee: schemas.Fr,
        noteHashes: z.array(schemas.Fr),
        nullifiers: z.array(schemas.Fr),
        l2ToL1Msgs: z.array(schemas.Fr),
        publicDataWrites: z.array(PublicDataWrite.schema),
        noteEncryptedLogsLength: schemas.Fr,
        encryptedLogsLength: schemas.Fr,
        unencryptedLogsLength: schemas.Fr,
        contractClassLogsLength: schemas.Fr,
        noteEncryptedLogs: EncryptedNoteTxL2Logs.schema,
        encryptedLogs: EncryptedTxL2Logs.schema,
        unencryptedLogs: UnencryptedTxL2Logs.schema,
        contractClassLogs: ContractClassTxL2Logs.schema,
      })
      .transform(TxEffect.from);
  }

  [inspect.custom]() {
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
      contractClassLogsLength: ${this.contractClassLogsLength},
      noteEncryptedLogs: ${jsonStringify(this.noteEncryptedLogs)},
      encryptedLogs: ${jsonStringify(this.encryptedLogs)},
      unencryptedLogs: ${jsonStringify(this.unencryptedLogs)}
      contractClassLogs: ${jsonStringify(this.contractClassLogs)}
     }`;
  }

  /**
   * Deserializes an TxEffect object from a string.
   * @param str - String to deserialize.
   * @returns An instance of TxEffect.
   */
  static fromString(str: string) {
    return TxEffect.fromBuffer(hexToBuffer(str));
  }

  get txHash(): TxHash {
    return new TxHash(this.nullifiers[0].toBuffer());
  }
}
