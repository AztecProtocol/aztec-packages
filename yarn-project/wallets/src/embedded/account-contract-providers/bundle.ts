import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub';
import type { Account, AccountContract } from '@aztec/aztec.js/account';
import type { Fq } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress } from '@aztec/stdlib/contract';

import type { AccountContractsProvider } from './types.js';

/**
 * Loads account contract artifacts eagerly via static imports.
 * Designed for Node.js environments where all artifacts are available at startup.
 */
export class BundleAccountContractsProvider implements AccountContractsProvider {
  getSchnorrAccountContract(signingKey: Fq): Promise<AccountContract> {
    return Promise.resolve(new SchnorrAccountContract(signingKey));
  }

  getEcdsaRAccountContract(signingKey: Buffer): Promise<AccountContract> {
    return Promise.resolve(new EcdsaRAccountContract(signingKey));
  }

  getEcdsaKAccountContract(signingKey: Buffer): Promise<AccountContract> {
    return Promise.resolve(new EcdsaKAccountContract(signingKey));
  }

  getStubAccountContractArtifact(): Promise<ContractArtifact> {
    return Promise.resolve(StubAccountContractArtifact);
  }

  createStubAccount(address: CompleteAddress): Promise<Account> {
    return Promise.resolve(createStubAccount(address));
  }
}
