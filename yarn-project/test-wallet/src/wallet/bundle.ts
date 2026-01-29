import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub';
import { type Account, SignerlessAccount } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { Fq, Fr } from '@aztec/aztec.js/fields';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AccountManager } from '@aztec/aztec.js/wallet';
import { type PXEConfig, type PXECreationOptions, createPXE, getPXEConfig } from '@aztec/pxe/client/bundle';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { BaseTestWallet } from './test_wallet.js';

/**
 * A TestWallet implementation that loads the account contract artifacts eagerly
 * Note that the only difference from `lazy` and `server` test wallets is that it uses the `createPXE` function
 * from the `pxe/client/bundle` package.
 */
export class TestWallet extends BaseTestWallet {
  static async create(
    node: AztecNode,
    overridePXEConfig?: Partial<PXEConfig>,
    options: PXECreationOptions = { loggers: {} },
  ): Promise<TestWallet> {
    // Allow proverEnabled to be auto-detected from node if not explicitly set
    const pxeConfig = {
      ...getPXEConfig(),
      ...overridePXEConfig,
    };
    const pxe = await createPXE(node, pxeConfig, options);
    return new TestWallet(pxe, node);
  }

  createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq): Promise<AccountManager> {
    signingKey = signingKey ?? deriveSigningKey(secret);
    const accountData = {
      secret,
      salt,
      contract: new SchnorrAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaRAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaKAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  /**
   * Creates a stub account that impersonates the given address, allowing kernelless simulations
   * to bypass the account's authorization mechanisms via contract overrides.
   * @param address - The address of the account to impersonate
   * @returns The stub account, contract instance, and artifact for simulation
   */
  async getFakeAccountDataFor(address: AztecAddress) {
    const originalAccount = await this.getAccountFromAddress(address);
    // Account contracts can only be overridden if they have an associated address
    // Overwriting SignerlessAccount is not supported, and does not really make sense
    // since it has no authorization mechanism.
    if (originalAccount instanceof SignerlessAccount) {
      throw new Error(`Cannot create fake account data for SignerlessAccount at address: ${address}`);
    }
    const originalAddress = (originalAccount as Account).getCompleteAddress();
    const contractInstance = await this.pxe.getContractInstance(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const stubAccount = createStubAccount(originalAddress);
    const instance = await getContractInstanceFromInstantiationParams(StubAccountContractArtifact, {
      salt: Fr.random(),
    });
    return {
      account: stubAccount,
      instance,
      artifact: StubAccountContractArtifact,
    };
  }
}
