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
import { randomBytes } from '@aztec/foundation/crypto/random';
import { EcdsaRAccountContract } from '@aztec/accounts/ecdsa/lazy';
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

const PROVER_ENABLED = true;

const logger = createLogger('wallet');
const LocalStorageKey = 'aztec-account';

// This is a minimal implementation of an Aztec wallet
// WARNING: This example code stores the wallet in plain text in LocalStorage. Do not use in production without understanding the security implications
export class EmbeddedWallet extends BaseWallet {
  connectedAccount: AztecAddress | null = null;
  protected accounts: Map<string, Account> = new Map();

  protected async getAccountFromAddress(
    address: AztecAddress
  ): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      account = new SignerlessAccount();
    } else {
      account = this.accounts.get(address?.toString() ?? '');
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
  }

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
    let walletFeePaymentMethod;
    let accountFeePaymentMethodOptions;
    // The transaction does not include a fee payment method, so we set a default
    if (!feePayer) {
      const sponsoredFPCContract =
        await EmbeddedWallet.#getSponsoredPFCContract();
      walletFeePaymentMethod = new SponsoredFeePaymentMethod(
        sponsoredFPCContract.instance.address
      );
      accountFeePaymentMethodOptions = AccountFeePaymentMethodOptions.EXTERNAL;
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

  getAccounts() {
    return Promise.resolve(
      Array.from(this.accounts.values()).map((acc) => ({
        alias: '',
        item: acc.getAddress(),
      }))
    );
  }

  static async initialize(nodeUrl: string) {
    // Create Aztec Node Client
    const aztecNode = createAztecNodeClient(nodeUrl);

    // Create PXE
    const config = getPXEConfig();
    config.l1Contracts = await aztecNode.getL1ContractAddresses();
    config.proverEnabled = PROVER_ENABLED;
    const pxe = await createPXE(aztecNode, config, {});

    // Register Sponsored FPC Contract with PXE
    await pxe.registerContract(await EmbeddedWallet.#getSponsoredPFCContract());

    // Log the Node Info
    const nodeInfo = await aztecNode.getNodeInfo();
    logger.info('PXE Connected to node', nodeInfo);
    return new EmbeddedWallet(pxe, aztecNode);
  }

  // Internal method to use the Sponsored FPC Contract for fee payment
  static async #getSponsoredPFCContract() {
    const { SponsoredFPCContractArtifact } = await import(
      '@aztec/noir-contracts.js/SponsoredFPC'
    );
    const instance = await getContractInstanceFromInstantiationParams(
      SponsoredFPCContractArtifact,
      {
        salt: new Fr(SPONSORED_FPC_SALT),
      }
    );

    return {
      instance,
      artifact: SponsoredFPCContractArtifact,
    };
  }

  getConnectedAccount() {
    if (!this.connectedAccount) {
      return null;
    }
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
    const contract = new EcdsaRAccountContract(signingKey);
    const accountManager = await AccountManager.create(
      this,
      secretKey,
      contract,
      salt
    );

    // Deploy the account
    const deployMethod = await accountManager.getDeployMethod();
    const sponsoredPFCContract =
      await EmbeddedWallet.#getSponsoredPFCContract();
    const deployOpts: DeployAccountOptions<InteractionWaitOptions> = {
      from: AztecAddress.ZERO,
      fee: {
        paymentMethod: new SponsoredFeePaymentMethod(
          sponsoredPFCContract.instance.address
        ),
      },
      skipClassPublication: true,
      skipInstancePublication: true,
      wait: { timeout: 120 },
    };

    const receipt = await deployMethod.send(deployOpts);

    logger.info('Account deployed', receipt);

    // Store the account in local storage
    localStorage.setItem(
      LocalStorageKey,
      JSON.stringify({
        address: accountManager.address.toString(),
        signingKey: signingKey.toString('hex'),
        secretKey: secretKey.toString(),
        salt: salt.toString(),
      })
    );

    // Register the account with PXE
    await this.registerAccount(accountManager);
    this.accounts.set(
      accountManager.address.toString(),
      await accountManager.getAccount()
    );
    this.connectedAccount = accountManager.address;
    return this.connectedAccount;
  }

  async connectExistingAccount() {
    // Read key from local storage and create the account
    const account = localStorage.getItem(LocalStorageKey);
    if (!account) {
      return null;
    }
    const parsed = JSON.parse(account);

    const contract = new EcdsaRAccountContract(
      Buffer.from(parsed.signingKey, 'hex')
    );
    const accountManager = await AccountManager.create(
      this,
      Fr.fromString(parsed.secretKey),
      contract,
      Fr.fromString(parsed.salt)
    );

    await this.registerAccount(accountManager);
    this.accounts.set(
      accountManager.address.toString(),
      await accountManager.getAccount()
    );
    this.connectedAccount = accountManager.address;
    return this.connectedAccount;
  }

  /**
   * Creates a stub account that impersonates the given address, allowing kernelless simulations
   * to bypass the account's authorization mechanisms via contract overrides.
   * @param address - The address of the account to impersonate
   * @returns The stub account, contract instance, and artifact for simulation
   */
  private async getFakeAccountDataFor(address: AztecAddress) {
    const originalAccount = await this.getAccountFromAddress(address);
    // Account contracts can only be overridden if they have an associated address
    // Overwriting SignerlessAccount is not supported, and does not really make sense
    // since it has no authorization mechanism.
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
    return {
      account: stubAccount,
      instance,
      artifact: StubAccountContractArtifact,
    };
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
    return this.pxe.simulateTx(
      txRequest,
      true /* simulatePublic */,
      true,
      true,
      {
        contracts: contractOverrides,
      }
    );
  }
}
