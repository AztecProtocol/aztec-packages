import { type Logger, type LoggerBindings, createLogger } from '@aztec/foundation/log';
import { PublicContractsDB, getCallRequestsWithCalldataByPhase } from '@aztec/simulator/server';
import type { ContractDataSource } from '@aztec/stdlib/contract';
import type { AllowedElement } from '@aztec/stdlib/interfaces/server';
import {
  type PublicCallRequestWithCalldata,
  TX_ERROR_DURING_VALIDATION,
  TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED,
  TX_ERROR_SETUP_FUNCTION_UNKNOWN_CONTRACT,
  Tx,
  TxExecutionPhase,
  type TxValidationResult,
  type TxValidator,
} from '@aztec/stdlib/tx';
import type { UInt64 } from '@aztec/stdlib/types';

export class PhasesTxValidator implements TxValidator<Tx> {
  #log: Logger;
  private contractsDB: PublicContractsDB;

  constructor(
    contracts: ContractDataSource,
    private setupAllowList: AllowedElement[],
    private timestamp: UInt64,
    bindings?: LoggerBindings,
  ) {
    this.#log = createLogger('sequencer:tx_validator:tx_phases', bindings);
    this.contractsDB = new PublicContractsDB(contracts, bindings);
  }

  async validateTx(tx: Tx): Promise<TxValidationResult> {
    this.contractsDB.createCheckpoint();
    try {
      // TODO(@spalladino): We add this just to handle public authwit-check calls during setup
      // which are needed for public FPC flows, but fail if the account contract hasnt been deployed yet,
      // which is what we're trying to do as part of the current txs.
      // We only need to create/revert checkpoint here because of this addNewContracts call.
      await this.contractsDB.addNewContracts(tx);

      if (!tx.data.forPublic) {
        this.#log.debug(
          `Tx ${tx.getTxHash().toString()} does not contain enqueued public functions. Skipping phases validation.`,
        );
        return { result: 'valid' };
      }

      const setupFns = getCallRequestsWithCalldataByPhase(tx, TxExecutionPhase.SETUP);
      for (const setupFn of setupFns) {
        const rejectionReason = await this.checkAllowList(setupFn, this.setupAllowList);
        if (rejectionReason) {
          this.#log.verbose(
            `Rejecting tx ${tx.getTxHash().toString()} because it calls setup function not on allow list: ${
              setupFn.request.contractAddress
            }:${setupFn.functionSelector}`,
            { allowList: this.setupAllowList },
          );

          return { result: 'invalid', reason: [rejectionReason] };
        }
      }

      return { result: 'valid' };
    } catch (err) {
      this.#log.error(`Error validating phases for tx`, err);
      return { result: 'invalid', reason: [TX_ERROR_DURING_VALIDATION] };
    } finally {
      this.contractsDB.revertCheckpoint();
    }
  }

  /** Returns a rejection reason if the call is not on the allow list, or undefined if it is allowed. */
  private async checkAllowList(
    publicCall: PublicCallRequestWithCalldata,
    allowList: AllowedElement[],
  ): Promise<string | undefined> {
    if (publicCall.isEmpty()) {
      return undefined;
    }

    const contractAddress = publicCall.request.contractAddress;
    const functionSelector = publicCall.functionSelector;

    // Check address-based entries first since they don't require the contract class.
    for (const entry of allowList) {
      if ('address' in entry) {
        if (contractAddress.equals(entry.address) && entry.selector.equals(functionSelector)) {
          return undefined;
        }
      }
    }

    // Check class-based entries. Fetch the contract instance lazily (only once).
    let contractClassId: undefined | { value: string | undefined };
    for (const entry of allowList) {
      if (!('classId' in entry)) {
        continue;
      }

      if (contractClassId === undefined) {
        const instance = await this.contractsDB.getContractInstance(contractAddress, this.timestamp);
        contractClassId = { value: instance?.currentContractClassId.toString() };
        if (!contractClassId.value) {
          return TX_ERROR_SETUP_FUNCTION_UNKNOWN_CONTRACT;
        }
      }

      if (contractClassId.value === entry.classId.toString() && entry.selector.equals(functionSelector)) {
        return undefined;
      }
    }

    return TX_ERROR_SETUP_FUNCTION_NOT_ALLOWED;
  }
}
