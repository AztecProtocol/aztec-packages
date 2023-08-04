import { Fr, PublicKey, getContractDeploymentInfo } from '@aztec/circuits.js';
import { AztecRPC, PrivateKey } from '@aztec/types';

import { AccountWallet, ContractDeployer, Wallet, generatePublicKey } from '../index.js';
import { CompleteAddress, isCompleteAddress } from './complete_address.js';
import { DeployAccountSentTx } from './deploy_account_sent_tx.js';
import { AccountContract, Salt } from './index.js';

export class Account {
  private completeAddress?: CompleteAddress;
  private salt?: Fr;
  private encryptionPublicKey?: PublicKey;

  constructor(
    private rpc: AztecRPC,
    private encryptionPrivateKey: PrivateKey,
    private accountContract: AccountContract,
    saltOrAddress?: Salt | CompleteAddress,
  ) {
    if (isCompleteAddress(saltOrAddress)) {
      this.completeAddress = saltOrAddress;
    } else {
      this.salt = saltOrAddress ? new Fr(saltOrAddress) : Fr.random();
    }
  }

  protected async getEncryptionPublicKey() {
    if (!this.encryptionPublicKey) {
      this.encryptionPublicKey = await generatePublicKey(this.encryptionPrivateKey);
    }
    return this.encryptionPublicKey;
  }

  public async getCompleteAddress(): Promise<CompleteAddress> {
    if (!this.completeAddress) {
      const encryptionPublicKey = await generatePublicKey(this.encryptionPrivateKey);
      this.completeAddress = await getContractDeploymentInfo(
        this.accountContract.getContractAbi(),
        await this.accountContract.getDeploymentArgs(),
        this.salt!,
        encryptionPublicKey,
      );
    }
    return this.completeAddress;
  }

  public async getWallet(): Promise<Wallet> {
    const nodeInfo = await this.rpc.getNodeInfo();
    const completeAddress = await this.getCompleteAddress();
    const account = await this.accountContract.getEntrypoint(completeAddress, nodeInfo);
    return new AccountWallet(this.rpc, account);
  }

  public async register(): Promise<Wallet> {
    const { address, partialAddress } = await this.getCompleteAddress();
    await this.rpc.addAccount(this.encryptionPrivateKey, address, partialAddress);
    return this.getWallet();
  }

  public async deploy(): Promise<DeployAccountSentTx> {
    if (!this.salt) throw new Error(`Cannot deploy account contract without known salt.`);
    const wallet = await this.register();
    const encryptionPublicKey = await this.getEncryptionPublicKey();
    const deployer = new ContractDeployer(this.accountContract.getContractAbi(), this.rpc, encryptionPublicKey);
    const args = await this.accountContract.getDeploymentArgs();
    const sentTx = deployer.deploy(...args).send({ contractAddressSalt: this.salt });
    return new DeployAccountSentTx(wallet, sentTx.getTxHash());
  }
}
