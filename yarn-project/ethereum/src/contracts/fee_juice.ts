import { EthAddress } from '@aztec/foundation/eth-address';
import { TestERC20Abi as FeeJuiceAbi } from '@aztec/l1-artifacts';

import { type GetContractReturnType, type Hex, getContract } from 'viem';

import type { L1Clients } from '../types.js';

export class FeeJuiceContract {
  private readonly publicFeeJuice: GetContractReturnType<typeof FeeJuiceAbi, L1Clients['publicClient']>;
  private readonly walletFeeJuice: GetContractReturnType<typeof FeeJuiceAbi, L1Clients['walletClient']> | undefined;

  constructor(
    address: Hex,
    public readonly publicClient: L1Clients['publicClient'],
    public readonly walletClient: L1Clients['walletClient'] | undefined,
  ) {
    this.publicFeeJuice = getContract({ address, abi: FeeJuiceAbi, client: publicClient });
    this.walletFeeJuice = walletClient ? getContract({ address, abi: FeeJuiceAbi, client: walletClient }) : undefined;
  }

  public get address() {
    return EthAddress.fromString(this.publicFeeJuice.address);
  }

  private assertWalletFeeJuice() {
    if (!this.walletFeeJuice) {
      throw new Error('Wallet client is required for this operation');
    }
    return this.walletFeeJuice;
  }

  public async mint(to: Hex, amount: bigint) {
    const walletFeeJuice = this.assertWalletFeeJuice();
    const tx = await walletFeeJuice.write.mint([to, amount]);
    await this.publicClient.waitForTransactionReceipt({ hash: tx });
  }

  public async approve(spender: Hex, amount: bigint) {
    const walletFeeJuice = this.assertWalletFeeJuice();
    const tx = await walletFeeJuice.write.approve([spender, amount]);
    await this.publicClient.waitForTransactionReceipt({ hash: tx });
  }
}
