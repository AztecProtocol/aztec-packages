import { keccak256 } from '@aztec/foundation/crypto/keccak';
import { sha256ToField } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { EthAddress } from '@aztec/foundation/eth-address';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';

// TS mirror of `asserted_token_contract/src/content_hash.nr`. Must stay byte-for-byte
// with the Noir side - the bridge e2e pins this by driving the claim flow through it.

// "OXIDE_BRIDGE_V1\0" - matches `DOMAIN_MAGIC` in content_hash.nr.
const DOMAIN_MAGIC: Uint8Array = new Uint8Array([
  0x4f, 0x58, 0x49, 0x44, 0x45, 0x5f, 0x42, 0x52, 0x49, 0x44, 0x47, 0x45, 0x5f, 0x56, 0x31, 0x00,
]);

function toBe32(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error(`non-negative required, got ${value}`);
  }
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  if (v !== 0n) {
    throw new Error(`value ${value} overflows 32 bytes`);
  }
  return out;
}

function frToBe32(value: Fr): Uint8Array {
  return toBe32(value.toBigInt());
}

function u128Slot(amount: bigint): Uint8Array {
  const out = toBe32(amount);
  for (let i = 0; i < 16; i++) {
    if (out[i] !== 0) {
      throw new Error(`amount ${amount} overflows u128`);
    }
  }
  return out;
}

function computeStealthTag(sharedSecret: Fr, recipient: AztecAddress): Fr {
  const bytes = new Uint8Array(64);
  bytes.set(frToBe32(sharedSecret), 0);
  bytes.set(frToBe32(recipient.toField()), 32);
  return sha256ToField([Buffer.from(bytes)]);
}

export function computeStealthRecipientHash(
  sharedSecret: Fr,
  recipient: AztecAddress,
  portal: EthAddress,
  l1ChainId: bigint,
): Fr {
  const tag = computeStealthTag(sharedSecret, recipient);
  const bytes = new Uint8Array(112);
  bytes.set(DOMAIN_MAGIC, 0);
  bytes.set(toBe32(l1ChainId), 16);
  bytes.set(frToBe32(portal.toField()), 48);
  bytes.set(frToBe32(tag), 80);
  return sha256ToField([Buffer.from(bytes)]);
}

export function getClaimContentHash(recipientHash: Fr, amount: bigint): Fr {
  const selector = keccak256(Buffer.from('claim(bytes32,uint256)')).subarray(0, 4);
  const bytes = new Uint8Array(68);
  bytes.set(selector, 0);
  bytes.set(frToBe32(recipientHash), 4);
  bytes.set(u128Slot(amount), 36);
  return sha256ToField([Buffer.from(bytes)]);
}

export function getWithdrawContentHash(l1Recipient: EthAddress, amount: bigint): Fr {
  const selector = keccak256(Buffer.from('withdraw(address,uint256)')).subarray(0, 4);
  const bytes = new Uint8Array(68);
  bytes.set(selector, 0);
  bytes.set(frToBe32(l1Recipient.toField()), 4);
  bytes.set(u128Slot(amount), 36);
  return sha256ToField([Buffer.from(bytes)]);
}
