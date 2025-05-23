import { EthAddress } from '@aztec/foundation/eth-address';
import { FeeAssetHandlerAbi } from '@aztec/l1-artifacts/FeeAssetHandlerAbi';

import { type Hex, encodeFunctionData, getContract } from 'viem';

import type { L1TxUtils } from '../l1_tx_utils.js';

export class FeeAssetHandlerContract {
  public address: EthAddress;

  constructor(
    address: Hex,
    public readonly txUtils: L1TxUtils,
  ) {
    this.address = EthAddress.fromString(address);
  }

  public getMintAmount() {
    const contract = getContract({
      abi: FeeAssetHandlerAbi,
      address: this.address.toString(),
      client: this.txUtils.client,
    });
    return contract.read.mintAmount();
  }

  public mint(recipient: Hex) {
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
