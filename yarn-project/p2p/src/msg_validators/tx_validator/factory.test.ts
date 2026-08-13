import { MAX_TX_DA_GAS } from '@aztec/constants';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import { Gas, GasFees, GasSettings } from '@aztec/stdlib/gas';
import type {
  ClientProtocolCircuitVerifier,
  MerkleTreeReadOperations,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { mockTx } from '@aztec/stdlib/testing';
import { type GlobalVariables, TX_ERROR_GAS_LIMIT_TOO_HIGH } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

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

/** A tx with no public calls, carrying the given gas settings. */
async function mockPrivateTxWithGasSettings(gasSettings: GasSettings) {
  const tx = await mockTx(1, {
    numberOfNonRevertiblePublicCallRequests: 0,
    numberOfRevertiblePublicCallRequests: 0,
    hasPublicTeardownCallRequest: false,
  });
  tx.data.constants.txContext.gasSettings = gasSettings;
  return tx;
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
        'gasLimitsValidator',
        'gasValidator',
        'dataValidator',
        'contractInstanceValidator',
      ]);
    });

    it('forwards the network admission limits to the gas limits validator', async () => {
      const maxTxL2Gas = 1_000_000;
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
        [],
        undefined,
        { maxTxL2Gas },
      );

      // Over the network admission limit but under the protocol ceiling, so only forwarded opts can reject it.
      const tx = await mockPrivateTxWithGasSettings(
        GasSettings.fallback({ gasLimits: new Gas(MAX_TX_DA_GAS, maxTxL2Gas + 1), maxFeesPerGas: new GasFees(1, 1) }),
      );
      const result = await validators.gasLimitsValidator.validator.validateTx(tx);
      expect(result.result).toBe('invalid');
      expect((result as { reason: string[] }).reason[0]).toContain(TX_ERROR_GAS_LIMIT_TOO_HIGH);
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
      expect(validators.gasLimitsValidator.severity).toBe(PeerErrorSeverity.MidToleranceError);
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
        GasLimitsValidator.name,
        GasTxValidator.name,
        TxProofValidator.name,
      ]);
    });

    it('excludes the fee validator but keeps gas-limits validation when fee enforcement is skipped', () => {
      const validator = createTxValidatorForAcceptingTxsOverRPC(db, contractSource, proofVerifier, {
        l1ChainId: 1,
        rollupVersion: 2,
        setupAllowList: [],
        gasFees: new GasFees(1, 1),
        skipFeeEnforcement: true,
        timestamp: 100n,
        blockNumber: BlockNumber(5),
        txsPermitted: true,
      });

      const aggregate = validator as AggregateTxValidator<unknown>;
      const names = getValidatorNames(aggregate);
      // Declared gas-limit admission is not fee enforcement, so it stays even with fees skipped.
      expect(names).toContain(GasLimitsValidator.name);
      expect(names).not.toContain(GasTxValidator.name);
      expect(names).toContain(TxProofValidator.name);
    });

    it('excludes the gas-limits admission validator during simulation', () => {
      // Gas estimation submits intentionally-inflated forEstimation limits, so the admission limit must not
      // reject the estimation tx; the wallet clamps the real tx afterward.
      const validator = createTxValidatorForAcceptingTxsOverRPC(db, contractSource, undefined, {
        l1ChainId: 1,
        rollupVersion: 2,
        setupAllowList: [],
        gasFees: new GasFees(1, 1),
        skipFeeEnforcement: true,
        isSimulation: true,
        timestamp: 100n,
        blockNumber: BlockNumber(5),
        txsPermitted: true,
      });

      const aggregate = validator as AggregateTxValidator<unknown>;
      expect(getValidatorNames(aggregate)).not.toContain(GasLimitsValidator.name);
    });

    describe('gas-limit admission for estimation gas settings', () => {
      // Estimation limits exceed the per-tx protocol maximum by construction, so whether the tx passes admission
      // is decided solely by the isSimulation exemption. The aggregate collects reasons from every validator, so
      // asserting on the specific error is robust to other validators failing on the mocked db.
      const validateEstimationTx = async (isSimulation: boolean) => {
        db.findLeafIndices.mockResolvedValue([]);
        const validator = createTxValidatorForAcceptingTxsOverRPC(db, contractSource, undefined, {
          l1ChainId: 1,
          rollupVersion: 2,
          setupAllowList: [],
          gasFees: new GasFees(1, 1),
          skipFeeEnforcement: false,
          isSimulation,
          timestamp: 100n,
          blockNumber: BlockNumber(5),
          txsPermitted: true,
        });
        const tx = await mockPrivateTxWithGasSettings(GasSettings.forEstimation({ maxFeesPerGas: new GasFees(1, 1) }));
        const result = await validator.validateTx(tx);
        return result.result === 'invalid' ? result.reason : [];
      };

      it('rejects estimation gas limits when not simulating', async () => {
        const reasons = await validateEstimationTx(false);
        expect(reasons.some(r => r.includes(TX_ERROR_GAS_LIMIT_TOO_HIGH))).toBe(true);
      });

      it('accepts estimation gas limits during simulation even with fee enforcement on', async () => {
        const reasons = await validateEstimationTx(true);
        expect(reasons.some(r => r.includes(TX_ERROR_GAS_LIMIT_TOO_HIGH))).toBe(false);
      });
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
        GasLimitsValidator.name,
        GasTxValidator.name,
      ]);
    });

    it('rejects declared gas limits above the protocol ceiling', async () => {
      // Block proposal txs get only well-formedness checks on receipt; this is where an over-declared limit must
      // be caught, or execution would trip the simulator's MAX_PROCESSABLE_L2_GAS assertion.
      db.findLeafIndices.mockResolvedValue([]);
      const result = createTxValidatorForBlockBuilding(db, contractSource, globalVariables, []);

      const tx = await mockPrivateTxWithGasSettings(GasSettings.forEstimation({ maxFeesPerGas: new GasFees(1, 1) }));
      const validationResult = await result.preprocessValidator!.validateTx(tx);
      expect(validationResult.result).toBe('invalid');
      const reasons = (validationResult as { reason: string[] }).reason;
      expect(reasons.some(r => r.includes(TX_ERROR_GAS_LIMIT_TOO_HIGH))).toBe(true);
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
        {},
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
        {},
        new GasFees(1, 1),
      );

      expect(synchronizer.syncImmediate).toHaveBeenCalled();
    });
  });
});
