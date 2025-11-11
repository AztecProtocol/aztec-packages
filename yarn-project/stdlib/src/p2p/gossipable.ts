import { Buffer32 } from '@aztec/foundation/buffer';
import { BufferReader, serializeToBuffer } from '@aztec/foundation/serialize';

import type { TopicType } from './topic_type.js';

export class P2PMessage {
  constructor(public readonly payload: Buffer) {}

  static fromGossipable(message: Gossipable): P2PMessage {
    return new P2PMessage(message.toBuffer());
  }

  static fromMessageData(messageData: Buffer): P2PMessage {
    const reader = new BufferReader(messageData);
    const payload = reader.readBuffer();
    return new P2PMessage(payload);
  }

  toMessageData(): Buffer {
    return serializeToBuffer([serializeToBuffer(this.payload.length, this.payload)]);
  }
}

/**
 * Gossipable
 *
 * Any class which extends gossipable will be able to be Gossiped over the p2p network
 */
export abstract class Gossipable {
  private cachedId: Buffer32 | undefined;
  /** The p2p topic identifier, this determines how the message is handled */
  static p2pTopic: TopicType;

  /**
   * A digest of the message information **used for logging only**.
   * The identifier used for deduplication is `getMsgIdFn` as defined in `encoding.ts` which is a hash over topic and data.
   */
  async p2pMessageLoggingIdentifier(): Promise<Buffer32> {
    if (this.cachedId) {
      return this.cachedId;
    }
    this.cachedId = await this.generateP2PMessageIdentifier();
    return this.cachedId;
  }

  abstract generateP2PMessageIdentifier(): Promise<Buffer32>;

  abstract toBuffer(): Buffer;

  toMessage(): Buffer {
    return this.toBuffer();
  }

  /**
   * Get the size of the gossipable object.
   * This is used for metrics recording.
   */
  abstract getSize(): number;
}
