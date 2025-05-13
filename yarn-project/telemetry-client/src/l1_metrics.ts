import type { EthAddress } from '@aztec/foundation/eth-address';

import { type Chain, type FallbackTransport, type Hex, type HttpTransport, type PublicClient, formatEther } from 'viem';

import { L1_SENDER } from './attributes.js';
import { L1_BALANCE_ETH, L1_BLOB_BASE_FEE_WEI, L1_BLOCK_HEIGHT, L1_GAS_PRICE_WEI } from './metrics.js';
import { type BatchObservableResult, type Meter, type ObservableGauge, ValueType } from './telemetry.js';

export class L1Metrics {
  private l1BlockHeight: ObservableGauge;
  private l1BalanceEth: ObservableGauge;
  private gasPriceWei: ObservableGauge;
  private blobBaseFeeWei: ObservableGauge;
  private addresses: Hex[];

  constructor(
    private meter: Meter,
    private client: PublicClient<FallbackTransport<HttpTransport[]>, Chain>,
    addresses: EthAddress[],
  ) {
    this.l1BlockHeight = meter.createObservableGauge(L1_BLOCK_HEIGHT, {
      description: 'The latest L1 block seen',
      valueType: ValueType.INT,
    });
    this.l1BalanceEth = meter.createObservableGauge(L1_BALANCE_ETH, {
      description: 'Eth balance of an address',
      unit: 'eth',
      valueType: ValueType.DOUBLE,
    });
    this.gasPriceWei = meter.createObservableGauge(L1_GAS_PRICE_WEI, {
      description: 'L1 gas price',
      unit: 'wei',
      valueType: ValueType.DOUBLE,
    });
    this.blobBaseFeeWei = meter.createObservableGauge(L1_BLOB_BASE_FEE_WEI, {
      description: 'L1 blob fee',
      unit: 'wei',
      valueType: ValueType.DOUBLE,
    });

    this.addresses = addresses.map(addr => addr.toString());
  }

  start() {
    this.meter.addBatchObservableCallback(this.observe, [this.l1BalanceEth, this.l1BlockHeight]);
  }

  stop() {
    this.meter.removeBatchObservableCallback(this.observe, [this.l1BalanceEth, this.l1BlockHeight]);
  }

  private observe = async (observer: BatchObservableResult) => {
    const blockNumber = await this.client.getBlockNumber();
    const ethBalances = await Promise.all(
      this.addresses.map(address =>
        this.client.getBalance({
          address,
          blockNumber,
        }),
      ),
    );

    const gasPrice = await this.client.getGasPrice();
    const blobFee = await this.client.getBlobBaseFee();

    observer.observe(this.l1BlockHeight, Number(blockNumber));
    observer.observe(this.gasPriceWei, Number(gasPrice));
    observer.observe(this.blobBaseFeeWei, Number(blobFee));

    for (let i = 0; i < ethBalances.length; i++) {
      const wei = ethBalances[i];
      const address = this.addresses[i];
      const eth = parseFloat(formatEther(wei, 'wei'));

      observer.observe(this.l1BalanceEth, eth, {
        [L1_SENDER]: address,
      });
    }
  };
}
