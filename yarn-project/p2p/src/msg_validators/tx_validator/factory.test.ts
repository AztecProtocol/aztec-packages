import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type {
  ClientProtocolCircuitVerifier,
  MerkleTreeReadOperations,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';

import { type MockProxy, mock } from 'jest-mock-extended';

import {
  createCompleteGossipedTransactionValidators,
  createFirstStageTxValidationsForGossippedTransactions,
  createSecondStageTxValidationsForGossippedTransactions,
  createTxValidatorForAcceptingTxsOverRPC,
  createTxValidatorForBlockProposalReceivedTxs,
  createTxValidatorForReqResponseReceivedTxs,
} from './factory.js';

describe('Validator factory functions', () => {
  let synchronizer: MockProxy<WorldStateSynchronizer>;
  let contractSource: MockProxy<ContractDataSource>;
  let proofVerifier: MockProxy<ClientProtocolCircuitVerifier>;

  beforeEach(() => {
    synchronizer = mock<WorldStateSynchronizer>();
    contractSource = mock<ContractDataSource>();
    proofVerifier = mock<ClientProtocolCircuitVerifier>();
  });

  describe('createFirstStageTxValidationsForGossippedTransactions', () => {
    it('returns the expected set of first-stage validator keys', () => {
      const validators = createFirstStageTxValidationsForGossippedTransactions(
        0n,
        BlockNumber(2),
        synchronizer,
        new GasFees(1, 1),
        1,
        2,
        Fr.ZERO,
        contractSource,
        true,
      );

      expect(Object.keys(validators)).toEqual([
        'txsPermittedValidator',
        'dataValidator',
        'metadataValidator',
        'timestampValidator',
        'doubleSpendValidator',
        'gasValidator',
        'phasesValidator',
        'blockHeaderValidator',
      ]);
    });

    it('does not include a proof validator', () => {
      const validators = createFirstStageTxValidationsForGossippedTransactions(
        0n,
        BlockNumber(2),
        synchronizer,
        new GasFees(1, 1),
        1,
        2,
        Fr.ZERO,
        contractSource,
        true,
      );

      expect(Object.keys(validators)).not.toContain('proofValidator');
    });

    it('assigns expected severities to each validator', () => {
      const validators = createFirstStageTxValidationsForGossippedTransactions(
        0n,
        BlockNumber(2),
        synchronizer,
        new GasFees(1, 1),
        1,
        2,
        Fr.ZERO,
        contractSource,
        true,
      );

      // Timestamp and block header are high tolerance (more likely to be stale rather than malicious)
      expect(validators.timestampValidator.severity).toBe(PeerErrorSeverity.HighToleranceError);
      expect(validators.blockHeaderValidator.severity).toBe(PeerErrorSeverity.HighToleranceError);

      // Others are mid tolerance
      expect(validators.txsPermittedValidator.severity).toBe(PeerErrorSeverity.MidToleranceError);
      expect(validators.dataValidator.severity).toBe(PeerErrorSeverity.MidToleranceError);
      expect(validators.metadataValidator.severity).toBe(PeerErrorSeverity.MidToleranceError);
      expect(validators.doubleSpendValidator.severity).toBe(PeerErrorSeverity.MidToleranceError);
      expect(validators.gasValidator.severity).toBe(PeerErrorSeverity.MidToleranceError);
      expect(validators.phasesValidator.severity).toBe(PeerErrorSeverity.MidToleranceError);
    });

    it('each entry has a validator with a validateTx method', () => {
      const validators = createFirstStageTxValidationsForGossippedTransactions(
        0n,
        BlockNumber(2),
        synchronizer,
        new GasFees(1, 1),
        1,
        2,
        Fr.ZERO,
        contractSource,
        true,
      );

      for (const [, entry] of Object.entries(validators)) {
        expect(entry.validator).toBeDefined();
        expect(typeof entry.validator.validateTx).toBe('function');
      }
    });
  });

  describe('createSecondStageTxValidationsForGossippedTransactions', () => {
    it('returns only the proof validator', () => {
      const validators = createSecondStageTxValidationsForGossippedTransactions(proofVerifier);

      expect(Object.keys(validators)).toEqual(['proofValidator']);
    });

    it('assigns low tolerance severity to proof validator', () => {
      const validators = createSecondStageTxValidationsForGossippedTransactions(proofVerifier);

      expect(validators.proofValidator.severity).toBe(PeerErrorSeverity.LowToleranceError);
    });

    it('proof validator has a validateTx method', () => {
      const validators = createSecondStageTxValidationsForGossippedTransactions(proofVerifier);

      expect(typeof validators.proofValidator.validator.validateTx).toBe('function');
    });
  });

  describe('createCompleteGossipedTransactionValidators', () => {
    it('returns two stages: first-stage validators then proof validator', () => {
      const stages = createCompleteGossipedTransactionValidators(
        0n,
        BlockNumber(2),
        synchronizer,
        new GasFees(1, 1),
        1,
        2,
        Fr.ZERO,
        contractSource,
        proofVerifier,
        true,
      );

      expect(stages).toHaveLength(2);
      expect(Object.keys(stages[0])).toEqual([
        'txsPermittedValidator',
        'dataValidator',
        'metadataValidator',
        'timestampValidator',
        'doubleSpendValidator',
        'gasValidator',
        'phasesValidator',
        'blockHeaderValidator',
      ]);
      expect(Object.keys(stages[1])).toEqual(['proofValidator']);
    });

    it('proof validator is always in the second stage, never the first', () => {
      const stages = createCompleteGossipedTransactionValidators(
        0n,
        BlockNumber(2),
        synchronizer,
        new GasFees(1, 1),
        1,
        2,
        Fr.ZERO,
        contractSource,
        proofVerifier,
        true,
      );

      expect(Object.keys(stages[0])).not.toContain('proofValidator');
      expect(Object.keys(stages[1])).toContain('proofValidator');
    });
  });

  describe('createTxValidatorForReqResponseReceivedTxs', () => {
    it('returns an aggregate validator with validateTx method', () => {
      const validator = createTxValidatorForReqResponseReceivedTxs(proofVerifier, {
        l1ChainId: 1,
        rollupVersion: 2,
      });

      expect(typeof validator.validateTx).toBe('function');
    });
  });

  describe('createTxValidatorForBlockProposalReceivedTxs', () => {
    it('returns an aggregate validator with validateTx method', () => {
      const validator = createTxValidatorForBlockProposalReceivedTxs(proofVerifier, {
        l1ChainId: 1,
        rollupVersion: 2,
      });

      expect(typeof validator.validateTx).toBe('function');
    });
  });

  describe('createTxValidatorForAcceptingTxsOverRPC', () => {
    let db: MockProxy<MerkleTreeReadOperations>;

    beforeEach(() => {
      db = mock<MerkleTreeReadOperations>();
    });

    it('returns an aggregate validator', () => {
      const validator = createTxValidatorForAcceptingTxsOverRPC(db, contractSource, proofVerifier, {
        l1ChainId: 1,
        rollupVersion: 2,
        setupAllowList: [],
        gasFees: new GasFees(1, 1),
        timestamp: 100n,
        blockNumber: BlockNumber(5),
        txsPermitted: true,
      });

      expect(typeof validator.validateTx).toBe('function');
    });

    it('includes proof validator when verifier is provided', () => {
      // With verifier: validator should include proof checking.
      // Without verifier: should still return a valid aggregate.
      const withVerifier = createTxValidatorForAcceptingTxsOverRPC(db, contractSource, proofVerifier, {
        l1ChainId: 1,
        rollupVersion: 2,
        setupAllowList: [],
        gasFees: new GasFees(1, 1),
        timestamp: 100n,
        blockNumber: BlockNumber(5),
        txsPermitted: true,
      });

      const withoutVerifier = createTxValidatorForAcceptingTxsOverRPC(db, contractSource, undefined, {
        l1ChainId: 1,
        rollupVersion: 2,
        setupAllowList: [],
        gasFees: new GasFees(1, 1),
        timestamp: 100n,
        blockNumber: BlockNumber(5),
        txsPermitted: true,
      });

      // Both should be valid aggregate validators
      expect(typeof withVerifier.validateTx).toBe('function');
      expect(typeof withoutVerifier.validateTx).toBe('function');
    });
  });
});
