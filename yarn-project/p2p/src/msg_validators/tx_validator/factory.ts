import { AbortError } from '@aztec/foundation/error';
import { Fr } from '@aztec/foundation/fields';
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

import { ArchiveCache } from './archive_cache.js';
import { BlockHeaderTxValidator } from './block_header_validator.js';
import { DataTxValidator } from './data_validator.js';
import { DoubleSpendTxValidator } from './double_spend_validator.js';
import { GasTxValidator } from './gas_validator.js';
import { MetadataTxValidator } from './metadata_validator.js';
import { PhasesTxValidator } from './phases_validator.js';
import { TxProofValidator } from './tx_proof_validator.js';

export type TxValidateFn = (tx: Tx, signal?: AbortSignal) => Promise<TxValidationResult>;

export interface MessageValidator {
  validator: {
    validateTx: TxValidateFn;
  };
  severity: PeerErrorSeverity;
}

export function createTxMessageValidators(
  blockNumber: number,
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
          blockNumber: new Fr(blockNumber),
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
        validator: new PhasesTxValidator(contractDataSource, allowedInSetup, blockNumber),
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

export interface ValidationResult {
  name: string;
  isValid: TxValidationResult;
  severity: PeerErrorSeverity;
}
export type ValidationOutcome = { allPassed: true } | { allPassed: false; failure: ValidationResult };

export async function validateInParallel(
  tx: Tx,
  validators: Record<string, MessageValidator>,
  log?: Logger,
): Promise<ValidationOutcome> {
  const abortController = new AbortController();
  const txHash = await tx.getTxHash();

  const asyncTasks = Object.fromEntries(
    Object.entries(validators).map(([name, { validator, severity }]): [string, Promise<ValidationResult>] => {
      const asyncTask = async () => {
        try {
          const isValid = await validator.validateTx(tx, abortController.signal);
          return { name, isValid, severity };
        } catch (err) {
          if (err instanceof AbortError) {
            log?.trace(`Validation task ${name} was aborted for tx ${txHash}`, { name, txHash });
            return { name, isValid: { result: 'skipped' as const, reason: ['Operation aborted'] }, severity };
          }

          log?.warn(`Unexpected error running validator ${name} on ${txHash}`, { err, name, txHash });
          return { name, isValid: { result: 'invalid' as const, reason: [String(err)] }, severity };
        }
      };

      return [name, asyncTask()];
    }),
  );

  const allValidations: Array<ValidationResult> = [];
  while (Object.keys(asyncTasks).length > 0) {
    const nextTaskFinished = await Promise.race(Object.values(asyncTasks));
    allValidations.push(nextTaskFinished);
    delete asyncTasks[nextTaskFinished.name];

    if (nextTaskFinished.isValid.result !== 'valid') {
      abortController.abort();
    }
  }

  // this will select the first 'real' failure (i.e. before any timeouts)
  const failure = allValidations.find(x => x.isValid.result !== 'valid');
  if (failure) {
    return {
      allPassed: false,
      failure,
    };
  } else {
    return {
      allPassed: true,
    };
  }
}
