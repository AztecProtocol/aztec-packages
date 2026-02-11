import type { BlobKzgInstance } from '@aztec/blob-lib/types';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';

import { type Hex, encodeFunctionData } from 'viem';

import { FORWARDER_ABI } from '../forwarder_proxy.js';
import type { ViemClient } from '../types.js';
import type { L1TxUtilsConfig } from './config.js';
import type { L1SignerSource } from './factory.js';
import { resolveSignerSource } from './factory.js';
import type { IL1TxMetrics, IL1TxStore } from './interfaces.js';
import { L1TxUtils } from './l1_tx_utils.js';
import { Delayer } from './tx_delayer.js';
import type { L1BlobInputs, L1TxConfig, L1TxRequest, SigningCallback } from './types.js';

/**
 * Extends L1TxUtils to wrap all transactions through a forwarder contract.
 * This is mainly used for testing the archiver's ability to decode transactions that go through proxies.
 */
export class ForwarderL1TxUtils extends L1TxUtils {
  constructor(
    client: ViemClient,
    senderAddress: EthAddress,
    signingCallback: SigningCallback,
    logger: Logger | undefined,
    dateProvider: DateProvider | undefined,
    config: Partial<L1TxUtilsConfig>,
    debugMaxGasLimit: boolean,
    store: IL1TxStore | undefined,
    metrics: IL1TxMetrics | undefined,
    kzg: BlobKzgInstance | undefined,
    delayer: Delayer | undefined,
    private readonly forwarderAddress: EthAddress,
  ) {
    super(
      client,
      senderAddress,
      signingCallback,
      logger,
      dateProvider,
      config,
      debugMaxGasLimit,
      store,
      metrics,
      kzg,
      delayer,
    );
  }

  /**
   * Wraps the transaction request in a call to the forwarder contract.
   */
  private wrapInForwarder(request: L1TxRequest): L1TxRequest {
    const forwarderCalldata = encodeFunctionData({
      abi: FORWARDER_ABI,
      functionName: 'forward',
      args: [request.to as Hex, request.data as Hex],
    });

    return {
      to: this.forwarderAddress.toString() as Hex,
      data: forwarderCalldata,
      value: request.value,
      abi: request.abi, // Preserve the original ABI for error decoding
    };
  }

  /**
   * Override sendAndMonitorTransaction to wrap the request in a forwarder call.
   */
  public override sendAndMonitorTransaction(request: L1TxRequest, gasConfig?: L1TxConfig, blobInputs?: L1BlobInputs) {
    this.logger.debug(`Wrapping transaction to ${request.to} in forwarder at ${this.forwarderAddress.toString()}`);
    const wrappedRequest = this.wrapInForwarder(request);
    return super.sendAndMonitorTransaction(wrappedRequest, gasConfig, blobInputs);
  }
}

export function createForwarderL1TxUtils(
  source: L1SignerSource,
  forwarderAddress: EthAddress,
  deps?: {
    logger?: Logger;
    dateProvider?: DateProvider;
    store?: IL1TxStore;
    metrics?: IL1TxMetrics;
    kzg?: BlobKzgInstance;
    delayer?: Delayer;
  },
  config?: Partial<L1TxUtilsConfig> & { debugMaxGasLimit?: boolean },
): ForwarderL1TxUtils {
  const { client, address, signingCallback } = resolveSignerSource(source);
  return new ForwarderL1TxUtils(
    client,
    address,
    signingCallback,
    deps?.logger,
    deps?.dateProvider,
    config ?? {},
    config?.debugMaxGasLimit ?? false,
    deps?.store,
    deps?.metrics,
    deps?.kzg,
    deps?.delayer,
    forwarderAddress,
  );
}
