import { BlockNumber, CheckpointNumber, SlotNumber } from '@aztec/foundation/branded-types';

import { describe, expect, it } from '@jest/globals';

import { DutyType } from './db/types.js';
import {
  type BlockProposalSigningContext,
  type HAProtectedSigningContext,
  type OtherSigningContext,
  type VoteSigningContext,
  getBlockNumberFromSigningContext,
} from './types.js';

describe('getBlockNumberFromSigningContext', () => {
  describe('duties with blockNumber', () => {
    it('should return blockNumber for BLOCK_PROPOSAL', () => {
      const context: BlockProposalSigningContext = {
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: 0,
      };
      expect(getBlockNumberFromSigningContext(context)).toBe(BlockNumber(50));
    });

    it('should return blockNumber for CHECKPOINT_PROPOSAL', () => {
      const context: OtherSigningContext = {
        slot: SlotNumber(100),
        blockNumber: CheckpointNumber(25),
        dutyType: DutyType.CHECKPOINT_PROPOSAL,
      };
      expect(getBlockNumberFromSigningContext(context)).toBe(CheckpointNumber(25));
    });

    it('should return blockNumber for ATTESTATION', () => {
      const context: OtherSigningContext = {
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        dutyType: DutyType.ATTESTATION,
      };
      expect(getBlockNumberFromSigningContext(context)).toBe(BlockNumber(50));
    });

    it('should return blockNumber for ATTESTATIONS_AND_SIGNERS', () => {
      const context: OtherSigningContext = {
        slot: SlotNumber(100),
        blockNumber: BlockNumber(50),
        dutyType: DutyType.ATTESTATIONS_AND_SIGNERS,
      };
      expect(getBlockNumberFromSigningContext(context)).toBe(BlockNumber(50));
    });

    it('should handle large block numbers', () => {
      const largeBlockNumber = BlockNumber(Number.MAX_SAFE_INTEGER);
      const context: BlockProposalSigningContext = {
        slot: SlotNumber(100),
        blockNumber: largeBlockNumber,
        dutyType: DutyType.BLOCK_PROPOSAL,
        blockIndexWithinCheckpoint: 0,
      };
      expect(getBlockNumberFromSigningContext(context)).toBe(largeBlockNumber);
    });
  });

  describe('vote duties (no blockNumber in context)', () => {
    it('should return BlockNumber(0) for GOVERNANCE_VOTE', () => {
      const context: VoteSigningContext = {
        slot: SlotNumber(100),
        dutyType: DutyType.GOVERNANCE_VOTE,
      };
      expect(getBlockNumberFromSigningContext(context)).toBe(BlockNumber(0));
    });

    it('should return BlockNumber(0) for SLASHING_VOTE', () => {
      const context: VoteSigningContext = {
        slot: SlotNumber(100),
        dutyType: DutyType.SLASHING_VOTE,
      };
      expect(getBlockNumberFromSigningContext(context)).toBe(BlockNumber(0));
    });

    it('should handle slot 0 for vote duties', () => {
      const context: VoteSigningContext = {
        slot: SlotNumber(0),
        dutyType: DutyType.GOVERNANCE_VOTE,
      };
      expect(getBlockNumberFromSigningContext(context)).toBe(BlockNumber(0));
    });
  });

  describe('type safety', () => {
    it('should accept all HAProtectedSigningContext types', () => {
      const contexts: HAProtectedSigningContext[] = [
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          dutyType: DutyType.BLOCK_PROPOSAL,
          blockIndexWithinCheckpoint: 0,
        },
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          dutyType: DutyType.ATTESTATION,
        },
        {
          slot: SlotNumber(100),
          blockNumber: BlockNumber(50),
          dutyType: DutyType.ATTESTATIONS_AND_SIGNERS,
        },
        {
          slot: SlotNumber(100),
          blockNumber: CheckpointNumber(25),
          dutyType: DutyType.CHECKPOINT_PROPOSAL,
        },
        {
          slot: SlotNumber(100),
          dutyType: DutyType.GOVERNANCE_VOTE,
        },
        {
          slot: SlotNumber(100),
          dutyType: DutyType.SLASHING_VOTE,
        },
      ];

      // All should return a valid block number without throwing
      for (const context of contexts) {
        const result = getBlockNumberFromSigningContext(context);
        expect(typeof result).toBe('number');
      }
    });
  });
});
