import type { AztecNodeService } from '@aztec/aztec-node';
import { Fr } from '@aztec/aztec.js/fields';
import { waitForTx } from '@aztec/aztec.js/node';
import { Tx, TxHash } from '@aztec/aztec.js/tx';
import { CheckpointNumber } from '@aztec/foundation/branded-types';
import { times } from '@aztec/foundation/collection';
import { sleep } from '@aztec/foundation/sleep';
import { unfreeze } from '@aztec/foundation/types';
import type { LibP2PService, P2PClient } from '@aztec/p2p';
import type { CppPublicTxSimulator, SimulationHandle } from '@aztec/simulator/server';
import { BlockProposal } from '@aztec/stdlib/p2p';
import { ReExFailedTxsError, ReExStateMismatchError, ReExTimeoutError } from '@aztec/stdlib/validators';
import type { ValidatorKeyStore } from '@aztec/validator-client';

import { describe, it, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { submitComplexTxsTo } from './shared.js';

const NUM_VALIDATORS = 4;
const NUM_TXS_PER_NODE = 1;
const BASE_BOOT_NODE_UDP_PORT = 4500;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'reex-'));

describe('e2e_p2p_reex', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let txs: TxHash[];

  beforeAll(async () => {
    nodes = [];

    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_reex',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BASE_BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        enforceTimeTable: true,
        txTimeoutMs: 30_000,
        listenAddress: '127.0.0.1',
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
        enableProposerPipelining: true,
        inboxLag: 2,
      },
    });

    t.logger.info('Setting up subsystems');
    await t.setup();

    t.logger.info('Applying base setup');
    await t.applyBaseSetup();

    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    t.logger.info('Creating peer nodes');
    nodes = await createNodes(
      {
        ...t.ctx.aztecNodeConfig,
        minTxsPerBlock: 1,
        maxTxsPerBlock: NUM_TXS_PER_NODE,
      },
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BASE_BOOT_NODE_UDP_PORT,
      t.genesis,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    // Wait a bit for peers to discover each other
    t.logger.info('Waiting for peer discovery');
    await sleep(8000);

    t.logger.info('Setup account');
    t.setupWalletOnNode(nodes[0]);
    await t.setupAccount();

    t.logger.info('Deploy spam contract');
    await t.deploySpamContract();

    // Submit the txs to the mempool. We submit a single set of txs, and then inject different behaviors
    // into the validator nodes to cause them to fail in different ways.
    t.logger.info('Submitting txs');
    txs = await submitComplexTxsTo(t.logger, t.defaultAccountAddress!, t.spamContract!, NUM_TXS_PER_NODE, {
      callPublic: true,
    });
  }, 360 * 1000);

  afterAll(async () => {
    // shutdown all nodes.
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_VALIDATORS; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  // TODO(palla/mbps): Reenable after fixing the spy on makeBlockBuilderDeps, or use a config like the fakeProcessingDelayPerTxMs
  // and fakeThrowAfterProcessingTxCount but ONLY when the node is acting as validator, not as proposer.
  describe.skip('validators re-execute transactions before attesting', () => {
    // Keep track of txs we have seen, so we do not intercept the simulate call on the first run (the block-proposer's)
    let seenTxs: Set<string>;
    beforeEach(() => {
      seenTxs = new Set();
    });

    // Hold off sequencers from building a block
    const pauseProposals = () =>
      Promise.all(nodes.map(node => node.getSequencer()?.updateConfig({ minTxsPerBlock: NUM_TXS_PER_NODE + 1 })));

    // Reenable them
    const resumeProposals = () =>
      Promise.all(nodes.map(node => node.getSequencer()?.updateConfig({ minTxsPerBlock: NUM_TXS_PER_NODE })));

    // Make sure the nodes submit faulty proposals, in this case a faulty proposal is one where we remove one of the transactions
    // Such that the calculated archive will be different!
    const interceptBroadcastProposal = (node: AztecNodeService) => {
      const p2pClient = (node as any).p2pClient as P2PClient;
      jest.spyOn(p2pClient, 'broadcastProposal').mockImplementation(async (...args: unknown[]) => {
        // We remove one of the transactions, therefore the block root will be different!
        const proposal = args[0] as BlockProposal;
        const signatureContext = {
          chainId: t.ctx.aztecNodeConfig.l1ChainId,
          rollupAddress: t.ctx.deployL1ContractsValues.l1ContractAddresses.rollupAddress,
        };
        const proposerAddress = proposal.getSender();
        const txHashes = proposal.txHashes;

        // Mutate txhashes to remove the last one
        unfreeze(proposal).txHashes = txHashes.slice(0, txHashes.length - 1);

        // We sign over the proposal using the node's signing key
        const signer = (node as any).sequencer.sequencer.validatorClient.validationService
          .keyStore as ValidatorKeyStore;
        const newProposal = await BlockProposal.createProposalFromSigner(
          proposal.blockHeader,
          CheckpointNumber(1),
          proposal.indexWithinCheckpoint,
          proposal.inHash,
          proposal.archiveRoot,
          proposal.txHashes,
          undefined,
          signatureContext,
          (typedData, context) => signer.signTypedDataWithAddress(proposerAddress!, typedData, context),
        );

        const p2pService = (p2pClient as any).p2pService as LibP2PService;
        return p2pService.propagate(newProposal);
      });
    };

    // Intercepts the simulator within the tx processor within the processor factory with the given function
    // Only the processor for validators is intercepted, the one for the proposer is left untouched
    // We abuse the fact that the proposer will always run before the validators
    const interceptTxProcessorSimulate = (
      node: AztecNodeService,
      stub: (tx: Tx, originalSimulate: (tx: Tx) => SimulationHandle) => SimulationHandle,
    ) => {
      const blockBuilder: any = (node as any).sequencer.sequencer.blockBuilder;
      const originalCreateDeps = blockBuilder.makeBlockBuilderDeps.bind(blockBuilder);
      jest.spyOn(blockBuilder, 'makeBlockBuilderDeps').mockImplementation(async (...args: any[]) => {
        const deps = await originalCreateDeps(...args);
        t.logger.warn('Creating mocked processor factory');
        const simulator: CppPublicTxSimulator = (deps.processor as any).publicTxSimulator;
        const originalSimulate = simulator.simulate.bind(simulator);
        // We only stub the simulate method if it's NOT the first time we see the tx
        // so the proposer works fine, but we cause the failure in the validators.
        jest.spyOn(simulator, 'simulate').mockImplementation((tx: Tx) => {
          const txHash = tx.getTxHash().toString();
          if (seenTxs.has(txHash)) {
            t.logger.warn('Calling stubbed simulate for tx', { txHash });
            return stub(tx, originalSimulate);
          } else {
            seenTxs.add(txHash);
            t.logger.warn('Calling original simulate for tx', { txHash });
            return originalSimulate(tx);
          }
        });
        return deps;
      });
    };

    // Have the public tx processor take an extra long time to process the tx, so the validator times out
    const interceptTxProcessorWithTimeout = (node: AztecNodeService) => {
      interceptTxProcessorSimulate(node, (tx: Tx, originalSimulate: (tx: Tx) => SimulationHandle) => {
        const result = (async () => {
          t.logger.warn('Public tx simulator sleeping for 40s to simulate timeout', { txHash: tx.getTxHash() });
          await sleep(40_000);
          return originalSimulate(tx).result;
        })();
        return { result, cancel: async () => {} };
      });
    };

    // Have the public tx processor throw when processing a tx
    const interceptTxProcessorWithFailure = (node: AztecNodeService) => {
      interceptTxProcessorSimulate(node, (tx: Tx, _originalSimulate: (tx: Tx) => SimulationHandle) => {
        const result = (async () => {
          await sleep(1);
          t.logger.warn('Public tx simulator failing', { txHash: tx.getTxHash() });
          throw new Error(`Fake tx failure`);
        })();
        return { result, cancel: async () => {} };
      });
    };

    it.each([
      ['ReExStateMismatchError', new ReExStateMismatchError(Fr.ZERO, Fr.ZERO).message, interceptBroadcastProposal],
      ['ReExTimeoutError', new ReExTimeoutError().message, interceptTxProcessorWithTimeout],
      ['ReExFailedTxsError', new ReExFailedTxsError(1).message, interceptTxProcessorWithFailure],
    ])(
      'rejects proposal with %s',
      async (errType: string, errMsg: string, nodeInterceptor: (node: AztecNodeService) => void) => {
        t.logger.info(`Running test with ${errType}`);

        await pauseProposals();

        // Hook into the node and intercept re-execution logic
        t.logger.info('Installing interceptors');
        jest.restoreAllMocks();
        const reExecutionSpies: any[] = [];
        for (const node of nodes) {
          nodeInterceptor(node);
          // Collect re-execution spies
          // TODO(palla/mbps): Fix this spy, we have removed this method
          // reExecutionSpies.push(
          //   jest.spyOn((node as any).sequencer.sequencer.validatorClient as ValidatorClient, 'reExecuteTransactions'),
          // );
        }

        // Start a fresh slot and resume proposals
        const [ts] = await t.ctx.cheatCodes.rollup.advanceToNextSlot();
        t.ctx.dateProvider.setTime(Number(ts) * 1000);

        await resumeProposals();

        // We ensure that the transactions are NOT mined in the next slot
        const txResults = await Promise.allSettled(
          txs.map(async (txHash: TxHash, i: number) => {
            t.logger.info(`Waiting for tx ${i}: ${txHash.toString()} to be mined`);
            return await waitForTx(nodes[0], txHash, { timeout: t.ctx.aztecNodeConfig.aztecSlotDuration * 2 });
          }),
        );

        // Check that txs are not mined
        expect(txResults.map(r => r.status)).toEqual(times(NUM_TXS_PER_NODE, () => 'rejected'));
        t.logger.info('Failed to mine txs as planned');

        // Expect that all of the re-execution attempts failed with an invalid root
        // Expect at least one re-execution attempt to fail with the expected error
        expect(reExecutionSpies.length).toBeGreaterThan(0);

        let mismatchCount = 0;
        const allowedMismatches = 1; // Sometimes proposer does not play ball

        for (const spy of reExecutionSpies) {
          for (const result of spy.mock.results) {
            try {
              await expect(result.value).rejects.toThrow(errMsg);
            } catch (e) {
              mismatchCount += 1;
              t.logger.debug('Re-execution did not throw expected error', { error: e });
            }
          }
        }

        expect(mismatchCount).toBeLessThanOrEqual(allowedMismatches);

        t.logger.info(`Test with ${errType} complete`);
      },
    );
  });
});
