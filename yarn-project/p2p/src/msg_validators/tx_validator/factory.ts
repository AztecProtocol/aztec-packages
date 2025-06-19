import { Fr } from '@aztec/foundation/fields';
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
import { TxProofValidator } from './tx_proof_validator.js';

export interface MessageValidator {
  validator: {
    validateTx(tx: Tx): Promise<TxValidationResult>;
  };
  severity: PeerErrorSeverity;
}

export function createTxMessageValidators(
  timestamp: UInt64,
  worldStateSynchronizer: WorldStateSynchronizer,
  gasFees: GasFees,
  l1ChainId: number,
  rollupVersion: number,
  protocolContractTreeRoot: Fr,
  contractDataSource: ContractDataSource,
  proofVerifier: ClientProtocolCircuitVerifier,
  allowedInSetup: AllowedElement[] = [],
): Record<string, MessageValidator>[] {
  const merkleTree = worldStateSynchronizer.getCommitted();

  return [
    {
      dataValidator: {
        validator: new DataTxValidator(),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      metadataValidator: {
        validator: new MetadataTxValidator({
          l1ChainId: new Fr(l1ChainId),
          rollupVersion: new Fr(rollupVersion),
          timestamp,
          protocolContractTreeRoot,
          vkTreeRoot: getVKTreeRoot(),
        }),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      doubleSpendValidator: {
        validator: new DoubleSpendTxValidator({
          nullifiersExist: async (nullifiers: Buffer[]) => {
            const merkleTree = worldStateSynchronizer.getCommitted();
            const indices = await merkleTree.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, nullifiers);
            return indices.map(index => index !== undefined);
          },
        }),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      gasValidator: {
        validator: new GasTxValidator(
          new DatabasePublicStateSource(merkleTree),
          ProtocolContractAddress.FeeJuice,
          gasFees,
        ),
        severity: PeerErrorSeverity.HighToleranceError,
      },
      phasesValidator: {
        validator: new PhasesTxValidator(contractDataSource, allowedInSetup, timestamp),
        severity: PeerErrorSeverity.MidToleranceError,
      },
      blockHeaderValidator: {
        validator: new BlockHeaderTxValidator(new ArchiveCache(merkleTree)),
        severity: PeerErrorSeverity.HighToleranceError,
      },
    },
    {
      proofValidator: {
        validator: new TxProofValidator(proofVerifier),
        severity: PeerErrorSeverity.MidToleranceError,
      },
    },
  ];
}
