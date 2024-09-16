import { type AllowedElement, type ProcessedTx, type Tx, type TxValidator } from '@aztec/circuit-types';
import { type GlobalVariables } from '@aztec/circuits.js';
import { FeeJuiceAddress } from '@aztec/protocol-contracts/fee-juice';
import { WorldStateDB } from '@aztec/simulator';
import { type ContractDataSource } from '@aztec/types/contracts';
import { type MerkleTreeOperations } from '@aztec/world-state';

import { AggregateTxValidator } from './aggregate_tx_validator.js';
import { DataTxValidator } from './data_validator.js';
import { DoubleSpendTxValidator } from './double_spend_validator.js';
import { GasTxValidator } from './gas_validator.js';
import { MetadataTxValidator } from './metadata_validator.js';
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
      new MetadataTxValidator(globalVariables),
      new DoubleSpendTxValidator(worldStateDB),
      new PhasesTxValidator(this.contractDataSource, setupAllowList),
      new GasTxValidator(worldStateDB, FeeJuiceAddress, this.enforceFees),
    );
  }

  validatorForProcessedTxs(): TxValidator<ProcessedTx> {
    return new DoubleSpendTxValidator(new WorldStateDB(this.merkleTreeDb, this.contractDataSource));
  }
}
