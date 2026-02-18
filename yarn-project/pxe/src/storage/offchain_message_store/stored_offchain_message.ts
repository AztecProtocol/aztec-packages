import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { OffchainMessage } from '@aztec/stdlib/tx';
import { TxHash } from '@aztec/stdlib/tx';

/**
 * Status of a stored offchain message.
 * - `pending`: Awaiting processing during the next sync_state.
 * - `processed`: Successfully validated and fed into the message discovery pipeline.
 * - `invalid`: Failed validation (e.g. the effect data was not produced via MessageDelivery.OFFCHAIN).
 * - `expired`: The originating tx was not mined within MAX_TX_LIFETIME.
 */
export type OffchainMessageStatus = 'pending' | 'processed' | 'invalid' | 'expired';

const STATUS_VALUES: OffchainMessageStatus[] = ['pending', 'processed', 'invalid', 'expired'];

/** An offchain message enriched with ingestion metadata and processing status. */
export class StoredOffchainMessage {
  constructor(
    readonly offchainMessage: OffchainMessage,
    readonly ingestedAt: number,
    private _status: OffchainMessageStatus = 'pending',
  ) {}

  static fromMessage(msg: OffchainMessage): StoredOffchainMessage {
    return new StoredOffchainMessage(msg, Date.now());
  }

  static fromBuffer(buffer: Buffer): StoredOffchainMessage {
    const reader = BufferReader.asReader(buffer);
    const dataLen = reader.readNumber();
    const data = reader.readArray(dataLen, Fr);
    const contractAddress = reader.readObject(AztecAddress);
    const txHash = reader.readObject(TxHash);
    const ingestedAt = Number(reader.readUInt64());
    const statusIndex = reader.readNumber();
    return new StoredOffchainMessage(
      { offchainEffect: { data, contractAddress }, txHash },
      ingestedAt,
      STATUS_VALUES[statusIndex],
    );
  }

  toBuffer(): Buffer {
    const { offchainEffect, txHash } = this.offchainMessage;
    const statusIndex = STATUS_VALUES.indexOf(this._status);
    return serializeToBuffer(
      offchainEffect.data.length,
      ...offchainEffect.data,
      offchainEffect.contractAddress,
      txHash,
      bigintToUInt64BE(BigInt(this.ingestedAt)),
      statusIndex,
    );
  }

  get status(): OffchainMessageStatus {
    return this._status;
  }

  set status(value: OffchainMessageStatus) {
    this._status = value;
  }
}
