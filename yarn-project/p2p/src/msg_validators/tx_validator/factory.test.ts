import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { GasFees } from '@aztec/stdlib/gas';
import type {
  ClientProtocolCircuitVerifier,
  MerkleTreeReadOperations,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import type { GlobalVariables } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { PeerErrorSeverity } from '../../types/index.js';
import { AggregateTxValidator } from './aggregate_tx_validator.js';
import { BlockHeaderTxValidator } from './block_header_validator.js';
import { ContractInstanceTxValidator } from './contract_instance_validator.js';
import { DataTxValidator } from './data_validator.js';
import { DoubleSpendTxValidator } from './double_spend_validator.js';
import {
  createFirstStageTxValidationsForGossipedTransactions,
  createSecondStageTxValidationsForGossipedTransactions,
  createTxValidatorForAcceptingTxsOverRPC,
  createTxValidatorForBlockBuilding,
  createTxValidatorForBlockProposalReceivedTxs,
  createTxValidatorForOnDemandReceivedTxs,
  createTxValidatorForTransactionsEnteringPendingTxPool,
} from './factory.js';
import { GasLimitsValidator, GasTxValidator, MaxFeePerGasValidator } from './gas_validator.js';
import { MetadataTxValidator } from './metadata_validator.js';
import { AllowedSetupCallsMetaValidator, PhasesTxValidator } from './phases_validator.js';
import { SizeTxValidator } from './size_validator.js';
import { TimestampTxValidator } from './timestamp_validator.js';
import { TxPermittedValidator } from './tx_permitted_validator.js';
import { TxProofValidator } from './tx_proof_validator.js';

/** Extract the constructor names from the validators inside an AggregateTxValidator. */
function getValidatorNames(aggregate: AggregateTxValidator<unknown>): string[] {
  return aggregate.validators.map(v => v.constructor.name);
}

describe('Validator factory functions', () => {
  let synchronizer: MockProxy<WorldStateSynchronizer>;
  let contractSource: MockProxy<ContractDataSource>;
  let proofVerifier: MockProxy<ClientProtocolCircuitVerifier>;

  beforeEach(() => {
    synchronizer = mock<WorldStateSynchronizer>();
    contractSource = mock<ContractDataSource>();
    proofVerifier = mock<ClientProtocolCircuitVerifier>();
  });

  describe('createFirstStageTxValidationsForGossipedTransactions', () => {
    it('returns the expected set of first-stage validator keys', () => {
      const validators = createFirstStageTxValidationsForGossipedTransactions(
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
        'timestampValidator',
        'txsPermittedValidator',
        'txSizeValidator',
        'metadataValidator',
        'phasesValidator',
        'blockHeaderValidator',
        'doubleSpendValidator',
        'gasValidator',
        'dataValidator',
        'contractInstanceValidator',
      ]);
    });

    it('does not include a proof validator', () => {
      const validators = createFirstStageTxValidationsForGossipedTransactions(
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
      const validators = createFirstStageTxValidationsForGossipedTransactions(
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
      const validators = createFirstStageTxValidationsForGossipedTransactions(
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

  describe('createSecondStageTxValidationsForGossipedTransactions', () => {
    it('returns only the proof validator', () => {
      const validators = createSecondStageTxValidationsForGossipedTransactions(proofVerifier);

      expect(Object.keys(validators)).toEqual(['proofValidator']);
    });

    it('assigns low tolerance severity to proof validator', () => {
      const validators = createSecondStageTxValidationsForGossipedTransactions(proofVerifier);

      expect(validators.proofValidator.severity).toBe(PeerErrorSeverity.LowToleranceError);
    });

    it('proof validator has a validateTx method', () => {
      const validators = createSecondStageTxValidationsForGossipedTransactions(proofVerifier);

      expect(typeof validators.proofValidator.validator.validateTx).toBe('function');
    });
  });

  describe('createTxValidatorForOnDemandReceivedTxs', () => {
    it('contains well-formedness validators only', () => {
      const validator = createTxValidatorForOnDemandReceivedTxs(proofVerifier, {
        l1ChainId: 1,
        rollupVersion: 2,
      });

      const aggregate = validator as AggregateTxValidator<unknown>;
      expect(getValidatorNames(aggregate)).toEqual([
        MetadataTxValidator.name,
        SizeTxValidator.name,
        DataTxValidator.name,
        ContractInstanceTxValidator.name,
        TxProofValidator.name,
      ]);
    });
  });

  describe('createTxValidatorForBlockProposalReceivedTxs', () => {
    it('contains the same well-formedness validators as req/resp', () => {
      const validator = createTxValidatorForBlockProposalReceivedTxs(proofVerifier, {
        l1ChainId: 1,
        rollupVersion: 2,
      });

      const aggregate = validator as AggregateTxValidator<unknown>;
      expect(getValidatorNames(aggregate)).toEqual([
        MetadataTxValidator.name,
        SizeTxValidator.name,
        DataTxValidator.name,
        ContractInstanceTxValidator.name,
        TxProofValidator.name,
      ]);
    });
  });

  describe('createTxValidatorForAcceptingTxsOverRPC', () => {
    let db: MockProxy<MerkleTreeReadOperations>;

    beforeEach(() => {
      db = mock<MerkleTreeReadOperations>();
    });

    it('contains the full set of validators with fee enforcement and proof verification', () => {
      const validator = createTxValidatorForAcceptingTxsOverRPC(db, contractSource, proofVerifier, {
        l1ChainId: 1,
        rollupVersion: 2,
        setupAllowList: [],
        gasFees: new GasFees(1, 1),
        timestamp: 100n,
        blockNumber: BlockNumber(5),
        txsPermitted: true,
        rollupManaLimit: Number.MAX_SAFE_INTEGER,
      });

      const aggregate = validator as AggregateTxValidator<unknown>;
      expect(getValidatorNames(aggregate)).toEqual([
        TxPermittedValidator.name,
        TimestampTxValidator.name,
        SizeTxValidator.name,
        MetadataTxValidator.name,
        PhasesTxValidator.name,
        BlockHeaderTxValidator.name,
        DoubleSpendTxValidator.name,
        DataTxValidator.name,
        ContractInstanceTxValidator.name,
        GasTxValidator.name,
        TxProofValidator.name,
      ]);
    });

    it('excludes gas validator when fee enforcement is skipped', () => {
      const validator = createTxValidatorForAcceptingTxsOverRPC(db, contractSource, proofVerifier, {
        l1ChainId: 1,
        rollupVersion: 2,
        setupAllowList: [],
        gasFees: new GasFees(1, 1),
        skipFeeEnforcement: true,
        timestamp: 100n,
        blockNumber: BlockNumber(5),
        txsPermitted: true,
        rollupManaLimit: Number.MAX_SAFE_INTEGER,
      });

      const aggregate = validator as AggregateTxValidator<unknown>;
      const names = getValidatorNames(aggregate);
      expect(names).not.toContain(GasTxValidator.name);
      expect(names).toContain(TxProofValidator.name);
    });

    it('excludes proof validator when no verifier is provided', () => {
      const validator = createTxValidatorForAcceptingTxsOverRPC(db, contractSource, undefined, {
        l1ChainId: 1,
        rollupVersion: 2,
        setupAllowList: [],
        gasFees: new GasFees(1, 1),
        timestamp: 100n,
        blockNumber: BlockNumber(5),
        txsPermitted: true,
        rollupManaLimit: Number.MAX_SAFE_INTEGER,
      });

      const aggregate = validator as AggregateTxValidator<unknown>;
      const names = getValidatorNames(aggregate);
      expect(names).not.toContain(TxProofValidator.name);
      expect(names).toContain(GasTxValidator.name);
    });
  });

  describe('createTxValidatorForBlockBuilding', () => {
    let db: MockProxy<MerkleTreeReadOperations>;
    let globalVariables: MockProxy<GlobalVariables>;

    beforeEach(() => {
      db = mock<MerkleTreeReadOperations>();
      globalVariables = mock<GlobalVariables>();
      globalVariables.timestamp = 100n;
      globalVariables.blockNumber = BlockNumber(5);
      globalVariables.gasFees = new GasFees(1, 1);
    });

    it('contains state-dependent validators only (no proof, no data)', () => {
      const result = createTxValidatorForBlockBuilding(db, contractSource, globalVariables, []);

      const aggregate = result.preprocessValidator as AggregateTxValidator<unknown>;
      expect(getValidatorNames(aggregate)).toEqual([
        TimestampTxValidator.name,
        PhasesTxValidator.name,
        BlockHeaderTxValidator.name,
        DoubleSpendTxValidator.name,
        GasTxValidator.name,
      ]);
    });

    it('returns a nullifierCache alongside the preprocessValidator', () => {
      const result = createTxValidatorForBlockBuilding(db, contractSource, globalVariables, []);

      expect(result.nullifierCache).toBeDefined();
      expect(typeof result.nullifierCache!.addNullifiers).toBe('function');
    });
  });

  describe('createTxValidatorForTransactionsEnteringPendingTxPool', () => {
    it('contains the state-dependent checks missed by well-formedness validators', async () => {
      const validator = await createTxValidatorForTransactionsEnteringPendingTxPool(
        synchronizer,
        100n,
        BlockNumber(5),
        { rollupManaLimit: Number.MAX_SAFE_INTEGER },
        new GasFees(1, 1),
      );

      const aggregate = validator as AggregateTxValidator<unknown>;
      expect(getValidatorNames(aggregate)).toEqual([
        GasLimitsValidator.name,
        MaxFeePerGasValidator.name,
        TimestampTxValidator.name,
        DoubleSpendTxValidator.name,
        BlockHeaderTxValidator.name,
        AllowedSetupCallsMetaValidator.name,
      ]);
    });

    it('syncs world state before creating the validator', async () => {
      await createTxValidatorForTransactionsEnteringPendingTxPool(
        synchronizer,
        100n,
        BlockNumber(5),
        { rollupManaLimit: Number.MAX_SAFE_INTEGER },
        new GasFees(1, 1),
      );

      expect(synchronizer.syncImmediate).toHaveBeenCalled();
    });
  });
});
