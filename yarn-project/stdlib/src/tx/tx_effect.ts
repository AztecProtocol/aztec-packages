import {
  type TxBlobData,
  type TxStartMarker,
  decodeTxBlobData,
  encodeTxBlobData,
  getNumTxBlobFields,
} from '@aztec/blob-lib/encoding';
import {
  MAX_CONTRACT_CLASS_LOGS_PER_TX,
  MAX_L2_TO_L1_MSGS_PER_TX,
  MAX_NOTE_HASHES_PER_TX,
  MAX_NULLIFIERS_PER_TX,
  MAX_PRIVATE_LOGS_PER_TX,
  MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
} from '@aztec/constants';
import { type FieldsOf, makeTuple, makeTupleAsync } from '@aztec/foundation/array';
import { randomInt } from '@aztec/foundation/crypto/random';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type ZodFor, schemas } from '@aztec/foundation/schemas';
import { BufferReader, serializeArrayOfBufferableToVector, serializeToBuffer } from '@aztec/foundation/serialize';
import { bufferToHex, hexToBuffer } from '@aztec/foundation/string';

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

  static async random({
    numNoteHashes,
    numNullifiers,
    numL2ToL1Msgs,
    numPublicDataWrites,
    numPrivateLogs,
    numPublicCallsPerTx = 3,
    numPublicLogsPerCall = 1,
    numContractClassLogs,
    maxEffects,
  }: {
    numNoteHashes?: number;
    numNullifiers?: number;
    numL2ToL1Msgs?: number;
    numPublicDataWrites?: number;
    numPrivateLogs?: number;
    numPublicCallsPerTx?: number;
    numPublicLogsPerCall?: number;
    numContractClassLogs?: number;
    maxEffects?: number;
  } = {}): Promise<TxEffect> {
    const count = (max: number, num?: number) => num ?? Math.min(maxEffects ?? randomInt(max), max);
    // Every tx effect must have at least 1 nullifier (the first nullifier is used for log indexing)
    const countNullifiers = (max: number, num?: number) => Math.max(1, count(max, num));
    return new TxEffect(
      RevertCode.random(),
      TxHash.random(),
      new Fr(Math.floor(Math.random() * 100_000)),
      makeTuple(count(MAX_NOTE_HASHES_PER_TX, numNoteHashes), Fr.random),
      makeTuple(countNullifiers(MAX_NULLIFIERS_PER_TX, numNullifiers), Fr.random),
      makeTuple(count(MAX_L2_TO_L1_MSGS_PER_TX, numL2ToL1Msgs), Fr.random),
      makeTuple(count(MAX_TOTAL_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX, numPublicDataWrites), PublicDataWrite.random),
      makeTuple(count(MAX_PRIVATE_LOGS_PER_TX, numPrivateLogs), () => PrivateLog.random()),
      await Promise.all(new Array(numPublicCallsPerTx * numPublicLogsPerCall).fill(null).map(() => PublicLog.random())),
      await makeTupleAsync(count(MAX_CONTRACT_CLASS_LOGS_PER_TX, numContractClassLogs), ContractClassLog.random),
    );
  }

  static empty(): TxEffect {
    return new TxEffect(RevertCode.OK, TxHash.zero(), Fr.ZERO, [], [], [], [], [], [], []);
  }

  /** Returns a hex representation of the TxEffect object. */
  toString() {
    return bufferToHex(this.toBuffer());
  }

  getNumBlobFields(): number {
    return this.getTxStartMarker().numBlobFields;
  }

  toBlobFields(): Fr[] {
    return encodeTxBlobData(this.toTxBlobData());
  }

  static fromBlobFields(fields: Fr[]) {
    return TxEffect.fromTxBlobData(decodeTxBlobData(fields));
  }

  getTxStartMarker(): TxStartMarker {
    const flatPublicLogs = FlatPublicLogs.fromLogs(this.publicLogs);
    const partialTxStartMarker = {
      revertCode: this.revertCode.getCode(),
      numNoteHashes: this.noteHashes.length,
      numNullifiers: this.nullifiers.length,
      numL2ToL1Msgs: this.l2ToL1Msgs.length,
      numPublicDataWrites: this.publicDataWrites.length,
      numPrivateLogs: this.privateLogs.length,
      privateLogsLength: this.privateLogs.reduce((acc, log) => acc + log.emittedLength, 0),
      publicLogsLength: flatPublicLogs.length,
      contractClassLogLength: this.contractClassLogs[0]?.emittedLength ?? 0,
    };
    const numBlobFields = getNumTxBlobFields(partialTxStartMarker);
    return {
      ...partialTxStartMarker,
      numBlobFields,
    };
  }

  toTxBlobData(): TxBlobData {
    return {
      txStartMarker: this.getTxStartMarker(),
      txHash: this.txHash.hash,
      transactionFee: this.transactionFee,
      noteHashes: this.noteHashes,
      nullifiers: this.nullifiers,
      l2ToL1Msgs: this.l2ToL1Msgs,
      publicDataWrites: this.publicDataWrites.map(w => w.toBlobFields()),
      privateLogs: this.privateLogs.map(l => l.toBlobFields()),
      publicLogs: FlatPublicLogs.fromLogs(this.publicLogs).toBlobFields(),
      contractClassLog: this.contractClassLogs.map(l => l.toBlobFields()).flat(),
    };
  }

  /**
   * Decodes a flat packed array of fields to TxEffect.
   */
  static fromTxBlobData(txBlobData: TxBlobData) {
    const txStartMarker = txBlobData.txStartMarker;
    const revertCode = RevertCode.fromNumber(txStartMarker.revertCode);
    const txHash = new TxHash(txBlobData.txHash);
    const transactionFee = txBlobData.transactionFee;
    const noteHashes = txBlobData.noteHashes;
    const nullifiers = txBlobData.nullifiers;
    const l2ToL1Msgs = txBlobData.l2ToL1Msgs;
    const publicDataWrites = txBlobData.publicDataWrites.map(w => PublicDataWrite.fromBlobFields(w));
    const privateLogs = txBlobData.privateLogs.map(l => PrivateLog.fromBlobFields(l.length, l));
    const publicLogs = FlatPublicLogs.fromBlobFields(txStartMarker.publicLogsLength, txBlobData.publicLogs).toLogs();
    const contractClassLogs =
      txStartMarker.contractClassLogLength > 0
        ? [ContractClassLog.fromBlobFields(txStartMarker.contractClassLogLength, txBlobData.contractClassLog)]
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
