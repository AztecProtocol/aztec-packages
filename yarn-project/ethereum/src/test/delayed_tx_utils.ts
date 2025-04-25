import { L1TxUtilsWithBlobs } from '../l1_tx_utils_with_blobs.js';
import { type Delayer, withDelayer } from './tx_delayer.js';

export class DelayedTxUtils extends L1TxUtilsWithBlobs {
  public delayer: Delayer | undefined;

  public static fromL1TxUtils(l1TxUtils: L1TxUtilsWithBlobs, ethereumSlotDuration: number) {
    const { client, delayer } = withDelayer(l1TxUtils.client, {
      ethereumSlotDuration,
    });
    const casted = l1TxUtils as unknown as DelayedTxUtils;
    casted.delayer = delayer;
    casted.client = client;
    return casted;
  }

  public enableDelayer(ethereumSlotDuration: number) {
    const { client, delayer } = withDelayer(this.client, {
      ethereumSlotDuration,
    });
    this.delayer = delayer;
    this.client = client;
  }
}
