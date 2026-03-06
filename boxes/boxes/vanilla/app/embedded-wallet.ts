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
import { type FeeOptions } from '@aztec/wallet-sdk/base-wallet';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import type { FieldsOf } from '@aztec/foundation/types';
import { randomBytes } from '@aztec/foundation/crypto/random';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import { GasSettings } from '@aztec/stdlib/gas';
import { AccountFeePaymentMethodOptions } from '@aztec/entrypoints/account';
import {
  EmbeddedWallet as EmbeddedWalletBase,
  type EmbeddedWalletOptions,
} from '@aztec/wallets/embedded';

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
   * @param from - The address where the transaction is being sent from
   * @param feePayer - The address paying for fees (if any fee payment method is embedded in the execution payload)
   * @param gasSettings - User-provided partial gas settings
   * @returns - Complete fee options that can be used to create a transaction execution request
   */
  override async completeFeeOptions(
    from: AztecAddress,
    feePayer?: AztecAddress,
    gasSettings?: Partial<FieldsOf<GasSettings>>
  ): Promise<FeeOptions> {
    const maxFeesPerGas =
      gasSettings?.maxFeesPerGas ??
      (await this.aztecNode.getCurrentMinFees()).mul(1 + this.minFeePadding);
    let accountFeePaymentMethodOptions;
    let walletFeePaymentMethod;
    // The transaction does not include a fee payment method, so we
    // use the sponsoredFPC
    if (!feePayer) {
      accountFeePaymentMethodOptions = AccountFeePaymentMethodOptions.EXTERNAL;
      const sponsoredFPCAddress = await this.#getSponsoredFPCAddress();

      walletFeePaymentMethod = new SponsoredFeePaymentMethod(
        sponsoredFPCAddress
      );
    } else {
      // The transaction includes fee payment method, so we check if we are the fee payer for it
      // (this can only happen if the embedded payment method is FeeJuiceWithClaim)
      accountFeePaymentMethodOptions = from.equals(feePayer)
        ? AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM
        : AccountFeePaymentMethodOptions.EXTERNAL;
    }
    const fullGasSettings: GasSettings = GasSettings.default({
      ...gasSettings,
      maxFeesPerGas,
    });
    this.log.debug(`Using L2 gas settings`, fullGasSettings);
    return {
      gasSettings: fullGasSettings,
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
      from: AztecAddress.ZERO,
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
