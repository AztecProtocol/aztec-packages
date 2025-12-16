import { decodeTxStartMarker, encodeTxStartMarker, isValidTxStartMarker } from '@aztec/blob-lib/encoding';
import {
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { type FieldsOf, makeTuple, makeTupleAsync } from '@aztec/foundation/array';
import { Fr } from '@aztec/foundation/fields';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import {
  BufferReader,
  FieldReader,
  serializeArrayOfBufferableToVector,
  serializeToBuffer,
} from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';
import { computeUnbalancedMerkleTreeRoot } from '@aztec/foundation/trees';

import { inspect } from 'util';
import { z } from 'zod';

import { PublicDataWrite } from '../avm/public_data_write.js';
import { RevertCode } from '../avm/revert_code.js';
import { ContractClassLog } from '../logs/contract_class_log.js';
import { PrivateLog } from '../logs/private_log.js';
import { FlatPublicLogs, PublicLog } from '../logs/public_log.js';
import { TxHash } from './tx_hash.js';

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
      serializeArrayOfBufferableToVector(this.publicLogs, 4),
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
      reader.readVector(PublicLog),
      reader.readVectorUint8Prefix(ContractClassLog),
    );
  }

  /**
   * Computes txOutHash of this tx effect.
   * @dev Follows new_sha in unbalanced_merkle_tree.nr
   */
  txOutHash(): Buffer {
    const { l2ToL1Msgs } = this;
    if (l2ToL1Msgs.length == 0) {
      return Buffer.alloc(32);
    }

    return computeUnbalancedMerkleTreeRoot(l2ToL1Msgs.map(msg => msg.toBuffer()));
  }

  static async random(
    numPublicCallsPerTx = 3,
    numPublicLogsPerCall = 1,
    maxEffects: number | undefined = undefined,
  ): Promise<TxEffect> {
    return new TxEffect(
      RevertCode.random(),
      TxHash.random(),
      new Fr(Math.floor(Math.random() * 100_000)),
      makeTuple(
        maxEffects === undefined ? MAX_NOTE_HASHES_PER_TX : Math.min(maxEffects, MAX_NOTE_HASHES_PER_TX),
        Fr.random,
      ),
      makeTuple(
        maxEffects === undefined ? MAX_NULLIFIERS_PER_TX : Math.min(maxEffects, MAX_NULLIFIERS_PER_TX),
        Fr.random,
      ),
      makeTuple(
        maxEffects === undefined ? MAX_L2_TO_L1_MSGS_PER_TX : Math.min(maxEffects, MAX_L2_TO_L1_MSGS_PER_TX),
        Fr.random,
      ),
      makeTuple(
        maxEffects === undefined
          ? MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
          : Math.min(maxEffects, MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX),
        PublicDataWrite.random,
      ),
      makeTuple(MAX_PRIVATE_LOGS_PER_TX, () => PrivateLog.random()),
      await Promise.all(new Array(numPublicCallsPerTx * numPublicLogsPerCall).fill(null).map(() => PublicLog.random())),
      await makeTupleAsync(MAX_CONTRACT_CLASS_LOGS_PER_TX, ContractClassLog.random),
    );
  }

  static empty(): TxEffect {
    return new TxEffect(RevertCode.OK, TxHash.zero(), Fr.ZERO, [], [], [], [], [], [], []);
  }

  /** Returns a hex representation of the TxEffect object. */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  /**
   * Returns a flat packed array of fields of all tx effects, to be appended to blobs.
   * Must match the implementation in noir-protocol-circuits/crates/rollup-lib/src/tx_base/components/tx_blob_data.nr
   */
  toBlobFields(): Fr[] {
    const flattened: Fr[] = [];

    // We reassign the first field at the end when we know the length of all effects to create the tx start marker.
    flattened.push(Fr.ZERO);

    flattened.push(this.txHash.hash);
    flattened.push(this.transactionFee);
    flattened.push(...this.noteHashes);
    flattened.push(...this.nullifiers);
    flattened.push(...this.l2ToL1Msgs);
    flattened.push(...this.publicDataWrites.flatMap(w => w.toBlobFields()));
    flattened.push(...this.privateLogs.flatMap(l => l.toBlobFields()));
    const flattenedPublicLogs = FlatPublicLogs.fromLogs(this.publicLogs);
    flattened.push(...flattenedPublicLogs.toBlobFields());
    flattened.push(...this.contractClassLogs.flatMap(l => l.toBlobFields()));

    flattened[0] = encodeTxStartMarker({
      revertCode: this.revertCode.getCode(),
      numBlobFields: flattened.length,
      numNoteHashes: this.noteHashes.length,
      numNullifiers: this.nullifiers.length,
      numL2ToL1Msgs: this.l2ToL1Msgs.length,
      numPublicDataWrites: this.publicDataWrites.length,
      numPrivateLogs: this.privateLogs.length,
      publicLogsLength: flattenedPublicLogs.length,
      contractClassLogLength: this.contractClassLogs[0]?.emittedLength ?? 0,
    });

    return flattened;
  }

  /**
   * Decodes a flat packed array of fields to TxEffect.
   */
  static fromBlobFields(fields: Fr[] | FieldReader) {
    const reader = FieldReader.asReader(fields);
    const totalFields = reader.remainingFields();
    if (!totalFields) {
      throw new Error('Cannot process empty blob fields.');
    }

    const txStartMarker = decodeTxStartMarker(reader.readField());
    if (!isValidTxStartMarker(txStartMarker)) {
      throw new Error('Invalid fields given to TxEffect.fromBlobFields(): invalid TxStartMarker');
    }

    const revertCode = RevertCode.fromField(new Fr(txStartMarker.revertCode));
    const txHash = new TxHash(reader.readField());
    const transactionFee = reader.readField();
    const noteHashes = reader.readFieldArray(txStartMarker.numNoteHashes);
    const nullifiers = reader.readFieldArray(txStartMarker.numNullifiers);
    const l2ToL1Msgs = reader.readFieldArray(txStartMarker.numL2ToL1Msgs);
    const publicDataWrites = Array.from({ length: txStartMarker.numPublicDataWrites }, () =>
      PublicDataWrite.fromBlobFields(reader),
    );
    const privateLogs = Array.from({ length: txStartMarker.numPrivateLogs }, () => PrivateLog.fromBlobFields(reader));
    const publicLogs = FlatPublicLogs.fromBlobFields(txStartMarker.publicLogsLength, reader).toLogs();
    const contractClassLogs =
      txStartMarker.contractClassLogLength > 0
        ? [ContractClassLog.fromBlobFields(txStartMarker.contractClassLogLength, reader)]
        : [];

    return TxEffect.from({
      revertCode,
      txHash,
      transactionFee,
      noteHashes,
      nullifiers,
      l2ToL1Msgs,
      publicDataWrites,
      privateLogs,
      publicLogs,
      contractClassLogs,
    });
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
      publicLogs: ${inspect(this.publicLogs)},
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
