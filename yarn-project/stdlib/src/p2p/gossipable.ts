import { Buffer32 } from '@aztec/foundation/buffer';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';

import type { TopicType } from './topic_type.js';

export class P2PMessage {
  constructor(
    public readonly publishTime: Date,
    public readonly id: Buffer32,
    public readonly payload: Buffer,
  ) {}

  static async fromGossipable(message: Gossipable): Promise<P2PMessage> {
    return new P2PMessage(new Date(), await message.p2pMessageIdentifier(), message.toBuffer());
  }

  static fromMessageData(messageData: Buffer): P2PMessage {
    const reader = new BufferReader(messageData);
    const publishTime = reader.readUInt64();
    const id = Buffer32.fromBuffer(reader);
    const payload = reader.readBuffer();
    return new P2PMessage(new Date(Number(publishTime)), id, payload);
  }

  toMessageData(): Buffer {
    return serializeToBuffer([
      bigintToUInt64BE(BigInt(this.publishTime.getTime())),
      this.id,
      serializeToBuffer(this.payload.length, this.payload),
    ]);
  }
}

/**
 * Gossipable
 *
 * Any class which extends gossipable will be able to be Gossiped over the p2p network
 */
export abstract class Gossipable {
  private cachedId: Buffer32 | undefined;
  /** p2p Topic
   *
   * - The p2p topic identifier, this determines how the message is handled
   */
  static p2pTopic: TopicType;

  /** p2p Message Identifier
   *
   *  - A digest of the message information, this key is used for deduplication
   */
  async p2pMessageIdentifier(): Promise<Buffer32> {
    if (this.cachedId) {
      return this.cachedId;
    }
    this.cachedId = await this.generateP2PMessageIdentifier();
    return this.cachedId;
  }

  abstract generateP2PMessageIdentifier(): Promise<Buffer32>;

  /** To Buffer
   *
   * - Serialization method
   */
  abstract toBuffer(): Buffer;

  toMessage(): Buffer {
    return this.toBuffer();
  }

  /**
   * Get the size of the gossipable object.
   *
   * This is used for metrics recording.
   */
  abstract getSize(): number;
}
