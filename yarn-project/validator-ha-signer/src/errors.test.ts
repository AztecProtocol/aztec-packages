import { SlotNumber } from '@aztec/foundation/branded-types';

import { describe, expect, it } from '@jest/globals';

import { DutyAlreadySignedError, SlashingProtectionError } from './errors.js';
import { DutyType } from './types.js';

describe('DutyAlreadySignedError', () => {
  it('should create error with correct properties', () => {
    const slot = SlotNumber(100);
    const dutyType = DutyType.BLOCK_PROPOSAL;
    const blockIndexWithinCheckpoint = 0;
    const signedByNode = 'node-1';

    const error = new DutyAlreadySignedError(slot, dutyType, blockIndexWithinCheckpoint, signedByNode);

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DutyAlreadySignedError');
    expect(error.slot).toBe(slot);
    expect(error.dutyType).toBe(dutyType);
    expect(error.blockIndexWithinCheckpoint).toBe(blockIndexWithinCheckpoint);
    expect(error.signedByNode).toBe(signedByNode);
    expect(error.message).toBe('Duty BLOCK_PROPOSAL for slot 100 already signed by node node-1');
  });

  it('should work with ATTESTATION duty type', () => {
    const error = new DutyAlreadySignedError(SlotNumber(200), DutyType.ATTESTATION, -1, 'node-2');
    expect(error.message).toBe('Duty ATTESTATION for slot 200 already signed by node node-2');
  });

  it('should work with ATTESTATIONS_AND_SIGNERS duty type', () => {
    const error = new DutyAlreadySignedError(SlotNumber(300), DutyType.ATTESTATIONS_AND_SIGNERS, -1, 'node-3');
    expect(error.message).toBe('Duty ATTESTATIONS_AND_SIGNERS for slot 300 already signed by node node-3');
  });

  it('should work with large slot numbers', () => {
    const largeSlot = SlotNumber(Number.MAX_SAFE_INTEGER);
    const error = new DutyAlreadySignedError(largeSlot, DutyType.BLOCK_PROPOSAL, 0, 'node-large');
    expect(error.slot).toBe(largeSlot);
    expect(error.message).toContain(largeSlot.toString());
  });
});

describe('SlashingProtectionError', () => {
  const existingRoot = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const attemptedRoot = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

  it('should create error with correct properties', () => {
    const slot = SlotNumber(100);
    const dutyType = DutyType.BLOCK_PROPOSAL;
    const blockIndexWithinCheckpoint = 0;
    const signedByNode = 'node-1';

    const error = new SlashingProtectionError(
      slot,
      dutyType,
      blockIndexWithinCheckpoint,
      existingRoot,
      attemptedRoot,
      signedByNode,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('SlashingProtectionError');
    expect(error.slot).toBe(slot);
    expect(error.dutyType).toBe(dutyType);
    expect(error.blockIndexWithinCheckpoint).toBe(blockIndexWithinCheckpoint);
    expect(error.existingMessageHash).toBe(existingRoot);
    expect(error.attemptedMessageHash).toBe(attemptedRoot);
    expect(error.signedByNode).toBe(signedByNode);
  });

  it('should include truncated signing roots in message', () => {
    const error = new SlashingProtectionError(
      SlotNumber(100),
      DutyType.BLOCK_PROPOSAL,
      0,
      existingRoot,
      attemptedRoot,
      'node-1',
    );

    expect(error.message).toContain('Slashing protection');
    expect(error.message).toContain(DutyType.BLOCK_PROPOSAL.toString());
    expect(error.message).toContain('slot 100');
    expect(error.message).toContain('already signed with different data');
    // Should contain first 10 characters of each root
    expect(error.message).toContain(existingRoot.slice(0, 10));
    expect(error.message).toContain(attemptedRoot.slice(0, 10));
  });

  it('should work with ATTESTATION duty type', () => {
    const error = new SlashingProtectionError(
      SlotNumber(200),
      DutyType.ATTESTATION,
      -1,
      existingRoot,
      attemptedRoot,
      'node-2',
    );
    expect(error.message).toContain(DutyType.ATTESTATION.toString());
    expect(error.message).toContain('slot 200');
  });

  it('should work with ATTESTATIONS_AND_SIGNERS duty type', () => {
    const error = new SlashingProtectionError(
      SlotNumber(300),
      DutyType.ATTESTATIONS_AND_SIGNERS,
      -1,
      existingRoot,
      attemptedRoot,
      'node-3',
    );
    expect(error.message).toContain(DutyType.ATTESTATIONS_AND_SIGNERS.toString());
    expect(error.message).toContain('slot 300');
  });

  it('should preserve full signing roots in properties', () => {
    const error = new SlashingProtectionError(
      SlotNumber(100),
      DutyType.BLOCK_PROPOSAL,
      0,
      existingRoot,
      attemptedRoot,
      'node-1',
    );
    expect(error.existingMessageHash).toBe(existingRoot);
    expect(error.attemptedMessageHash).toBe(attemptedRoot);
    // Full roots should be in properties, not just truncated in message
    expect(error.existingMessageHash.length).toBe(existingRoot.length);
    expect(error.attemptedMessageHash.length).toBe(attemptedRoot.length);
  });
});
