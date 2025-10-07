import { EthAddress } from '@aztec/foundation/eth-address';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { DateProvider } from '@aztec/foundation/timer';

import { type L1TxUtilsConfig, createViemSigner } from '../l1_tx_utils/index.js';
import { L1TxUtilsWithBlobs } from '../l1_tx_utils/l1_tx_utils_with_blobs.js';
import type { ExtendedViemWalletClient } from '../types.js';
import { type Delayer, withDelayer } from './tx_delayer.js';

export class DelayedTxUtils extends L1TxUtilsWithBlobs {
  public delayer: Delayer | undefined;

  public static fromL1TxUtils(
    l1TxUtils: L1TxUtilsWithBlobs,
    ethereumSlotDuration: number,
    wallet: ExtendedViemWalletClient,
  ) {
    const { client, delayer } = withDelayer(wallet, l1TxUtils.dateProvider, {
      ethereumSlotDuration,
    });
    const casted = l1TxUtils as unknown as DelayedTxUtils;
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

export function createDelayedL1TxUtilsFromViemWallet(
  client: ExtendedViemWalletClient,
  logger: Logger = createLogger('L1TxUtils'),
  dateProvider: DateProvider = new DateProvider(),
  config?: Partial<L1TxUtilsConfig>,
  debugMaxGasLimit: boolean = false,
) {
  return new DelayedTxUtils(
    client,
    EthAddress.fromString(client.account.address),
    createViemSigner(client),
    logger,
    dateProvider,
    config,
    debugMaxGasLimit,
  );
}
