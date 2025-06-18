import { FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractOverrides } from '@aztec/stdlib/tx';

import type { ContractDataProvider } from '../storage/index.js';

/*
 * Proxy generator for a ContractDataProvider that allows overriding contract instances and artifacts, so
 * the contract function simulator can execute different bytecode on certain addresses. An example use case
 * would be overriding your own account contract so that valid signatures don't have to be provided while simulating.
 */
export class ProxiedContractDataProviderFactory {
  static create(contractDataProvider: ContractDataProvider, overrides?: ContractOverrides) {
    if (!overrides) {
      return contractDataProvider;
    }

    return new Proxy(contractDataProvider, {
      get(target, prop: keyof ContractDataProvider) {
        switch (prop) {
          case 'getContractInstance': {
            return async (address: AztecAddress) => {
              if (overrides[address.toString()]) {
                const { instance } = overrides[address.toString()]!;
                instance.address = address;
                const realInstance = await target.getContractInstance(address);
                if (!realInstance) {
                  throw new Error(`Contract instance not found for address: ${address}`);
                }
                instance.currentContractClassId = realInstance.currentContractClassId;
                instance.originalContractClassId = realInstance.originalContractClassId;
                return instance;
              } else {
                return target.getContractInstance(address);
              }
            };
          }
          case 'getFunctionArtifact': {
            return async (contractAddress: AztecAddress, selector: FunctionSelector) => {
              if (overrides[contractAddress.toString()]) {
                const { artifact } = overrides[contractAddress.toString()]!;
                const functions = artifact.functions;
                for (let i = 0; i < functions.length; i++) {
                  const fn = functions[i];
                  const fnSelector = await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters);
                  if (fnSelector.equals(selector)) {
                    return fn;
                  }
                }
              } else {
                return target.getFunctionArtifact(contractAddress, selector);
              }
            };
          }
          default: {
            const value = Reflect.get(target, prop);
            if (typeof value === 'function') {
              return value.bind(target);
            }
            return value;
          }
        }
      },
    });
  }
}
