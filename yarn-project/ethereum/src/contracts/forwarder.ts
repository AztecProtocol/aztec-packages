import { toHex } from '@aztec/foundation/bigint-buffer';
import type { Logger } from '@aztec/foundation/log';
import { ForwarderAbi } from '@aztec/l1-artifacts/ForwarderAbi';
import { ForwarderBytecode } from '@aztec/l1-artifacts/ForwarderBytecode';

import {
  type EncodeFunctionDataParameters,
  type GetContractReturnType,
  type Hex,
  encodeFunctionData,
  getContract,
} from 'viem';

import { deployL1Contract, getExpectedAddress } from '../deploy_l1_contracts.js';
import type { L1BlobInputs, L1GasConfig, L1TxRequest, L1TxUtils } from '../l1_tx_utils.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import { RollupContract } from './rollup.js';

export class ForwarderContract {
  private readonly forwarder: GetContractReturnType<typeof ForwarderAbi, ViemClient>;

  constructor(
    public readonly client: ExtendedViemWalletClient,
    address: Hex,
    public readonly rollupAddress: Hex,
  ) {
    this.forwarder = getContract({ address, abi: ForwarderAbi, client });
  }

  static expectedAddress(owner: Hex) {
    const { address } = getExpectedAddress(ForwarderAbi, ForwarderBytecode, [owner], owner);
    return address;
  }

  static async create(owner: Hex, l1Client: ExtendedViemWalletClient, logger: Logger, rollupAddress: Hex) {
    logger.info('Deploying forwarder contract');

    const { address, txHash } = await deployL1Contract(
      l1Client,
      ForwarderAbi,
      ForwarderBytecode,
      [owner],
      owner,
      undefined,
      logger,
    );

    if (txHash) {
      await l1Client.waitForTransactionReceipt({ hash: txHash });
    }

    logger.info(`Forwarder contract deployed at ${address} with owner ${owner}`);

    return new ForwarderContract(l1Client, address.toString(), rollupAddress);
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
    const forwarderFunctionData: EncodeFunctionDataParameters<typeof ForwarderAbi, 'forward'> = {
      abi: ForwarderAbi,
      functionName: 'forward',
      args: [toArgs, dataArgs],
    };
    const encodedForwarderData = encodeFunctionData(forwarderFunctionData);

    const { receipt, gasPrice } = await l1TxUtils.sendAndMonitorTransaction(
      {
        to: this.forwarder.address,
        data: encodedForwarderData,
      },
      gasConfig,
      blobConfig,
    );

    if (receipt.status === 'success') {
      const stats = await l1TxUtils.getTransactionStats(receipt.transactionHash);
      return { receipt, gasPrice, stats };
    } else {
      logger.error('Forwarder transaction failed', undefined, { receipt });

      const args = {
        ...forwarderFunctionData,
        address: this.forwarder.address,
      };

      let errorMsg: string | undefined;

      if (blobConfig) {
        const maxFeePerBlobGas = blobConfig.maxFeePerBlobGas ?? gasPrice.maxFeePerBlobGas;
        if (maxFeePerBlobGas === undefined) {
          errorMsg = 'maxFeePerBlobGas is required to get the error message';
        } else {
          logger.debug('Trying to get error from reverted tx with blob config');
          errorMsg = await l1TxUtils.tryGetErrorFromRevertedTx(
            encodedForwarderData,
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
                    slot: toHex(RollupContract.checkBlobStorageSlot, true),
                    value: toHex(0n, true),
                  },
                ],
              },
            ],
          );
        }
      } else {
        logger.debug('Trying to get error from reverted tx without blob config');
        errorMsg = await l1TxUtils.tryGetErrorFromRevertedTx(encodedForwarderData, args, undefined, []);
      }

      return { receipt, gasPrice, errorMsg };
    }
  }
}
