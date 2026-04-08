import { type FunctionArtifact, type FunctionArtifactWithContractName, FunctionSelector } from '@aztec/stdlib/abi';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { ContractOverrides } from '@aztec/stdlib/tx';

import type { ContractStore } from '../storage/contract_store/contract_store.js';

/*
 * Proxy generator for a ContractStore that allows overriding contract instances and artifacts, so
 * the contract function simulator can execute different bytecode on certain addresses. An example use case
 * would be overriding your own account contract so that valid signatures don't have to be provided while simulating.
 */
export class ProxiedContractStoreFactory {
  static create(contractStore: ContractStore, overrides?: ContractOverrides) {
    if (!overrides) {
      return contractStore;
    }

    return new Proxy(contractStore, {
      get(target, prop: keyof ContractStore) {
        switch (prop) {
          case 'getContractInstance': {
            return async (address: AztecAddress): Promise<ContractInstanceWithAddress | undefined> => {
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
            return async (
              contractAddress: AztecAddress,
              selector: FunctionSelector,
            ): Promise<FunctionArtifactWithContractName | undefined> => {
              if (overrides[contractAddress.toString()]) {
                const { artifact } = overrides[contractAddress.toString()]!;
                const fn = await findFunctionInOverride(artifact.functions, selector);
                if (fn) {
                  return { ...fn, contractName: artifact.name };
                }
              }
              // Fall through to the real store if there's no override or the function wasn't found in the override artifact.
              return target.getFunctionArtifact(contractAddress, selector);
            };
          }
          case 'getFunctionArtifactWithDebugMetadata': {
            return async (
              contractAddress: AztecAddress,
              selector: FunctionSelector,
            ): Promise<FunctionArtifactWithContractName> => {
              if (overrides[contractAddress.toString()]) {
                const { artifact } = overrides[contractAddress.toString()]!;
                const fn = await findFunctionInOverride(artifact.functions, selector);
                if (fn) {
                  return { ...fn, contractName: artifact.name };
                }
              }
              // Fall through to the real store if there's no override or the function wasn't found in the override artifact.
              return target.getFunctionArtifactWithDebugMetadata(contractAddress, selector);
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
    }) satisfies ContractStore;
  }
}

/**
 * Searches for a function matching the given selector in a contract artifact's functions array.
 * @returns The matching function artifact, or undefined if not found.
 */
async function findFunctionInOverride(
  functions: FunctionArtifact[],
  selector: FunctionSelector,
): Promise<FunctionArtifact | undefined> {
  for (const fn of functions) {
    const fnSelector = await FunctionSelector.fromNameAndParameters(fn.name, fn.parameters);
    if (fnSelector.equals(selector)) {
      return fn;
    }
  }
  return undefined;
}
