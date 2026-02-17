import { EthAddress } from '@aztec/foundation/eth-address';
import { FeeAssetHandlerAbi } from '@aztec/l1-artifacts/FeeAssetHandlerAbi';

import { type Hex, encodeFunctionData, getContract } from 'viem';

import type { L1TxUtils } from '../l1_tx_utils/index.js';
import type { ViemClient } from '../types.js';

export class FeeAssetHandlerContract {
  public address: EthAddress;

  constructor(
    public readonly client: ViemClient,
    address: Hex | EthAddress,
  ) {
    if (address instanceof EthAddress) {
      address = address.toString();
    }
    this.address = EthAddress.fromString(address);
  }

  public async getOwner(): Promise<EthAddress> {
    const contract = getContract({
      abi: FeeAssetHandlerAbi,
      address: this.address.toString(),
      client: this.client,
    });
    return EthAddress.fromString(await contract.read.owner());
  }

  public getMintAmount() {
    const contract = getContract({
      abi: FeeAssetHandlerAbi,
      address: this.address.toString(),
      client: this.client,
    });
    return contract.read.mintAmount();
  }

  public mint(txUtils: L1TxUtils, recipient: Hex | EthAddress) {
    if (recipient instanceof EthAddress) {
      recipient = recipient.toString();
    }
    return txUtils.sendAndMonitorTransaction({
      to: this.address.toString(),
      abi: FeeAssetHandlerAbi,
      data: encodeFunctionData({
        abi: FeeAssetHandlerAbi,
        functionName: 'mint',
        args: [recipient],
      }),
    });
  }

  public setMintAmount(txUtils: L1TxUtils, amount: bigint) {
    return txUtils.sendAndMonitorTransaction({
      to: this.address.toString(),
      abi: FeeAssetHandlerAbi,
      data: encodeFunctionData({
        abi: FeeAssetHandlerAbi,
        functionName: 'setMintAmount',
        args: [amount],
      }),
    });
  }
}
