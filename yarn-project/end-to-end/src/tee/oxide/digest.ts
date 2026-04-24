import { sha256 } from '@aztec/foundation/crypto/sha256';

const FIELD_BYTES = 32;

type WithdrawalFinalDigestInput = {
  /**
   * Archive root that contains the first-phase operation anchor block hash.
   * L1 derives this from `Rollup.archiveAt(checkpointNumber)`.
   */
  archiveRoot: Buffer;
  /**
   * Per-operation, per-exit L1 nullifier key produced by the first-phase TEE
   * Grumpkin Schnorr attestation (`TeeSigner.signExitFinalization` derives it as
   * `sha256(TeeSignedData(EXIT, ...).toFields())`). L1 treats it as opaque.
   */
  withdrawalDigest: Buffer;
  /** Outbox leaf hash for this exit. L1 rebuilds this from the withdraw params. */
  messageHash: Buffer;
};

/**
 * Domain separator for the L1-verified finalization TEE attestation. Prepended
 * to the preimage so a signature produced for the finalization flow cannot
 * collide with any other SHA256-based digest the TEE emits. Must stay in
 * lockstep with `TEEPortal.sol::TEE_SIG_DOMAIN_EXIT_FINALIZED`.
 */
const TEE_SIG_DOMAIN_EXIT_FINALIZED = 2;

function assertLen(name: string, buf: Buffer, expected: number): void {
  if (buf.length !== expected) {
    throw new Error(`${name} must be ${expected} bytes, got ${buf.length}`);
  }
}

export function buildWithdrawalFinalDigest(input: WithdrawalFinalDigestInput): Buffer {
  assertLen('archiveRoot', input.archiveRoot, FIELD_BYTES);
  assertLen('withdrawalDigest', input.withdrawalDigest, FIELD_BYTES);
  assertLen('messageHash', input.messageHash, FIELD_BYTES);
  const preimage = Buffer.concat([
    Buffer.of(TEE_SIG_DOMAIN_EXIT_FINALIZED),
    input.archiveRoot,
    input.withdrawalDigest,
    input.messageHash,
  ]);
  return sha256(preimage);
}
