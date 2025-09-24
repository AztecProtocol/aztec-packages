import {
  type Account,
  type AccountContract,
  AccountManager,
  BaseWallet,
  type CallIntent,
  type ContractArtifact,
  type ContractFunctionInteractionCallIntent,
  type IntentInnerHash,
  type PXE,
  SetPublicAuthwitContractInteraction,
  SignerlessAccount,
  type SimulateMethodOptions,
  getMessageHashFromIntent,
  lookupValidity,
} from '@aztec/aztec.js';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fq, Fr } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { CompleteAddress, ContractInstanceWithAddress, PartialAddress } from '@aztec/stdlib/contract';
import type { PXEInfo } from '@aztec/stdlib/interfaces/client';
import type { NotesFilter, UniqueNote } from '@aztec/stdlib/note';
import type { TxSimulationResult } from '@aztec/stdlib/tx';

/**
 * Data for generating an account.
 */
export interface AccountData {
  /**
   * Secret to derive the keys for the account.
   */
  secret: Fr;
  /**
   * Contract address salt.
   */
  salt: Fr;
  /**
   * Contract that backs the account.
   */
  contract: AccountContract;
}

/**
 * Wallet implementation that stores accounts in memory and allows allows their creation
 * from the outside (which is something actual wallets shouldn't allow!)
 * It is intended to be used in e2e tests.
 */
export abstract class BaseTestWallet extends BaseWallet {
  protected accounts: Map<string, Account> = new Map();

  private simulatedSimulations = false;

  enableSimulatedSimulations() {
    this.simulatedSimulations = true;
  }

  disableSimulatedSimulations() {
    this.simulatedSimulations = false;
  }

  setBaseFeePadding(value?: number) {
    this.baseFeePadding = value ?? 0.5;
  }

  protected async getAccountFromAddress(address: AztecAddress): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const chainInfo = await this.getChainInfo();
      account = new SignerlessAccount(
        new DefaultMultiCallEntrypoint(chainInfo.chainId.toNumber(), chainInfo.version.toNumber()),
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
    return Promise.resolve(Array.from(this.accounts.values()).map(acc => ({ alias: '', item: acc.getAddress() })));
  }

  async createAccount(accountData: AccountData): Promise<AccountManager> {
    const accountManager = await AccountManager.create(
      this,
      this.pxe,
      accountData.secret,
      accountData.contract,
      accountData.salt,
    );

    await accountManager.register();

    this.accounts.set(accountManager.getAddress().toString(), await accountManager.getAccount());

    return accountManager;
  }

  abstract createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq): Promise<AccountManager>;
  abstract createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager>;
  abstract createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager>;

  /**
   * Lookup the validity of an authwit in private and public contexts.
   *
   * Uses the chain id and version of the wallet.
   *
   * @param wallet - The wallet use to simulate and read the public data
   * @param onBehalfOf - The address of the "approver"
   * @param intent - The consumer and inner hash or the caller and action to lookup
   * @param witness - The computed authentication witness to check
   * @returns - A struct containing the validity of the authwit in private and public contexts.
   */
  lookupValidity(
    onBehalfOf: AztecAddress,
    intent: IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
    witness: AuthWitness,
  ): Promise<{
    /** boolean flag indicating if the authwit is valid in private context */
    isValidInPrivate: boolean;
    /** boolean flag indicating if the authwit is valid in public context */
    isValidInPublic: boolean;
  }> {
    return lookupValidity(this, onBehalfOf, intent, witness);
  }

  /**
   * Returns an interaction that can be used to set the authorization status
   * of an intent
   * @param from - The address authorizing/revoking the action
   * @param messageHashOrIntent - The action to authorize/revoke
   * @param authorized - Whether the action can be performed or not
   */
  public setPublicAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
    authorized: boolean,
  ): Promise<SetPublicAuthwitContractInteraction> {
    return SetPublicAuthwitContractInteraction.create(this, from, messageHashOrIntent, authorized);
  }

  /**
   * Creates and returns an authwit according the the rules
   * of the provided account. This authwit can be verified
   * by the account contract
   * @param from - The address authorizing the action
   * @param messageHashOrIntent - The action to authorize
   */
  public override async createAuthWit(
    from: AztecAddress,
    messageHashOrIntent: Fr | Buffer | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
  ): Promise<AuthWitness> {
    const account = await this.getAccountFromAddress(from);
    const chainInfo = await this.getChainInfo();
    const messageHash = await getMessageHashFromIntent(messageHashOrIntent, chainInfo);
    return account.createAuthWit(messageHash);
  }

  abstract getFakeAccountDataFor(
    address: AztecAddress, // eslint-disable-next-line jsdoc/require-jsdoc
  ): Promise<{ account: Account; instance: ContractInstanceWithAddress; artifact: ContractArtifact }>;

  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateMethodOptions,
  ): Promise<TxSimulationResult> {
    if (this.simulatedSimulations && opts.fee?.estimateGas) {
      throw new Error(
        'Simulated simulations potentially skews gas measurements, please disable this feature to estimate gas',
      );
    }
    if (!this.simulatedSimulations) {
      return super.simulateTx(executionPayload, opts);
    } else {
      const executionOptions = { txNonce: Fr.random(), cancellable: false };
      const { account: fromAccount, instance, artifact } = await this.getFakeAccountDataFor(opts.from);
      const feeOptions = opts.fee?.estimateGas
        ? await this.getFeeOptionsForGasEstimation(opts.from, opts.fee)
        : await this.getDefaultFeeOptions(opts.from, opts.fee);
      const txRequest = await fromAccount.createTxExecutionRequest(executionPayload, feeOptions, executionOptions);
      const contractOverrides = {
        [opts.from.toString()]: { instance, artifact },
      };
      return this.pxe.simulateTx(txRequest, true /* simulatePublic */, true, true, { contracts: contractOverrides });
    }
  }

  // RECENTLY ADDED TO GET RID OF PXE IN END-TO-END TESTS
  registerAccount(secretKey: Fr, partialAddress: PartialAddress): Promise<CompleteAddress> {
    return this.pxe.registerAccount(secretKey, partialAddress);
  }

  // RECENTLY ADDED TO GET RID OF PXE IN END-TO-END TESTS
  getNotes(filter: NotesFilter): Promise<UniqueNote[]> {
    return this.pxe.getNotes(filter);
  }

  // RECENTLY ADDED TO GET RID OF PXE IN END-TO-END TESTS
  // Temporary hack to be able to instantiate TestWalletInternals
  getPxe(): PXE {
    return this.pxe;
  }

  // RECENTLY ADDED TO GET RID OF PXE IN END-TO-END TESTS
  getPXEInfo(): Promise<PXEInfo> {
    return this.pxe.getPXEInfo();
  }

  // RECENTLY ADDED TO GET RID OF PXE IN END-TO-END TESTS
  getContracts(): Promise<AztecAddress[]> {
    return this.pxe.getContracts();
  }

  stop(): Promise<void> {
    return this.pxe.stop();
  }
}
