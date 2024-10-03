import {
  type AllowedElement,
  MerkleTreeId,
  type MerkleTreeReadOperations,
  type ProcessedTx,
  type Tx,
  type TxValidator,
} from '@aztec/circuit-types';
import { type GlobalVariables } from '@aztec/circuits.js';
import {
  AggregateTxValidator,
  DataTxValidator,
  DoubleSpendTxValidator,
  MetadataTxValidator,
  type NullifierSource,
} from '@aztec/p2p';
import { FeeJuiceAddress } from '@aztec/protocol-contracts/fee-juice';
import { readPublicState } from '@aztec/simulator';
import { type ContractDataSource } from '@aztec/types/contracts';

import { GasTxValidator, type PublicStateSource } from './gas_validator.js';
import { PhasesTxValidator } from './phases_validator.js';

export class TxValidatorFactory {
  nullifierSource: NullifierSource;
  publicStateSource: PublicStateSource;
  constructor(
    private db: MerkleTreeReadOperations,
    private contractDataSource: ContractDataSource,
    private enforceFees: boolean,
  ) {
    this.nullifierSource = {
      getNullifierIndex: nullifier => this.db.findLeafIndex(MerkleTreeId.NULLIFIER_TREE, nullifier.toBuffer()),
    };

    this.publicStateSource = {
      storageRead: (contractAddress, slot) => {
        return readPublicState(this.db, contractAddress, slot);
      },
    };
  }

  validatorForNewTxs(globalVariables: GlobalVariables, setupAllowList: AllowedElement[]): TxValidator<Tx> {
    return new AggregateTxValidator(
      new DataTxValidator(),
      new MetadataTxValidator(globalVariables.chainId, globalVariables.blockNumber),
      new DoubleSpendTxValidator(this.nullifierSource),
      new PhasesTxValidator(this.contractDataSource, setupAllowList),
      new GasTxValidator(this.publicStateSource, FeeJuiceAddress, this.enforceFees),
    );
  }

  validatorForProcessedTxs(): TxValidator<ProcessedTx> {
    return new DoubleSpendTxValidator(this.nullifierSource);
  }
}
