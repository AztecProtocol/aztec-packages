import { L1TxUtilsWithBlobs } from '../l1_tx_utils_with_blobs.js';
import { type Delayer, withDelayer } from './tx_delayer.js';

export class DelayedTxUtils extends L1TxUtilsWithBlobs {
  public delayer: Delayer | undefined;

  public static fromL1TxUtils(l1TxUtils: L1TxUtilsWithBlobs, ethereumSlotDuration: number) {
    if (!l1TxUtils.walletClient) {
      throw new Error('You need to initialise L1 tx utils with a wallet client to use the delayer.');
    }

    const { client, delayer } = withDelayer(l1TxUtils.walletClient, {
      ethereumSlotDuration,
    });
    const casted = l1TxUtils as unknown as DelayedTxUtils;
    casted.delayer = delayer;
    casted.walletClient = client;
    return casted;
  }

  public enableDelayer(ethereumSlotDuration: number) {
    if (!this.walletClient) {
      throw new Error('You need to initialise L1 tx utils with a wallet client to use the delayer.');
    }

    const { client, delayer } = withDelayer(this.walletClient, {
      ethereumSlotDuration,
    });
    this.delayer = delayer;
    this.walletClient = client;
  }
}
