import { TxSenderConfig } from './config.js';
import { L1ProcessArgs as ProcessTxArgs, L1PublisherTxSender } from './l1-publisher.js';
import { UnverifiedData } from '@aztec/types';
import { createDebugLogger } from '@aztec/foundation';
import {
  GetContractReturnType,
  Hex,
  PublicClient,
  WalletClient,
  createPublicClient,
  createWalletClient,
  getAddress,
  getContract,
  http,
} from 'viem';
import { RollupAbi, UnverifiedDataEmitterAbi } from '@aztec/l1-contracts/viem';
import { PrivateKeyAccount, privateKeyToAccount } from 'viem/accounts';
import * as chains from 'viem/chains';

/**
 * Pushes transactions to the L1 rollup contract using viem.
 */
export class ViemTxSender implements L1PublisherTxSender {
  private rollupContract: GetContractReturnType<typeof RollupAbi, PublicClient, WalletClient>;
  private unverifiedDataEmitterContract: GetContractReturnType<
    typeof UnverifiedDataEmitterAbi,
    PublicClient,
    WalletClient
  >;
  private confirmations: number;
  private log = createDebugLogger('aztec:sequencer:viem-tx-sender');
  private account: PrivateKeyAccount;
  private rpcUrl: string;

  constructor(config: TxSenderConfig) {
    const {
      rpcUrl,
      publisherPrivateKey,
      rollupContract: rollupContractAddress,
      unverifiedDataEmitterContract: unverifiedDataEmitterContractAddress,
      requiredConfirmations,
    } = config;

    this.account = privateKeyToAccount('0x' + publisherPrivateKey.toString('hex') as Hex);
    this.rpcUrl = rpcUrl;

    // TODO: generalize for all networks
    const anvil = {
      ...chains.localhost,
      id: 31337,
    } as const;

    const walletClient = createWalletClient({
      account: this.account,
      chain: anvil,
      transport: http(rpcUrl),
    });

    const publicClient = createPublicClient({
      chain: anvil,
      transport: http(),
    });

    this.rollupContract = getContract({
      address: getAddress(rollupContractAddress.toString()),
      abi: RollupAbi,
      publicClient,
      walletClient,
    });
    this.unverifiedDataEmitterContract = getContract({
      address: getAddress(unverifiedDataEmitterContractAddress.toString()),
      abi: UnverifiedDataEmitterAbi,
      publicClient,
      walletClient,
    });

    this.confirmations = requiredConfirmations;
  }

  private async getChain(rpcUrl: string) {
    const publicClient = createPublicClient({
      chain: chains.mainnet,
      transport: http(rpcUrl),
    });
    const targetId = await publicClient.getChainId();
    for (const chain of Object.values(chains)) {
      if ('id' in chain) {
        if (chain.id === targetId) {
          return chain;
        }
      }
    }

    throw new Error(`Chain with id ${targetId} not found`);
  }

  getTransactionReceipt(txHash: string): Promise<{ status: boolean; transactionHash: string } | undefined> {
    // TODO: we don't use this anywhere. Do we really need this?
    throw new Error('Method not implemented.');
    return new Promise(resolve => {});
  }

  async sendProcessTx(encodedData: ProcessTxArgs): Promise<string | undefined> {
    const proof = encodedData.proof.toString('hex') as Hex;
    const input = encodedData.inputs.toString('hex') as Hex;
    const args = [proof, input] as const;
    const hash = await this.rollupContract.write.process(args, {
      account: this.account,
      chain: await this.getChain(this.rpcUrl),
    });
    console.log('hash processTx', hash);
    return hash;
  }

  async sendEmitUnverifiedDataTx(l2BlockNum: number, unverifiedData: UnverifiedData): Promise<string | undefined> {
    const args = [BigInt(l2BlockNum), unverifiedData.toBuffer().toString('hex') as Hex] as const;
    const hash = await this.unverifiedDataEmitterContract.write.emitUnverifiedData(args, {
      account: this.account,
      chain: await this.getChain(this.rpcUrl),
    });
    console.log('hash emitUnverifiedData', hash);
    return hash;
  }
}
