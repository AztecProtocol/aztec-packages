import type { AztecNodeConfig } from '@aztec/aztec-node';
import { createExtendedL1Client } from '@aztec/ethereum/client';
import { FORWARDER_ABI, deployForwarderProxy } from '@aztec/ethereum/forwarder-proxy';
import type { L1TxUtils } from '@aztec/ethereum/l1-tx-utils';
import type { PublisherManager } from '@aztec/ethereum/publisher-manager';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { EthAddress } from '@aztec/foundation/eth-address';
import type { Logger } from '@aztec/foundation/log';
import { retryUntil } from '@aztec/foundation/retry';
import { bufferToHex } from '@aztec/foundation/string';
import type { SequencerClient } from '@aztec/sequencer-client';
import type { TestSequencerClient } from '@aztec/sequencer-client/test';
import type { AztecNode, AztecNodeAdmin } from '@aztec/stdlib/interfaces/client';

import { jest } from '@jest/globals';
import 'jest-extended';
import { type Hex, decodeFunctionData, encodeFunctionData, multicall3Abi } from 'viem';

import { getPrivateKeyFromIndex, setup } from './fixtures/utils.js';

// Tests that the sequencer can successfully process blocks when L1 block proposals are forwarded
// via a proxy contract (Forwarder). Also tests that a corrupted first propose call (failing with
// allowFailure:true) followed by a valid second call still produces blocks.
// Uses setup(2, {ethereumSlotDuration:4, aztecSlotDuration:12, proofSubEpochs:640, minTxsPerBlock:0,
// aztecEpochDuration=default}) — production sequencer, anvil interval mining. The L1 interaction is
// Forwarder/Multicall3/Rollup contract interception for block-proposal routing, not cross-chain bridging.
describe('e2e_debug_trace_transaction', () => {
  jest.setTimeout(5 * 60 * 1000); // 5 minutes

  let logger: Logger;
  let aztecNode: AztecNode;
  let aztecNodeAdmin: AztecNodeAdmin;
  let sequencer: TestSequencerClient;
  let publisherManager: PublisherManager;
  let teardown: () => Promise<void>;
  let config: AztecNodeConfig;
  let forwarderAddress: EthAddress;
  let l1Client: ExtendedViemWalletClient;

  const coinbase = EthAddress.random();

  beforeAll(async () => {
    let sequencerClient: SequencerClient | undefined;
    let maybeAztecNodeAdmin: AztecNodeAdmin | undefined;

    ({
      teardown,
      aztecNode,
      logger,
      aztecNodeAdmin: maybeAztecNodeAdmin,
      sequencer: sequencerClient,
      config,
    } = await setup(2, {
      archiverPollingIntervalMS: 200,
      sequencerPollingIntervalMS: 200,
      worldStateBlockCheckIntervalMS: 200,
      blockCheckIntervalMS: 200,
      maxSpeedUpAttempts: 0, // Disable speed ups, so that cancellation txs never make it through
      minTxsPerBlock: 0,
      coinbase: coinbase,
      aztecSlotDuration: 12,
      ethereumSlotDuration: 4,
      aztecProofSubmissionEpochs: 640,
      inboxLag: 2,
    }));
    sequencer = sequencerClient! as TestSequencerClient;
    publisherManager = sequencer.publisherManager;
    aztecNodeAdmin = maybeAztecNodeAdmin!;

    logger.info('Deploying Forwarder contract to L1');
    l1Client = createExtendedL1Client(config.l1RpcUrls, bufferToHex(getPrivateKeyFromIndex(0)!));

    forwarderAddress = await deployForwarderProxy(l1Client, logger);
    logger.info(`Deployed Forwarder at ${forwarderAddress.toString()}`);
  });

  beforeEach(async () => {
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
  });

  afterEach(async () => {
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 1 });
    // Clean up any mocks
    jest.restoreAllMocks();
  });

  afterAll(() => teardown());

  // In this test we deploy a simple forwarder contract to L1, this serves as an additional proxy
  // Intercepts sendAndMonitorTransaction to forward the Multicall3 call via the Forwarder proxy.
  // Waits for 2 new blocks via retryUntil; asserts the chain advances.
  it('can process blocks using debug trace', async () => {
    // We intercept calls to sendAndMonitorTransaction to forward inner calls via the forwarder
    const l1Utils: L1TxUtils[] = (publisherManager as any).publishers;

    // Intercept sendAndMonitorTransaction to access blobInputs directly
    const originalSendAndMonitor = l1Utils[0].sendAndMonitorTransaction.bind(l1Utils[0]);

    // auto-dispose of this spy at the end of this function
    using _ = jest
      .spyOn(l1Utils[0], 'sendAndMonitorTransaction')
      .mockImplementation(async function (request, gasConfig, blobInputs) {
        logger.info(`Intercepted sendAndMonitorTransaction to ${request.to}`);
        logger.info(`Blobs present: ${!!blobInputs?.blobs}, count: ${blobInputs?.blobs?.length ?? 0}`);

        // Wrap the original Multicall3 call with the forwarder
        // Call chain: Forwarder -> Multicall3 -> Rollup
        const forwarderCalldata = encodeFunctionData({
          abi: FORWARDER_ABI,
          functionName: 'forward',
          args: [request.to as Hex, request.data as Hex],
        });

        const forwardedRequest = {
          to: forwarderAddress.toString() as Hex,
          data: forwarderCalldata,
        };

        logger.info(`Forwarding call to ${request.to} via forwarder at ${forwarderAddress.toString()}`);

        try {
          const result = await originalSendAndMonitor(forwardedRequest, gasConfig, blobInputs);
          logger.info(`Forwarded call sent with hash ${result.receipt.transactionHash}`);
          return result;
        } catch (err: any) {
          logger.error(`Failed to send forwarded transaction: ${err.message}`, err);
          throw err;
        }
      });

    expect(await aztecNode.getBlockNumber()).toBeGreaterThanOrEqual(1);

    // The current config requires at least 1 tx per block, so the block number won't be increasing

    // We now want to set the sequencer config to allow blocks with 0 transactions
    // Wait until we have successfully moved forward by a few blocks
    const numBlocksToMine = 2;
    const startBlockNumber = await aztecNode.getBlockNumber();
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });
    // REFACTOR: raw retryUntil poll on block number; replace with a waitForBlock(n) DSL helper
    const result = await retryUntil(
      async () => {
        const blockNumber = await aztecNode.getBlockNumber();
        return blockNumber >= startBlockNumber + numBlocksToMine;
      },
      'block number check',
      60,
      1,
    );
    expect(result).toBeTrue();

    // Restore the original sendAndMonitorTransaction
    l1Utils[0].sendAndMonitorTransaction = originalSendAndMonitor;
  });

  // Intercepts Multicall3 aggregate3, prepends a corrupted call (coinbase zeroed, allowFailure=true)
  // before the original calls. Waits for 3 new blocks; asserts the chain advances despite the
  // first inner call reverting.
  it('can process blocks with a failing call followed by a successful call', async () => {
    // We intercept calls to sendAndMonitorTransaction to:
    // 1. Decode the Multicall3 aggregate3 call
    // 2. Duplicate the inner call to the rollup
    // 3. Corrupt the first call so it reverts (with allowFailure: true)
    // 4. Keep the second call intact so it succeeds
    const l1Utils: L1TxUtils[] = (publisherManager as any).publishers;

    const originalSendAndMonitor = l1Utils[0].sendAndMonitorTransaction.bind(l1Utils[0]);

    using _ = jest
      .spyOn(l1Utils[0], 'sendAndMonitorTransaction')
      .mockImplementation(async function (request, gasConfig, blobInputs) {
        logger.info(`Intercepted sendAndMonitorTransaction to ${request.to}`);
        logger.info(`Blobs present: ${!!blobInputs?.blobs}, count: ${blobInputs?.blobs?.length ?? 0}`);

        const originalData = request.data ?? '0x';

        // Decode the aggregate3 call to get the inner calls
        const decoded = decodeFunctionData({
          abi: multicall3Abi,
          data: originalData as Hex,
        });

        if (decoded.functionName !== 'aggregate3') {
          // Not a multicall3 aggregate3 call, just forward as-is
          return originalSendAndMonitor(request, gasConfig, blobInputs);
        }

        const originalCalls = decoded.args[0] as readonly { target: Hex; allowFailure: boolean; callData: Hex }[];

        logger.info(`Found ${originalCalls.length} inner call(s) in Multicall3`);

        // Create a corrupted version of the first call by zeroing out the coinbase address
        // The coinbase is located within the ProposedHeader struct in the propose() calldata
        // We search for the known coinbase address and replace it with zeros
        const corruptedCalls = originalCalls.map((call, index) => {
          if (index === 0) {
            const callDataHex = call.callData.toLowerCase();
            // In the calldata it appears as the 20-byte address padded to 32 bytes
            const coinbasePattern = coinbase.toString().slice(2).toLowerCase();
            const coinbaseIndex = callDataHex.indexOf(coinbasePattern);

            if (coinbaseIndex === -1) {
              logger.warn('Coinbase address not found in calldata, using original');
              return call;
            } else {
              logger.info(`Found coinbase address ${coinbasePattern} in calldata at index ${coinbaseIndex}`);
            }

            // Replace the coinbase with zeros (20 bytes = 40 hex chars)
            const corruptedCallData = (call.callData.slice(0, coinbaseIndex) +
              '0'.repeat(40) +
              call.callData.slice(coinbaseIndex + 40)) as Hex;

            return {
              target: call.target,
              allowFailure: true, // Allow this call to fail without reverting the whole transaction
              callData: corruptedCallData,
            };
          }
          return call;
        });

        // Now prepend the corrupted call and keep the original calls
        // Result: [corrupted_call (fails), original_call (succeeds)]
        const newCalls = [
          corruptedCalls[0], // The corrupted call that will fail (coinbase = 0)
          ...originalCalls, // The original calls that will succeed
        ];

        logger.info(`New call sequence: ${newCalls.length} calls (first one corrupted, rest original)`);

        // Re-encode the aggregate3 call with the new calls
        const newMulticallData = encodeFunctionData({
          abi: multicall3Abi,
          functionName: 'aggregate3',
          args: [newCalls],
        });

        // Send directly to Multicall3 with the modified call sequence
        const modifiedRequest = {
          to: request.to,
          data: newMulticallData,
        };

        logger.info(`Sending modified Multicall3 call directly to ${request.to}`);

        try {
          const result = await originalSendAndMonitor(modifiedRequest, gasConfig, blobInputs);
          logger.info(`Modified call sent with hash ${result.receipt.transactionHash}`);
          return result;
        } catch (err: any) {
          logger.error(`Failed to send modified transaction: ${err.message}`, err);
          throw err;
        }
      });

    expect(await aztecNode.getBlockNumber()).toBeGreaterThanOrEqual(1);

    const numBlocksToMine = 3;
    const startBlockNumber = await aztecNode.getBlockNumber();
    await aztecNodeAdmin.setConfig({ minTxsPerBlock: 0 });
    // REFACTOR: raw retryUntil poll on block number; replace with a waitForBlock(n) DSL helper
    const result = await retryUntil(
      async () => {
        const blockNumber = await aztecNode.getBlockNumber();
        return blockNumber >= startBlockNumber + numBlocksToMine;
      },
      'block number check',
      60,
      1,
    );
    expect(result).toBeTrue();

    // Restore the original sendAndMonitorTransaction
    l1Utils[0].sendAndMonitorTransaction = originalSendAndMonitor;
  });
});
