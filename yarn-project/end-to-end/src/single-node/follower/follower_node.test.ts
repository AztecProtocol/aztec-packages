import { type InitialAccountData, generateSchnorrAccounts } from '@aztec/accounts/testing';
import { type AztecNodeService, createAztecNodeService } from '@aztec/aztec-node';
import { NO_FROM } from '@aztec/aztec.js/account';
import type { AztecAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import { BlockNumber } from '@aztec/foundation/branded-types';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import type { L2TipId } from '@aztec/stdlib/block';
import type { AztecNode } from '@aztec/stdlib/interfaces/client';
import { TxExecutionResult } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';

import type { EndToEndContext } from '../../fixtures/utils.js';
import { setupPXEAndGetWallet } from '../../fixtures/utils.js';
import { waitForBlockNumber, waitForNodeCheckpoint, waitForNodeProvenCheckpoint } from '../../fixtures/wait_helpers.js';
import type { TestWallet } from '../../test-wallet/test_wallet.js';
import { setupBlockProducer } from '../setup.js';
import type { SingleNodeTestContext } from '../single_node_test_context.js';
import { type UpstreamRpcServer, createFollowerNode, startUpstreamRpcServer } from './setup.js';

// Exercises follower mode end to end: a second node that replicates the whole chain from an upstream node
// over HTTP JSON-RPC, with p2p off and **no L1 connection at all**, and that forwards the transactions it
// receives to that upstream.
//
// Topology: `setupBlockProducer` (one production sequencer, no prover, NO_REORG_SUBMISSION_EPOCHS so the
// pending chain is never pruned out from under the test), the upstream node served over an ephemeral HTTP
// port, and one follower node created through the production `createAztecNodeService` factory. A PXE is
// attached to the follower so the wallet flows run against it.
//
// The `it`s share one environment and run in order: the chain-rollback case is destructive, so it comes
// after the wallet cases, and the proven-tip case runs after the rollback so the manually-proven tip is not
// in the way of `rollbackTo`.
describe('single-node/follower/follower_node', () => {
  jest.setTimeout(1000 * 60 * 12);

  let test: SingleNodeTestContext;
  let context: EndToEndContext;
  let logger: Logger;

  let upstreamNode: AztecNode;
  let upstreamServer: UpstreamRpcServer;
  let followerNode: AztecNodeService;

  let fundedAccount: InitialAccountData;
  let followerWallet: TestWallet;
  let stopFollowerWallet: (() => Promise<void>) | undefined;
  let accountAddress: AztecAddress;
  let testContract: TestContract;

  beforeAll(async () => {
    [fundedAccount] = await generateSchnorrAccounts(1, 'schnorr');
    test = await setupBlockProducer({ numberOfAccounts: 0, additionallyFundedAccounts: [fundedAccount] });
    ({ context, logger } = test);
    upstreamNode = context.aztecNode;

    upstreamServer = await startUpstreamRpcServer(context.aztecNodeService, context.config, logger);
    followerNode = await createFollowerNode(test, upstreamServer.url);

    ({ wallet: followerWallet, teardown: stopFollowerWallet } = await setupPXEAndGetWallet(
      followerNode,
      undefined,
      { syncChainTip: 'proposed' },
      logger,
      'pxe-follower',
    ));
  });

  afterAll(async () => {
    await stopFollowerWallet?.();
    await followerNode?.stop();
    await upstreamServer?.stop();
    await test?.teardown();
  });

  it('replicates the upstream chain and reports itself ready', async () => {
    // The follower blocks on its initial replication pass during creation, so it is already ready here.
    expect(await followerNode.isReady()).toBe(true);

    await waitForNodeCheckpoint(upstreamNode, 2, { timeout: test.L2_SLOT_DURATION_IN_S * 8 });
    const upstreamTip = (await upstreamNode.getChainTips()).checkpointed;
    await expectFollowerToReplicate(upstreamTip);

    // World state follows the replicating archiver exactly as it follows an L1-syncing one.
    const worldState = await followerNode.getWorldStateSyncStatus();
    expect(worldState.latestBlockNumber).toBeGreaterThanOrEqual(upstreamTip.block.number);
    expect(worldState.treesAreSynched).toBe(true);
  });

  it('serves a PXE that deploys contracts and sends transactions through its upstream', async () => {
    // The account deploy is the first tx the follower forwards: the PXE proves it locally, the follower
    // validates it (proof included) and hands it to the upstream, and the receipt only reaches a mined status
    // once the follower has replicated the block that mined it.
    const account = await followerWallet.createSchnorrAccount(
      fundedAccount.secret,
      fundedAccount.salt,
      fundedAccount.signingKey,
    );
    accountAddress = account.address;
    const deployAccountMethod = await account.getDeployMethod();
    const { receipt: accountReceipt } = await deployAccountMethod.send({ from: NO_FROM });
    await expectMinedOnFollower(accountReceipt.blockNumber);

    const deployed = await TestContract.deploy(followerWallet).send({ from: accountAddress });
    testContract = deployed.contract;
    await expectMinedOnFollower(deployed.receipt.blockNumber);

    // Public simulation on a follower runs against fees approximated from the upstream's predicted-min-fee
    // window rather than an L1 `eth_call`, so the interesting part is that the tx it produces still clears
    // the upstream's own fee checks when the follower forwards it.
    await testContract.methods.emit_nullifier_public(new Fr(7)).simulate({ from: accountAddress });
    const { receipt } = await testContract.methods.emit_nullifier_public(new Fr(7)).send({ from: accountAddress });
    expect(receipt.executionResult).toEqual(TxExecutionResult.SUCCESS);
    await expectMinedOnFollower(receipt.blockNumber);

    // The effect is served from the follower's own store, not proxied.
    expect(await followerNode.getTxEffect(receipt.txHash)).toBeDefined();
  });

  it('rejects an invalid transaction locally instead of forwarding it upstream', async () => {
    const { receipt } = await testContract.methods.emit_nullifier_public(new Fr(8)).send({ from: accountAddress });
    const minedTx = await upstreamNode.getTxByHash(receipt.txHash, { includeProof: true });
    expect(minedTx).toBeDefined();

    // Re-submitting a mined tx double-spends its nullifiers against the follower's own state. The follower
    // runs the whole RPC validation pipeline before forwarding, so this is rejected here and the upstream
    // never sees it. Never reaching the upstream is the point of the change, and a spy is the only way to
    // observe it: a tx the follower rejects would be rejected upstream too, leaving no other trace.
    const upstreamSendTx = jest.spyOn(context.aztecNodeService, 'sendTx');
    try {
      await expect(followerNode.sendTx(minedTx!)).rejects.toThrow(/Invalid tx: .*Existing nullifier/);
      expect(upstreamSendTx).not.toHaveBeenCalled();
    } finally {
      upstreamSendTx.mockRestore();
    }
  });

  it('follows the upstream when its chain is rolled back', async () => {
    await waitForBlockNumber(upstreamNode, 4, { tag: 'checkpointed', timeout: test.L2_SLOT_DURATION_IN_S * 8 });
    const blockNumberBeforeRollback = await upstreamNode.getBlockNumber('checkpointed');
    const target = BlockNumber(blockNumberBeforeRollback - 2);

    // Leave the upstream's own sync paused after the rollback (`resumeSync: false`) so it cannot re-fetch
    // the rolled-back blocks from L1 before the follower has had a chance to notice the tip move backwards.
    logger.info(`Rolling the upstream node back from block ${blockNumberBeforeRollback} to ${target}`);
    await context.aztecNodeAdmin.rollbackTo(target, false, false);
    expect(await upstreamNode.getBlockNumber()).toEqual(target);

    await waitForBlockNumber(followerNode, target, { compare: (actual, t) => actual === t, timeout: 30 });
    expect(await followerNode.getBlockNumber('checkpointed')).toEqual(target);
    const worldState = await followerNode.getWorldStateSyncStatus();
    expect(worldState.latestBlockNumber).toBeLessThanOrEqual(target);

    logger.info(`Resuming upstream sync and waiting for both nodes to climb back to the previous tip`);
    await context.aztecNodeAdmin.resumeSync();
    await waitForBlockNumber(upstreamNode, blockNumberBeforeRollback, { tag: 'checkpointed', timeout: 60 });
    await expectFollowerToReplicate((await upstreamNode.getChainTips()).checkpointed);
  });

  it('replicates the upstream proven tip', async () => {
    const checkpointNumber = await upstreamNode.getCheckpointNumber('checkpointed');
    await context.cheatCodes.rollup.markAsProven(checkpointNumber);

    await waitForNodeProvenCheckpoint(upstreamNode, checkpointNumber, { timeout: 30 });
    await waitForNodeProvenCheckpoint(followerNode, checkpointNumber, { timeout: 30 });

    const [upstreamTips, followerTips] = await Promise.all([upstreamNode.getChainTips(), followerNode.getChainTips()]);
    expect(followerTips.proven.checkpoint.number).toBeGreaterThanOrEqual(checkpointNumber);
    expect(followerTips.proven.checkpoint.number).toBeLessThanOrEqual(upstreamTips.proven.checkpoint.number);
  });

  it('refuses to start against an upstream serving a different rollup', async () => {
    const configuredVersion = typeof context.config.rollupVersion === 'number' ? context.config.rollupVersion : 1;
    await expect(
      createFollowerNode(test, upstreamServer.url, { rollupVersion: configuredVersion + 1 }),
    ).rejects.toThrow(/Cannot follow the upstream node/);
  });

  it('refuses to start on a genesis state that differs from its upstream', async () => {
    // An empty genesis hashes differently from the funded one this network was deployed with, which would
    // otherwise show up much later as every archive root disagreeing.
    await expect(createFollowerNode(test, upstreamServer.url, {}, { genesis: undefined })).rejects.toThrow(
      /genesis block hash .* does not match the upstream/,
    );
  });

  it('refuses to start a node with no upstream and no L1 connection', async () => {
    // The mirror image of the follower guard: every other node role needs L1, and says so at startup.
    await expect(
      createAztecNodeService({ ...context.config, l1RpcUrls: [] }, {}, { genesis: context.genesis }),
    ).rejects.toThrow(/No L1 RPC URLs configured/);
  });

  /** Asserts the follower has replicated the upstream's checkpointed tip, block hash and archive root included. */
  async function expectFollowerToReplicate(upstreamTip: L2TipId) {
    await waitForNodeCheckpoint(followerNode, upstreamTip.checkpoint.number, { timeout: 30 });
    const [upstreamBlock, followerBlock] = await Promise.all([
      upstreamNode.getBlockData(upstreamTip.block.number),
      followerNode.getBlockData(upstreamTip.block.number),
    ]);
    expect(followerBlock).toBeDefined();
    expect(followerBlock!.blockHash.toString()).toEqual(upstreamBlock!.blockHash.toString());
    expect(followerBlock!.archive.root.toString()).toEqual(upstreamBlock!.archive.root.toString());
  }

  /**
   * Asserts a receipt the follower reported as mined names a block the follower can actually serve. A mined
   * receipt is never built from what the upstream reports, precisely so this holds.
   */
  async function expectMinedOnFollower(blockNumber: number | undefined) {
    expect(blockNumber).toBeDefined();
    expect(await followerNode.getBlockNumber()).toBeGreaterThanOrEqual(blockNumber!);
    expect(await followerNode.getBlockData(BlockNumber(blockNumber!))).toBeDefined();
  }
});
