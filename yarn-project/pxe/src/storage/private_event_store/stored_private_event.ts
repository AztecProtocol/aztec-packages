import { Fr } from '@aztec/foundation/curves/bn254';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';
import { EventSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { BlockHash } from '@aztec/stdlib/block';
import { TxHash } from '@aztec/stdlib/tx';

/** Serializable private event entry with scope tracking. */
export class StoredPrivateEvent {
  constructor(
    readonly randomness: Fr,
    readonly msgContent: Fr[],
    readonly l2BlockNumber: number,
    readonly l2BlockHash: BlockHash,
    readonly txHash: TxHash,
    readonly txIndexInBlock: number,
    readonly eventIndexInTx: number,
    readonly contractAddress: AztecAddress,
    readonly eventSelector: EventSelector,
    readonly scopes: Set<string>,
  ) {}

  addScope(scope: string) {
    this.scopes.add(scope);
  }

  toBuffer(): Buffer {
    const scopesArray = [...this.scopes];
    return serializeToBuffer(
      this.randomness,
      this.msgContent.length,
      ...this.msgContent,
      this.l2BlockNumber,
      this.l2BlockHash,
      this.txHash,
      this.txIndexInBlock,
      this.eventIndexInTx,
      this.contractAddress,
      this.eventSelector.toBuffer(),
      scopesArray.length,
      ...scopesArray,
    );
  }

  static fromBuffer(buffer: Buffer): StoredPrivateEvent {
    const reader = BufferReader.asReader(buffer);

    const randomness = Fr.fromBuffer(reader);
    const msgContentLength = reader.readNumber();
    const msgContent = reader.readArray(msgContentLength, Fr);
    const l2BlockNumber = reader.readNumber();
    const l2BlockHash = new BlockHash(Fr.fromBuffer(reader));
    const txHash = TxHash.fromBuffer(reader);
    const txIndexInBlock = reader.readNumber();
    const eventIndexInTx = reader.readNumber();
    const contractAddress = AztecAddress.fromBuffer(reader);
    const eventSelector = EventSelector.fromBuffer(reader);
    const scopes = reader.readVector({ fromBuffer: (r: BufferReader) => r.readString() });

    return new StoredPrivateEvent(
      randomness,
      msgContent,
      l2BlockNumber,
      l2BlockHash,
      txHash,
      txIndexInBlock,
      eventIndexInTx,
      contractAddress,
      eventSelector,
      new Set(scopes),
    );
  }
}
