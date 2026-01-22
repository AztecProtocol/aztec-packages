import { Buffer32 } from '@aztec/foundation/buffer';
import { BufferReader, bigintToUInt64BE, serializeToBuffer } from '@aztec/foundation/serialize';

import type { TopicType } from './topic_type.js';

export class P2PMessage {
  constructor(
    public readonly payload: Buffer,
    public readonly timestamp?: Date,
    public readonly traceContext?: string,
  ) {}

  static fromGossipable(message: Gossipable, instrumentMessages = false, traceContext?: string): P2PMessage {
    if (!instrumentMessages) {
      return new P2PMessage(message.toBuffer());
    }
    return new P2PMessage(message.toBuffer(), new Date(), traceContext);
  }

  static fromMessageData(messageData: Buffer, instrumentMessages = false): P2PMessage {
    const reader = new BufferReader(messageData);
    let timestamp: Date | undefined;
    let traceContext: string | undefined;
    if (instrumentMessages) {
      timestamp = new Date(Number(reader.readUInt64()));
      traceContext = reader.readString();
    }
    const payload = reader.readBuffer();
    return new P2PMessage(payload, timestamp, traceContext);
  }

  toMessageData(): Buffer {
    const arr: Buffer[] = [];
    if (this.timestamp) {
      arr.push(bigintToUInt64BE(BigInt(this.timestamp.getTime())));
      arr.push(serializeToBuffer(this.traceContext ?? ''));
    }
    arr.push(serializeToBuffer(this.payload.length, this.payload));
    return serializeToBuffer(arr);
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
