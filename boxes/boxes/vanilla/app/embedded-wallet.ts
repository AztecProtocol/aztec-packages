import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  getContractInstanceFromInstantiationParams,
  type InteractionWaitOptions,
} from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import { DeployAccountOptions } from '@aztec/aztec.js/wallet';
import type { AztecNode } from '@aztec/aztec.js/node';
import {
  type CompleteFeeOptionsConfig,
  type FeeOptions,
} from '@aztec/wallet-sdk/base-wallet';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import { AccountFeePaymentMethodOptions } from '@aztec/entrypoints/account';
import {
  EmbeddedWallet as EmbeddedWalletBase,
  type EmbeddedWalletOptions,
} from '@aztec/wallets/embedded';
import { NO_FROM } from '@aztec/aztec.js/account';

const logger = createLogger('wallet');
const LocalStorageKey = 'aztec-account';

// This is a minimal implementation of an Aztec wallet
export class EmbeddedWallet extends EmbeddedWalletBase {
  static override create<T extends EmbeddedWalletBase = EmbeddedWallet>(
    nodeOrUrl: string | AztecNode,
    options?: EmbeddedWalletOptions
  ): Promise<T> {
    return super.create<T>(nodeOrUrl, options);
  }

  connectedAccount: AztecAddress | null = null;

  /**
   * Completes partial user-provided fee options with wallet defaults.
   * This wallet will use the sponsoredFPC payment method unless otherwise stated.
   */
  override async completeFeeOptions(
    config: CompleteFeeOptionsConfig
  ): Promise<FeeOptions> {
    const { from, feePayer } = config;
    // Delegate to base for gas settings, then override with sponsored FPC if needed
    const baseFeeOptions = await super.completeFeeOptions(config);
    let { accountFeePaymentMethodOptions, walletFeePaymentMethod } =
      baseFeeOptions;
    // If from is and address and the transaction does not include a fee payment
    // method, we use the sponsoredFPC
    if (from !== NO_FROM && !feePayer) {
      accountFeePaymentMethodOptions = AccountFeePaymentMethodOptions.EXTERNAL;
      const sponsoredFPCAddress = await this.#getSponsoredFPCAddress();
      walletFeePaymentMethod = new SponsoredFeePaymentMethod(
        sponsoredFPCAddress
      );
    }
    return {
      ...baseFeeOptions,
      walletFeePaymentMethod,
      accountFeePaymentMethodOptions,
    };
  }

  // Internal method to use the Sponsored FPC Contract for fee payment
  async #getSponsoredFPCAddress() {
    const { SponsoredFPCContractArtifact } = await import(
      '@aztec/noir-contracts.js/SponsoredFPC'
    );
    const sponsoredFPCInstance =
      await getContractInstanceFromInstantiationParams(
        SponsoredFPCContractArtifact,
        {
          salt: new Fr(SPONSORED_FPC_SALT),
        }
      );
    const { instance } = await this.getContractMetadata(
      sponsoredFPCInstance.address
    );
    if (!instance) {
      await this.registerContract(
        sponsoredFPCInstance,
        SponsoredFPCContractArtifact
      );
    }

    return sponsoredFPCInstance.address;
  }

  getConnectedAccount() {
    if (!this.connectedAccount) {
      return null;
    }
    return this.connectedAccount;
  }

  async connectTestAccount(index: number) {
    const testAccounts = await getInitialTestAccountsData();
    const accountData = testAccounts[index];

    const accountManager = await this.createAndStoreAccount(
      `test-account-${index}`,
      'schnorr',
      accountData.secret,
      accountData.salt,
      accountData.signingKey.toBuffer()
    );

    this.connectedAccount = accountManager.address;

    return this.connectedAccount;
  }

  // Create a new account
  async createAccountAndConnect() {
    if (!this.pxe) {
      throw new Error('PXE not initialized');
    }

    // Generate a random salt, secret key, and signing key
    const salt = Fr.random();
    const secretKey = Fr.random();
    const signingKey = randomBytes(32);

    // Create an ECDSA account
    const accountManager = await this.createAndStoreAccount(
      `main`,
      'ecdsasecp256r1',
      secretKey,
      salt,
      signingKey
    );
    // Deploy the account
    const deployMethod = await accountManager.getDeployMethod();
    const sponsoredFPCAddress = await this.#getSponsoredFPCAddress();

    const deployOpts: DeployAccountOptions<InteractionWaitOptions> = {
      from: NO_FROM,
      fee: {
        paymentMethod: new SponsoredFeePaymentMethod(sponsoredFPCAddress),
      },
      skipClassPublication: true,
      skipInstancePublication: true,
      wait: { timeout: 120 },
    };

    const { receipt } = await deployMethod.send(deployOpts);

    logger.info('Account deployed', receipt);

    // Store the account in local storage
    localStorage.setItem(LocalStorageKey, accountManager.address.toString());

    this.connectedAccount = accountManager.address;
    return this.connectedAccount;
  }

  async connectExistingAccount() {
    // Read key from local storage and create the account
    const address = localStorage.getItem(LocalStorageKey);
    if (!address) {
      return null;
    }
    const parsed = AztecAddress.fromString(address);
    this.connectedAccount = parsed;
    return this.connectedAccount;
  }
}
