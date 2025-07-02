import { createLogger } from '@aztec/foundation/log';
import { PublicContractsDB, getCallRequestsWithCalldataByPhase } from '@aztec/simulator/server';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';
import {
  type PublicCallRequestWithCalldata,
  TX_ERROR_DURING_VALIDATION,
  TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED,
  Tx,
  TxExecutionPhase,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

export class PhasesTxValidator implements TxValidator<Tx> {
  #log = createLogger('sequencer:tx_validator:tx_phases');
  private contractsDB: PublicContractsDB;

  constructor(
    contracts: ContractDataSource,
    private setupAllowList: AllowedElement[],
    private timestamp: UInt64,
  ) {
    this.contractsDB = new PublicContractsDB(contracts);
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    try {
      // TODO(@spalladino): We add this just to handle public authwit-check calls during setup
      // which are needed for public FPC flows, but fail if the account contract hasnt been deployed yet,
      // which is what we're trying to do as part of the current txs.
      await this.contractsDB.addNewContracts(tx);

      if (!tx.data.forPublic) {
        this.#log.debug(
          `Tx ${await Tx.getHash(tx)} does not contain enqueued public functions. Skipping phases validation.`,
        );
        return { result: 'valid' };
      }

      const setupFns = getCallRequestsWithCalldataByPhase(tx, TxExecutionPhase.SETUP);
      for (const setupFn of setupFns) {
        if (!(await this.isOnAllowList(setupFn, this.setupAllowList))) {
          this.#log.verbose(
            `Rejecting tx ${await Tx.getHash(tx)} because it calls setup function not on allow list: ${
              setupFn.request.contractAddress
            }:${setupFn.functionSelector}`,
            { allowList: this.setupAllowList },
          );

          return { result: 'invalid', reason: [TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED] };
        }
      }

      return { result: 'valid' };
    } catch (err) {
      this.#log.error(`Error validating phases for tx`, err);
      return { result: 'invalid', reason: [TX_ERROR_DURING_VALIDATION] };
    } finally {
      this.contractsDB.clearContractsForTx();
    }
  }

  private async isOnAllowList(
    publicCall: PublicCallRequestWithCalldata,
    allowList: AllowedElement[],
  ): Promise<boolean> {
    if (publicCall.isEmpty()) {
      return true;
    }

    const contractAddress = publicCall.request.contractAddress;
    const functionSelector = publicCall.functionSelector;

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

      const contractClass = await this.contractsDB.getContractInstance(contractAddress, this.timestamp);

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
