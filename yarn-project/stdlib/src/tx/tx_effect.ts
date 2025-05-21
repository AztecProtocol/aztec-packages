import {
  CONTRACT_CLASS_LOGS_PREFIX,
  L2_L1_MSGS_PREFIX,
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NOTES_PREFIX,
  NULLIFIERS_PREFIX,
  PRIVATE_LOGS_PREFIX,
  PUBLIC_DATA_UPDATE_REQUESTS_PREFIX,
  PUBLIC_LOGS_PREFIX,
  REVERT_CODE_PREFIX,
  TX_FEE_PREFIX,
} from '@aztec/constants';
import { type FieldsOf, makeTuple, makeTupleAsync } from '@aztec/foundation/array';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { padArrayEnd } from '@aztec/foundation/collection';
import { sha256Trunc } from '@aztec/foundation/crypto';
import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import {
  BufferReader,
  FieldReader,
  serializeArrayOfBufferableToVector,
  serializeToBuffer,
} from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

import { inspect } from 'util';
import { z } from 'zod';

import { PublicDataWrite } from '../avm/public_data_write.js';
import { RevertCode } from '../avm/revert_code.js';
import { ContractClassLog } from '../logs/contract_class_log.js';
import { PrivateLog } from '../logs/private_log.js';
import { PublicLog } from '../logs/public_log.js';
import { TxHash } from './tx_hash.js';

// This will appear as 0x74785f7374617274 in logs
export const TX_START_PREFIX = 8392562855083340404n;
// These are helper constants to decode tx effects from blob encoded fields
export const TX_START_PREFIX_BYTES_LENGTH = TX_START_PREFIX.toString(16).length / 2;
// 7 bytes for: | 0 | txlen[0] | txlen[1] | 0 | REVERT_CODE_PREFIX | 0 | revertCode |
export const TX_EFFECT_PREFIX_BYTE_LENGTH = TX_START_PREFIX_BYTES_LENGTH + 7;

export class TxEffect {
  constructor(
    /**
     * Whether the transaction reverted during public app logic.
     */
    public revertCode: RevertCode,
    /**
     * The identifier of the transaction.
     */
    public txHash: TxHash,
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
     * The private logs.
     */
    public privateLogs: PrivateLog[],
    /**
     * The public logs.
     */
    public publicLogs: PublicLog[],
    /**
     * The contract class logs.
     */
    public contractClassLogs: ContractClassLog[],
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

    if (privateLogs.length > MAX_PRIVATE_LOGS_PER_TX) {
      throw new Error(`Too many private logs: ${privateLogs.length}, max: ${MAX_PRIVATE_LOGS_PER_TX}`);
    }
    privateLogs.forEach(h => {
      if (h.isEmpty()) {
        throw new Error('Private log is empty');
      }
    });
  }

  toBuffer(): Buffer {
    return serializeToBuffer([
      this.revertCode,
      this.txHash,
      this.transactionFee,
      serializeArrayOfBufferableToVector(this.noteHashes, 1),
      serializeArrayOfBufferableToVector(this.nullifiers, 1),
      serializeArrayOfBufferableToVector(this.l2ToL1Msgs, 1),
      serializeArrayOfBufferableToVector(this.publicDataWrites, 1),
      serializeArrayOfBufferableToVector(this.privateLogs, 1),
      serializeArrayOfBufferableToVector(this.publicLogs, 1),
      serializeArrayOfBufferableToVector(this.contractClassLogs, 1),
    ]);
  }

  equals(other: TxEffect): boolean {
    return (
      this.revertCode.equals(other.revertCode) &&
      this.txHash.equals(other.txHash) &&
      this.transactionFee.equals(other.transactionFee) &&
      this.noteHashes.length === other.noteHashes.length &&
      this.noteHashes.every((h, i) => h.equals(other.noteHashes[i])) &&
      this.nullifiers.length === other.nullifiers.length &&
      this.nullifiers.every((h, i) => h.equals(other.nullifiers[i])) &&
      this.l2ToL1Msgs.length === other.l2ToL1Msgs.length &&
      this.l2ToL1Msgs.every((h, i) => h.equals(other.l2ToL1Msgs[i])) &&
      this.publicDataWrites.length === other.publicDataWrites.length &&
      this.publicDataWrites.every((h, i) => h.equals(other.publicDataWrites[i])) &&
      this.privateLogs.length === other.privateLogs.length &&
      this.privateLogs.every((h, i) => h.equals(other.privateLogs[i])) &&
      this.publicLogs.length === other.publicLogs.length &&
      this.publicLogs.every((h, i) => h.equals(other.publicLogs[i])) &&
      this.contractClassLogs.length === other.contractClassLogs.length &&
      this.contractClassLogs.every((h, i) => h.equals(other.contractClassLogs[i]))
    );
  }

  /** Returns the size of this tx effect in bytes as serialized onto DA. */
  getDASize() {
    return this.toBlobFields().length * Fr.SIZE_IN_BYTES;
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
      TxHash.fromBuffer(reader),
      Fr.fromBuffer(reader),
      reader.readVectorUint8Prefix(Fr),
      reader.readVectorUint8Prefix(Fr),
      reader.readVectorUint8Prefix(Fr),
      reader.readVectorUint8Prefix(PublicDataWrite),
      reader.readVectorUint8Prefix(PrivateLog),
      reader.readVectorUint8Prefix(PublicLog),
      reader.readVectorUint8Prefix(ContractClassLog),
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

  static async random(numPublicCallsPerTx = 3, numPublicLogsPerCall = 1): Promise<TxEffect> {
    return new TxEffect(
      RevertCode.random(),
      TxHash.random(),
      new Fr(Math.floor(Math.random() * 100_000)),
      makeTuple(MAX_NOTE_HASHES_PER_TX, Fr.random),
      makeTuple(MAX_NULLIFIERS_PER_TX, Fr.random),
      makeTuple(MAX_L2_TO_L1_MSGS_PER_TX, Fr.random),
      makeTuple(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, PublicDataWrite.random),
      makeTuple(MAX_PRIVATE_LOGS_PER_TX, () => PrivateLog.random()),
      await makeTupleAsync(numPublicCallsPerTx * numPublicLogsPerCall, async () => await PublicLog.random()),
      await makeTupleAsync(MAX_CONTRACT_CLASS_LOGS_PER_TX, ContractClassLog.random),
    );
  }

  static empty(): TxEffect {
    return new TxEffect(RevertCode.OK, TxHash.zero(), Fr.ZERO, [], [], [], [], [], [], []);
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
    const buf = Buffer.alloc(4);
    buf.writeUint8(type);
    buf.writeUInt16BE(length, 2);
    return new Fr(buf);
  }

  /**
   * Decodes the prefix as used in a blob to tx effect type and length.
   */
  static fromPrefix(prefix: Fr) {
    const buf = prefix.toBuffer().subarray(-4);
    return { type: buf[0], length: new Fr(buf.subarray(-2)).toNumber() };
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

    flattened.push(this.txHash.hash);
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
      flattened.push(this.toPrefix(PUBLIC_DATA_UPDATE_REQUESTS_PREFIX, this.publicDataWrites.length));
      flattened.push(...this.publicDataWrites.flatMap(w => w.toBlobFields()));
    }
    if (this.privateLogs.length) {
      flattened.push(this.toPrefix(PRIVATE_LOGS_PREFIX, this.privateLogs.length));
      flattened.push(...this.privateLogs.flatMap(l => l.toBlobFields()));
    }
    if (this.publicLogs.length) {
      flattened.push(this.toPrefix(PUBLIC_LOGS_PREFIX, this.publicLogs.length));
      flattened.push(...this.publicLogs.flatMap(l => l.toBlobFields()));
    }
    if (this.contractClassLogs.length) {
      flattened.push(this.toPrefix(CONTRACT_CLASS_LOGS_PREFIX, this.contractClassLogs.length));
      flattened.push(...this.contractClassLogs.flatMap(l => l.toBlobFields()));
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
   */
  static fromBlobFields(fields: Fr[] | FieldReader) {
    const ensureEmpty = <T>(arr: Array<T>) => {
      if (arr.length) {
        throw new Error('Invalid fields given to TxEffect.fromBlobFields(): Attempted to assign property twice.');
      }
    };

    const effect = this.empty();
    const reader = FieldReader.asReader(fields);
    const totalFields = reader.remainingFields();
    if (!totalFields) {
      return effect;
    }

    const firstField = reader.readField();
    if (!this.isFirstField(firstField)) {
      throw new Error('Invalid fields given to TxEffect.fromBlobFields(): First field invalid.');
    }

    const { length: fieldsToProcess, revertCode } = this.decodeFirstField(firstField);
    effect.revertCode = RevertCode.fromField(new Fr(revertCode));

    effect.txHash = new TxHash(reader.readField());
    // TODO: how long should tx fee be? For now, not using fromPrefix()
    const prefixedFee = reader.readField();
    // NB: Fr.fromBuffer hangs here if you provide a buffer less than 32 in len
    // todo: try new Fr(prefixedFee.toBuffer().subarray(3))
    effect.transactionFee = Fr.fromBuffer(Buffer.concat([Buffer.alloc(3), prefixedFee.toBuffer().subarray(3)]));

    let fieldsProcessed = totalFields - reader.remainingFields();
    while (fieldsProcessed < fieldsToProcess) {
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
          effect.publicDataWrites = Array.from({ length }, () => PublicDataWrite.fromBlobFields(reader));
          break;
        }
        case PRIVATE_LOGS_PREFIX: {
          ensureEmpty(effect.privateLogs);
          effect.privateLogs = Array.from({ length }, () => PrivateLog.fromBlobFields(reader));
          break;
        }
        case PUBLIC_LOGS_PREFIX: {
          ensureEmpty(effect.publicLogs);
          effect.publicLogs = Array.from({ length }, () => PublicLog.fromBlobFields(reader));
          break;
        }
        case CONTRACT_CLASS_LOGS_PREFIX: {
          ensureEmpty(effect.contractClassLogs);
          effect.contractClassLogs = Array.from({ length }, () => ContractClassLog.fromBlobFields(reader));
          break;
        }
        case REVERT_CODE_PREFIX:
        default:
          throw new Error(`Too many fields to decode given to TxEffect.fromBlobFields()`);
      }
      fieldsProcessed = totalFields - reader.remainingFields();
    }
    return effect;
  }

  static from(fields: FieldsOf<TxEffect>) {
    return new TxEffect(
      fields.revertCode,
      fields.txHash,
      fields.transactionFee,
      fields.noteHashes,
      fields.nullifiers,
      fields.l2ToL1Msgs,
      fields.publicDataWrites,
      fields.privateLogs,
      fields.publicLogs,
      fields.contractClassLogs,
    );
  }

  static get schema(): ZodFor<TxEffect> {
    return z
      .object({
        revertCode: RevertCode.schema,
        txHash: TxHash.schema,
        transactionFee: schemas.Fr,
        noteHashes: z.array(schemas.Fr),
        nullifiers: z.array(schemas.Fr),
        l2ToL1Msgs: z.array(schemas.Fr),
        publicDataWrites: z.array(PublicDataWrite.schema),
        privateLogs: z.array(PrivateLog.schema),
        publicLogs: z.array(PublicLog.schema),
        contractClassLogs: z.array(ContractClassLog.schema),
      })
      .transform(TxEffect.from);
  }

  [inspect.custom]() {
    return `TxEffect {
      revertCode: ${this.revertCode.getCode()},
      txHash: ${this.txHash},
      transactionFee: ${this.transactionFee},
      note hashes: [${this.noteHashes.map(h => h.toString()).join(', ')}],
      nullifiers: [${this.nullifiers.map(h => h.toString()).join(', ')}],
      l2ToL1Msgs: [${this.l2ToL1Msgs.map(h => h.toString()).join(', ')}],
      publicDataWrites: [${this.publicDataWrites.map(h => h.toString()).join(', ')}],
      privateLogs: [${this.privateLogs.map(l => l.fields.map(f => f.toString()).join(',')).join(', ')}],
      publicLogs: [${this.publicLogs.map(l => l.fields.map(f => f.toString()).join(',')).join(', ')}],
      contractClassLogs: [${this.contractClassLogs
        .map(l =>
          l
            .toFields()
            .map(f => f.toString())
            .join(','),
        )
        .join(', ')}],
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
}
