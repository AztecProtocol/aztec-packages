import { type AztecAddress } from '@aztec/circuits.js/aztec-address';
import { type ContractDataSource } from '@aztec/circuits.js/contract';
import type { GasFees } from '@aztec/circuits.js/gas';
import {
  type AllowedElement,
  type ClientProtocolCircuitVerifier,
  type MerkleTreeReadOperations,
} from '@aztec/circuits.js/interfaces/server';
import { type ProcessedTx, type Tx, type TxValidator } from '@aztec/circuits.js/tx';
import type { GlobalVariables } from '@aztec/circuits.js/tx';
import { Fr } from '@aztec/foundation/fields';
import {
  AggregateTxValidator,
  BlockHeaderTxValidator,
  DataTxValidator,
  DoubleSpendTxValidator,
  MetadataTxValidator,
  TxProofValidator,
} from '@aztec/p2p';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { readPublicState } from '@aztec/simulator/server';

import { ArchiveCache } from './archive_cache.js';
import { GasTxValidator, type PublicStateSource } from './gas_validator.js';
import { NullifierCache } from './nullifier_cache.js';
import { PhasesTxValidator } from './phases_validator.js';

export function createValidatorForAcceptingTxs(
  db: MerkleTreeReadOperations,
  contractDataSource: ContractDataSource,
  verifier: ClientProtocolCircuitVerifier | undefined,
  {
    blockNumber,
    l1ChainId,
    setupAllowList,
    gasFees,
    skipFeeEnforcement,
  }: {
    blockNumber: number;
    l1ChainId: number;
    setupAllowList: AllowedElement[];
    gasFees: GasFees;
    skipFeeEnforcement?: boolean;
  },
): TxValidator<Tx> {
  const validators: TxValidator<Tx>[] = [
    new DataTxValidator(),
    new MetadataTxValidator(new Fr(l1ChainId), new Fr(blockNumber)),
    new DoubleSpendTxValidator(new NullifierCache(db)),
    new PhasesTxValidator(contractDataSource, setupAllowList),
    new BlockHeaderTxValidator(new ArchiveCache(db)),
  ];

  if (!skipFeeEnforcement) {
    validators.push(new GasTxValidator(new DatabasePublicStateSource(db), ProtocolContractAddress.FeeJuice, gasFees));
  }

  if (verifier) {
    validators.push(new TxProofValidator(verifier));
  }

  return new AggregateTxValidator(...validators);
}

export function createValidatorsForBlockBuilding(
  db: MerkleTreeReadOperations,
  contractDataSource: ContractDataSource,
  globalVariables: GlobalVariables,
  setupAllowList: AllowedElement[],
): {
  preprocessValidator: TxValidator<Tx>;
  postprocessValidator: TxValidator<ProcessedTx>;
  nullifierCache: NullifierCache;
} {
  const nullifierCache = new NullifierCache(db);
  const archiveCache = new ArchiveCache(db);
  const publicStateSource = new DatabasePublicStateSource(db);

  return {
    preprocessValidator: preprocessValidator(
      nullifierCache,
      archiveCache,
      publicStateSource,
      contractDataSource,
      globalVariables,
      setupAllowList,
    ),
    postprocessValidator: postprocessValidator(nullifierCache),
    nullifierCache,
  };
}

class DatabasePublicStateSource implements PublicStateSource {
  constructor(private db: MerkleTreeReadOperations) {}

  storageRead(contractAddress: AztecAddress, slot: Fr): Promise<Fr> {
    return readPublicState(this.db, contractAddress, slot);
  }
}

function preprocessValidator(
  nullifierCache: NullifierCache,
  archiveCache: ArchiveCache,
  publicStateSource: PublicStateSource,
  contractDataSource: ContractDataSource,
  globalVariables: GlobalVariables,
  setupAllowList: AllowedElement[],
): TxValidator<Tx> {
  // We don't include the TxProofValidator nor the DataTxValidator here because they are already checked by the time we get to block building.
  return new AggregateTxValidator(
    new MetadataTxValidator(globalVariables.chainId, globalVariables.blockNumber),
    new DoubleSpendTxValidator(nullifierCache),
    new PhasesTxValidator(contractDataSource, setupAllowList),
    new GasTxValidator(publicStateSource, ProtocolContractAddress.FeeJuice, globalVariables.gasFees),
    new BlockHeaderTxValidator(archiveCache),
  );
}

function postprocessValidator(nullifierCache: NullifierCache): TxValidator<ProcessedTx> {
  return new DoubleSpendTxValidator(nullifierCache);
}
