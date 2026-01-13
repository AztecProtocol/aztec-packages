import { BlockNumber, BlockNumberSchema } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import { schemas as foundationSchemas } from '@aztec/foundation/schemas';
import {
  BufferReader,
  bigintToUInt64BE,
  numToUInt32BE,
  serializeArrayOfBufferableToVector,
} from '@aztec/foundation/serialize';

import { z } from 'zod';

import { schemas } from '../schemas/schemas.js';
import { TxHash } from '../tx/tx_hash.js';
import type { UInt64 } from '../types/shared.js';

export class TxScopedL2Log {
  constructor(
    /*
     * Hash of the tx where the log is included
     */
    public txHash: TxHash,
    /*
     * The block this log is included in
     */
    public blockNumber: BlockNumber,
    /*
     * The timestamp of the block this log is included in
     */
    public blockTimestamp: UInt64,
    /*
     * The log data as an array of field elements
     */
    public logData: Fr[],
    /*
     * The note hashes from the tx effect
     */
    public noteHashes: Fr[],
    /*
     * The first nullifier from the tx effect. Used for nonce discovery when processing notes from logs.
     *
     * (Note nonces are computed as `hash(firstNullifier, noteIndexInTx)`.)
     */
    public firstNullifier: Fr,
  ) {}

  static get schema() {
    return z
      .object({
        txHash: TxHash.schema,
        blockNumber: BlockNumberSchema,
        blockTimestamp: schemas.UInt64,
        logData: z.array(foundationSchemas.Fr),
        noteHashes: z.array(foundationSchemas.Fr),
        firstNullifier: foundationSchemas.Fr,
      })
      .transform(
        ({ txHash, blockNumber, blockTimestamp, logData, noteHashes, firstNullifier }) =>
          new TxScopedL2Log(txHash, blockNumber, blockTimestamp, logData, noteHashes, firstNullifier),
      );
  }

  toBuffer() {
    return Buffer.concat([
      this.txHash.toBuffer(),
      numToUInt32BE(this.blockNumber),
      bigintToUInt64BE(this.blockTimestamp),
      serializeArrayOfBufferableToVector(this.logData),
      serializeArrayOfBufferableToVector(this.noteHashes),
      this.firstNullifier.toBuffer(),
    ]);
  }

  static fromBuffer(buffer: Buffer) {
    const reader = BufferReader.asReader(buffer);
    const txHash = reader.readObject(TxHash);
    const blockNumber = BlockNumber(reader.readNumber());
    const blockTimestamp = reader.readUInt64();
    const logData = reader.readVector(Fr);
    const noteHashes = reader.readVector(Fr);
    const firstNullifier = reader.readObject(Fr);

    return new TxScopedL2Log(txHash, blockNumber, blockTimestamp, logData, noteHashes, firstNullifier);
  }

  equals(other: TxScopedL2Log) {
    return (
      this.txHash.equals(other.txHash) &&
      this.blockNumber === other.blockNumber &&
      this.blockTimestamp === other.blockTimestamp &&
      this.logData.length === other.logData.length &&
      this.logData.every((f, i) => f.equals(other.logData[i])) &&
      this.noteHashes.length === other.noteHashes.length &&
      this.noteHashes.every((h, i) => h.equals(other.noteHashes[i])) &&
      this.firstNullifier.equals(other.firstNullifier)
    );
  }
}
