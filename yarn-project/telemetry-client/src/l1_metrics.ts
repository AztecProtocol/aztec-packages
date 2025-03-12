import type { EthAddress } from '@aztec/foundation/eth-address';

import { type Hex, type PublicClient, formatEther } from 'viem';

import { L1_SENDER } from './attributes.js';
import { L1_BALANCE, L1_BLOCK_HEIGHT } from './metrics.js';
import { type BatchObservableResult, type Meter, type ObservableGauge, ValueType } from './telemetry.js';

export class L1Metrics {
  private l1BlockHeight: ObservableGauge;
  private l1Balance: ObservableGauge;
  private addresses: Hex[];

  constructor(private meter: Meter, private client: PublicClient, addresses: EthAddress[]) {
    this.l1BlockHeight = meter.createObservableGauge(L1_BLOCK_HEIGHT, {
      description: 'The latest L1 block seen',
      valueType: ValueType.INT,
    });
    this.l1Balance = meter.createObservableGauge(L1_BALANCE, {
      description: 'Eth balance of an address',
      unit: 'eth',
      valueType: ValueType.DOUBLE,
    });

    this.addresses = addresses.map(addr => addr.toString());
  }

  start() {
    this.meter.addBatchObservableCallback(this.observe, [this.l1Balance, this.l1BlockHeight]);
  }

  stop() {
    this.meter.removeBatchObservableCallback(this.observe, [this.l1Balance, this.l1BlockHeight]);
  }

  private observe = async (observer: BatchObservableResult) => {
    const blockNumber = await this.client.getBlockNumber();
    const balances = await Promise.all(
      this.addresses.map(address =>
        this.client.getBalance({
          address,
          blockNumber,
        }),
      ),
    );

    observer.observe(this.l1BlockHeight, Number(blockNumber));
    for (let i = 0; i < balances.length; i++) {
      const wei = balances[i];
      const address = this.addresses[i];
      const eth = parseFloat(formatEther(wei, 'wei'));

      observer.observe(this.l1Balance, eth, {
        [L1_SENDER]: address,
      });
    }
  };
}
