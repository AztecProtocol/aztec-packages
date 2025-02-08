import {
  type AllowedElement,
  type ClientProtocolCircuitVerifier,
  type MerkleTreeReadOperations,
  type ProcessedTx,
  type Tx,
  type TxValidator,
} from '@aztec/circuit-types';
import { type AztecAddress, type ContractDataSource, Fr, type GasFees, type GlobalVariables } from '@aztec/circuits.js';
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
  data: {
    blockNumber: number;
    l1ChainId: number;
    enforceFees: boolean;
    setupAllowList: AllowedElement[];
    gasFees: GasFees;
  },
): TxValidator<Tx> {
  const { blockNumber, l1ChainId, enforceFees, setupAllowList, gasFees } = data;
  const validators: TxValidator<Tx>[] = [
    new DataTxValidator(),
    new MetadataTxValidator(new Fr(l1ChainId), new Fr(blockNumber)),
    new DoubleSpendTxValidator(new NullifierCache(db)),
    new PhasesTxValidator(contractDataSource, setupAllowList),
    new GasTxValidator(new DatabasePublicStateSource(db), ProtocolContractAddress.FeeJuice, enforceFees, gasFees),
    new BlockHeaderTxValidator(new ArchiveCache(db)),
  ];

  if (verifier) {
    validators.push(new TxProofValidator(verifier));
  }

  return new AggregateTxValidator(...validators);
}

export function createValidatorsForBlockBuilding(
  db: MerkleTreeReadOperations,
  contractDataSource: ContractDataSource,
  globalVariables: GlobalVariables,
  enforceFees: boolean,
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
      enforceFees,
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
  enforceFees: boolean,
  globalVariables: GlobalVariables,
  setupAllowList: AllowedElement[],
): TxValidator<Tx> {
  // We don't include the TxProofValidator nor the DataTxValidator here because they are already checked by the time we get to block building.
  return new AggregateTxValidator(
    new MetadataTxValidator(globalVariables.chainId, globalVariables.blockNumber),
    new DoubleSpendTxValidator(nullifierCache),
    new PhasesTxValidator(contractDataSource, setupAllowList),
    new GasTxValidator(publicStateSource, ProtocolContractAddress.FeeJuice, enforceFees, globalVariables.gasFees),
    new BlockHeaderTxValidator(archiveCache),
  );
}

function postprocessValidator(nullifierCache: NullifierCache): TxValidator<ProcessedTx> {
  return new DoubleSpendTxValidator(nullifierCache);
}
