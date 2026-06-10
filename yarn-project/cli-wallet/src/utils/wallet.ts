import { EcdsaRAccountContract, EcdsaRSSHAccountContract } from '@aztec/accounts/ecdsa';
import { StubEcdsaAccountContractArtifact, createStubEcdsaAccount } from '@aztec/accounts/ecdsa/stub';
import { SchnorrAccountContract, SchnorrInitializerlessAccountContract } from '@aztec/accounts/schnorr';
import { StubSchnorrAccountContractArtifact, createStubSchnorrAccount } from '@aztec/accounts/schnorr/stub';
import { getIdentities } from '@aztec/accounts/utils';
import { type Account, type AccountContract, NO_FROM } from '@aztec/aztec.js/account';
import {
  ContractFunctionInteraction,
  type InteractionFeeOptions,
  getContractClassFromArtifact,
  getGasLimits,
} from '@aztec/aztec.js/contracts';
import type { AztecNode } from '@aztec/aztec.js/node';
import { AccountManager, type Aliased, type SimulateOptions } from '@aztec/aztec.js/wallet';
import { TxSimulationResultWithAppOffset } from '@aztec/aztec.js/wallet';
import type { DefaultAccountEntrypointOptions } from '@aztec/entrypoints/account';
import { DefaultEntrypoint } from '@aztec/entrypoints/default';
import { poseidon2Hash } from '@aztec/foundation/crypto/poseidon';
import { Fr } from '@aztec/foundation/curves/bn254';
import type { LogFn } from '@aztec/foundation/log';
import type { NotesFilter } from '@aztec/pxe/client/lazy';
import type { PXEConfig } from '@aztec/pxe/config';
import type { PXE } from '@aztec/pxe/server';
import { createPXE, getPXEConfig } from '@aztec/pxe/server';
import { getStandardAuthRegistry } from '@aztec/standard-contracts/auth-registry';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import { NoteDao } from '@aztec/stdlib/note';
import type { SimulationOverrides, TxExecutionRequest, TxProvingResult } from '@aztec/stdlib/tx';
import { ExecutionPayload, mergeExecutionPayloads } from '@aztec/stdlib/tx';
import { BaseWallet, type SimulateViaEntrypointOptions } from '@aztec/wallet-sdk/base-wallet';

import type { WalletDB } from '../storage/wallet_db.js';
import type { AccountType } from './constants.js';
import { extractECDSAPublicKeyFromBase64String } from './ecdsa.js';
import { printGasEstimates } from './options/fees.js';

export class CLIWallet extends BaseWallet {
  private accountCache = new Map<string, Account>();
  // Stub class ids, populated on wallet startup
  // to avoid redundant work per simulation
  private stubClassIds = new Map<AccountType, Fr>();

  constructor(
    pxe: PXE,
    node: AztecNode,
    private userLog: LogFn,
    private db?: WalletDB,
  ) {
    super(pxe, node);
    this.cancellableTransactions = true;
  }

  static async create(
    node: AztecNode,
    log: LogFn,
    db?: WalletDB,
    overridePXEConfig?: Partial<PXEConfig>,
  ): Promise<CLIWallet> {
    const pxeConfig = Object.assign(getPXEConfig(), overridePXEConfig);
    const pxe = await createPXE(node, pxeConfig);
    const wallet = new CLIWallet(pxe, node, log, db);
    await wallet.initStubClasses();
    await wallet.registerAuthRegistry();
    return wallet;
  }

  private async registerAuthRegistry(): Promise<void> {
    const { instance, artifact } = await getStandardAuthRegistry();
    await this.pxe.registerContract({ instance, artifact });
  }

  /**
   * Hashes and registers the stub class for every supported account type with PXE, populating
   * stubClassIds. Called on wallet initialization.
   */
  private async initStubClasses(): Promise<void> {
    const { id: schnorrClassId } = await getContractClassFromArtifact(StubSchnorrAccountContractArtifact);
    await this.pxe.registerContractClass(StubSchnorrAccountContractArtifact);

    // ecdsa stubs share the same class id
    const { id: ecdsaClassId } = await getContractClassFromArtifact(StubEcdsaAccountContractArtifact);
    await this.pxe.registerContractClass(StubEcdsaAccountContractArtifact);

    this.stubClassIds.set('schnorr', schnorrClassId);
    this.stubClassIds.set('schnorr_initializerless', schnorrClassId);
    this.stubClassIds.set('ecdsasecp256k1', ecdsaClassId);
    this.stubClassIds.set('ecdsasecp256r1', ecdsaClassId);
    this.stubClassIds.set('ecdsasecp256r1ssh', ecdsaClassId);
  }

  override async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    const accounts = (await this.db?.listAliases('accounts')) ?? [];
    return Promise.resolve(
      accounts.map(({ key, value }) => {
        const alias = key.includes(':') ? key.slice(key.indexOf(':') + 1) : key;
        return { alias, item: AztecAddress.fromString(value) };
      }),
    );
  }

  private async createCancellationTxExecutionRequest(
    from: AztecAddress,
    txNonce: Fr,
    increasedFee: InteractionFeeOptions,
  ) {
    const executionPayload = ExecutionPayload.empty();
    const feeOptions = await this.completeFeeOptions({
      from,
      feePayer: executionPayload.feePayer,
      gasSettings: increasedFee.gasSettings,
    });
    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const fromAccount = await this.getAccountFromAddress(from);
    const chainInfo = await this.getChainInfo();
    const executionOptions: DefaultAccountEntrypointOptions = {
      txNonce,
      cancellable: this.cancellableTransactions,
      // If from is an address, feeOptions include the way the account contract should handle the fee payment
      feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions!,
    };
    return await fromAccount.createTxExecutionRequest(
      feeExecutionPayload ?? executionPayload,
      feeOptions.gasSettings,
      chainInfo,
      executionOptions,
    );
  }

  async proveCancellationTx(
    from: AztecAddress,
    txNonce: Fr,
    increasedFee: InteractionFeeOptions,
  ): Promise<TxProvingResult> {
    const cancellationTxRequest = await this.createCancellationTxExecutionRequest(from, txNonce, increasedFee);
    return await this.pxe.proveTx(cancellationTxRequest, { scopes: this.scopesFrom(from), senderForTags: from });
  }

  override async getAccountFromAddress(address: AztecAddress) {
    let account: Account | undefined;
    if (this.accountCache.has(address.toString())) {
      return this.accountCache.get(address.toString())!;
    } else {
      const accountManager = await this.createOrRetrieveAccount(address);
      account = await accountManager.getAccount();
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }
    return account;
  }

  private async createAccount(
    secret: Fr,
    salt: Fr,
    contract: AccountContract,
    isInitializerless = false,
  ): Promise<AccountManager> {
    const init = isInitializerless ? await contract.getInitializationFunctionAndArgs() : undefined;
    const immutablesHash = init ? await poseidon2Hash(init.constructorArgs) : undefined;

    const accountManager = await AccountManager.create(this, secret, contract, { salt, immutablesHash });

    const instance = accountManager.getInstance();
    const artifact = await contract.getContractArtifact();

    await this.registerContract(instance, artifact, secret);
    this.accountCache.set(accountManager.address.toString(), await accountManager.getAccount());

    if (init) {
      const constructorAbi = artifact.functions.find(f => f.name === init.constructorName);
      if (!constructorAbi) {
        throw new Error('Could not create SchnorrInitializerlessAccount: constructor ABI not found');
      }
      const storeCall = new ContractFunctionInteraction(this, instance.address, constructorAbi, init.constructorArgs);
      await storeCall.simulate({ from: instance.address });
    }

    return accountManager;
  }

  async createOrRetrieveAccount(
    address?: AztecAddress,
    secretKey?: Fr,
    type: AccountType = 'schnorr',
    salt?: Fr,
    publicKey?: string,
  ): Promise<AccountManager> {
    let account;

    salt ??= Fr.ZERO;

    if (this.db && address) {
      ({ type, secretKey, salt } = await this.db.retrieveAccount(address));
    }

    if (!secretKey) {
      throw new Error('Cannot retrieve/create wallet without secret key');
    }

    switch (type) {
      case 'schnorr': {
        account = await this.createAccount(secretKey, salt, new SchnorrAccountContract(deriveSigningKey(secretKey)));
        break;
      }
      case 'schnorr_initializerless': {
        account = await this.createAccount(
          secretKey,
          salt,
          new SchnorrInitializerlessAccountContract(deriveSigningKey(secretKey)),
          true,
        );
        break;
      }
      case 'ecdsasecp256r1': {
        account = await this.createAccount(
          secretKey,
          salt,
          new EcdsaRAccountContract(deriveSigningKey(secretKey).toBuffer()),
        );
        break;
      }
      case 'ecdsasecp256r1ssh': {
        let publicSigningKey;
        if (this.db && address) {
          publicSigningKey = await this.db.retrieveAccountMetadata(address, 'publicSigningKey');
        } else if (publicKey) {
          const identities = await getIdentities();
          const foundIdentity = identities.find(
            identity => identity.type === 'ecdsa-sha2-nistp256' && identity.publicKey === publicKey,
          );
          if (!foundIdentity) {
            throw new Error(`Identity for public key ${publicKey} not found in the SSH agent`);
          }
          publicSigningKey = extractECDSAPublicKeyFromBase64String(foundIdentity.publicKey);
        } else {
          throw new Error('Public key must be provided for ECDSA SSH account');
        }
        account = await this.createAccount(secretKey, salt, new EcdsaRSSHAccountContract(publicSigningKey));
        break;
      }
      default: {
        throw new Error(`Unsupported account type: ${type}`);
      }
    }

    return account;
  }

  /**
   * Creates a stub account that impersonates the given address, allowing kernelless simulations
   * to bypass the account's authorization mechanisms via contract overrides.
   * @param address - The address of the account to impersonate
   * @returns The stub account, contract instance, and artifact for simulation
   */
  private async getFakeAccountDataFor(address: AztecAddress) {
    const originalAccount = await this.getAccountFromAddress(address);
    const originalAddress = originalAccount.getCompleteAddress();
    const contractInstance = await this.pxe.getContractInstance(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const { type } = await this.db!.retrieveAccount(address);
    const stubAccount =
      type === 'schnorr' || type === 'schnorr_initializerless'
        ? createStubSchnorrAccount(originalAddress)
        : createStubEcdsaAccount(originalAddress);
    const stubClassId = this.stubClassIds.get(type);
    if (!stubClassId) {
      throw new Error(
        `Stub class for account type '${type}' was not registered at wallet init. This is a bug — initStubClasses should cover every supported AccountType.`,
      );
    }
    const instance = { ...contractInstance, currentContractClassId: stubClassId };
    return { account: stubAccount, instance };
  }

  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateOptions,
  ): Promise<TxSimulationResultWithAppOffset> {
    const simulationResults = await super.simulateTx(executionPayload, opts);

    if (opts.fee?.estimateGas) {
      const feeOptions = await this.completeFeeOptions({
        from: opts.from,
        feePayer: executionPayload.feePayer,
        gasSettings: opts.fee?.gasSettings,
      });
      const limits = getGasLimits(simulationResults, opts.fee?.estimatedGasPadding);
      printGasEstimates(feeOptions, limits, this.userLog);
    }
    return simulationResults;
  }

  /**
   * Uses a stub account for kernelless simulation, bypassing real account authorization.
   * Uses DefaultEntrypoint directly for NO_FROM transactions.
   */
  protected override async simulateViaEntrypoint(
    executionPayload: ExecutionPayload,
    opts: SimulateViaEntrypointOptions,
  ): Promise<TxSimulationResultWithAppOffset> {
    const { from, feeOptions, additionalScopes, sendMessagesAs } = opts;
    const scopes = this.scopesFrom(from, additionalScopes);
    const feeExecutionPayload = await feeOptions.walletFeePaymentMethod?.getExecutionPayload();
    const finalExecutionPayload = feeExecutionPayload
      ? mergeExecutionPayloads([feeExecutionPayload, executionPayload])
      : executionPayload;
    const chainInfo = await this.getChainInfo();

    let overrides: SimulationOverrides | undefined;
    let txRequest: TxExecutionRequest;
    if (from === NO_FROM) {
      const entrypoint = new DefaultEntrypoint();
      txRequest = await entrypoint.createTxExecutionRequest(finalExecutionPayload, feeOptions.gasSettings, chainInfo);
    } else {
      const { account, instance } = await this.getFakeAccountDataFor(from);
      overrides = {
        contracts: { [from.toString()]: { instance } },
      };
      const executionOptions: DefaultAccountEntrypointOptions = {
        txNonce: Fr.random(),
        cancellable: this.cancellableTransactions,
        // If from is an address, feeOptions include the way the account contract should handle the fee payment
        feePaymentMethodOptions: feeOptions.accountFeePaymentMethodOptions!,
      };
      txRequest = await account.createTxExecutionRequest(
        finalExecutionPayload,
        feeOptions.gasSettings,
        chainInfo,
        executionOptions,
      );
    }

    const result = await this.pxe.simulateTx(txRequest, {
      simulatePublic: true,
      skipFeeEnforcement: true,
      skipTxValidation: true,
      overrides,
      scopes,
      senderForTags: this.senderForTagsFrom(from, sendMessagesAs),
    });
    const appCallOffset = await this.computeAppCallOffset(from, feeOptions);
    return TxSimulationResultWithAppOffset.fromResultAndOffset(result, appCallOffset);
  }

  // Exposed because of the `aztec-wallet get-tx` command. It has been decided that it's fine to keep around because
  // this is just a CLI wallet.
  getContracts(): Promise<AztecAddress[]> {
    return this.pxe.getContracts();
  }

  // Exposed because of the `aztec-wallet get-tx` command. It has been decided that it's fine to keep around because
  // this is just a CLI wallet.
  getNotes(filter: NotesFilter): Promise<NoteDao[]> {
    return this.pxe.debug.getNotes(filter);
  }

  // Exposed because of the `aztec-wallet get-tx` command. It has been decided that it's fine to keep around because
  // this is just a CLI wallet.
  getContractArtifact(id: Fr) {
    return this.pxe.getContractArtifact(id);
  }
}
