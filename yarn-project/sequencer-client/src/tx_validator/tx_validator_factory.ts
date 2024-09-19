import { type AllowedElement, type ProcessedTx, type Tx, type TxValidator } from '@aztec/circuit-types';
import { type GlobalVariables } from '@aztec/circuits.js';
import { AggregateTxValidator, DataTxValidator, DoubleSpendTxValidator, MetadataTxValidator } from '@aztec/p2p';
import { FeeJuiceAddress } from '@aztec/protocol-contracts/fee-juice';
import { WorldStateDB, WorldStatePublicDB } from '@aztec/simulator';
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
    return new AggregateTxValidator(
      new DataTxValidator(),
      new MetadataTxValidator(globalVariables.chainId, globalVariables.blockNumber),
      new DoubleSpendTxValidator(new WorldStateDB(this.merkleTreeDb)),
      new PhasesTxValidator(this.contractDataSource, setupAllowList),
      new GasTxValidator(new WorldStatePublicDB(this.merkleTreeDb), FeeJuiceAddress, this.enforceFees),
    );
  }

  validatorForProcessedTxs(): TxValidator<ProcessedTx> {
    return new DoubleSpendTxValidator(new WorldStateDB(this.merkleTreeDb));
  }
}
