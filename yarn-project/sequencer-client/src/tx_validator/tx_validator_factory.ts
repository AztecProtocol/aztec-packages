import { type AllowedElement, type ProcessedTx, type Tx, type TxValidator } from '@aztec/circuit-types';
import { type GlobalVariables } from '@aztec/circuits.js';
import { AggregateTxValidator, DataTxValidator, DoubleSpendTxValidator, MetadataTxValidator } from '@aztec/p2p';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { WorldStateDB } from '@aztec/simulator';
import { type ContractDataSource } from '@aztec/types/contracts';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { GasTxValidator } from './gas_validator.js';
import { PhasesTxValidator } from './phases_validator.js';

export class TxValidatorFactory {
  constructor(
    private merkleTreeDb: MerkleTreeOperations,
    private contractDataSource: ContractDataSource,
    private enforceFees: boolean,
  ) {}

  validatorForNewTxs(globalVariables: GlobalVariables, setupAllowList: AllowedElement[]): TxValidator<Tx> {
    const worldStateDB = new WorldStateDB(this.merkleTreeDb, this.contractDataSource);
    return new AggregateTxValidator(
      new DataTxValidator(),
      new MetadataTxValidator(globalVariables.chainId, globalVariables.blockNumber),
      new DoubleSpendTxValidator(worldStateDB),
      new PhasesTxValidator(this.contractDataSource, setupAllowList),
      new GasTxValidator(worldStateDB, ProtocolContractAddress.FeeJuice, this.enforceFees),
    );
  }

  validatorForProcessedTxs(): TxValidator<ProcessedTx> {
    return new DoubleSpendTxValidator(new WorldStateDB(this.merkleTreeDb, this.contractDataSource));
  }
}
