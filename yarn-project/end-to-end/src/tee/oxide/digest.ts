import { sha256, sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

const FIELD_BYTES = 32;
const LENGTH_BYTES = 4;
const U256_BYTES = 32;

// The per-bridge identity the TEE binds into every digest so an attestation for
// bridge A cannot be replayed against bridge B. `l2Bridge` is the contract
// address on L2 that consumes claims and emits exits; `l1Portal` is the L1
// contract the exits drain to.
export type TeeConfig = {
  l2Bridge: AztecAddress;
  tokenAddress: EthAddress;
  l1Portal: EthAddress;
  l1ChainId: bigint;
  rollupVersion: bigint;
};

export type DepositDigestInput = {
  l2BlockHash: Fr;
  requiredNullifiers: Fr[];
  validNotes: Fr[];
  config: TeeConfig;
};

export type WithdrawalInitDigestInput = {
  l2BlockHash: Fr;
  requiredNullifiers: Fr[];
  validNotes: Fr[];
  validExits: Buffer[];
  config: TeeConfig;
};

export type WithdrawalFinalDigestInput = {
  withdrawalDigest: Buffer;
  l1BlockNumber: bigint;
  l1BlockHash: Buffer;
  messageHash: Buffer;
  epochNumber: bigint;
  leafIndex: bigint;
  // Bound into the final-sig preimage so TEEPortal can refuse a signature
  // produced by a TEE that was configured against a different network.
  // TEEPortal rebuilds the same bytes inline from its own immutables /
  // storage - see `TEEPortal.sol::_verifyTeeAttestation`.
  config: TeeConfig;
};

export function hashFrList(list: Fr[]): Fr {
  return sha256ToField(list.map(x => x.toBuffer()));
}

export function hashBufferList(list: Buffer[]): Fr {
  return sha256ToField(list);
}

function u256Be(value: bigint): Buffer {
  if (value < 0n) {
    throw new Error(`non-negative required, got ${value}`);
  }
  const buf = Buffer.alloc(U256_BYTES);
  let v = value;
  for (let i = U256_BYTES - 1; i >= 0; i--) {
    buf[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) {
    throw new Error(`value ${value} overflows u256`);
  }
  return buf;
}

function u32Be(value: number): Buffer {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
    throw new Error(`u32 out of range: ${value}`);
  }
  const buf = Buffer.alloc(LENGTH_BYTES);
  buf.writeUInt32BE(value, 0);
  return buf;
}

function encodeFrList(list: Fr[]): Buffer {
  return Buffer.concat([u32Be(list.length), ...list.map(x => x.toBuffer())]);
}

function encodeBufferList(list: Buffer[], byteLen: number): Buffer {
  for (const item of list) {
    if (item.length !== byteLen) {
      throw new Error(`list item must be ${byteLen} bytes, got ${item.length}`);
    }
  }
  return Buffer.concat([u32Be(list.length), ...list]);
}

function encodeConfig(config: TeeConfig): Buffer {
  return Buffer.concat([
    config.l2Bridge.toBuffer(),
    config.tokenAddress.toBuffer(),
    config.l1Portal.toBuffer(),
    u256Be(config.l1ChainId),
    u256Be(config.rollupVersion),
  ]);
}

function assertLen(name: string, buf: Buffer, expected: number): void {
  if (buf.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes, got ${buf.length}`);
  }
}

export function buildDepositDigest(input: DepositDigestInput): Buffer {
  const preimage = Buffer.concat([
    input.l2BlockHash.toBuffer(),
    encodeFrList(input.requiredNullifiers),
    encodeFrList(input.validNotes),
    encodeConfig(input.config),
  ]);
  return sha256(preimage);
}

export function buildWithdrawalInitDigest(input: WithdrawalInitDigestInput): Buffer {
  const preimage = Buffer.concat([
    input.l2BlockHash.toBuffer(),
    encodeFrList(input.requiredNullifiers),
    encodeFrList(input.validNotes),
    encodeBufferList(input.validExits, FIELD_BYTES),
    encodeConfig(input.config),
  ]);
  return sha256(preimage);
}

export function buildWithdrawalFinalDigest(input: WithdrawalFinalDigestInput): Buffer {
  assertLen('withdrawalDigest', input.withdrawalDigest, FIELD_BYTES);
  assertLen('l1BlockHash', input.l1BlockHash, FIELD_BYTES);
  assertLen('messageHash', input.messageHash, FIELD_BYTES);
  const preimage = Buffer.concat([
    input.withdrawalDigest,
    u256Be(input.l1BlockNumber),
    input.l1BlockHash,
    input.messageHash,
    u256Be(input.epochNumber),
    u256Be(input.leafIndex),
    encodeConfig(input.config),
  ]);
  return sha256(preimage);
}
