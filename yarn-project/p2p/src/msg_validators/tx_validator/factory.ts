import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { LoggerBindings } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractAddress, protocolContractsHash } from '@aztec/protocol-contracts';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import type {
  AllowedElement,
  ClientProtocolCircuitVerifier,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { DatabasePublicStateSource, MerkleTreeId } from '@aztec/stdlib/trees';
import type { Tx, TxValidationResult, TxValidator } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { AggregateTxValidator } from './aggregate_tx_validator.js';
import { ArchiveCache } from './archive_cache.js';
import { BlockHeaderTxValidator } from './block_header_validator.js';
import { DataTxValidator } from './data_validator.js';
import { DoubleSpendTxValidator } from './double_spend_validator.js';
import { GasTxValidator } from './gas_validator.js';
import { MetadataTxValidator } from './metadata_validator.js';
import { PhasesTxValidator } from './phases_validator.js';
import { SizeTxValidator } from './size_validator.js';
import { TimestampTxValidator } from './timestamp_validator.js';
import { TxPermittedValidator } from './tx_permitted_validator.js';
import { TxProofValidator } from './tx_proof_validator.js';

export interface MessageValidator {
  validator: {
    validateTx(tx: Tx): Promise<TxValidationResult>;
  };
  severity: PeerErrorSeverity;
}

export function createTxMessageValidators(
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
): Record<string, MessageValidator>[] {
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

export function createTxReqRespValidator(
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
