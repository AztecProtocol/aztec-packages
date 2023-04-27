import { TxSenderConfig } from './config.js';
import { L1ProcessArgs as ProcessTxArgs, L1PublisherTxSender } from './l1-publisher.js';
import { CompleteContractData, UnverifiedData } from '@aztec/types';
import { createDebugLogger } from '@aztec/foundation';
import {
  GetContractReturnType,
  Hex,
  HttpTransport,
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
  private publicClient: PublicClient<HttpTransport, chains.Chain>;

  private log = createDebugLogger('aztec:sequencer:viem-tx-sender');
  private account: PrivateKeyAccount;
  private chain: chains.Chain;

  constructor(config: TxSenderConfig) {
    const {
      rpcUrl,
      chainId,
      publisherPrivateKey,
      rollupContract: rollupContractAddress,
      unverifiedDataEmitterContract: unverifiedDataEmitterContractAddress,
    } = config;

    this.account = privateKeyToAccount(('0x' + publisherPrivateKey.toString('hex')) as Hex);

    this.chain = this.getChain(chainId);

    const walletClient = createWalletClient({
      account: this.account,
      chain: this.chain,
      transport: http(rpcUrl),
    });

    this.publicClient = createPublicClient({
      chain: this.chain,
      transport: http(),
    });

    this.rollupContract = getContract({
      address: getAddress(rollupContractAddress.toString()),
      abi: RollupAbi,
      publicClient: this.publicClient,
      walletClient,
    });
    this.unverifiedDataEmitterContract = getContract({
      address: getAddress(unverifiedDataEmitterContractAddress.toString()),
      abi: UnverifiedDataEmitterAbi,
      publicClient: this.publicClient,
      walletClient,
    });
  }

  async getTransactionReceipt(txHash: string): Promise<{ status: boolean; transactionHash: string } | undefined> {
    const receipt = await this.publicClient.getTransactionReceipt({
      hash: txHash as Hex,
    });

    // TODO: check for confirmations

    if (receipt) {
      return {
        status: receipt.status === 'success',
        transactionHash: txHash,
      };
    }

    this.log('Receipt not found for tx hash', txHash);
    return undefined;
  }

  async sendProcessTx(encodedData: ProcessTxArgs): Promise<string | undefined> {
    const args = [
      ('0x' + encodedData.proof.toString('hex')) as Hex,
      ('0x' + encodedData.inputs.toString('hex')) as Hex,
    ] as const;

    const gas = await this.rollupContract.estimateGas.process(args, {
      account: this.account,
    });

    const hash = await this.rollupContract.write.process(args, {
      account: this.account,
      chain: this.chain,
      gas,
    });
    return hash;
  }

  async sendEmitUnverifiedDataTx(l2BlockNum: number, unverifiedData: UnverifiedData): Promise<string | undefined> {
    const args = [BigInt(l2BlockNum), ('0x' + unverifiedData.toBuffer().toString('hex')) as Hex] as const;

    const gas = await this.unverifiedDataEmitterContract.estimateGas.emitUnverifiedData(args, {
      account: this.account,
    });

    const hash = await this.unverifiedDataEmitterContract.write.emitUnverifiedData(args, {
      account: this.account,
      chain: this.chain,
      gas,
    });
    return hash;
  }

  async sendEmitNewContractDataTx(
    l2BlockNum: number,
    newContractData: CompleteContractData[],
  ): Promise<string | undefined> {
    for (const contractData of newContractData) {
      const args = [
        BigInt(l2BlockNum),
        contractData.contractAddress.toString() as Hex,
        contractData.portalContractAddress.toString() as Hex,
        ('0x' + contractData.bytecode.toString('hex')) as Hex,
      ] as const;

      const gas = await this.unverifiedDataEmitterContract.estimateGas.emitContractDeployment(args, {
        account: this.account,
      });

      const hash = await this.unverifiedDataEmitterContract.write.emitContractDeployment(args, {
        account: this.account,
        chain: this.chain,
        gas,
      });
      return hash;
    }
  }

  /**
   * Gets the chain object for the given chain id.
   * @param chainId - Chain id of the target EVM chain.
   * @returns Viem's chain object.
   */
  private getChain(chainId: number) {
    for (const chain of Object.values(chains)) {
      if ('id' in chain) {
        if (chain.id === chainId) {
          return chain;
        }
      }
    }

    throw new Error(`Chain with id ${chainId} not found`);
  }
}
