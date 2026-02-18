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
import { DataTxValidator } from './data_validator.js';
import { DoubleSpendTxValidator, type NullifierSource } from './double_spend_validator.js';
import { GasLimitsValidator, GasTxValidator } from './gas_validator.js';
import { MetadataTxValidator } from './metadata_validator.js';
import { NullifierCache } from './nullifier_cache.js';
import { PhasesTxValidator } from './phases_validator.js';
import { SizeTxValidator } from './size_validator.js';
import { TimestampTxValidator } from './timestamp_validator.js';
import { TxPermittedValidator } from './tx_permitted_validator.js';
import { TxProofValidator } from './tx_proof_validator.js';

export interface TransactionValidator {
  validator: {
    validateTx(tx: Tx): Promise<TxValidationResult>;
  };
  severity: PeerErrorSeverity;
}

/**
 * Builds a set of transaction validators used for gossiped transactions.
 * This contains the complete set of validations applied to transactions.
 * As a result, we verify that not only is the transaction itself valid,
 * but it is valid against the current state.
 */
export function createCompleteGossipedTransactionValidators(
  timestamp: UInt64,
  blockNumber: BlockNumber,
  worldStateSynchronizer: WorldStateSynchronizer,
  gasFees: GasFees,
  l1ChainId: number,
  rollupVersion: number,
  protocolContractsHash: Fr,
  contractDataSource: ContractDataSource,
  proofVerifier: ClientProtocolCircuitVerifier,
  txsPermitted: boolean,
  allowedInSetup: AllowedElement[] = [],
  bindings?: LoggerBindings,
): Record<string, TransactionValidator>[] {
  const merkleTree = worldStateSynchronizer.getCommitted();

  return [
    {
      txsPermittedValidator: {
        validator: new TxPermittedValidator(txsPermitted, bindings),
        severity: PeerErrorSeverity.MidToleranceError,
      },
      dataValidator: {
        validator: new DataTxValidator(bindings),
        severity: PeerErrorSeverity.HighToleranceError,
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
        severity: PeerErrorSeverity.HighToleranceError,
      },
      timestampValidator: {
        validator: new TimestampTxValidator<Tx>(
          {
            timestamp,
            blockNumber,
          },
          bindings,
        ),
        severity: PeerErrorSeverity.MidToleranceError,
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
        severity: PeerErrorSeverity.HighToleranceError,
      },
      gasValidator: {
        validator: new GasTxValidator(
          new DatabasePublicStateSource(merkleTree),
          ProtocolContractAddress.FeeJuice,
          gasFees,
          bindings,
        ),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      phasesValidator: {
        validator: new PhasesTxValidator(contractDataSource, allowedInSetup, timestamp, bindings),
        severity: PeerErrorSeverity.MidToleranceError,
      },
      blockHeaderValidator: {
        validator: new BlockHeaderTxValidator(new ArchiveCache(merkleTree), bindings),
        severity: PeerErrorSeverity.HighToleranceError,
      },
    },
    {
      proofValidator: {
        validator: new TxProofValidator(proofVerifier, bindings),
        severity: PeerErrorSeverity.MidToleranceError,
      },
    },
  ];
}

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
): TxValidator {
  return new AggregateTxValidator(
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
    new DataTxValidator(bindings),
    new TxProofValidator(verifier, bindings),
  );
}

/**
 * Validators used for transactions received via req/resp or filestores.
 * Performs a subset of validations, namely those required to determine if the transaction
 * itself is valid, not necessarily valid within the context of the current state.
 */
export function createTxValidatorForReqResponseReceivedTxs(
  verifier: ClientProtocolCircuitVerifier,
  {
    l1ChainId,
    rollupVersion,
  }: {
    l1ChainId: number;
    rollupVersion: number;
  },
  bindings?: LoggerBindings,
): TxValidator {
  return createTxValidatorForMinimumTxIntegrityChecks(verifier, { l1ChainId, rollupVersion }, bindings);
}

/**
 * Validators used for transactions received via block proposals themselves.
 * Performs the sdame validations as those on request/response received transactions.
 * That measn, we validate the transaction itself is valid. But not necessarily valid against current state.
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
): TxValidator {
  return createTxValidatorForMinimumTxIntegrityChecks(verifier, { l1ChainId, rollupVersion }, bindings);
}

/**
 * Validators used for transactions received over JSON RPC.
 * Performs a configurable set of validations to allow for usage in various scenarios
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
  }: {
    l1ChainId: number;
    rollupVersion: number;
    setupAllowList: AllowedElement[];
    gasFees: GasFees;
    skipFeeEnforcement?: boolean;
    timestamp: UInt64;
    blockNumber: BlockNumber;
    txsPermitted: boolean;
  },
  bindings?: LoggerBindings,
): TxValidator<Tx> {
  const validators: TxValidator<Tx>[] = [
    new TxPermittedValidator(txsPermitted, bindings),
    new SizeTxValidator(bindings),
    new DataTxValidator(bindings),
    new MetadataTxValidator(
      {
        l1ChainId: new Fr(l1ChainId),
        rollupVersion: new Fr(rollupVersion),
        protocolContractsHash,
        vkTreeRoot: getVKTreeRoot(),
      },
      bindings,
    ),
    new TimestampTxValidator(
      {
        timestamp,
        blockNumber,
      },
      bindings,
    ),
    new DoubleSpendTxValidator(new NullifierCache(db), bindings),
    new PhasesTxValidator(contractDataSource, setupAllowList, timestamp, bindings),
    new BlockHeaderTxValidator(new ArchiveCache(db), bindings),
  ];

  if (!skipFeeEnforcement) {
    validators.push(
      new GasTxValidator(new DatabasePublicStateSource(db), ProtocolContractAddress.FeeJuice, gasFees, bindings),
    );
  }

  if (verifier) {
    validators.push(new TxProofValidator(verifier, bindings));
  }

  return new AggregateTxValidator(...validators);
}

/**
 * Validators used for transactions immediately prior to being included in a block.
 * Performs a last minute sanity check to ensure we don't build and invalid block.
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
    new DoubleSpendTxValidator(nullifierSource, bindings),
    new PhasesTxValidator(contractDataSource, setupAllowList, globalVariables.timestamp, bindings),
    new GasTxValidator(publicStateSource, ProtocolContractAddress.FeeJuice, globalVariables.gasFees, bindings),
    new BlockHeaderTxValidator(archiveSource, bindings),
  );
}

/**
 * Validator for transactions entering the pending transaction pool. Performs validations that were potentially missed
 * because transactions are not fully validated when received via req/resp.
 */
export async function createTxValidatorForTransactionsEnteringPendingTxPool(
  worldStateSynchronizer: WorldStateSynchronizer,
  contractDataSource: ContractDataSource,
  timestamp: bigint,
  blockNumber: BlockNumber,
  setupAllowList: AllowedElement[],
  bindings?: LoggerBindings,
) {
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
    new DoubleSpendTxValidator<TxMetaData>(nullifierSource, bindings),
    new BlockHeaderTxValidator<TxMetaData>(archiveSource, bindings),
    new PhasesTxValidator(contractDataSource, setupAllowList, timestamp, bindings),
    new GasLimitsValidator<TxMetaData>(bindings),
    new TimestampTxValidator(
      {
        timestamp: timestamp,
        blockNumber: blockNumber,
      },
      bindings,
    ),
  );
}
