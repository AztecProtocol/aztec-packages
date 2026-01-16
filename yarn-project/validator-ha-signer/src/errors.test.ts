import { describe, expect, it } from '@jest/globals';

import { DutyAlreadySignedError, SlashingProtectionError } from './errors.js';
import { DutyType } from './types.js';

describe('DutyAlreadySignedError', () => {
  it('should create error with correct properties', () => {
    const slot = 100n;
    const dutyType = DutyType.BLOCK_PROPOSAL;
    const signedByNode = 'node-1';

    const error = new DutyAlreadySignedError(slot, dutyType, signedByNode);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DutyAlreadySignedError');
    expect(error.slot).toBe(slot);
    expect(error.dutyType).toBe(dutyType);
    expect(error.signedByNode).toBe(signedByNode);
    expect(error.message).toBe('Duty BLOCK_PROPOSAL for slot 100 already signed by node node-1');
  });

  it('should work with ATTESTATION duty type', () => {
    const error = new DutyAlreadySignedError(200n, DutyType.ATTESTATION, 'node-2');
    expect(error.message).toBe('Duty ATTESTATION for slot 200 already signed by node node-2');
  });

  it('should work with ATTESTATIONS_AND_SIGNERS duty type', () => {
    const error = new DutyAlreadySignedError(300n, DutyType.ATTESTATIONS_AND_SIGNERS, 'node-3');
    expect(error.message).toBe('Duty ATTESTATIONS_AND_SIGNERS for slot 300 already signed by node node-3');
  });

  it('should work with large slot numbers', () => {
    const largeSlot = 9007199254740991n;
    const error = new DutyAlreadySignedError(largeSlot, DutyType.BLOCK_PROPOSAL, 'node-large');
    expect(error.slot).toBe(largeSlot);
    expect(error.message).toContain(largeSlot.toString());
  });
});

describe('SlashingProtectionError', () => {
  const existingRoot = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const attemptedRoot = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('should create error with correct properties', () => {
    const slot = 100n;
    const dutyType = DutyType.BLOCK_PROPOSAL;

    const error = new SlashingProtectionError(slot, dutyType, existingRoot, attemptedRoot);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SlashingProtectionError');
    expect(error.slot).toBe(slot);
    expect(error.dutyType).toBe(dutyType);
    expect(error.existingMessageHash).toBe(existingRoot);
    expect(error.attemptedMessageHash).toBe(attemptedRoot);
  });

  it('should include truncated signing roots in message', () => {
    const error = new SlashingProtectionError(100n, DutyType.BLOCK_PROPOSAL, existingRoot, attemptedRoot);

    expect(error.message).toContain('Slashing protection');
    expect(error.message).toContain(DutyType.BLOCK_PROPOSAL.toString());
    expect(error.message).toContain('slot 100');
    expect(error.message).toContain('already signed with different data');
    // Should contain first 10 characters of each root
    expect(error.message).toContain(existingRoot.slice(0, 10));
    expect(error.message).toContain(attemptedRoot.slice(0, 10));
  });

  it('should work with ATTESTATION duty type', () => {
    const error = new SlashingProtectionError(200n, DutyType.ATTESTATION, existingRoot, attemptedRoot);
    expect(error.message).toContain(DutyType.ATTESTATION.toString());
    expect(error.message).toContain('slot 200');
  });

  it('should work with ATTESTATIONS_AND_SIGNERS duty type', () => {
    const error = new SlashingProtectionError(300n, DutyType.ATTESTATIONS_AND_SIGNERS, existingRoot, attemptedRoot);
    expect(error.message).toContain(DutyType.ATTESTATIONS_AND_SIGNERS.toString());
    expect(error.message).toContain('slot 300');
  });

  it('should preserve full signing roots in properties', () => {
    const error = new SlashingProtectionError(100n, DutyType.BLOCK_PROPOSAL, existingRoot, attemptedRoot);
    expect(error.existingMessageHash).toBe(existingRoot);
    expect(error.attemptedMessageHash).toBe(attemptedRoot);
    // Full roots should be in properties, not just truncated in message
    expect(error.existingMessageHash.length).toBe(existingRoot.length);
    expect(error.attemptedMessageHash.length).toBe(attemptedRoot.length);
  });
});
