import type { AztecNodeService } from '@aztec/aztec-node';
import { type SentTx, Tx, sleep } from '@aztec/aztec.js';
import { times } from '@aztec/foundation/collection';
import type { BlockBuilder } from '@aztec/sequencer-client';
import type { PublicTxResult, PublicTxSimulator } from '@aztec/simulator/server';
import { BlockProposal, SignatureDomainSeparator, getHashedSignaturePayload } from '@aztec/stdlib/p2p';
import { ReExFailedTxsError, ReExStateMismatchError, ReExTimeoutError } from '@aztec/stdlib/validators';
import type { ValidatorClient } from '@aztec/validator-client';

import { describe, it, jest } from '@jest/globals';
import fs from 'fs';
import os from 'os';
import path from 'path';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { submitComplexTxsTo } from './shared.js';

const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 1;
const BASE_BOOT_NODE_UDP_PORT = 4500;
const DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'reex-'));

describe('e2e_p2p_reex', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let txs: SentTx[];

  beforeAll(async () => {
    nodes = [];

    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_reex',
      numberOfNodes: NUM_NODES,
      basePort: BASE_BOOT_NODE_UDP_PORT,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      metricsPort: shouldCollectMetrics(),
      initialConfig: {
        enforceTimeTable: true,
        txTimeoutMs: 30_000,
        listenAddress: '127.0.0.1',
        aztecProofSubmissionEpochs: 1024, // effectively do not reorg
      },
    });

    t.logger.info('Apply base snapshots');
    await t.applyBaseSnapshots();

    t.logger.info('Setup snapshot manager');
    await t.setup();

    t.logger.info('Stopping main node sequencer');
    await t.ctx.aztecNode.getSequencer()?.stop();

    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    t.logger.info('Creating peer nodes');
    nodes = await createNodes(
      {
        ...t.ctx.aztecNodeConfig,
        validatorReexecute: true,
        minTxsPerBlock: 1,
        maxTxsPerBlock: NUM_TXS_PER_NODE,
      },
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_NODES,
      BASE_BOOT_NODE_UDP_PORT,
      t.prefilledPublicData,
      DATA_DIR,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      shouldCollectMetrics(),
    );

    // Wait a bit for peers to discover each other
    t.logger.info('Waiting for peer discovery');
    await sleep(8000);

    t.logger.info('Setup account');
    await t.setupAccount();

    t.logger.info('Deploy spam contract');
    await t.deploySpamContract();

    // Submit the txs to the mempool. We submit a single set of txs, and then inject different behaviors
    // into the validator nodes to cause them to fail in different ways.
    t.logger.info('Submitting txs');
    txs = await submitComplexTxsTo(t.logger, t.spamContract!, NUM_TXS_PER_NODE, { callPublic: true });
  }, 360 * 1000);

  afterAll(async () => {
    // shutdown all nodes.
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${DATA_DIR}-${i}`, { recursive: true, force: true, maxRetries: 3 });
    }
  });

  describe('validators re-execute transactions before attesting', () => {
    // Keep track of txs we have seen, so we do not intercept the simulate call on the first run (the block-proposer's)
    let seenTxs: Set<string>;
    beforeEach(() => {
      seenTxs = new Set();
    });

    // Hold off sequencers from building a block
    const pauseProposals = () =>
      Promise.all(
        nodes.map(node => node.getSequencer()?.updateSequencerConfig({ minTxsPerBlock: NUM_TXS_PER_NODE + 1 })),
      );

    // Reenable them
    const resumeProposals = () =>
      Promise.all(nodes.map(node => node.getSequencer()?.updateSequencerConfig({ minTxsPerBlock: NUM_TXS_PER_NODE })));

    // Make sure the nodes submit faulty proposals, in this case a faulty proposal is one where we remove one of the transactions
    // Such that the calculated archive will be different!
    const interceptBroadcastProposal = (node: AztecNodeService) => {
      jest.spyOn((node as any).p2pClient, 'broadcastProposal').mockImplementation(async (...args: unknown[]) => {
        // We remove one of the transactions, therefore the block root will be different!
        const proposal = args[0] as BlockProposal;
        const { txHashes } = proposal.payload;

        // We need to mutate the proposal, so we cast to any
        (proposal.payload as any).txHashes = txHashes.slice(0, txHashes.length - 1);

        // We sign over the proposal using the node's signing key
        // Abusing javascript to access the nodes signing key
        const signer = (node as any).sequencer.sequencer.validatorClient.validationService.keyStore;
        const newProposal = new BlockProposal(
          proposal.blockNumber,
          proposal.payload,
          await signer.signMessage(getHashedSignaturePayload(proposal.payload, SignatureDomainSeparator.blockProposal)),
        );

        return (node as any).p2pClient.p2pService.propagate(newProposal);
      });
    };

    // Intercepts the simulator within the tx processor within the processor factory with the given function
    // Only the processor for validators is intercepted, the one for the proposer is left untouched
    // We abuse the fact that the proposer will always run before the validators
    const interceptTxProcessorSimulate = (
      node: AztecNodeService,
      stub: (tx: Tx, originalSimulate: (tx: Tx) => Promise<PublicTxResult>) => Promise<PublicTxResult>,
    ) => {
      const blockBuilder: BlockBuilder = (node as any).sequencer.sequencer.blockBuilder;
      const originalCreateDeps = blockBuilder.makeBlockBuilderDeps.bind(blockBuilder);
      jest
        .spyOn(blockBuilder, 'makeBlockBuilderDeps')
        .mockImplementation(async (...args: Parameters<BlockBuilder['makeBlockBuilderDeps']>) => {
          const deps = await originalCreateDeps(...args);
          t.logger.warn('Creating mocked processor factory');
          const simulator: PublicTxSimulator = (deps.processor as any).publicTxSimulator;
          const originalSimulate = simulator.simulate.bind(simulator);
          // We only stub the simulate method if it's NOT the first time we see the tx
          // so the proposer works fine, but we cause the failure in the validators.
          jest.spyOn(simulator, 'simulate').mockImplementation(async (tx: Tx) => {
            const txHash = (await tx.getTxHash()).toString();
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
      interceptTxProcessorSimulate(node, async (tx: Tx, originalSimulate: (tx: Tx) => Promise<PublicTxResult>) => {
        t.logger.warn('Public tx simulator sleeping for 40s to simulate timeout', { txHash: await tx.getTxHash() });
        await sleep(40_000);
        return originalSimulate(tx);
      });
    };

    // Have the public tx processor throw when processing a tx
    const interceptTxProcessorWithFailure = (node: AztecNodeService) => {
      interceptTxProcessorSimulate(node, async (tx: Tx, _originalSimulate: (tx: Tx) => Promise<PublicTxResult>) => {
        await sleep(1);
        t.logger.warn('Public tx simulator failing', { txHash: await tx.getTxHash() });
        throw new Error(`Fake tx failure`);
      });
    };

    it.each([
      ['ReExStateMismatchError', new ReExStateMismatchError().message, interceptBroadcastProposal],
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
        const reExecutionSpies = [];
        for (const node of nodes) {
          nodeInterceptor(node);
          // Collect re-execution spies
          reExecutionSpies.push(
            jest.spyOn((node as any).sequencer.sequencer.validatorClient as ValidatorClient, 'reExecuteTransactions'),
          );
        }

        // Start a fresh slot and resume proposals
        const [ts] = await t.ctx.cheatCodes.rollup.advanceToNextSlot();
        t.ctx.dateProvider.setTime(Number(ts) * 1000);

        await resumeProposals();

        // We ensure that the transactions are NOT mined in the next slot
        const txResults = await Promise.allSettled(
          txs.map(async (tx: SentTx, i: number) => {
            t.logger.info(`Waiting for tx ${i}: ${await tx.getTxHash()} to be mined`);
            return tx.wait({ timeout: t.ctx.aztecNodeConfig.aztecSlotDuration * 2 });
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
