import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub';
import {
  AccountManager,
  type AztecAddress,
  type AztecNode,
  Fq,
  Fr,
  getContractInstanceFromInstantiationParams,
} from '@aztec/aztec.js';
import {
  type PXECreationOptions,
  type PXEServiceConfig,
  createPXEService,
  getPXEServiceConfig,
} from '@aztec/pxe/server';
import { deriveSigningKey } from '@aztec/stdlib/keys';

import { BaseTestWallet } from './test_wallet.js';

/**
 * A TestWallet implementation to be used in server settings (e.g. e2e tests).
 * Note that the only difference from `lazy` and `bundle` test wallets is that it uses the `createPXEService` function
 * from the `pxe/server` package.
 */
export class TestWallet extends BaseTestWallet {
  static async create(
    node: AztecNode,
    overridePXEServiceConfig?: Partial<PXEServiceConfig>,
    options: PXECreationOptions = { loggers: {} },
  ): Promise<TestWallet> {
    const pxeConfig = Object.assign(getPXEServiceConfig(), {
      proverEnabled: overridePXEServiceConfig?.proverEnabled ?? false,
      ...overridePXEServiceConfig,
    });
    const pxe = await createPXEService(node, pxeConfig, options);
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

  async getFakeAccountDataFor(address: AztecAddress) {
    const chainInfo = await this.getChainInfo();
    const originalAccount = await this.getAccountFromAddress(address);
    const originalAddress = originalAccount.getCompleteAddress();
    const { contractInstance } = await this.pxe.getContractMetadata(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const stubAccount = createStubAccount(originalAddress, chainInfo);
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
