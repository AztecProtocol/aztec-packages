import type { Fr } from '@aztec/foundation/fields';
import { FunctionSelector } from '@aztec/stdlib/abi';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractOverrides } from '@aztec/stdlib/tx';

import type { ContractDataProvider } from '../storage/index.js';

export class ProxiedContractDataProviderFactory {
  static create(contractDataProvider: ContractDataProvider, overrides?: ContractOverrides) {
    if (!overrides) {
      return contractDataProvider;
    }
    return new Proxy(contractDataProvider, {
      get(target, prop: keyof ContractDataProvider) {
        console.log('ProxiedContractDataProviderFactory: getting property', prop);
        switch (prop) {
          case 'getContractInstance': {
            return async (address: AztecAddress) => {
              if (overrides.instances.has(address.toString())) {
                const instance = overrides.instances.get(address.toString())!;
                instance.address = address;
                instance.currentContractClassId = (await target.getContractInstance(address))!.currentContractClassId;
                return instance;
              } else {
                return target.getContractInstance(address);
              }
            };
          }
          case 'getContractArtifact': {
            return (contractClassId: Fr) => {
              if (overrides.artifacts.has(contractClassId.toString())) {
                return overrides.artifacts.get(contractClassId.toString());
              } else {
                return target.getContractArtifact(contractClassId);
              }
            };
          }
          case 'getFunctionArtifact': {
            return async (contractAddress: AztecAddress, selector: FunctionSelector) => {
              if (overrides.instances.has(contractAddress.toString())) {
                const realInstance = await target.getContractInstance(contractAddress);
                const artifact = overrides.artifacts.get(realInstance!.currentContractClassId.toString());
                const functions = artifact!.functions;
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
