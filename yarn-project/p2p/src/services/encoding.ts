// Taken from lodestar: https://github.com/ChainSafe/lodestar
import { sha256 } from '@aztec/foundation/crypto';
import { createLogger } from '@aztec/foundation/log';
import { TopicType, getTopicFromString } from '@aztec/stdlib/p2p';

import type { RPC } from '@chainsafe/libp2p-gossipsub/message';
import type { DataTransform } from '@chainsafe/libp2p-gossipsub/types';
import type { Message } from '@libp2p/interface';
import { compressSync, uncompressSync } from 'snappy';
import xxhashFactory from 'xxhash-wasm';

// Load WASM
const xxhash = await xxhashFactory();

// Use salt to prevent msgId from being mined for collisions
const h64Seed = BigInt(Math.floor(Math.random() * 1e9));

// Shared buffer to convert msgId to string
const sharedMsgIdBuf = Buffer.alloc(20);

/**
 * The function used to generate a gossipsub message id
 * We use the first 8 bytes of SHA256(data) for content addressing
 */
export function fastMsgIdFn(rpcMsg: RPC.Message): string {
  if (rpcMsg.data) {
    return xxhash.h64Raw(rpcMsg.data, h64Seed).toString(16);
  }
  return '0000000000000000';
}

export function msgIdToStrFn(msgId: Uint8Array): string {
  // This happens serially, no need to reallocate the buffer
  sharedMsgIdBuf.set(msgId);
  return `0x${sharedMsgIdBuf.toString('hex')}`;
}

/**
 * Get the message identifier from a libp2p message
 *
 * Follows similarly to:
 * https://github.com/ethereum/consensus-specs/blob/v1.1.0-alpha.7/specs/altair/p2p-interface.md#topics-and-messages
 *
 * @param message - The libp2p message
 * @returns The message identifier
 */
export function getMsgIdFn(message: Message) {
  const { topic } = message;

  const vec = [Buffer.from(topic), message.data];
  return sha256(Buffer.concat(vec)).subarray(0, 20);
}

const DefaultMaxSizesKb: Record<TopicType, number> = {
  // Tx effects should not exceed 128kb, so 512kb for the full tx obj should be sufficient
  [TopicType.tx]: 512,
  // An attestation has roughly 30 fields, which is 1kb, so 5x is plenty
  [TopicType.block_attestation]: 5,
  // Proposals may carry some tx objects, so we allow a larger size capped at 10mb
  // Note this may not be enough for carrying all tx objects in a block
  [TopicType.block_proposal]: 1024 * 10,
};

/**
 * Snappy transform for libp2p gossipsub
 */
export class SnappyTransform implements DataTransform {
  constructor(
    private maxSizesKb: Record<TopicType, number> = DefaultMaxSizesKb,
    private defaultMaxSizeKb: number = 10 * 1024,
    private logger = createLogger('p2p:snappy-transform'),
  ) {}

  // Topic string included to satisfy DataTransform interface
  inboundTransform(topicStr: string, data: Uint8Array): Uint8Array {
    const topic = getTopicFromString(topicStr);
    return this.inboundTransformData(Buffer.from(data), topic);
  }

  public inboundTransformData(data: Buffer, topic?: TopicType): Buffer {
    if (data.length === 0) {
      return data;
    }
    const maxSizeKb = this.maxSizesKb[topic!] ?? this.defaultMaxSizeKb;
    const { decompressedSize } = readSnappyPreamble(data);
    if (decompressedSize > maxSizeKb * 1024) {
      this.logger.warn(`Decompressed size ${decompressedSize} exceeds maximum allowed size of ${maxSizeKb}kb`);
      throw new Error(`Decompressed size ${decompressedSize} exceeds maximum allowed size of ${maxSizeKb}kb`);
    }

    return Buffer.from(uncompressSync(data, { asBuffer: true }));
  }

  // Topic string included to satisfy DataTransform interface
  outboundTransform(_topicStr: string, data: Uint8Array): Uint8Array {
    return this.outboundTransformData(Buffer.from(data));
  }

  public outboundTransformData(data: Buffer): Buffer {
    if (data.length === 0) {
      return data;
    }
    return Buffer.from(compressSync(data));
  }
}

/**
 * Reads the Snappy preamble from compressed data and returns the expected decompressed size.
 *
 * The Snappy format starts with a little-endian varint encoding the uncompressed length.
 * Varints consist of a series of bytes where:
 * - Lower 7 bits contain data
 * - Upper bit (0x80) is set if more bytes follow
 *
 * @param data - The compressed data starting with the Snappy preamble
 * @returns Object containing the decompressed size and the number of bytes read from the preamble
 * @throws Error if the data is too short or the varint is invalid
 */
export function readSnappyPreamble(data: Uint8Array): { decompressedSize: number; bytesRead: number } {
  if (data.length === 0) {
    throw new Error('Cannot read preamble from empty data');
  }

  let result = 0;
  let shift = 0;
  let bytesRead = 0;

  // Maximum varint length for 32-bit value is 5 bytes
  // (7 bits per byte, so 5 bytes = 35 bits, enough for 2^32 - 1)
  const maxBytes = 5;

  for (let i = 0; i < Math.min(data.length, maxBytes); i++) {
    const byte = data[i];
    bytesRead++;

    // Extract lower 7 bits and add to result with appropriate shift
    // Use >>> 0 to convert to unsigned 32-bit integer to avoid sign issues
    result = (result | ((byte & 0x7f) << shift)) >>> 0;

    // If upper bit is not set, we're done
    if ((byte & 0x80) === 0) {
      return { decompressedSize: result, bytesRead };
    }

    shift += 7;
  }

  // If we get here, either we ran out of data or the varint is too long
  if (bytesRead >= maxBytes) {
    throw new Error('Varint is too long (max 5 bytes for 32-bit value)');
  }

  throw new Error('Incomplete varint: data ended before varint termination');
}
