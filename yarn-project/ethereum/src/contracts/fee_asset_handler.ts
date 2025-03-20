import { EthAddress } from '@aztec/foundation/eth-address';
import { FeeAssetHandlerAbi } from '@aztec/l1-artifacts/FeeAssetHandlerAbi';

import { type Hex, encodeFunctionData } from 'viem';

import type { L1TxUtils } from '../l1_tx_utils.js';

// See https://github.com/AztecProtocol/engineering-designs/blob/42455c99b867cde4d67700bc97ac12309c2332ea/docs/faucets/dd.md#choosing-the-mint-amount
export const MINT_AMOUNT = 1_000_000_000_000_000n;

export class FeeAssetHandlerContract {
  public address: EthAddress;

  constructor(address: Hex, public readonly txUtils: L1TxUtils) {
    this.address = EthAddress.fromString(address);
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
