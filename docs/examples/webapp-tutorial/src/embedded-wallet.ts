// docs:start:embedded-wallet-imports
import { NO_FROM } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import { getContractInstanceFromInstantiationParams } from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { AccountFeePaymentMethodOptions } from '@aztec/entrypoints/account';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import type { ContractArtifact } from '@aztec/stdlib/abi';
import { type CompleteFeeOptionsConfig, type FeeOptions } from '@aztec/wallet-sdk/base-wallet';
import { EmbeddedWallet as BaseEmbeddedWallet } from '@aztec/wallets/embedded';
// docs:end:embedded-wallet-imports

// docs:start:embedded-wallet-class
/**
 * A tutorial wallet for local development.
 * Extends the official EmbeddedWallet to add SponsoredFPC fee payment
 * so users don't need to hold fee tokens.
 *
 * Inherits from the SDK's EmbeddedWallet which provides:
 * - Account creation and persistence via WalletDB
 * - Pre-simulation with gas estimation in sendTx
 * - Automatic authwitness generation
 * - Stub-account simulation (no expensive kernel proving)
 */
export class EmbeddedWallet extends BaseEmbeddedWallet {
  connectedAccount: AztecAddress | null = null;

  // docs:start:fee-options
  /**
   * Uses SponsoredFPC for fee payment by default, so users
   * don't need to hold fee tokens.
   */
  override async completeFeeOptions(config: CompleteFeeOptionsConfig): Promise<FeeOptions> {
    // Let the base wallet compute gas settings, fee padding and account options.
    const feeOptions = await super.completeFeeOptions(config);

    // If the caller already provided a fee payer, respect their choice.
    if (config.feePayer) {
      return feeOptions;
    }

    // Otherwise default to SponsoredFPC so users don't need to hold fee tokens.
    const fpc = await EmbeddedWallet.#getSponsoredFPCContract();
    return {
      ...feeOptions,
      walletFeePaymentMethod: new SponsoredFeePaymentMethod(fpc.instance.address),
      // The SponsoredFPC method is external to any account paying for itself.
      accountFeePaymentMethodOptions:
        config.from !== NO_FROM
          ? AccountFeePaymentMethodOptions.EXTERNAL
          : feeOptions.accountFeePaymentMethodOptions,
    };
  }
  // docs:end:fee-options

  // docs:start:initialize
  /**
   * Creates a new EmbeddedWallet connected to the given Aztec node URL.
   * Sets up an in-browser PXE and registers the SponsoredFPC contract.
   */
  static async initialize(nodeUrl: string) {
    const isLocal =
      nodeUrl.includes('localhost') || nodeUrl.includes('127.0.0.1');
    const wallet = await EmbeddedWallet.create(nodeUrl, {
      ephemeral: true,
      pxeConfig: { proverEnabled: !isLocal },
    });

    // Register SponsoredFPC so we can pay fees
    const fpc = await EmbeddedWallet.#getSponsoredFPCContract();
    await wallet.registerContract(fpc.instance, fpc.artifact);

    return wallet;
  }
  // docs:end:initialize

  static async #getSponsoredFPCContract() {
    const { SponsoredFPCContractArtifact } = await import(
      '@aztec/noir-contracts.js/SponsoredFPC'
    );
    const instance = await getContractInstanceFromInstantiationParams(
      SponsoredFPCContractArtifact,
      { salt: new Fr(SPONSORED_FPC_SALT) },
    );
    return { instance, artifact: SponsoredFPCContractArtifact };
  }

  getConnectedAccount() {
    return this.connectedAccount;
  }

  // docs:start:connect-test-account
  /**
   * Connects one of the pre-deployed test accounts available on the local network.
   * Uses the inherited createSchnorrAccount which handles account creation,
   * contract registration, and WalletDB persistence.
   */
  async connectTestAccount(index: number) {
    const testAccounts = await getInitialTestAccountsData();
    const accountData = testAccounts[index];

    const accountManager = await this.createSchnorrAccount(
      accountData.secret,
      accountData.salt,
      accountData.signingKey,
    );

    this.connectedAccount = accountManager.address;
    return this.connectedAccount;
  }
  // docs:end:connect-test-account

  /**
   * Fetches a contract instance from the Aztec node (onchain) and registers it
   * with this wallet's PXE. Required before calling private functions on contracts
   * deployed by another wallet/PXE.
   */
  async registerContractFromNode(
    address: AztecAddress,
    artifact: ContractArtifact,
  ) {
    const instance = await this.aztecNode.getContract(address);
    if (!instance) {
      throw new Error(`Contract not found onchain at ${address}`);
    }
    await this.registerContract(instance, artifact);
  }
  // docs:end:embedded-wallet-class
}
