// Taken from lodestar: https://github.com/ChainSafe/lodestar
import { sha256 } from '@aztec/foundation/crypto';

import { type RPC } from '@chainsafe/libp2p-gossipsub/message';
import { type Message } from '@libp2p/interface';
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
