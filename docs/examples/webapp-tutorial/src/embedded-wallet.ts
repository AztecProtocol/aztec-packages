// docs:start:embedded-wallet
import { Account, SignerlessAccount } from '@aztec/aztec.js/account';
import { AztecAddress } from '@aztec/aztec.js/addresses';
import {
  getContractInstanceFromInstantiationParams,
  InteractionWaitOptions,
} from '@aztec/aztec.js/contracts';
import { SponsoredFeePaymentMethod } from '@aztec/aztec.js/fee';
import { Fr } from '@aztec/aztec.js/fields';
import { createLogger } from '@aztec/aztec.js/log';
import { createAztecNodeClient } from '@aztec/aztec.js/node';
import {
  AccountManager,
  DeployAccountOptions,
  SimulateOptions,
} from '@aztec/aztec.js/wallet';
import { type FeeOptions, BaseWallet } from '@aztec/wallet-sdk/base-wallet';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import type { FieldsOf } from '@aztec/foundation/types';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr/lazy';
import { getPXEConfig } from '@aztec/pxe/config';
import { createPXE } from '@aztec/pxe/client/lazy';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import {
  getStubAccountContractArtifact,
  createStubAccount,
} from '@aztec/accounts/stub/lazy';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';
import { TxSimulationResult } from '@aztec/stdlib/tx';
import { GasSettings } from '@aztec/stdlib/gas';
import {
  AccountFeePaymentMethodOptions,
  DefaultAccountEntrypointOptions,
} from '@aztec/entrypoints/account';

const logger = createLogger('embedded-wallet');

// docs:start:embedded-wallet-class
/**
 * A minimal in-browser wallet for local development.
 * Extends BaseWallet from the wallet-sdk to provide account management
 * and sponsored fee payment via the SponsoredFPC contract.
 *
 * WARNING: This stores keys in plain text in localStorage.
 * Do not use in production without understanding the security implications.
 */
export class EmbeddedWallet extends BaseWallet {
  connectedAccount: AztecAddress | null = null;
  protected accounts: Map<string, Account> = new Map();

  protected async getAccountFromAddress(
    address: AztecAddress
  ): Promise<Account> {
    if (address.equals(AztecAddress.ZERO)) {
      return new SignerlessAccount();
    }
    const account = this.accounts.get(address?.toString() ?? '');
    if (!account) {
      throw new Error(`Account not found for address: ${address}`);
    }
    return account;
  }

  // docs:start:fee-options
  /**
   * Uses SponsoredFPC for fee payment by default, so users
   * don't need to hold fee tokens.
   */
  override async completeFeeOptions(
    from: AztecAddress,
    feePayer?: AztecAddress,
    gasSettings?: Partial<FieldsOf<GasSettings>>
  ): Promise<FeeOptions> {
    const maxFeesPerGas =
      gasSettings?.maxFeesPerGas ??
      (await this.aztecNode.getCurrentMinFees()).mul(1 + this.minFeePadding);

    let walletFeePaymentMethod;
    let accountFeePaymentMethodOptions;

    if (!feePayer) {
      const sponsoredFPCContract =
        await EmbeddedWallet.#getSponsoredFPCContract();
      walletFeePaymentMethod = new SponsoredFeePaymentMethod(
        sponsoredFPCContract.instance.address
      );
      accountFeePaymentMethodOptions = AccountFeePaymentMethodOptions.EXTERNAL;
    } else {
      accountFeePaymentMethodOptions = from.equals(feePayer)
        ? AccountFeePaymentMethodOptions.FEE_JUICE_WITH_CLAIM
        : AccountFeePaymentMethodOptions.EXTERNAL;
    }

    const fullGasSettings = GasSettings.default({
      ...gasSettings,
      maxFeesPerGas,
    });

    return {
      gasSettings: fullGasSettings,
      walletFeePaymentMethod,
      accountFeePaymentMethodOptions,
    };
  }
  // docs:end:fee-options

  getAccounts() {
    return Promise.resolve(
      Array.from(this.accounts.values()).map((acc) => ({
        alias: '',
        item: acc.getAddress(),
      }))
    );
  }

  // docs:start:initialize
  /**
   * Creates a new EmbeddedWallet connected to the given Aztec node URL.
   * Sets up an in-browser PXE and registers the SponsoredFPC contract.
   */
  static async initialize(nodeUrl: string) {
    const aztecNode = createAztecNodeClient(nodeUrl);
    const config = getPXEConfig();
    config.l1Contracts = await aztecNode.getL1ContractAddresses();
    config.proverEnabled = true;
    const pxe = await createPXE(aztecNode, config, {});

    // Register SponsoredFPC so we can pay fees
    await pxe.registerContract(await EmbeddedWallet.#getSponsoredFPCContract());

    const nodeInfo = await aztecNode.getNodeInfo();
    logger.info('PXE connected to node', nodeInfo);

    return new EmbeddedWallet(pxe, aztecNode);
  }
  // docs:end:initialize

  static async #getSponsoredFPCContract() {
    const { SponsoredFPCContractArtifact } = await import(
      '@aztec/noir-contracts.js/SponsoredFPC'
    );
    const instance = await getContractInstanceFromInstantiationParams(
      SponsoredFPCContractArtifact,
      { salt: new Fr(SPONSORED_FPC_SALT) }
    );
    return { instance, artifact: SponsoredFPCContractArtifact };
  }

  getConnectedAccount() {
    return this.connectedAccount;
  }

  private async registerAccount(accountManager: AccountManager) {
    const instance = await accountManager.getInstance();
    const artifact = await accountManager
      .getAccountContract()
      .getContractArtifact();
    await this.registerContract(
      instance,
      artifact,
      accountManager.getSecretKey()
    );
  }

  // docs:start:connect-test-account
  /**
   * Connects one of the pre-deployed test accounts available on the local network.
   * These accounts are already deployed and funded — perfect for development.
   */
  async connectTestAccount(index: number) {
    const testAccounts = await getInitialTestAccountsData();
    const accountData = testAccounts[index];

    const accountManager = await AccountManager.create(
      this,
      accountData.secret,
      new SchnorrAccountContract(accountData.signingKey),
      accountData.salt
    );

    await this.registerAccount(accountManager);
    this.accounts.set(
      accountManager.address.toString(),
      await accountManager.getAccount()
    );
    this.connectedAccount = accountManager.address;
    return this.connectedAccount;
  }
  // docs:end:connect-test-account
  // docs:end:embedded-wallet-class

  private async getFakeAccountDataFor(address: AztecAddress) {
    const originalAccount = await this.getAccountFromAddress(address);
    if (originalAccount instanceof SignerlessAccount) {
      throw new Error(
        `Cannot create fake account data for SignerlessAccount at address: ${address}`
      );
    }
    const originalAddress = (originalAccount as Account).getCompleteAddress();
    const contractInstance = await this.pxe.getContractInstance(
      originalAddress.address
    );
    if (!contractInstance) {
      throw new Error(
        `No contract instance found for address: ${originalAddress.address}`
      );
    }
    const stubAccount = createStubAccount(originalAddress);
    const StubAccountContractArtifact = await getStubAccountContractArtifact();
    const instance = await getContractInstanceFromInstantiationParams(
      StubAccountContractArtifact,
      { salt: Fr.random() }
    );
    return { account: stubAccount, instance, artifact: StubAccountContractArtifact };
  }

  async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions
  ): Promise<TxSimulationResult> {
    const feeOptions = opts.fee?.estimateGas
      ? await this.completeFeeOptionsForEstimation(
          opts.from,
          executionPayload.feePayer,
          opts.fee?.gasSettings
        )
      : await this.completeFeeOptions(
          opts.from,
          executionPayload.feePayer,
          opts.fee?.gasSettings
        );
    const feeExecutionPayload =
      await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const executionOptions: DefaultAccountEntrypointOptions = {
      txNonce: Fr.random(),
      cancellable: this.cancellableTransactions,
      feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions,
    };
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const {
      account: fromAccount,
      instance,
      artifact,
    } = await this.getFakeAccountDataFor(opts.from);
    const chainInfo = await this.getChainInfo();
    const txRequest = await fromAccount.createTxExecutionRequest(
      finalExecutionPayload,
      feeOptions.gasSettings,
      chainInfo,
      executionOptions
    );
    const contractOverrides = {
      [opts.from.toString()]: { instance, artifact },
    };
    return this.pxe.simulateTx(txRequest, true, true, true, {
      contracts: contractOverrides,
    });
  }
}
// docs:end:embedded-wallet
