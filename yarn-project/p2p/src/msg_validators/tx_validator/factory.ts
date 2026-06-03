/**
 * Transaction validator factories for each tx entry point.
 *
 * Unsolicited transactions (gossip and RPC) are fully validated before acceptance.
 * Transactions received via req/resp or block proposals are only checked for
 * well-formedness because we must include them for block re-execution — they may
 * ultimately be invalid, which is caught during block building and reported as
 * part of block validation/attestation. See the README in this directory for the
 * full validation strategy.
 *
 * 1. **Gossip** — full validation in two stages with a pool pre-check in between.
 *    Stage 1 (fast): metadata, data, timestamps, double-spend, gas, phases, block header.
 *    Pool pre-check: `canAddPendingTx` — skips proof verification if pool would reject.
 *    Stage 2 (slow): proof verification.
 *    Orchestrated by `handleGossipedTx` in `libp2p_service.ts`.
 *
 * 2. **JSON-RPC** — full validation including all state-dependent checks.
 *    Proof verification and fee enforcement are configurable for testing purposes.
 *
 * 3. **Req/resp & block proposals** — well-formedness checks only (metadata, size,
 *    data, proof). Stored for re-execution; validity against state is not checked here.
 *
 * 4. **Block building** — re-validates against current state immediately before
 *    sequencing. Catches invalid txs that entered via req/resp or block proposals.
 *    Proof and data checks are skipped since they were verified on entry.
 *
 * 5. **Pending pool migration** — when unmined txs (e.g. from req/resp or block
 *    proposals) are migrated to the pending pool, the pool runs the state-dependent
 *    checks they missed: double-spend, block header, gas limits, and timestamps.
 *    This runs on every tx potentially entering the pending pool.
 */
import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { LoggerBindings } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractAddress, protocolContractsHash } from '@aztec/protocol-contracts';
import type { BlockHash } from '@aztec/stdlib/block';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import type {
  AllowedElement,
  ClientProtocolCircuitVerifier,
  MerkleTreeReadOperations,
  PublicProcessorValidator,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { DatabasePublicStateSource, MerkleTreeId, type PublicStateSource } from '@aztec/stdlib/trees';
import type { GlobalVariables, Tx, TxValidationResult, TxValidator } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import type { TxMetaData } from '../../mem_pools/tx_pool_v2/tx_metadata.js';
import { AggregateTxValidator } from './aggregate_tx_validator.js';
import { ArchiveCache } from './archive_cache.js';
import { type ArchiveSource, BlockHeaderTxValidator } from './block_header_validator.js';
import { CachedTxValidator } from './cached_tx_validator.js';
import { ContractInstanceTxValidator } from './contract_instance_validator.js';
import { DataTxValidator } from './data_validator.js';
import { DoubleSpendTxValidator, type NullifierSource } from './double_spend_validator.js';
import { GasLimitsValidator, GasTxValidator, MaxFeePerGasValidator } from './gas_validator.js';
import { MetadataTxValidator } from './metadata_validator.js';
import { NullifierCache } from './nullifier_cache.js';
import { AllowedSetupCallsMetaValidator, PhasesTxValidator } from './phases_validator.js';
import { SizeTxValidator } from './size_validator.js';
import { TimestampTxValidator } from './timestamp_validator.js';
import { TxPermittedValidator } from './tx_permitted_validator.js';
import { TxProofValidator } from './tx_proof_validator.js';
import { TxValidationCache } from './tx_validation_cache.js';

/**
 * A validator paired with a peer penalty severity.
 * Used for gossip validation where each validator's failure triggers a peer penalization
 * with the associated severity level.
 */
export interface TransactionValidator {
  validator: {
    validateTx(tx: Tx): Promise<TxValidationResult>;
  };
  severity: PeerErrorSeverity;
}

/**
 * First stage of gossip validation — fast checks run before the pool pre-check.
 *
 * If any validator fails, the peer is penalized and the tx is rejected immediately,
 * without consulting the pool or running proof verification.
 *
 * The `doubleSpendValidator` failure is special-cased by the caller (`handleGossipedTx`)
 * to determine severity based on how recently the nullifier appeared.
 */
export function createFirstStageTxValidationsForGossipedTransactions(
  timestamp: UInt64,
  blockNumber: BlockNumber,
  worldStateSynchronizer: WorldStateSynchronizer,
  gasFees: GasFees,
  l1ChainId: number,
  rollupVersion: number,
  protocolContractsHash: Fr,
  contractDataSource: ContractDataSource,
  txsPermitted: boolean,
  allowedInSetup: AllowedElement[] = [],
  bindings?: LoggerBindings,
  gasLimitOpts?: { rollupManaLimit?: number; maxBlockL2Gas?: number; maxBlockDAGas?: number },
): Record<string, TransactionValidator> {
  const merkleTree = worldStateSynchronizer.getCommitted();

  return {
    timestampValidator: {
      validator: new TimestampTxValidator<Tx>(
        {
          timestamp,
          blockNumber,
        },
        bindings,
      ),
      severity: PeerErrorSeverity.HighToleranceError,
    },
    txsPermittedValidator: {
      validator: new TxPermittedValidator(txsPermitted, bindings),
      severity: PeerErrorSeverity.MidToleranceError,
    },
    txSizeValidator: {
      validator: new SizeTxValidator(bindings),
      severity: PeerErrorSeverity.MidToleranceError,
    },
    metadataValidator: {
      validator: new MetadataTxValidator(
        {
          l1ChainId: new Fr(l1ChainId),
          rollupVersion: new Fr(rollupVersion),
          protocolContractsHash,
          vkTreeRoot: getVKTreeRoot(),
        },
        bindings,
      ),
      severity: PeerErrorSeverity.MidToleranceError,
    },
    phasesValidator: {
      validator: new PhasesTxValidator(contractDataSource, allowedInSetup, timestamp, bindings),
      severity: PeerErrorSeverity.MidToleranceError,
    },
    blockHeaderValidator: {
      validator: new BlockHeaderTxValidator(new ArchiveCache(merkleTree), bindings),
      severity: PeerErrorSeverity.HighToleranceError,
    },
    doubleSpendValidator: {
      validator: new DoubleSpendTxValidator(
        {
          nullifiersExist: async (nullifiers: Buffer[]) => {
            const merkleTree = worldStateSynchronizer.getCommitted();
            const indices = await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, nullifiers);
            return indices.map(index => index !== undefined);
          },
        },
        bindings,
      ),
      severity: PeerErrorSeverity.MidToleranceError, // This is handled specifically at the point of rejection by considering a recent window where it may have been valid
    },
    gasValidator: {
      validator: new GasTxValidator(
        new DatabasePublicStateSource(merkleTree),
        ProtocolContractAddress.FeeJuice,
        gasFees,
        bindings,
        gasLimitOpts,
      ),
      severity: PeerErrorSeverity.MidToleranceError,
    },
    dataValidator: {
      validator: new DataTxValidator(bindings),
      severity: PeerErrorSeverity.MidToleranceError,
    },
    contractInstanceValidator: {
      validator: new ContractInstanceTxValidator(bindings),
      severity: PeerErrorSeverity.MidToleranceError,
    },
  };
}

/**
 * Second stage of gossip validation — expensive proof verification.
 *
 * Only runs after the first stage passes AND `canAddPendingTx` confirms the pool would
 * accept the tx. This avoids wasting CPU on proof verification for txs the pool would reject
 * (e.g., duplicates, insufficient balance, pool full).
 */
export function createSecondStageTxValidationsForGossipedTransactions(
  proofVerifier: ClientProtocolCircuitVerifier,
  bindings?: LoggerBindings,
): Record<string, TransactionValidator> {
  return {
    proofValidator: {
      validator: new TxProofValidator(proofVerifier, bindings),
      severity: PeerErrorSeverity.LowToleranceError,
    },
  };
}

/**
 * Well-formedness checks only: metadata, size, data, and proof.
 * Used for req/resp and block proposal txs. These txs must be accepted for block
 * re-execution even though they may be invalid against current state — that is
 * caught later by the block building validator.
 */
function createTxValidatorForMinimumTxIntegrityChecks(
  verifier: ClientProtocolCircuitVerifier,
  {
    l1ChainId,
    rollupVersion,
  }: {
    l1ChainId: number;
    rollupVersion: number;
  },
  bindings?: LoggerBindings,
  cache?: TxValidationCache,
): TxValidator {
  const aggregate = new AggregateTxValidator(
    new MetadataTxValidator(
      {
        l1ChainId: new Fr(l1ChainId),
        rollupVersion: new Fr(rollupVersion),
        protocolContractsHash,
        vkTreeRoot: getVKTreeRoot(),
      },
      bindings,
    ),
    new SizeTxValidator(bindings),
    CachedTxValidator.new(new DataTxValidator(bindings), cache),
    new ContractInstanceTxValidator(bindings),
    CachedTxValidator.new(new TxProofValidator(verifier, bindings), cache),
  );

  // This validator is not state-dependent so we can cache it.
  const identifier = Symbol('TxValidatorForMinimumTxIntegrityChecks');
  return CachedTxValidator.newWithIdentifier(aggregate, identifier, cache);
}

/**
 * Validators for txs received via req/resp or filestores.
 * Checks well-formedness only — we must accept these for re-execution even if they
 * are invalid against current state. State-dependent checks happen when the tx
 * enters the pending pool or during block building.
 */
export function createTxValidatorForOnDemandReceivedTxs(
  verifier: ClientProtocolCircuitVerifier,
  {
    l1ChainId,
    rollupVersion,
  }: {
    l1ChainId: number;
    rollupVersion: number;
  },
  bindings?: LoggerBindings,
  cache?: TxValidationCache,
): TxValidator {
  return createTxValidatorForMinimumTxIntegrityChecks(verifier, { l1ChainId, rollupVersion }, bindings, cache);
}

/**
 * Validators for txs received in block proposals.
 * Same as req/resp — well-formedness only. We must store these for block
 * re-execution; their validity against state is checked during block building.
 */
export function createTxValidatorForBlockProposalReceivedTxs(
  verifier: ClientProtocolCircuitVerifier,
  {
    l1ChainId,
    rollupVersion,
  }: {
    l1ChainId: number;
    rollupVersion: number;
  },
  bindings?: LoggerBindings,
  cache?: TxValidationCache,
): TxValidator {
  return createTxValidatorForMinimumTxIntegrityChecks(verifier, { l1ChainId, rollupVersion }, bindings, cache);
}

/**
 * Validators for unsolicited txs received over JSON-RPC (from a local wallet/PXE).
 * Full validation — all state-dependent checks are run. Proof verification is optional
 * (can be skipped for testing purposes). Fee enforcement is also optional (skipped for testing/dev).
 * Called from `AztecNodeService.isValidTx()`.
 */
export function createTxValidatorForAcceptingTxsOverRPC(
  db: MerkleTreeReadOperations,
  contractDataSource: ContractDataSource,
  verifier: ClientProtocolCircuitVerifier | undefined,
  {
    l1ChainId,
    rollupVersion,
    setupAllowList,
    gasFees,
    skipFeeEnforcement,
    timestamp,
    blockNumber,
    txsPermitted,
    rollupManaLimit,
    maxBlockL2Gas,
    maxBlockDAGas,
  }: {
    l1ChainId: number;
    rollupVersion: number;
    setupAllowList: AllowedElement[];
    gasFees: GasFees;
    skipFeeEnforcement?: boolean;
    timestamp: UInt64;
    blockNumber: BlockNumber;
    txsPermitted: boolean;
    rollupManaLimit: number;
    maxBlockL2Gas?: number;
    maxBlockDAGas?: number;
  },
  bindings?: LoggerBindings,
): TxValidator<Tx> {
  const validators: TxValidator<Tx>[] = [
    new TxPermittedValidator(txsPermitted, bindings),
    new TimestampTxValidator(
      {
        timestamp,
        blockNumber,
      },
      bindings,
    ),
    new SizeTxValidator(bindings),
    new MetadataTxValidator(
      {
        l1ChainId: new Fr(l1ChainId),
        rollupVersion: new Fr(rollupVersion),
        protocolContractsHash,
        vkTreeRoot: getVKTreeRoot(),
      },
      bindings,
    ),
    new PhasesTxValidator(contractDataSource, setupAllowList, timestamp, bindings),
    new BlockHeaderTxValidator(new ArchiveCache(db), bindings),
    new DoubleSpendTxValidator(new NullifierCache(db), bindings),
    new DataTxValidator(bindings),
    new ContractInstanceTxValidator(bindings),
  ];

  if (!skipFeeEnforcement) {
    validators.push(
      new GasTxValidator(new DatabasePublicStateSource(db), ProtocolContractAddress.FeeJuice, gasFees, bindings, {
        rollupManaLimit,
        maxBlockL2Gas,
        maxBlockDAGas,
      }),
    );
  }

  if (verifier) {
    validators.push(new TxProofValidator(verifier, bindings));
  }

  return new AggregateTxValidator(...validators);
}

/**
 * Validators for txs about to be included in a block by the sequencer.
 * Re-validates against current state. This is where invalid txs that entered via
 * req/resp or block proposals are caught — their invalidity is reported as part
 * of block validation/attestation. Proof and data checks are omitted since they
 * were already verified on entry.
 * Called from `CheckpointBuilder.makeBlockBuilderDeps()`.
 */
export function createTxValidatorForBlockBuilding(
  db: MerkleTreeReadOperations,
  contractDataSource: ContractDataSource,
  globalVariables: GlobalVariables,
  setupAllowList: AllowedElement[],
  bindings?: LoggerBindings,
): PublicProcessorValidator {
  const nullifierCache = new NullifierCache(db);
  const archiveCache = new ArchiveCache(db);
  const publicStateSource = new DatabasePublicStateSource(db);

  return {
    preprocessValidator: createTxValidatorForValidatingAgainstCurrentState(
      nullifierCache,
      archiveCache,
      publicStateSource,
      contractDataSource,
      globalVariables,
      setupAllowList,
      bindings,
    ),
    nullifierCache,
  };
}

function createTxValidatorForValidatingAgainstCurrentState(
  nullifierSource: NullifierSource,
  archiveSource: ArchiveSource,
  publicStateSource: PublicStateSource,
  contractDataSource: ContractDataSource,
  globalVariables: GlobalVariables,
  setupAllowList: AllowedElement[],
  bindings?: LoggerBindings,
): TxValidator<Tx> {
  // We don't include the TxProofValidator nor the DataTxValidator here because they are already checked by the time we get to block building.
  return new AggregateTxValidator(
    new TimestampTxValidator(
      {
        timestamp: globalVariables.timestamp,
        blockNumber: globalVariables.blockNumber,
      },
      bindings,
    ),
    new PhasesTxValidator(contractDataSource, setupAllowList, globalVariables.timestamp, bindings),
    new BlockHeaderTxValidator(archiveSource, bindings),
    new DoubleSpendTxValidator(nullifierSource, bindings),
    new GasTxValidator(publicStateSource, ProtocolContractAddress.FeeJuice, globalVariables.gasFees, bindings),
  );
}

/**
 * Validators for txs migrating to the pending pool.
 *
 * Txs that arrived via req/resp or block proposals only had well-formedness checks
 * on receipt. When they fail to be mined and are migrated to the pending pool, we
 * run the state-dependent checks they missed: double-spend, block header, gas limits,
 * and timestamp expiry. This is run on EVERY tx potentially entering the pending pool
 * — called inside `TxPoolV2Impl` during `addPendingTxs`, `prepareForSlot` (unprotect),
 * `handlePrunedBlocks` (unmine), and startup hydration.
 *
 * Operates on `TxMetaData` rather than full `Tx` since metadata is pre-built by the pool.
 * Injected into `TxPoolV2` as the `createTxValidator` factory in `TxPoolV2Dependencies`.
 */
export async function createTxValidatorForTransactionsEnteringPendingTxPool(
  worldStateSynchronizer: WorldStateSynchronizer,
  timestamp: bigint,
  blockNumber: BlockNumber,
  gasLimitOpts: { rollupManaLimit?: number; maxBlockL2Gas?: number; maxBlockDAGas?: number },
  gasFees: GasFees,
  bindings?: LoggerBindings,
): Promise<TxValidator<TxMetaData>> {
  await worldStateSynchronizer.syncImmediate();
  const merkleTree = worldStateSynchronizer.getCommitted();
  const nullifierSource: NullifierSource = {
    nullifiersExist: async (nullifiers: Buffer[]) => {
      const indices = await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, nullifiers);
      return indices.map(index => index !== undefined);
    },
  };
  const archiveSource: ArchiveSource = {
    getArchiveIndices: (archives: BlockHash[]) => {
      return merkleTree.findLeafIndices(MerkleTreeId.ARCHIVE, archives);
    },
  };
  return new AggregateTxValidator<TxMetaData>(
    new GasLimitsValidator<TxMetaData>({ ...gasLimitOpts, bindings }),
    new MaxFeePerGasValidator<TxMetaData>(gasFees, bindings),
    new TimestampTxValidator<TxMetaData>({ timestamp, blockNumber }, bindings),
    new DoubleSpendTxValidator<TxMetaData>(nullifierSource, bindings),
    new BlockHeaderTxValidator<TxMetaData>(archiveSource, bindings),
    new AllowedSetupCallsMetaValidator<TxMetaData>(bindings),
  );
}

/**
 * Creates a function that checks whether a tx's setup-phase calls are on the allow list.
 *
 * Uses the `PhasesTxValidator` on the full Tx. The result is stored as a boolean
 * flag in `TxMetaData.allowedSetupCalls` at receipt time, so the pending pool
 * migration validator can check it without needing the full Tx or its dependencies.
 */
export function createCheckAllowedSetupCalls(
  contractDataSource: ContractDataSource,
  setupAllowList: AllowedElement[],
  getTimestamp: () => UInt64,
): (tx: Tx) => Promise<boolean> {
  return async (tx: Tx) => {
    const validator = new PhasesTxValidator(contractDataSource, setupAllowList, getTimestamp());
    const result = await validator.validateTx(tx);
    return result.result === 'valid';
  };
}
