import type { DateProvider } from '@aztec/foundation/timer';

import { L1TxUtilsWithBlobs } from '../l1_tx_utils_with_blobs.js';
import { type Delayer, withDelayer } from './tx_delayer.js';

export class DelayedTxUtils extends L1TxUtilsWithBlobs {
  public delayer: Delayer | undefined;
  public dateProvider!: DateProvider;

  public static fromL1TxUtils(l1TxUtils: L1TxUtilsWithBlobs, dateProvider: DateProvider, ethereumSlotDuration: number) {
    const { client, delayer } = withDelayer(l1TxUtils.client, dateProvider, {
      ethereumSlotDuration,
    });
    const casted = l1TxUtils as unknown as DelayedTxUtils;
    casted.dateProvider = dateProvider;
    casted.delayer = delayer;
    casted.client = client;
    return casted;
  }

  public enableDelayer(ethereumSlotDuration: number) {
    const { client, delayer } = withDelayer(this.client, this.dateProvider, {
      ethereumSlotDuration,
    });
    this.delayer = delayer;
    this.client = client;
  }
}
