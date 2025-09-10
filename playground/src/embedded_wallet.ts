import { EcdsaKAccountContract, EcdsaRAccountContract } from '@aztec/accounts/ecdsa/lazy';
import { SchnorrAccountContract } from '@aztec/accounts/schnorr/lazy';
import { getStubAccountContractArtifact, createStubAccount } from '@aztec/accounts/stub/lazy';
import {
  type Account,
  type AccountContract,
  AccountManager,
  BaseWallet,
  SignerlessAccount,
  type SimulateMethodOptions,
  type PXE,
} from '@aztec/aztec.js';
import type { ExecutionPayload } from '@aztec/entrypoints/payload';
import { Fq, Fr } from '@aztec/foundation/fields';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { getContractInstanceFromInstantiationParams } from '@aztec/stdlib/contract';
import { deriveSigningKey } from '@aztec/stdlib/keys';
import type { TxSimulationResult } from '@aztec/stdlib/tx';
import { DefaultMultiCallEntrypoint } from '@aztec/entrypoints/multicall';
import type { WalletDB } from './utils/storage';
import { convertFromUTF8BufferAsString } from './utils/conversion';

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

export class EmbeddedWallet extends BaseWallet {


    constructor(pxe: PXE, private walletDB: WalletDB){
        super(pxe);
    }

  protected async getAccountFromAddress(address: AztecAddress): Promise<Account> {
    let account: Account | undefined;
    if (address.equals(AztecAddress.ZERO)) {
      const { l1ChainId: chainId, rollupVersion } = await this.pxe.getNodeInfo();
      account = new SignerlessAccount(new DefaultMultiCallEntrypoint(chainId, rollupVersion));
    } else {
        const { secretKey, salt, signingKey, type } = await this.walletDB.retrieveAccount(address);
        const parsedType = convertFromUTF8BufferAsString(type);

        let accountManager;
        switch(parsedType) {
            case 'schnorr': {
                accountManager = await this.createSchnorrAccount(secretKey, salt, Fq.fromBuffer(signingKey));
                break;
              }
              case 'ecdsasecp256r1': {
                accountManager = await this.createECDSARAccount(secretKey, salt, signingKey);
                break;
              }
              case 'ecdsasecp256k1': {
                accountManager = await this.createECDSAKAccount(secretKey, salt, signingKey);
                break;
              }
              default: {
                throw new Error(`Unknown account type ${parsedType}`);
              }
        }
        account = await accountManager.getAccount();
    }

    if (!account) {
      throw new Error(`Account not found in wallet for address: ${address}`);
    }

    return account;
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

    return accountManager;
  }


  createSchnorrAccount(secret: Fr, salt: Fr, signingKey?: Fq): Promise<AccountManager> {
    signingKey = signingKey ?? deriveSigningKey(secret);
    const accountData = {
      secret,
      salt,
      contract: new SchnorrAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSARAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaRAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  createECDSAKAccount(secret: Fr, salt: Fr, signingKey: Buffer): Promise<AccountManager> {
    const accountData = {
      secret,
      salt,
      contract: new EcdsaKAccountContract(signingKey),
    };
    return this.createAccount(accountData);
  }

  private async getFakeAccountDataFor(address: AztecAddress) {
    const nodeInfo = await this.pxe.getNodeInfo();
    const originalAccount = await this.getAccountFromAddress(address);
    const originalAddress = await originalAccount.getCompleteAddress();
    const { contractInstance } = await this.pxe.getContractMetadata(originalAddress.address);
    if (!contractInstance) {
      throw new Error(`No contract instance found for address: ${originalAddress.address}`);
    }
    const stubAccount = createStubAccount(originalAddress, nodeInfo);
    const StubAccountContractArtifact = await getStubAccountContractArtifact();
    const instance = await getContractInstanceFromInstantiationParams(StubAccountContractArtifact, {});
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
      const executionOptions = { txNonce: Fr.random(), cancellable: false };
      const { account: fromAccount, instance, artifact } = await this.getFakeAccountDataFor(opts.from);
      const fee = await this.getFeeOptions(fromAccount, executionPayload, opts.fee, executionOptions);
      const txRequest = await fromAccount.createTxExecutionRequest(executionPayload, fee, executionOptions);
      const contractOverrides = {
        [opts.from.toString()]: { instance, artifact },
      };
      return this.pxe.simulateTx(txRequest, true /* simulatePublic */, true, true, { contracts: contractOverrides });
  }
}
