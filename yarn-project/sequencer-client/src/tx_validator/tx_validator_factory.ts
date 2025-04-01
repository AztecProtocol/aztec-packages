import { MerkleTreeId } from '@aztec/aztec.js';
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
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import { computePublicDataTreeLeafSlot } from '@aztec/stdlib/hash';
import type {
  AllowedElement,
  ClientProtocolCircuitVerifier,
  MerkleTreeReadOperations,
} from '@aztec/stdlib/interfaces/server';
import type { PublicDataTreeLeafPreimage } from '@aztec/stdlib/trees';
import { GlobalVariables, type Tx, type TxValidator } from '@aztec/stdlib/tx';

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
    rollupVersion,
    setupAllowList,
    gasFees,
    skipFeeEnforcement,
  }: {
    blockNumber: number;
    l1ChainId: number;
    rollupVersion: number;
    setupAllowList: AllowedElement[];
    gasFees: GasFees;
    skipFeeEnforcement?: boolean;
  },
): TxValidator<Tx> {
  const validators: TxValidator<Tx>[] = [
    new DataTxValidator(),
    new MetadataTxValidator(new Fr(l1ChainId), new Fr(rollupVersion), new Fr(blockNumber)),
    new DoubleSpendTxValidator(new NullifierCache(db)),
    new PhasesTxValidator(contractDataSource, setupAllowList, blockNumber),
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

export function createValidatorForBlockBuilding(
  db: MerkleTreeReadOperations,
  contractDataSource: ContractDataSource,
  globalVariables: GlobalVariables,
  setupAllowList: AllowedElement[],
): {
  preprocessValidator: TxValidator<Tx>;
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
    nullifierCache,
  };
}

class DatabasePublicStateSource implements PublicStateSource {
  constructor(private db: MerkleTreeReadOperations) {}

  async storageRead(contractAddress: AztecAddress, slot: Fr): Promise<Fr> {
    const leafSlot = (await computePublicDataTreeLeafSlot(contractAddress, slot)).toBigInt();

    const lowLeafResult = await this.db.getPreviousValueIndex(MerkleTreeId.PUBLIC_DATA_TREE, leafSlot);
    if (!lowLeafResult || !lowLeafResult.alreadyPresent) {
      return Fr.ZERO;
    }

    const preimage = (await this.db.getLeafPreimage(
      MerkleTreeId.PUBLIC_DATA_TREE,
      lowLeafResult.index,
    )) as PublicDataTreeLeafPreimage;

    return preimage.value;
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
    new MetadataTxValidator(globalVariables.chainId, globalVariables.version, globalVariables.blockNumber),
    new DoubleSpendTxValidator(nullifierCache),
    new PhasesTxValidator(contractDataSource, setupAllowList, globalVariables.blockNumber.toNumber()),
    new GasTxValidator(publicStateSource, ProtocolContractAddress.FeeJuice, globalVariables.gasFees),
    new BlockHeaderTxValidator(archiveCache),
  );
}
