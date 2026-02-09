import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import type { DateProvider } from '@aztec/foundation/timer';

import { type Hex, encodeFunctionData } from 'viem';

import type { EthSigner } from '../eth-signer/eth-signer.js';
import { FORWARDER_ABI } from '../forwarder_proxy.js';
import type { ExtendedViemWalletClient, ViemClient } from '../types.js';
import type { L1TxUtilsConfig } from './config.js';
import type { IL1TxMetrics, IL1TxStore } from './interfaces.js';
import { L1TxUtilsWithBlobs } from './l1_tx_utils_with_blobs.js';
import { createViemSigner } from './signer.js';
import { type Delayer, applyDelayer } from './tx_delayer.js';
import type { L1BlobInputs, L1TxConfig, L1TxRequest, SigningCallback } from './types.js';

/**
 * Extends L1TxUtilsWithBlobs to wrap all transactions through a forwarder contract.
 * This is mainly used for testing the archiver's ability to decode transactions that go through proxies.
 */
export class ForwarderL1TxUtils extends L1TxUtilsWithBlobs {
  constructor(
    client: ViemClient | ExtendedViemWalletClient,
    senderAddress: EthAddress,
    signingCallback: SigningCallback,
    logger: Logger | undefined,
    dateProvider: DateProvider | undefined,
    config: Partial<L1TxUtilsConfig>,
    debugMaxGasLimit: boolean,
    store: IL1TxStore | undefined,
    metrics: IL1TxMetrics | undefined,
    private readonly forwarderAddress: EthAddress,
  ) {
    super(client, senderAddress, signingCallback, logger, dateProvider, config, debugMaxGasLimit, store, metrics);
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

export function createForwarderL1TxUtilsFromViemWallet(
  client: ExtendedViemWalletClient,
  forwarderAddress: EthAddress,
  deps: {
    logger?: Logger;
    dateProvider?: DateProvider;
    store?: IL1TxStore;
    metrics?: IL1TxMetrics;
    ethereumSlotDuration?: number;
    delayer?: Delayer;
  } = {},
  config: Partial<L1TxUtilsConfig> = {},
  debugMaxGasLimit: boolean = false,
) {
  const l1TxUtils = new ForwarderL1TxUtils(
    client,
    EthAddress.fromString(client.account.address),
    createViemSigner(client),
    deps.logger,
    deps.dateProvider,
    config,
    debugMaxGasLimit,
    deps.store,
    deps.metrics,
    forwarderAddress,
  );
  applyDelayer(l1TxUtils, config, deps.ethereumSlotDuration, deps.delayer);
  return l1TxUtils;
}

export function createForwarderL1TxUtilsFromEthSigner(
  client: ViemClient,
  signer: EthSigner,
  forwarderAddress: EthAddress,
  deps: {
    logger?: Logger;
    dateProvider?: DateProvider;
    store?: IL1TxStore;
    metrics?: IL1TxMetrics;
    ethereumSlotDuration?: number;
    delayer?: Delayer;
  } = {},
  config: Partial<L1TxUtilsConfig> = {},
  debugMaxGasLimit: boolean = false,
) {
  const callback: SigningCallback = async (transaction, _signingAddress) => {
    return (await signer.signTransaction(transaction)).toViemTransactionSignature();
  };

  const l1TxUtils = new ForwarderL1TxUtils(
    client,
    signer.address,
    callback,
    deps.logger,
    deps.dateProvider,
    config,
    debugMaxGasLimit,
    deps.store,
    deps.metrics,
    forwarderAddress,
  );
  applyDelayer(l1TxUtils, config, deps.ethereumSlotDuration, deps.delayer);
  return l1TxUtils;
}
