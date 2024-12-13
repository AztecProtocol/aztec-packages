import {
  type AllowedElement,
  MerkleTreeId,
  type MerkleTreeReadOperations,
  type ProcessedTx,
  type Tx,
  type TxValidator,
} from '@aztec/circuit-types';
import { type ContractDataSource, type GlobalVariables } from '@aztec/circuits.js';
import {
  AggregateTxValidator,
  DataTxValidator,
  DoubleSpendTxValidator,
  MetadataTxValidator,
  type NullifierSource,
} from '@aztec/p2p';
import { ProtocolContractAddress } from '@aztec/protocol-contracts';
import { readPublicState } from '@aztec/simulator';

import { GasTxValidator, type PublicStateSource } from './gas_validator.js';
import { PhasesTxValidator } from './phases_validator.js';

export class TxValidatorFactory {
  nullifierSource: NullifierSource;
  publicStateSource: PublicStateSource;
  constructor(
    private committedDb: MerkleTreeReadOperations,
    private contractDataSource: ContractDataSource,
    private enforceFees: boolean,
  ) {
    this.nullifierSource = {
      getNullifierIndex: nullifier =>
        this.committedDb.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]).then(x => x[0]),
    };

    this.publicStateSource = {
      storageRead: (contractAddress, slot) => {
        return readPublicState(this.committedDb, contractAddress, slot);
      },
    };
  }

  validatorForNewTxs(globalVariables: GlobalVariables, setupAllowList: AllowedElement[]): TxValidator<Tx> {
    return new AggregateTxValidator(
      new DataTxValidator(),
      new MetadataTxValidator(globalVariables.chainId, globalVariables.blockNumber),
      new DoubleSpendTxValidator(this.nullifierSource),
      new PhasesTxValidator(this.contractDataSource, setupAllowList),
      new GasTxValidator(this.publicStateSource, ProtocolContractAddress.FeeJuice, this.enforceFees),
    );
  }

  validatorForProcessedTxs(fork: MerkleTreeReadOperations): TxValidator<ProcessedTx> {
    return new DoubleSpendTxValidator({
      getNullifierIndex: nullifier =>
        fork.findLeafIndices(MerkleTreeId.NULLIFIER_TREE, [nullifier.toBuffer()]).then(x => x[0]),
    });
  }
}
