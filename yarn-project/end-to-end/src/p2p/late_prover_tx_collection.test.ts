import type { AztecNodeService } from '@aztec/aztec-node';
import { waitForTx } from '@aztec/aztec.js/node';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { tryStop } from '@aztec/stdlib/interfaces/server';
import type { Tx } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import { shouldCollectMetrics } from '../fixtures/fixtures.js';
import { ATTESTER_PRIVATE_KEYS_START_INDEX, createNodes, createProverNode } from '../fixtures/setup_p2p_test.js';
import { P2PNetworkTest, SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES, WAIT_FOR_TX_TIMEOUT } from './p2p_network.js';
import { submitTransactions } from './shared.js';

// A prover joins the mesh after a block has been mined and its proposal/tx gossip already happened,
// so it knows the block from its archiver (via L1 sync) but has no proposal locally and is missing
// the block's txs. It must fetch them from its (dumb) peers over reqresp BLOCK_TXS — the same path
// ProverNode.gatherTxs takes when preparing an epoch proof — and the test asserts the prover ends up
// holding all of the block's txs.

const NUM_VALIDATORS = 4;
const NUM_TXS = 2;
const BOOT_NODE_UDP_PORT = process.env.BOOT_NODE_UDP_PORT ? parseInt(process.env.BOOT_NODE_UDP_PORT) : 4900;
const AZTEC_SLOT_DURATION = 12;
const AZTEC_EPOCH_DURATION = 4;

jest.setTimeout(1000 * 60 * 10);

// Tests the reqresp BLOCK_TXS path for a prover that joins after a block has already been mined. The
// prover learns the block via L1/archiver sync but never received the proposal or txs via gossip.
// It must fetch the missing txs from peers over reqresp. Setup: P2PNetworkTest real libp2p, 4 validators,
// SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES (ethSlot=4s, aztecSlot=12s, epoch=4, proofSubEpochs=640),
// minTxsPerBlock=1, inboxLag=2. Late prover node created after transactions are already mined.
describe('e2e_p2p_late_prover_tx_collection', () => {
  let t: P2PNetworkTest;
  let nodes: AztecNodeService[] = [];
  let proverNode: AztecNodeService | undefined;

  beforeEach(async () => {
    t = await P2PNetworkTest.create({
      testName: 'e2e_p2p_late_prover_tx_collection',
      numberOfNodes: 0,
      numberOfValidators: NUM_VALIDATORS,
      basePort: BOOT_NODE_UDP_PORT,
      metricsPort: shouldCollectMetrics(),
      startProverNode: false, // we start our own prover, late, after a block is mined
      initialConfig: {
        ...SHORTENED_BLOCK_TIME_CONFIG_NO_PRUNES,
        aztecSlotDuration: AZTEC_SLOT_DURATION,
        aztecEpochDuration: AZTEC_EPOCH_DURATION,
        listenAddress: '127.0.0.1',
        // Only build blocks that actually carry txs, so the chain idles after our block is mined and
        // the late prover is never auto-triggered to collect for a different block.
        minTxsPerBlock: 1,
        inboxLag: 2,
      },
    });

    await t.setup();
    await t.applyBaseSetup();
  });

  afterEach(async () => {
    await tryStop(proverNode);
    await t.stopNodes(nodes);
    await t.teardown();
  });

  // Mines a block with 2 txs via 4 validators, then starts a prover node late (after gossip has already
  // propagated). Waits for the prover to sync the block from L1 and connect to peers, then drives
  // txCollection.collectFastForBlock directly and asserts all block txs are collected over reqresp.
  it("lets a late-joining prover collect a mined block's txs from dumb peers when it has no local proposal", async () => {
    if (!t.bootstrapNodeEnr) {
      throw new Error('Bootstrap node ENR is not available');
    }

    // 1. Stand up the validator network and let it form the mesh.
    t.logger.info('Creating validator nodes');
    nodes = await createNodes(
      t.ctx.aztecNodeConfig,
      t.ctx.dateProvider,
      t.bootstrapNodeEnr,
      NUM_VALIDATORS,
      BOOT_NODE_UDP_PORT,
      t.genesis,
      t.dataDirFor('validator'),
      shouldCollectMetrics(),
    );
    await t.waitForP2PMeshConnectivity(nodes, NUM_VALIDATORS);
    await t.setupAccount();

    // 2. Submit txs and wait for them to be mined into a block. The validators end up holding the
    //    proposal, the mined block, and the txs in their pools — everything the prover will be missing.
    t.logger.info('Submitting transactions and waiting for them to be mined');
    const txHashes = await submitTransactions(t.logger, nodes[0], NUM_TXS, t.fundedAccount);
    await Promise.all(txHashes.map(h => waitForTx(nodes[0], h, { timeout: WAIT_FOR_TX_TIMEOUT })));

    const receipt = await nodes[0].getTxReceipt(txHashes[0]);
    const minedBlockNumber = BlockNumber(receipt.blockNumber!);
    const minedBlock = await nodes[0].getBlockSource().getBlock({ number: minedBlockNumber });
    if (!minedBlock) {
      throw new Error(`Mined block ${minedBlockNumber} not found on validator`);
    }
    const blockTxHashes = minedBlock.body.txEffects.map(e => e.txHash);
    t.logger.info(`Block ${minedBlockNumber} mined with ${blockTxHashes.length} txs`);

    // 3. Start the prover LATE: after the block was mined and its proposal/tx gossip already happened.
    //    It learns the mined block via L1/archiver sync, but never received the proposal or the txs.
    t.logger.info('Creating late-joining prover node');
    // The prover node auto-starts a CheckpointProver whose background gatherTxs waits up to
    // txGatheringTimeoutMs for the block's txs. The second tx is never reachable via that background path
    // here, so the gather runs to its full deadline and blocks proverNode.stop() in afterEach. The
    // assertion only exercises the direct collectFastForBlock call (its own 4*slot deadline), so a short
    // timeout lets teardown's cancel unblock quickly without affecting what the test verifies.
    ({ proverNode } = await createProverNode(
      { ...t.ctx.aztecNodeConfig, txGatheringTimeoutMs: 15_000 },
      BOOT_NODE_UDP_PORT + NUM_VALIDATORS + 1,
      t.bootstrapNodeEnr,
      ATTESTER_PRIVATE_KEYS_START_INDEX + NUM_VALIDATORS + 1,
      { dateProvider: t.ctx.dateProvider },
      t.genesis,
      t.dataDirFor('late-prover'),
      shouldCollectMetrics(),
    ));

    // The prover syncs the mined block from L1 (no peers required), so wait for both the archive sync
    // and for it to actually peer with the network before driving reqresp collection.
    await retryUntil(
      async () => (await proverNode!.getBlockNumber()) >= minedBlockNumber,
      'prover to sync the mined block via L1',
      60,
      1,
    );
    await retryUntil(
      async () => (await proverNode!.getP2P().getPeers()).length >= 2,
      'prover to connect to peers',
      60,
      1,
    );

    // Sanity check: the prover does not have the block's txs (it joined after they were gossiped, and
    // gossip is not replayed to late joiners). The archiver only carries tx effects, not full txs.
    const txsBeforeCollection = await proverNode.getTxsByHash(blockTxHashes);
    expect(txsBeforeCollection.length).toBe(0);

    // 4. Drive the exact collection ProverNode.gatherTxs performs to prove the block: fetch the missing
    //    txs over reqresp BLOCK_TXS from dumb peers, running the prover's real response validation
    //    against its own (empty) attestation pool and its archiver.
    //
    //    Deadline must be computed against the same DateProvider the prover uses (advanced by the
    //    harness's cheatCodes). Using Date.now() would land in the past from the prover's view of time,
    //    and collectFastFor would short-circuit with timeout <= 0.
    const txCollection = (proverNode as unknown as { p2pClient: { txCollection: TxCollectionLike } }).p2pClient
      .txCollection;
    const collected = await txCollection.collectFastForBlock(minedBlock, blockTxHashes, {
      deadline: new Date(t.ctx.dateProvider.now() + AZTEC_SLOT_DURATION * 1000 * 4),
    });

    const collectedHashes = collected.map(tx => tx.getTxHash().toString()).sort();
    const expectedHashes = blockTxHashes.map(h => h.toString()).sort();
    expect(collectedHashes).toEqual(expectedHashes);
  });
});

/** Minimal shape of the (otherwise private) TxCollection we reach into for this test. */
interface TxCollectionLike {
  collectFastForBlock(block: unknown, txHashes: unknown[], opts: { deadline: Date }): Promise<Tx[]>;
}
