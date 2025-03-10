import type { Buffer32 } from '@aztec/foundation/buffer';

/**
 * Gossipable
 *
 * Any class which extends gossipable will be able to be Gossiped over the p2p network
 */
export abstract class Gossipable {
  /** p2p Topic
   *
   * - The p2p topic identifier, this determines how the message is handled
   */
  static p2pTopic: string;

  /** p2p Message Identifier
   *
   *  - A digest of the message information, this key is used for deduplication
   */
  abstract p2pMessageIdentifier(): Promise<Buffer32>;

  /** To Buffer
   *
   * - Serialization method
   */
  abstract toBuffer(): Buffer;

  /**
   * Get the size of the gossipable object.
   *
   * This is used for metrics recording.
   */
  abstract getSize(): number;
}
