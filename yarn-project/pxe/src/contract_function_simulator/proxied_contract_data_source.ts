import { type FunctionSelector, findFunctionArtifactBySelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractOverrides } from '@aztec/stdlib/tx';

import type { ContractStore } from '../storage/contract_store/contract_store.js';

/*
 * Proxy generator for a ContractStore that allows overriding contract instances at given addresses,
 * so the contract function simulator can execute different bytecode on certain addresses. An example
 * use case would be overriding your own account contract so that valid signatures don't have to be
 * provided while simulating.
 *
 * Function artifact lookups for an overridden address are routed via the override-instance's
 * `currentContractClassId` rather than the underlying ContractStore's address→class mapping —
 * `ContractStore.getFunctionArtifact` calls `this.getContractInstance` internally, which the proxy
 * cannot intercept (the binding sees the raw target, not the proxy). The target class must be
 * registered ahead of time via `pxe.registerContractClass(...)`.
 */
export class ProxiedContractStoreFactory {
  static create(contractStore: ContractStore, overrides?: ContractOverrides) {
    if (!overrides) {
      return contractStore;
    }

    return new Proxy(contractStore, {
      get(target, prop: keyof ContractStore) {
        if (prop === 'getContractInstance') {
          return (address: AztecAddress) => {
            const override = overrides[address.toString()];
            return override ? Promise.resolve(override.instance) : target.getContractInstance(address);
          };
        }
        if (prop === 'getFunctionArtifact' || prop === 'getFunctionArtifactWithDebugMetadata') {
          return async (contractAddress: AztecAddress, selector: FunctionSelector) => {
            const override = overrides[contractAddress.toString()];
            if (!override) {
              return (target[prop] as Function).call(target, contractAddress, selector);
            }
            const artifact = await target.getContractArtifact(override.instance.currentContractClassId);
            if (!artifact) {
              throw new Error(
                `No artifact registered for override class ${override.instance.currentContractClassId} ` +
                  `at ${contractAddress}. Register it via pxe.registerContractClass(...) before simulating.`,
              );
            }
            const fn = await findFunctionArtifactBySelector(artifact, selector);
            if (!fn) {
              throw new Error(
                `Function with selector ${selector} not found in stub artifact for overridden contract at ${contractAddress}.`,
              );
            }
            return { ...fn, contractName: artifact.name };
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) satisfies ContractStore;
  }
}
