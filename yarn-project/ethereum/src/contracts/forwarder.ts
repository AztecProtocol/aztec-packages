import { toHex } from '@aztec/foundation/bigint-buffer';
import { type Logger } from '@aztec/foundation/log';
import { ForwarderAbi, ForwarderBytecode } from '@aztec/l1-artifacts';

import {
  type Account,
  type Chain,
  type GetContractReturnType,
  type Hex,
  type HttpTransport,
  type PublicClient,
  type WalletClient,
  encodeFunctionData,
  getContract,
} from 'viem';

import { type L1Clients, deployL1Contract } from '../deploy_l1_contracts.js';
import { type L1BlobInputs, type L1GasConfig, type L1TxRequest, type L1TxUtils } from '../l1_tx_utils.js';
import { RollupContract } from './rollup.js';

export class ForwarderContract {
  private readonly forwarder: GetContractReturnType<typeof ForwarderAbi, PublicClient<HttpTransport, Chain>>;

  constructor(public readonly client: L1Clients['publicClient'], address: Hex, public readonly rollupAddress: Hex) {
    this.forwarder = getContract({ address, abi: ForwarderAbi, client });
  }

  static async create(
    owner: Hex,
    walletClient: WalletClient<HttpTransport, Chain, Account>,
    publicClient: PublicClient<HttpTransport, Chain>,
    logger: Logger,
    rollupAddress: Hex,
  ) {
    logger.info('Deploying forwarder contract');

    const { address, txHash } = await deployL1Contract(
      walletClient,
      publicClient,
      ForwarderAbi,
      ForwarderBytecode,
      [owner],
      owner,
      undefined,
      logger,
    );

    if (txHash) {
      await publicClient.waitForTransactionReceipt({ hash: txHash });
    }

    logger.info(`Forwarder contract deployed at ${address} with owner ${owner}`);

    return new ForwarderContract(publicClient, address.toString(), rollupAddress);
  }

  public getAddress() {
    return this.forwarder.address;
  }

  public async forward(
    requests: L1TxRequest[],
    l1TxUtils: L1TxUtils,
    gasConfig: L1GasConfig | undefined,
    blobConfig: L1BlobInputs | undefined,
    logger: Logger,
  ) {
    requests = requests.filter(request => request.to !== null);
    const toArgs = requests.map(request => request.to!);
    const dataArgs = requests.map(request => request.data!);
    const data = encodeFunctionData({
      abi: ForwarderAbi,
      functionName: 'forward',
      args: [toArgs, dataArgs],
    });

    const { receipt, gasPrice } = await l1TxUtils.sendAndMonitorTransaction(
      {
        to: this.forwarder.address,
        data,
      },
      gasConfig,
      blobConfig,
    );

    if (receipt.status === 'success') {
      const stats = await l1TxUtils.getTransactionStats(receipt.transactionHash);
      return { receipt, gasPrice, stats };
    } else {
      logger.error('Forwarder transaction failed', { receipt });
      const args = {
        args: [toArgs, dataArgs],
        functionName: 'forward',
        abi: ForwarderAbi,
        address: this.forwarder.address,
      };

      let errorMsg: string | undefined;

      if (blobConfig) {
        const maxFeePerBlobGas = blobConfig.maxFeePerBlobGas ?? gasPrice.maxFeePerBlobGas;
        if (maxFeePerBlobGas === undefined) {
          errorMsg = 'maxFeePerBlobGas is required to get the error message';
        } else {
          errorMsg = await l1TxUtils.tryGetErrorFromRevertedTx(
            data,
            args,
            {
              blobs: blobConfig.blobs,
              kzg: blobConfig.kzg,
              maxFeePerBlobGas,
            },
            [
              {
                address: this.rollupAddress,
                stateDiff: [
                  {
                    slot: toHex(RollupContract.checkBlobSlot, true),
                    value: toHex(0n, true),
                  },
                ],
              },
            ],
          );
        }
      } else {
        logger.info('Trying to get error from reverted tx without blob config');
        errorMsg = await l1TxUtils.tryGetErrorFromRevertedTx(data, args, undefined, []);
      }

      return { receipt, gasPrice, errorMsg };
    }
  }
}
