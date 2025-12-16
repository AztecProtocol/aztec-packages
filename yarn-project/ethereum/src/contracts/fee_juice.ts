import { EthAddress } from '@aztec/foundation/eth-address';
import { TestERC20Abi as FeeJuiceAbi } from '@aztec/l1-artifacts/TestERC20Abi';

import { type GetContractReturnType, type Hex, getContract } from 'viem';

import { type ExtendedViemWalletClient, type ViemClient, isExtendedClient } from '../types.js';

export class FeeJuiceContract {
  private readonly feeJuiceContract: GetContractReturnType<typeof FeeJuiceAbi, ViemClient>;

  constructor(
    address: Hex,
    public readonly client: ViemClient,
  ) {
    this.feeJuiceContract = getContract({ address, abi: FeeJuiceAbi, client });
  }

  public get address() {
    return EthAddress.fromString(this.feeJuiceContract.address);
  }

  private assertWalletFeeJuice(): GetContractReturnType<typeof FeeJuiceAbi, ExtendedViemWalletClient> {
    if (!isExtendedClient(this.client)) {
      throw new Error('Wallet client is required for this operation');
    }
    return this.feeJuiceContract as GetContractReturnType<typeof FeeJuiceAbi, ExtendedViemWalletClient>;
  }

  public async mint(to: Hex, amount: bigint) {
    const walletFeeJuice = this.assertWalletFeeJuice();
    const tx = await walletFeeJuice.write.mint([to, amount]);
    const receipt = await this.client.waitForTransactionReceipt({ hash: tx });

    if (receipt.status === 'success') {
      return;
    }
    throw new Error('Mint failed');
  }

  public async approve(spender: Hex, amount: bigint) {
    const walletFeeJuice = this.assertWalletFeeJuice();
    const tx = await walletFeeJuice.write.approve([spender, amount]);
    const receipt = await this.client.waitForTransactionReceipt({ hash: tx });

    if (receipt.status === 'success') {
      return;
    }
    throw new Error('Approve failed');
  }
}
