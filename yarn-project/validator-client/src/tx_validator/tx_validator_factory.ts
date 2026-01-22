import { BlockNumber } from '@aztec/foundation/branded-types';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { Logger } from '@aztec/foundation/log';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import {
  AggregateTxValidator,
  ArchiveCache,
  BlockHeaderTxValidator,
  DataTxValidator,
  DoubleSpendTxValidator,
  GasTxValidator,
  MetadataTxValidator,
  PhasesTxValidator,
  SizeTxValidator,
  TimestampTxValidator,
  TxPermittedValidator,
  TxProofValidator,
} from '@aztec/p2p';
import { ProtocolContractAddress, protocolContractsHash } from '@aztec/protocol-contracts';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { GasFees } from '@aztec/stdlib/gas';
import type {
  AllowedElement,
  ClientProtocolCircuitVerifier,
  MerkleTreeReadOperations,
  PublicProcessorValidator,
} from '@aztec/stdlib/interfaces/server';
import { DatabasePublicStateSource, type PublicStateSource } from '@aztec/stdlib/trees';
import { GlobalVariables, type Tx, type TxValidator } from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

import { NullifierCache } from './nullifier_cache.js';

export function createValidatorForAcceptingTxs(
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
  log: Logger,
): TxValidator<Tx> {
  const validators: TxValidator<Tx>[] = [
    new TxPermittedValidator(txsPermitted, log),
    new SizeTxValidator(log),
    new DataTxValidator(log),
    new MetadataTxValidator(
      {
        l1ChainId: new Fr(l1ChainId),
        rollupVersion: new Fr(rollupVersion),
        protocolContractsHash,
        vkTreeRoot: getVKTreeRoot(),
      },
      log,
    ),
    new TimestampTxValidator(
      {
        timestamp,
        blockNumber,
      },
      log,
    ),
    new DoubleSpendTxValidator(new NullifierCache(db), log),
    new PhasesTxValidator(contractDataSource, setupAllowList, timestamp, log),
    new BlockHeaderTxValidator(new ArchiveCache(db), log),
  ];

  if (!skipFeeEnforcement) {
    validators.push(
      new GasTxValidator(new DatabasePublicStateSource(db), ProtocolContractAddress.FeeJuice, gasFees, log),
    );
  }

  if (verifier) {
    validators.push(new TxProofValidator(verifier, log));
  }

  return new AggregateTxValidator(...validators);
}

export function createValidatorForBlockBuilding(
  db: MerkleTreeReadOperations,
  contractDataSource: ContractDataSource,
  globalVariables: GlobalVariables,
  setupAllowList: AllowedElement[],
  log: Logger,
): PublicProcessorValidator {
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
      log,
    ),
    nullifierCache,
  };
}

function preprocessValidator(
  nullifierCache: NullifierCache,
  archiveCache: ArchiveCache,
  publicStateSource: PublicStateSource,
  contractDataSource: ContractDataSource,
  globalVariables: GlobalVariables,
  setupAllowList: AllowedElement[],
  log: Logger,
): TxValidator<Tx> {
  // We don't include the TxProofValidator nor the DataTxValidator here because they are already checked by the time we get to block building.
  return new AggregateTxValidator(
    new MetadataTxValidator(
      {
        l1ChainId: globalVariables.chainId,
        rollupVersion: globalVariables.version,
        protocolContractsHash,
        vkTreeRoot: getVKTreeRoot(),
      },
      log,
    ),
    new TimestampTxValidator(
      {
        timestamp: globalVariables.timestamp,
        blockNumber: globalVariables.blockNumber,
      },
      log,
    ),
    new DoubleSpendTxValidator(nullifierCache, log),
    new PhasesTxValidator(contractDataSource, setupAllowList, globalVariables.timestamp, log),
    new GasTxValidator(publicStateSource, ProtocolContractAddress.FeeJuice, globalVariables.gasFees, log),
    new BlockHeaderTxValidator(archiveCache, log),
  );
}
