import { type EthereumChain } from '@aztec/ethereum';
import { type Delayer, withDelayer } from '@aztec/ethereum/test';

import { type Chain, type HttpTransport, type PrivateKeyAccount, type WalletClient } from 'viem';

import { L1Publisher } from '../publisher/l1-publisher.js';

export class TestL1Publisher extends L1Publisher {
  public delayer: Delayer | undefined;

  protected override createWalletClient(
    account: PrivateKeyAccount,
    chain: EthereumChain,
  ): WalletClient<HttpTransport, Chain, PrivateKeyAccount> {
    const baseClient = super.createWalletClient(account, chain);
    const { client, delayer } = withDelayer(baseClient, { ethereumSlotDuration: this.ethereumSlotDuration });
    this.delayer = delayer;
    return client;
  }
}
