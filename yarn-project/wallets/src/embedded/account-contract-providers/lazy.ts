import type { Account, AccountContract } from '@aztec/aztec.js/account';
import type { Fq } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress } from '@aztec/stdlib/contract';

import type { AccountContractsProvider } from './types.js';

/**
 * Loads account contract artifacts lazily via dynamic imports.
 * Designed for browser environments where code splitting reduces initial bundle size.
 */
export class LazyAccountContractsProvider implements AccountContractsProvider {
  async getSchnorrAccountContract(signingKey: Fq): Promise<AccountContract> {
    const { SchnorrAccountContract } = await import('@aztec/accounts/schnorr/lazy');
    return new SchnorrAccountContract(signingKey);
  }

  async getEcdsaRAccountContract(signingKey: Buffer): Promise<AccountContract> {
    const { EcdsaRAccountContract } = await import('@aztec/accounts/ecdsa/lazy');
    return new EcdsaRAccountContract(signingKey);
  }

  async getEcdsaKAccountContract(signingKey: Buffer): Promise<AccountContract> {
    const { EcdsaKAccountContract } = await import('@aztec/accounts/ecdsa/lazy');
    return new EcdsaKAccountContract(signingKey);
  }

  async getStubAccountContractArtifact(): Promise<ContractArtifact> {
    const { getStubAccountContractArtifact } = await import('@aztec/accounts/stub/lazy');
    return getStubAccountContractArtifact();
  }

  async createStubAccount(address: CompleteAddress): Promise<Account> {
    const { createStubAccount } = await import('@aztec/accounts/stub/lazy');
    return createStubAccount(address);
  }
}
