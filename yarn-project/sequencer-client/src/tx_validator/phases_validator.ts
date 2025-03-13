import { createLogger } from '@aztec/foundation/log';
import { ContractsDataSourcePublicDB, getExecutionRequestsByPhase } from '@aztec/simulator/server';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';
import {
  type PublicExecutionRequest,
  Tx,
  TxExecutionPhase,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';

export class PhasesTxValidator implements TxValidator<Tx> {
  #log = createLogger('sequencer:tx_validator:tx_phases');
  private contractDataSource: ContractsDataSourcePublicDB;

  constructor(contracts: ContractDataSource, private setupAllowList: AllowedElement[], private blockNumber: number) {
    this.contractDataSource = new ContractsDataSourcePublicDB(contracts);
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    try {
      // TODO(@spalladino): We add this just to handle public authwit-check calls during setup
      // which are needed for public FPC flows, but fail if the account contract hasnt been deployed yet,
      // which is what we're trying to do as part of the current txs.
      await this.contractDataSource.addNewContracts(tx);

      if (!tx.data.forPublic) {
        this.#log.debug(`Tx ${Tx.getHash(tx)} does not contain enqueued public functions. Skipping phases validation.`);
        return { result: 'valid' };
      }

      const setupFns = getExecutionRequestsByPhase(tx, TxExecutionPhase.SETUP);
      for (const setupFn of setupFns) {
        if (!(await this.isOnAllowList(setupFn, this.setupAllowList))) {
          this.#log.warn(
            `Rejecting tx ${Tx.getHash(tx)} because it calls setup function not on allow list: ${
              setupFn.callContext.contractAddress
            }:${setupFn.callContext.functionSelector}`,
            { allowList: this.setupAllowList },
          );

          return { result: 'invalid', reason: ['Setup function not on allow list'] };
        }
      }

      return { result: 'valid' };
    } finally {
      this.contractDataSource.clearContractsForTx();
    }
  }

  async isOnAllowList(publicCall: PublicExecutionRequest, allowList: AllowedElement[]): Promise<boolean> {
    if (publicCall.isEmpty()) {
      return true;
    }

    const { contractAddress, functionSelector } = publicCall.callContext;

    // do these checks first since they don't require the contract class
    for (const entry of allowList) {
      if ('address' in entry && !('selector' in entry)) {
        if (contractAddress.equals(entry.address)) {
          return true;
        }
      }

      if ('address' in entry && 'selector' in entry) {
        if (contractAddress.equals(entry.address) && entry.selector.equals(functionSelector)) {
          return true;
        }
      }

      const contractClass = await this.contractDataSource.getContractInstance(contractAddress, this.blockNumber);

      if (!contractClass) {
        throw new Error(`Contract not found: ${contractAddress}`);
      }

      if ('classId' in entry && !('selector' in entry)) {
        if (contractClass.currentContractClassId.equals(entry.classId)) {
          return true;
        }
      }

      if ('classId' in entry && 'selector' in entry) {
        if (
          contractClass.currentContractClassId.equals(entry.classId) &&
          (entry.selector === undefined || entry.selector.equals(functionSelector))
        ) {
          return true;
        }
      }
    }

    return false;
  }
}
