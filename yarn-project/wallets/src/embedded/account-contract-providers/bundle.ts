import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubEcdsaAccountContractArtifact, createStubEcdsaAccount } from '@aztec/accounts/stub/ecdsa';
import { StubSchnorrAccountContractArtifact, createStubSchnorrAccount } from '@aztec/accounts/stub/schnorr';
import type { Account, AccountContract } from '@aztec/aztec.js/account';
import { getStandardMultiCallEntrypoint } from '@aztec/standard-contracts/multi-call-entrypoint';
import type { Fq } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress, ContractInstanceWithAddress } from '@aztec/stdlib/contract';

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

  getEcdsaRAccountContract(signingKey: Buffer): Promise<AccountContract> {
    return Promise.resolve(new EcdsaRAccountContract(signingKey));
  }

  getEcdsaKAccountContract(signingKey: Buffer): Promise<AccountContract> {
    return Promise.resolve(new EcdsaKAccountContract(signingKey));
  }

  getStubAccountContractArtifact(type: AccountType): Promise<ContractArtifact> {
    return Promise.resolve(type === 'schnorr' ? StubSchnorrAccountContractArtifact : StubEcdsaAccountContractArtifact);
  }

  createStubAccount(address: CompleteAddress, type: AccountType): Promise<Account> {
    return Promise.resolve(type === 'schnorr' ? createStubSchnorrAccount(address) : createStubEcdsaAccount(address));
  }

  getMulticallContract(): Promise<{ instance: ContractInstanceWithAddress; artifact: ContractArtifact }> {
    return getStandardMultiCallEntrypoint();
  }
}
