import {
  Fr,
  createLogger,
  createAztecNodeClient,
  AztecAddress,
  getContractInstanceFromInstantiationParams,
  SponsoredFeePaymentMethod,
  BaseWallet,
  Account,
  SignerlessAccount,
  AccountManager,
  SimulateMethodOptions,
} from '@aztec/aztec.js';
import { SPONSORED_FPC_SALT } from '@aztec/constants';
import { randomBytes } from '@aztec/foundation/crypto';
import { EcdsaRAccountContract } from '@aztec/accounts/ecdsa/lazy';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr/lazy';

import { getPXEServiceConfig } from '@aztec/pxe/config';
import { createPXEService } from '@aztec/pxe/client/lazy';
import { getInitialTestAccountsData } from '@aztec/accounts/testing/lazy';
import {
  getStubAccountContractArtifact,
  createStubAccount,
} from '@aztec/accounts/stub/lazy';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { TxProvingResult, TxSimulationResult } from '@aztec/stdlib/tx';

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
      const { l1ChainId: chainId, rollupVersion } =
        await this.pxe.getNodeInfo();
      account = new SignerlessAccount(
        new DefaultMultiCallEntrypoint(chainId, rollupVersion)
      );
    } else {
      account = this.accounts.get(address?.toString() ?? '');
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
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
    const aztecNode = await createAztecNodeClient(nodeUrl);

    // Create PXE Service
    const config = getPXEServiceConfig();
    config.l1Contracts = await aztecNode.getL1ContractAddresses();
    config.proverEnabled = PROVER_ENABLED;
    const pxe = await createPXEService(aztecNode, config, {
      useLogSuffix: true,
    });

    // Register Sponsored FPC Contract with PXE
    await pxe.registerContract(await EmbeddedWallet.#getSponsoredPFCContract());

    // Log the Node Info
    const nodeInfo = await pxe.getNodeInfo();
    logger.info('PXE Connected to node', nodeInfo);
    return new EmbeddedWallet(pxe);
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

  async connectTestAccount(index: number) {
    const testAccounts = await getInitialTestAccountsData();
    const account = testAccounts[index];

    const accountManager = await AccountManager.create(
      this,
      this.pxe,
      account.secret,
      new SchnorrAccountContract(account.signingKey),
      account.salt
    );

    await accountManager.register();
    this.accounts.set(
      accountManager.getAddress().toString(),
      await accountManager.getAccount()
    );

    this.connectedAccount = accountManager.getAddress();
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
      this.pxe,
      secretKey,
      contract,
      salt
    );

    // Deploy the account
    const deployMethod = await accountManager.getDeployMethod();
    const sponsoredPFCContract =
      await EmbeddedWallet.#getSponsoredPFCContract();
    const deployOpts = {
      from: AztecAddress.ZERO,
      contractAddressSalt: Fr.fromString(salt.toString()),
      fee: {
        paymentMethod: await accountManager.getSelfPaymentMethod(
          new SponsoredFeePaymentMethod(sponsoredPFCContract.instance.address)
        ),
      },
      universalDeploy: true,
      skipClassPublication: true,
      skipInstancePublication: true,
    };

    const provenInteraction = await deployMethod.prove(deployOpts);
    const receipt = await provenInteraction.send().wait({ timeout: 120 });

    logger.info('Account deployed', receipt);

    // Store the account in local storage
    localStorage.setItem(
      LocalStorageKey,
      JSON.stringify({
        address: accountManager.getAddress().toString(),
        signingKey: signingKey.toString('hex'),
        secretKey: secretKey.toString(),
        salt: salt.toString(),
      })
    );

    // Register the account with PXE
    await accountManager.register();
    this.accounts.set(
      accountManager.getAddress().toString(),
      await accountManager.getAccount()
    );
    this.connectedAccount = accountManager.getAddress();
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
      this.pxe,
      Fr.fromString(parsed.secretKey),
      contract,
      Fr.fromString(parsed.salt)
    );

    await accountManager.register();
    this.accounts.set(
      accountManager.getAddress().toString(),
      await accountManager.getAccount()
    );
    this.connectedAccount = accountManager.getAddress();
    return this.connectedAccount;
  }

  private async getFakeAccountDataFor(address: AztecAddress) {
    const nodeInfo = await this.pxe.getNodeInfo();
    const originalAccount = await this.getAccountFromAddress(address);
    const originalAddress = await originalAccount.getCompleteAddress();
    const { contractInstance } = await this.pxe.getContractMetadata(
      originalAddress.address
    );
    if (!contractInstance) {
      throw new Error(
        `No contract instance found for address: ${originalAddress.address}`
      );
    }
    const stubAccount = createStubAccount(originalAddress, nodeInfo);
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
    opts: SimulateMethodOptions
  ): Promise<TxSimulationResult> {
    if (!opts.fee) {
      const sponsoredPFCContract =
        await EmbeddedWallet.#getSponsoredPFCContract();
      opts.fee = {
        paymentMethod: new SponsoredFeePaymentMethod(
          sponsoredPFCContract.instance.address
        ),
      };
    }
    const executionOptions = { txNonce: Fr.random(), cancellable: false };
    const {
      account: fromAccount,
      instance,
      artifact,
    } = await this.getFakeAccountDataFor(opts.from);
    const fee = await this.getFeeOptions(
      fromAccount,
      executionPayload,
      opts.fee,
      executionOptions
    );
    const txRequest = await fromAccount.createTxExecutionRequest(
      executionPayload,
      fee,
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
      { contracts: contractOverrides }
    );
  }

  async proveTx(
    exec: ExecutionPayload,
    opts: SimulateMethodOptions
  ): Promise<TxProvingResult> {
    if (!opts.fee) {
      const sponsoredPFCContract =
        await EmbeddedWallet.#getSponsoredPFCContract();
      opts.fee = {
        paymentMethod: new SponsoredFeePaymentMethod(
          sponsoredPFCContract.instance.address
        ),
      };
    }
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(
      exec,
      opts.from,
      opts.fee
    );
    return this.pxe.proveTx(txRequest);
  }
}
