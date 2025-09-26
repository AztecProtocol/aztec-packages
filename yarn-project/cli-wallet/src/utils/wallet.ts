import { EcdsaRAccountContract, EcdsaRSSHAccountContract } from '@aztec/accounts/ecdsa';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr';
import { StubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub';
import { getIdentities } from '@aztec/accounts/utils';
import {
  type Account,
  type AccountContract,
  AccountManager,
  type Aliased,
  BaseWallet,
  SignerlessAccount,
  type SimulateMethodOptions,
  UniqueNote,
  getContractInstanceFromInstantiationParams,
  getGasLimits,
} from '@aztec/aztec.js';
import type { FeeOptions } from '@aztec/entrypoints/interfaces';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fr } from '@aztec/foundation/fields';
import type { LogFn } from '@aztec/foundation/log';
import type { PXEServiceConfig } from '@aztec/pxe/config';
import { createPXEService, getPXEServiceConfig } from '@aztec/pxe/server';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import type { AztecNode, PXE } from '@aztec/stdlib/interfaces/client';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import type { NotesFilter } from '@aztec/stdlib/note';
import type { TxExecutionRequest, TxProvingResult, TxSimulationResult } from '@aztec/stdlib/tx';

import type { WalletDB } from '../storage/wallet_db.js';
import { extractECDSAPublicKeyFromBase64String } from './ecdsa.js';
import { printGasEstimates } from './options/fees.js';

export const AccountTypes = ['schnorr', 'ecdsasecp256r1', 'ecdsasecp256r1ssh', 'ecdsasecp256k1'] as const;
export type AccountType = (typeof AccountTypes)[number];

export class CLIWallet extends BaseWallet {
  constructor(
    pxe: PXE,
    node: AztecNode,
    private userLog: LogFn,
    private db?: WalletDB,
  ) {
    super(pxe, node);
  }

  static async create(
    node: AztecNode,
    log: LogFn,
    db?: WalletDB,
    overridePXEServiceConfig?: Partial<PXEServiceConfig>,
  ): Promise<CLIWallet> {
    const pxeConfig = Object.assign(getPXEServiceConfig(), overridePXEServiceConfig);
    const pxe = await createPXEService(node, pxeConfig);
    return new CLIWallet(pxe, node, log, db);
  }

  override async getAccounts(): Promise<Aliased<AztecAddress>[]> {
    const accounts = (await this.db?.listAliases('accounts')) ?? [];
    return Promise.resolve(accounts.map(({ key, value }) => ({ alias: value, item: AztecAddress.fromString(key) })));
  }

  override async createTxExecutionRequestFromPayloadAndFee(
    executionPayload: ExecutionPayload,
    from: AztecAddress,
    feeOptions: FeeOptions,
  ): Promise<TxExecutionRequest> {
    const executionOptions = { txNonce: Fr.random(), cancellable: true };
    const fromAccount = await this.getAccountFromAddress(from);
    return fromAccount.createTxExecutionRequest(executionPayload, feeOptions, executionOptions);
  }

  private async createCancellationTxExecutionRequest(from: AztecAddress, txNonce: Fr, increasedFee: FeeOptions) {
    const executionOptions = { txNonce, cancellable: true };
    const fromAccount = await this.getAccountFromAddress(from);
    return await fromAccount.createTxExecutionRequest(ExecutionPayload.empty(), increasedFee, executionOptions);
  }

  async proveCancellationTx(from: AztecAddress, txNonce: Fr, increasedFee: FeeOptions): Promise<TxProvingResult> {
    const cancellationTxRequest = await this.createCancellationTxExecutionRequest(from, txNonce, increasedFee);
    return await this.pxe.proveTx(cancellationTxRequest);
  }

  override async getAccountFromAddress(address: AztecAddress) {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const chainInfo = await this.getChainInfo();
      account = new SignerlessAccount(
        new DefaultMultiCallEntrypoint(chainInfo.chainId.toNumber(), chainInfo.version.toNumber()),
      );
    } else {
      const accountManager = await this.createOrRetrieveAccount(address);
      account = await accountManager.getAccount();
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }
    return account;
  }

  private async createAccount(secret: Fr, salt: Fr, contract: AccountContract): Promise<AccountManager> {
    const accountManager = await AccountManager.create(this, this.pxe, secret, contract, salt);

    await accountManager.register();
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

  private async getFakeAccountDataFor(address: AztecAddress) {
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

  override async simulateTx(
    executionPayload: ExecutionPayload,
    opts: SimulateMethodOptions,
  ): Promise<TxSimulationResult> {
    let simulationResults;
    let fee;
    const executionOptions = { txNonce: Fr.random(), cancellable: true };
    // Kernelless simulations using the multicall entrypoing are not currently supported,
    // since we only override proper account contracts.
    // TODO: allow disabling kernels even when no overrides are necessary
    if (opts.from.equals(AztecAddress.ZERO)) {
      const fromAccount = await this.getAccountFromAddress(opts.from);
      fee = opts.fee?.estimateGas
        ? await this.getFeeOptionsForGasEstimation(opts.from, opts.fee)
        : await this.getDefaultFeeOptions(opts.from, opts.fee);
      const txRequest = await fromAccount.createTxExecutionRequest(executionPayload, fee, executionOptions);
      simulationResults = await this.pxe.simulateTx(
        txRequest,
        true /* simulatePublic */,
        opts?.skipTxValidation,
        opts?.skipFeeEnforcement ?? true,
      );
    } else {
      const { account: fromAccount, instance, artifact } = await this.getFakeAccountDataFor(opts.from);
      fee = opts.fee?.estimateGas
        ? await this.getFeeOptionsForGasEstimation(opts.from, opts.fee)
        : await this.getDefaultFeeOptions(opts.from, opts.fee);
      const txRequest = await fromAccount.createTxExecutionRequest(executionPayload, fee, executionOptions);
      const contractOverrides = {
        [opts.from.toString()]: { instance, artifact },
      };
      simulationResults = await this.pxe.simulateTx(txRequest, true /* simulatePublic */, true, true, {
        contracts: contractOverrides,
      });
    }
    const limits = getGasLimits(simulationResults, opts.fee?.estimatedGasPadding);
    printGasEstimates(fee, limits, this.userLog);
    return simulationResults;
  }

  // Exposed because of the `aztec-wallet get-tx` command. It has been decided that it's fine to keep around because
  // this is just a CLI wallet.
  getContracts(): Promise<AztecAddress[]> {
    return this.pxe.getContracts();
  }

  // Exposed because of the `aztec-wallet get-tx` command. It has been decided that it's fine to keep around because
  // this is just a CLI wallet.
  getNotes(filter: NotesFilter): Promise<UniqueNote[]> {
    return this.pxe.getNotes(filter);
  }
}
