import { EthAddress } from '@aztec/foundation/eth-address';
import { FeeAssetHandlerAbi } from '@aztec/l1-artifacts/FeeAssetHandlerAbi';

import { type Hex, encodeFunctionData, getContract } from 'viem';

import type { L1TxUtils } from '../l1_tx_utils/index.js';

export class FeeAssetHandlerContract {
  public address: EthAddress;

  constructor(
    address: Hex | EthAddress,
    public readonly txUtils: L1TxUtils,
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
      client: this.txUtils.client,
    });
    return EthAddress.fromString(await contract.read.owner());
  }

  public getMintAmount() {
    const contract = getContract({
      abi: FeeAssetHandlerAbi,
      address: this.address.toString(),
      client: this.txUtils.client,
    });
    return contract.read.mintAmount();
  }

  public mint(recipient: Hex | EthAddress) {
    if (recipient instanceof EthAddress) {
      recipient = recipient.toString();
    }
    return this.txUtils.sendAndMonitorTransaction({
      to: this.address.toString(),
      data: encodeFunctionData({
        abi: FeeAssetHandlerAbi,
        functionName: 'mint',
        args: [recipient],
      }),
    });
  }

  public setMintAmount(amount: bigint) {
    return this.txUtils.sendAndMonitorTransaction({
      to: this.address.toString(),
      data: encodeFunctionData({
        abi: FeeAssetHandlerAbi,
        functionName: 'setMintAmount',
        args: [amount],
      }),
    });
  }
}
