import { type AztecNodeService } from '@aztec/aztec-node';
import { type SentTx, sleep } from '@aztec/aztec.js';

/* eslint-disable-next-line no-restricted-imports */
import { BlockProposal, SignatureDomainSeparator, getHashedSignaturePayload } from '@aztec/circuit-types';
import { type PublicTxSimulator } from '@aztec/simulator';
import { ReExFailedTxsError, ReExStateMismatchError, ReExTimeoutError } from '@aztec/validator-client/errors';

import { describe, it, jest } from '@jest/globals';
import fs from 'fs';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { createNodes } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest } from './p2p_network.js';
import { submitComplexTxsTo } from './shared.js';

const NUM_NODES = 4;
const NUM_TXS_PER_NODE = 1;
const BASE_BOOT_NODE_UDP_PORT = 40000;
const BASE_DATA_DIR = './data/re-ex';

describe('e2e_p2p_reex', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[];
  let bootNodeUdpPort: number = BASE_BOOT_NODE_UDP_PORT;
  let dataDir: string;

  beforeEach(async () => {
    nodes = [];
    bootNodeUdpPort += 1000;
    dataDir = `${BASE_DATA_DIR}/${bootNodeUdpPort.toString()}`;

    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_reex',
      numberOfNodes: NUM_NODES,
      basePort: bootNodeUdpPort,
      // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
      metricsPort: shouldCollectMetrics(),
      initialConfig: { enforceTimeTable: true },
    });

    t.logger.verbose('Setup account');
    await t.setupAccount();

    t.logger.verbose('Deploy spam contract');
    await t.deploySpamContract();

    t.logger.verbose('Apply base snapshots');
    await t.applyBaseSnapshots();

    t.logger.verbose('Setup nodes');
    await t.setup();
  });

  afterEach(async () => {
    // shutdown all nodes.
    await t.stopNodes(nodes);
    await t.teardown();
    for (let i = 0; i < NUM_NODES; i++) {
      fs.rmSync(`${dataDir}-${i}`, { recursive: true, force: true });
    }
  });

  describe('validators re-execute transactions before attesting', () => {
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
          proposal.payload,
          await signer.signMessage(getHashedSignaturePayload(proposal.payload, SignatureDomainSeparator.blockProposal)),
        );

        return (node as any).p2pClient.p2pService.propagate(newProposal);
      });
    };

    // Intercepts the simulator within the tx processor within the processor factory with the given function
    // Only the processor for validators is intercepted, the one for the proposer is left untouched
    // We abuse the fact that the proposer will always run before the validators
    let interceptTxProcessorSimulatorCallCount = 0;
    const interceptTxProcessorSimulator = (
      node: AztecNodeService,
      intercept: (simulator: PublicTxSimulator) => void,
    ) => {
      const processorFactory = (node as any).sequencer.sequencer.publicProcessorFactory;
      const originalCreate = processorFactory.create.bind(processorFactory);
      jest.spyOn(processorFactory, 'create').mockImplementation((...args: unknown[]) => {
        interceptTxProcessorSimulatorCallCount++;
        const processor = originalCreate(...args);
        if (interceptTxProcessorSimulatorCallCount > 1) {
          t.logger.warn('Creating mocked processor factory');
          const simulator = (processor as any).publicTxSimulator;
          intercept(simulator);
        } else {
          t.logger.warn('Creating vanilla processor factory');
        }
        return processor;
      });
    };

    // Have the public tx processor take an extra long time to process the tx, so the validator times out
    const interceptTxProcessorWithTimeout = (node: AztecNodeService) => {
      interceptTxProcessorSimulator(node, simulator => {
        const anySimulator: any = simulator;
        const originalSimulate = anySimulator.simulate.bind(simulator);
        jest.spyOn(anySimulator, 'simulate').mockImplementation(async (...args: unknown[]) => {
          t.logger.warn('Public tx simulator sleeping for 40s to simulate timeout');
          await sleep(40_000);
          return originalSimulate(...args);
        });
      });
    };

    // Have the public tx processor throw when processing a tx
    const interceptTxProcessorWithFailure = (node: AztecNodeService) => {
      interceptTxProcessorSimulator(node, simulator => {
        const anySimulator: any = simulator;
        jest.spyOn(anySimulator, 'simulate').mockImplementation(async () => {
          t.logger.warn('Public tx simulator failing');
          await sleep(1);
          throw new Error(`Fake tx failure`);
        });
      });
    };

    it.each([
      ['ReExStateMismatchError', new ReExStateMismatchError().message, interceptBroadcastProposal],
      ['ReExTimeoutError', new ReExTimeoutError().message, interceptTxProcessorWithTimeout],
      ['ReExFailedTxsError', new ReExFailedTxsError(1).message, interceptTxProcessorWithFailure],
    ])(
      'rejects proposal with %s',
      async (_errType: string, errMsg: string, nodeInterceptor: (node: AztecNodeService) => void) => {
        // create the bootstrap node for the network
        if (!t.bootstrapNodeEnr) {
          throw new Error('Bootstrap node ENR is not available');
        }

        t.ctx.aztecNodeConfig.validatorReexecute = true;

        t.logger.info('Creating nodes');
        nodes = await createNodes(
          t.ctx.aztecNodeConfig,
          t.ctx.dateProvider,
          t.bootstrapNodeEnr,
          NUM_NODES,
          bootNodeUdpPort,
          dataDir,
          // To collect metrics - run in aztec-packages `docker compose --profile metrics up` and set COLLECT_METRICS=true
          shouldCollectMetrics(),
        );

        // Hook into the node and intercept re-execution logic
        t.logger.info('Installing interceptors');
        const reExecutionSpies = [];
        for (const node of nodes) {
          nodeInterceptor(node);
          // Collect re-execution spies node -> sequencer client -> sequencer -> validator
          const spy = jest.spyOn((node as any).sequencer.sequencer.validatorClient, 'reExecuteTransactions');
          reExecutionSpies.push(spy);
        }

        // Wait a bit for peers to discover each other
        t.logger.info('Waiting for peer discovery');
        await sleep(4000);

        nodes.forEach(node => {
          node.getSequencer()?.updateSequencerConfig({
            minTxsPerBlock: NUM_TXS_PER_NODE,
            maxTxsPerBlock: NUM_TXS_PER_NODE,
          });
        });

        t.logger.info('Submitting txs');
        const txs = await submitComplexTxsTo(t.logger, t.spamContract!, NUM_TXS_PER_NODE, { callPublic: true });

        // We ensure that the transactions are NOT mined
        // FIXME: This only works if NUM_TXS_PER_NODE is 1, otherwise this throws on the 1st tx that times out.
        try {
          await Promise.all(
            txs.map(async (tx: SentTx, i: number) => {
              t.logger.info(`Waiting for tx ${i}: ${await tx.getTxHash()} to be mined`);
              return tx.wait({ timeout: 60 });
            }),
          );
        } catch (e) {
          t.logger.info('Failed to mine txs as planned');
        }

        // Expect that all of the re-execution attempts failed with an invalid root
        for (const spy of reExecutionSpies) {
          for (const result of spy.mock.results) {
            await expect(result.value).rejects.toThrow(errMsg);
          }
        }
      },
    );
  });
});
