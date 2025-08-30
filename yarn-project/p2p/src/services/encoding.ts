// Taken from lodestar: https://github.com/ChainSafe/lodestar
import { sha256 } from '@aztec/foundation/crypto';

import type { RPC } from '@chainsafe/libp2p-gossipsub/message';
import type { DataTransform } from '@chainsafe/libp2p-gossipsub/types';
import type { Message } from '@libp2p/interface';
import { compressSync, uncompressSync } from 'snappy';
import xxhashFactory from 'xxhash-wasm';
import { randomBytes } from 'crypto';

// Load WASM
const xxhash = await xxhashFactory();

/**
 * Derive a 64-bit seed for xxhash using a cryptographically secure RNG.
 * Allows deterministic override for tests via AZTEC_P2P_MSGID_SEED
 * (accepts decimal or hex strings, with or without "0x").
 */
function deriveH64Seed(): bigint {
  const override = typeof process !== 'undefined' ? process.env?.AZTEC_P2P_MSGID_SEED : undefined;
  if (override && override.length > 0) {
    // Allow decimal or hex input (with or without 0x)
    const normalized = override.startsWith('0x') ? override : ( /^[0-9]+$/.test(override) ? override : `0x${override}` );
    try {
      return BigInt(normalized);
    } catch {
      throw new Error(
        `Invalid AZTEC_P2P_MSGID_SEED value: "${override}". Provide a 64-bit integer (decimal or hex).`,
      );
    }
  }
  // 64-bit seed from CSPRNG
  return BigInt('0x' + randomBytes(8).toString('hex'));
}

// Use non-predictable seed to prevent msgId collision mining
const h64Seed: bigint = deriveH64Seed();

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

/**
 * Snappy transform for libp2p gossipsub
 */
export class SnappyTransform implements DataTransform {
  // Topic string included to satisfy DataTransform interface
  inboundTransform(_topicStr: string, data: Uint8Array): Uint8Array {
    return this.inboundTransformNoTopic(Buffer.from(data));
  }

  public inboundTransformNoTopic(data: Buffer): Buffer {
    if (data.length === 0) {
      return data;
    }
    return Buffer.from(uncompressSync(data, { asBuffer: true }));
  }

  // Topic string included to satisfy DataTransform interface
  outboundTransform(_topicStr: string, data: Uint8Array): Uint8Array {
    return this.outboundTransformNoTopic(Buffer.from(data));
  }

  public outboundTransformNoTopic(data: Buffer): Buffer {
    if (data.length === 0) {
      return data;
    }
    return Buffer.from(compressSync(data));
  }
}
