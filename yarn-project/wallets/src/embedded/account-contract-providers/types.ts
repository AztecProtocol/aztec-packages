import type { Account, AccountContract } from '@aztec/aztec.js/account';
import type { Fq } from '@aztec/foundation/curves/bn254';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import type { CompleteAddress } from '@aztec/stdlib/contract';

/**
 * Provides account contract implementations and stub accounts for the EmbeddedWallet.
 * Two implementations exist:
 * - LazyAccountContractsProvider: uses dynamic imports for browser environments
 * - EagerAccountContractsProvider: uses static imports for Node.js environments
 */
export interface AccountContractsProvider {
  getSchnorrAccountContract(signingKey: Fq): Promise<AccountContract>;
  getEcdsaRAccountContract(signingKey: Buffer): Promise<AccountContract>;
  getEcdsaKAccountContract(signingKey: Buffer): Promise<AccountContract>;
  getStubAccountContractArtifact(): Promise<ContractArtifact>;
  createStubAccount(address: CompleteAddress): Promise<Account>;
}
