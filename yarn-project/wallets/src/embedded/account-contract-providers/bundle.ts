import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { StubEcdsaAccountContractArtifact, createStubEcdsaAccount } from '@aztec/accounts/ecdsa/stub';
import { SchnorrAccountContract, SchnorrInitializerlessAccountContract } from '@aztec/accounts/schnorr';
import { StubSchnorrAccountContractArtifact, createStubSchnorrAccount } from '@aztec/accounts/schnorr/stub';
import type { Account, AccountContract } from '@aztec/aztec.js/account';
import type { Fq } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress } from '@aztec/stdlib/contract';

import type { AccountType } from '../wallet_db.js';
import type { AccountContractsProvider } from './types.js';

/**
 * Loads account contract artifacts eagerly via static imports.
 * Designed for Node.js environments where all artifacts are available at startup.
 */
export class BundleAccountContractsProvider implements AccountContractsProvider {
  getSchnorrAccountContract(signingKey: Fq): Promise<AccountContract> {
    return Promise.resolve(new SchnorrAccountContract(signingKey));
  }

  getSchnorrInitializerlessAccountContract(signingKey: Fq): Promise<AccountContract> {
    return Promise.resolve(new SchnorrInitializerlessAccountContract(signingKey));
  }

  getEcdsaRAccountContract(signingKey: Buffer): Promise<AccountContract> {
    return Promise.resolve(new EcdsaRAccountContract(signingKey));
  }

  getEcdsaKAccountContract(signingKey: Buffer): Promise<AccountContract> {
    return Promise.resolve(new EcdsaKAccountContract(signingKey));
  }

  getStubAccountContractArtifact(type: AccountType): Promise<ContractArtifact> {
    const isSchnorr = type === 'schnorr' || type === 'schnorr_initializerless';
    return Promise.resolve(isSchnorr ? StubSchnorrAccountContractArtifact : StubEcdsaAccountContractArtifact);
  }

  createStubAccount(address: CompleteAddress, type: AccountType): Promise<Account> {
    const isSchnorr = type === 'schnorr' || type === 'schnorr_initializerless';
    return Promise.resolve(isSchnorr ? createStubSchnorrAccount(address) : createStubEcdsaAccount(address));
  }
}
