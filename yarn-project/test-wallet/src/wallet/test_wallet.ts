import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import type { ContractArtifact } from '@aztec/aztec.js/abi';
import { type Account, type AccountContract, SignerlessAccount } from '@aztec/aztec.js/account';
import {
  type CallIntent,
  type ContractFunctionInteractionCallIntent,
  type IntentInnerHash,
  SetPublicAuthwitContractInteraction,
  getMessageHashFromIntent,
  lookupValidity,
} from '@aztec/aztec.js/authorization';
import { AccountManager, type SendOptions, type SimulateOptions } from '@aztec/aztec.js/wallet';
import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { Fq, Fr, GrumpkinScalar } from '@aztec/foundation/fields';
import { AuthWitness } from '@aztec/stdlib/auth-witness';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { ContractInstanceWithAddress } from '@aztec/stdlib/contract';
import type { NotesFilter, UniqueNote } from '@aztec/stdlib/note';
import type { TxSimulationResult } from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';
import { BaseWallet } from '@aztec/wallet-sdk/base-wallet';

import { ProvenTx } from '../utils.js';

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

  /**
   * Toggle for running "simulated simulations" when calling simulateTx.
   *
   * Terminology:
   * - "simulation": run private circuits normally and then run the kernel in a simulated (brillig) mode on ACVM.
   *   No kernel witnesses are generated, but protocol rules are checked.
   * - "simulated simulation": skip running kernels in ACVM altogether and emulate their behavior in TypeScript
   *   (akin to generateSimulatedProvingResult). We mutate public inputs like the kernels would and can swap in
   *   fake/private bytecode or accounts for tests. This is much faster but is not usable in situations where we
   *   need kernel witnesses.
   *
   * When this flag is true, simulateTx constructs a request using a fake account (and accepts contract overrides
   * on the input) and the PXE emulates kernel effects without generating kernel witnesses. When false, simulateTx
   * defers to the standard simulation path.
   */
  private simulatedSimulations = false;

  /** Enable the "simulated simulation" path for simulateTx. */
  enableSimulatedSimulations() {
    this.simulatedSimulations = true;
  }

  /** Disable the "simulated simulation" path for simulateTx. */
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
      account = new SignerlessAccount(chainInfo);
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

  /**
   * Creates a new account with the provided account data or generates random values and uses SchnorrAccountContract
   * if not provided.
   *
   * @param accountData - Optional account configuration containing secret, salt and account contract.
   * @returns A new AccountManager instance for the created account
   */
  async createAccount(accountData?: AccountData): Promise<AccountManager> {
    // Generate random values if not provided
    const secret = accountData?.secret ?? Fr.random();
    const salt = accountData?.salt ?? Fr.random();
    // Use SchnorrAccountContract if not provided
    const contract = accountData?.contract ?? new SchnorrAccountContract(GrumpkinScalar.random());

    const accountManager = await AccountManager.create(this, secret, contract, salt);

    const instance = accountManager.getInstance();
    const artifact = await contract.getContractArtifact();

    await this.registerContract(instance, artifact, secret);

    this.accounts.set(accountManager.address.toString(), await accountManager.getAccount());

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
    messageHashOrIntent: Fr | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
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
    messageHashOrIntent: Fr | IntentInnerHash | CallIntent | ContractFunctionInteractionCallIntent,
  ): Promise<AuthWitness> {
    const account = await this.getAccountFromAddress(from);
    const chainInfo = await this.getChainInfo();
    const messageHash = await getMessageHashFromIntent(messageHashOrIntent, chainInfo);
    return account.createAuthWit(messageHash);
  }

  abstract getFakeAccountDataFor(
    address: AztecAddress, // eslint-disable-next-line jsdoc/require-jsdoc
  ): Promise<{ account: Account; instance: ContractInstanceWithAddress; artifact: ContractArtifact }>;

  override async simulateTx(executionPayload: ExecutionPayload, opts: SimulateOptions): Promise<TxSimulationResult> {
    if (!this.simulatedSimulations) {
      return super.simulateTx(executionPayload, opts);
    } else {
      const feeOptions = opts.fee?.estimateGas
        ? await this.completeFeeOptionsForEstimation(opts.from, executionPayload.feePayer, opts.fee?.gasSettings)
        : await this.completeFeeOptions(opts.from, executionPayload.feePayer, opts.fee?.gasSettings);
      const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
      const executionOptions: DefaultAccountEntrypointOptions = {
        txNonce: Fr.random(),
        cancellable: this.cancellableTransactions,
        feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions,
      };
      const finalExecutionPayload = feeExecutionPayload
        ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
        : executionPayload;
      const { account: fromAccount, instance, artifact } = await this.getFakeAccountDataFor(opts.from);
      const txRequest = await fromAccount.createTxExecutionRequest(
        finalExecutionPayload,
        feeOptions.gasSettings,
        executionOptions,
      );
      const contractOverrides = {
        [opts.from.toString()]: { instance, artifact },
      };
      return this.pxe.simulateTx(txRequest, true /* simulatePublic */, true, true, { contracts: contractOverrides });
    }
  }

  /**
   * A utility to prove a transaction using this wallet and return it to be sent by a different entity on their own accord
   *
   * Note that this should not be used in production code since a proven transaction could be sent to a malicious
   * node to index and track. It also makes it very difficult for the wallet to keep track of the interaction.
   * @param exec - The execution payload to prove.
   * @param opts - The options to configure the interaction
   * @returns - A proven tx ready to be sent to the network
   */
  async proveTx(exec: ExecutionPayload, opts: SendOptions): Promise<ProvenTx> {
    const fee = await this.completeFeeOptions(opts.from, exec.feePayer, opts.fee?.gasSettings);
    const txRequest = await this.createTxExecutionRequestFromPayloadAndFee(exec, opts.from, fee);
    const txProvingResult = await this.pxe.proveTx(txRequest);
    return new ProvenTx(
      this.aztecNode,
      await txProvingResult.toTx(),
      txProvingResult.getOffchainEffects(),
      txProvingResult.stats,
    );
  }

  /**
   * A debugging utility to get notes based on the provided filter.
   *
   * Note that this should not be used in production code because the structure of notes is considered to be
   * an implementation detail of contracts. This is only meant to be used for debugging purposes. If you need to obtain
   * note-related information in production code, please implement a custom utility function on your contract and call
   * that function instead (e.g. `get_balance(owner: AztecAddress) -> u128` utility function on a Token contract).
   *
   * @param filter - The filter to apply to the notes.
   * @returns The requested notes.
   */
  getNotes(filter: NotesFilter): Promise<UniqueNote[]> {
    return this.pxe.getNotes(filter);
  }

  /**
   * Stops the internal job queue.
   *
   * This function is typically used when tearing down tests.
   */
  stop(): Promise<void> {
    return this.pxe.stop();
  }
}
