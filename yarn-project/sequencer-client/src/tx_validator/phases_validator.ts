import { type AllowedFunction, Tx, type TxValidator } from '@aztec/circuit-types';
import { type PublicCallRequest } from '@aztec/circuits.js';
import { createDebugLogger } from '@aztec/foundation/log';
import { AbstractPhaseManager, PublicKernelPhase } from '@aztec/simulator';
import { type ContractDataSource } from '@aztec/types/contracts';

export class PhasesTxValidator implements TxValidator<Tx> {
  #log = createDebugLogger('aztec:sequencer:tx_validator:tx_phases');

  constructor(private contractDataSource: ContractDataSource, private setupAllowList: AllowedFunction[]) {}

  async validateTxs(txs: Tx[]): Promise<[validTxs: Tx[], invalidTxs: Tx[]]> {
    const validTxs: Tx[] = [];
    const invalidTxs: Tx[] = [];

    for (const tx of txs) {
      if (await this.#validateTx(tx)) {
        validTxs.push(tx);
      } else {
        invalidTxs.push(tx);
      }
    }

    return Promise.resolve([validTxs, invalidTxs]);
  }

  async #validateTx(tx: Tx): Promise<boolean> {
    if (!tx.data.forPublic) {
      this.#log.debug(`Tx ${Tx.getHash(tx)} does not contain enqueued public functions. Skipping phases validation.`);
      return true;
    }

    const { [PublicKernelPhase.SETUP]: setupFns } = AbstractPhaseManager.extractEnqueuedPublicCallsByPhase(tx);

    for (const setupFn of setupFns) {
      if (!(await this.isOnAllowList(setupFn, this.setupAllowList))) {
        this.#log.warn(
          `Rejecting tx ${Tx.getHash(tx)} because it calls setup function not on allow list: ${
            setupFn.contractAddress
          }:${setupFn.functionSelector}`,
        );

        return false;
      }
    }

    return true;
  }

  async isOnAllowList(publicCall: PublicCallRequest, allowList: AllowedFunction[]): Promise<boolean> {
    if (publicCall.isEmpty()) {
      return true;
    }

    const { contractAddress, functionSelector } = publicCall;

    // do these checks first since they don't require the contract class
    for (const entry of allowList) {
      if (!('address' in entry)) {
        continue;
      }

      if (contractAddress.equals(entry.address) && entry.selector.equals(functionSelector)) {
        return true;
      }
    }

    const contractClass = await this.contractDataSource.getContract(contractAddress);
    if (!contractClass) {
      throw new Error(`Contract not found: ${publicCall.contractAddress.toString()}`);
    }

    for (const entry of allowList) {
      if (!('classId' in entry)) {
        continue;
      }

      if (contractClass.contractClassId.equals(entry.classId) && entry.selector.equals(functionSelector)) {
        return true;
      }
    }

    return false;
  }
}
