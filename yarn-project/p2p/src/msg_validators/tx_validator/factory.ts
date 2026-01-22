import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import type {
  AllowedElement,
  ClientProtocolCircuitVerifier,
  WorldStateSynchronizer,
} from '@aztec/stdlib/interfaces/server';
import { PeerErrorSeverity } from '@aztec/stdlib/p2p';
import { DatabasePublicStateSource, MerkleTreeId } from '@aztec/stdlib/trees';
import type { Tx, TxValidationResult } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { ArchiveCache } from './archive_cache.js';
import { BlockHeaderTxValidator } from './block_header_validator.js';
import { DataTxValidator } from './data_validator.js';
import { DoubleSpendTxValidator } from './double_spend_validator.js';
import { GasTxValidator } from './gas_validator.js';
import { MetadataTxValidator } from './metadata_validator.js';
import { PhasesTxValidator } from './phases_validator.js';
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
  logger: Logger,
  allowedInSetup: AllowedElement[] = [],
): Record<string, MessageValidator>[] {
  const merkleTree = worldStateSynchronizer.getCommitted();

  return [
    {
      txsPermittedValidator: {
        validator: new TxPermittedValidator(txsPermitted, logger.createChild('tx-permitted-validator')),
        severity: PeerErrorSeverity.MidToleranceError,
      },
      dataValidator: {
        validator: new DataTxValidator(logger.createChild('data-validator')),
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
          logger.createChild('metadata-validator'),
        ),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      timestampValidator: {
        validator: new TimestampTxValidator<Tx>(
          {
            timestamp,
            blockNumber,
          },
          logger.createChild('timestamp-validator'),
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
          logger.createChild('double-spend-validator'),
        ),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      gasValidator: {
        validator: new GasTxValidator(
          new DatabasePublicStateSource(merkleTree),
          ProtocolContractAddress.FeeJuice,
          gasFees,
          logger.createChild('gas-validator'),
        ),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      phasesValidator: {
        validator: new PhasesTxValidator(
          contractDataSource,
          allowedInSetup,
          timestamp,
          logger.createChild('phases-validator'),
        ),
        severity: PeerErrorSeverity.MidToleranceError,
      },
      blockHeaderValidator: {
        validator: new BlockHeaderTxValidator(
          new ArchiveCache(merkleTree),
          logger.createChild('block-header-validator'),
        ),
        severity: PeerErrorSeverity.HighToleranceError,
      },
    },
    {
      proofValidator: {
        validator: new TxProofValidator(proofVerifier, logger.createChild('proof-validator')),
        severity: PeerErrorSeverity.MidToleranceError,
      },
    },
  ];
}
