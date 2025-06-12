import type { Fr } from '@aztec/foundation/fields';
import type { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractClass } from '@aztec/stdlib/contract';
import type { ContractOverrides } from '@aztec/stdlib/tx';

import type { ContractDataProvider } from '../storage/index.js';

export class ProxiedContractDataProviderFactory {
  static create(contractDataProvider: ContractDataProvider, overrides: ContractOverrides) {
    const classes = Array.from(overrides.values()).reduce(
      (acc, { contractClass }) => {
        acc[contractClass.id.toString()] = contractClass;
        return acc;
      },
      {} as Record<string, ContractClass>,
    );
    return new Proxy(contractDataProvider, {
      get(target, prop: keyof ContractDataProvider) {
        switch (prop) {
          case 'getContractInstance':
            return (address: AztecAddress) => {
              if (overrides.has(address.toString())) {
                const { instance } = overrides.get(address.toString())!;
                instance.address = address;
                return instance;
              } else {
                return target.getContractInstance(address);
              }
            };
          case 'getContractArtifact':
            return (contractClassId: Fr) => {
              if (classes[contractClassId.toString()]) {
                return classes[contractClassId.toString()];
              } else {
                return target.getContractArtifact(contractClassId);
              }
            };
          default: {
            return (target as any)[prop].bind(target);
          }
        }
      },
    });
  }
}
