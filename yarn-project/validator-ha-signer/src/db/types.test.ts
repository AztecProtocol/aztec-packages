import { IndexWithinCheckpoint, SlotNumber } from '@aztec/foundation/branded-types';
import { EthAddress } from '@aztec/foundation/eth-address';

import { describe, expect, it } from '@jest/globals';

import {
  type BlockProposalDutyIdentifier,
  DutyType,
  type OtherDutyIdentifier,
  getBlockIndexFromDutyIdentifier,
  normalizeBlockIndex,
} from './types.js';

describe('normalizeBlockIndex', () => {
  describe('BLOCK_PROPOSAL duties', () => {
    it('should return the blockIndexWithinCheckpoint when valid (>= 0)', () => {
      expect(normalizeBlockIndex(DutyType.BLOCK_PROPOSAL, 0)).toBe(0);
      expect(normalizeBlockIndex(DutyType.BLOCK_PROPOSAL, 1)).toBe(1);
      expect(normalizeBlockIndex(DutyType.BLOCK_PROPOSAL, 2)).toBe(2);
      expect(normalizeBlockIndex(DutyType.BLOCK_PROPOSAL, 100)).toBe(100);
    });

    it('should throw when blockIndexWithinCheckpoint is undefined', () => {
      expect(() => normalizeBlockIndex(DutyType.BLOCK_PROPOSAL, undefined)).toThrow(
        'BLOCK_PROPOSAL duties require blockIndexWithinCheckpoint to be specified',
      );
    });

    it('should throw when blockIndexWithinCheckpoint is negative', () => {
      expect(() => normalizeBlockIndex(DutyType.BLOCK_PROPOSAL, -1)).toThrow(
        'BLOCK_PROPOSAL duties require blockIndexWithinCheckpoint >= 0, got -1',
      );
      expect(() => normalizeBlockIndex(DutyType.BLOCK_PROPOSAL, -100)).toThrow(
        'BLOCK_PROPOSAL duties require blockIndexWithinCheckpoint >= 0, got -100',
      );
    });
  });

  describe('non-BLOCK_PROPOSAL duties', () => {
    const nonBlockProposalTypes = [
      DutyType.CHECKPOINT_PROPOSAL,
      DutyType.ATTESTATION,
      DutyType.ATTESTATIONS_AND_SIGNERS,
      DutyType.GOVERNANCE_VOTE,
      DutyType.SLASHING_VOTE,
    ];

    it.each(nonBlockProposalTypes)('should return -1 for %s regardless of input', dutyType => {
      // Should return -1 even when undefined
      expect(normalizeBlockIndex(dutyType, undefined)).toBe(-1);

      // Should return -1 even when a value is passed (ignores the value)
      expect(normalizeBlockIndex(dutyType, 0)).toBe(-1);
      expect(normalizeBlockIndex(dutyType, 1)).toBe(-1);
      expect(normalizeBlockIndex(dutyType, 100)).toBe(-1);
      expect(normalizeBlockIndex(dutyType, -1)).toBe(-1);
    });
  });
});

describe('getBlockIndexFromDutyIdentifier', () => {
  const validatorAddress = EthAddress.random();
  const slot = SlotNumber(100);

  describe('BLOCK_PROPOSAL duties', () => {
    it('should return the blockIndexWithinCheckpoint', () => {
      const duty: BlockProposalDutyIdentifier = {
        validatorAddress,
        slot,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(0),
        dutyType: DutyType.BLOCK_PROPOSAL,
      };
      expect(getBlockIndexFromDutyIdentifier(duty)).toBe(0);

      const duty2: BlockProposalDutyIdentifier = {
        validatorAddress,
        slot,
        blockIndexWithinCheckpoint: IndexWithinCheckpoint(5),
        dutyType: DutyType.BLOCK_PROPOSAL,
      };
      expect(getBlockIndexFromDutyIdentifier(duty2)).toBe(5);
    });
  });

  describe('non-BLOCK_PROPOSAL duties', () => {
    it('should return -1 for CHECKPOINT_PROPOSAL', () => {
      const duty: OtherDutyIdentifier = {
        validatorAddress,
        slot,
        dutyType: DutyType.CHECKPOINT_PROPOSAL,
      };
      expect(getBlockIndexFromDutyIdentifier(duty)).toBe(-1);
    });

    it('should return -1 for ATTESTATION', () => {
      const duty: OtherDutyIdentifier = {
        validatorAddress,
        slot,
        dutyType: DutyType.ATTESTATION,
      };
      expect(getBlockIndexFromDutyIdentifier(duty)).toBe(-1);
    });

    it('should return -1 for ATTESTATIONS_AND_SIGNERS', () => {
      const duty: OtherDutyIdentifier = {
        validatorAddress,
        slot,
        dutyType: DutyType.ATTESTATIONS_AND_SIGNERS,
      };
      expect(getBlockIndexFromDutyIdentifier(duty)).toBe(-1);
    });

    it('should return -1 for GOVERNANCE_VOTE', () => {
      const duty: OtherDutyIdentifier = {
        validatorAddress,
        slot,
        dutyType: DutyType.GOVERNANCE_VOTE,
      };
      expect(getBlockIndexFromDutyIdentifier(duty)).toBe(-1);
    });

    it('should return -1 for SLASHING_VOTE', () => {
      const duty: OtherDutyIdentifier = {
        validatorAddress,
        slot,
        dutyType: DutyType.SLASHING_VOTE,
      };
      expect(getBlockIndexFromDutyIdentifier(duty)).toBe(-1);
    });
  });
});
