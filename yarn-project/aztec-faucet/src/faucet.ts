import { type ExtendedViemWalletClient, createEthereumChain, createExtendedL1Client } from '@aztec/ethereum';
import type { EthAddress } from '@aztec/foundation/eth-address';
import { createLogger } from '@aztec/foundation/log';
import { TestERC20Abi } from '@aztec/l1-artifacts';

import {
  type Account,
  type Chain,
  type GetContractReturnType,
  type HttpTransport,
  type LocalAccount,
  type WalletClient,
  getContract,
  parseEther,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';

import type { FaucetConfig, L1AssetConfig } from './config.js';

type L1Asset = {
  contract: GetContractReturnType<typeof TestERC20Abi, WalletClient<HttpTransport, Chain, Account>>;
  amount: bigint;
};

export class Faucet {
  private l1Client: ExtendedViemWalletClient;

  private dripHistory = new Map<string, Map<string, number>>();
  private l1Assets = new Map<string, L1Asset>();

  constructor(
    private config: FaucetConfig,
    private account: LocalAccount,
    private timeFn: () => number = Date.now,
    private log = createLogger('aztec:faucet'),
  ) {
    const chain = createEthereumChain(config.l1RpcUrls, config.l1ChainId);

    this.l1Client = createExtendedL1Client(config.l1RpcUrls, this.account, chain.chainInfo);
  }

  public static async create(config: FaucetConfig): Promise<Faucet> {
    if (!config.l1Mnemonic || !config.l1Mnemonic.getValue()) {
      throw new Error('Missing faucet mnemonic');
    }

    const account = mnemonicToAccount(config.l1Mnemonic.getValue(), { addressIndex: config.mnemonicAddressIndex });
    const faucet = new Faucet(config, account);

    for (const asset of config.l1Assets) {
      await faucet.addL1Asset(asset);
    }

    return faucet;
  }

  public send(to: EthAddress, assetName: string): Promise<void> {
    if (assetName.toUpperCase() === 'ETH') {
      return this.sendEth(to);
    } else {
      return this.sendERC20(to, assetName);
    }
  }

  public async sendEth(to: EthAddress): Promise<void> {
    this.checkThrottle(to, 'ETH');

    const hash = await this.l1Client.sendTransaction({
      account: this.account,
      to: to.toString(),
      value: parseEther(this.config.ethAmount),
    });
    await this.l1Client.waitForTransactionReceipt({ hash });

    this.updateThrottle(to, 'ETH');
    this.log.info(`Sent ETH ${this.config.ethAmount} to ${to} in tx ${hash}`);
  }

  public async sendERC20(to: EthAddress, assetName: string): Promise<void> {
    const asset = this.l1Assets.get(assetName);
    if (!asset) {
      throw new UnknownAsset(assetName);
    }

    this.checkThrottle(to, assetName);

    const hash = await asset.contract.write.mint([to.toString(), asset.amount]);
    await this.l1Client.waitForTransactionReceipt({ hash });

    this.updateThrottle(to, assetName);

    this.log.info(`Sent ${assetName} ${asset.amount} to ${to} in tx ${hash}`);
  }

  public async addL1Asset(l1AssetConfig: L1AssetConfig): Promise<void> {
    const contract = getContract({
      abi: TestERC20Abi,
      address: l1AssetConfig.address.toString(),
      client: this.l1Client,
    });

    const [name, owner] = await Promise.all([contract.read.name(), contract.read.owner()]);

    if (owner !== this.account.address) {
      throw new Error(
        `Owner mismatch. Expected contract ${name} to be owned by ${this.account.address}, received ${owner}`,
      );
    }

    if (
      this.l1Assets.has(name) &&
      this.l1Assets.get(name)!.contract.address.toLowerCase() !== l1AssetConfig.address.toString().toLowerCase()
    ) {
      this.log.warn(`Updating asset ${name} to address=${contract.address}`);
    }

    this.l1Assets.set(name, { contract, amount: l1AssetConfig.amount });
  }

  private checkThrottle(address: EthAddress, asset = 'ETH') {
    const addressHistory = this.dripHistory.get(address.toString());
    if (!addressHistory) {
      return;
    }

    const now = this.timeFn();
    const last = addressHistory.get(asset);
    if (typeof last === 'number' && last + this.config.interval > now) {
      throw new ThrottleError(address.toString(), asset);
    }
  }

  private updateThrottle(address: EthAddress, asset = 'ETH') {
    const addressStr = address.toString();
    if (!this.dripHistory.has(addressStr)) {
      this.dripHistory.set(addressStr, new Map());
    }

    const addressHistory = this.dripHistory.get(addressStr)!;
    addressHistory.set(asset, this.timeFn());
  }
}

export class ThrottleError extends Error {
  constructor(address: string, asset: string) {
    super(`Not funding ${asset}: throttled ${address}`);
  }
}

export class UnknownAsset extends Error {
  constructor(asset: string) {
    super(`Unknown asset: ${asset}`);
  }
}
