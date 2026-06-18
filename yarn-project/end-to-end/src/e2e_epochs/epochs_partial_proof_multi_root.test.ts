import { EthAddress } from '@aztec/aztec.js/addresses';
import { Fr } from '@aztec/aztec.js/fields';
import type { Logger } from '@aztec/aztec.js/log';
import type { AztecNode } from '@aztec/aztec.js/node';
import { EpochTestSettler } from '@aztec/aztec/testing';
import { MAX_CHECKPOINTS_PER_EPOCH } from '@aztec/constants';
import { OutboxContract, type ViemL2ToL1Msg } from '@aztec/ethereum/contracts';
import type { L1ContractAddresses } from '@aztec/ethereum/l1-contract-addresses';
import type { ExtendedViemWalletClient } from '@aztec/ethereum/types';
import { EpochNumber } from '@aztec/foundation/branded-types';
import { retryUntil } from '@aztec/foundation/retry';
import { OutboxAbi } from '@aztec/l1-artifacts';
import { TestContract } from '@aztec/noir-test-contracts.js/Test';
import { computeL2ToL1MessageHash } from '@aztec/stdlib/hash';
import {
  type L2ToL1MembershipWitness,
  computeEpochOutHash,
  computeL2ToL1MembershipWitness,
  getL2ToL1MessageLeafId,
} from '@aztec/stdlib/messaging';
import { type TxReceipt, TxStatus } from '@aztec/stdlib/tx';

import { jest } from '@jest/globals';
import { type Hex, decodeEventLog } from 'viem';

import { EpochsTestContext } from './epochs_test.js';

jest.setTimeout(1000 * 60 * 10);

// Suite: verifies the AZIP-14 partial-proof multi-root Outbox design. Drives an EpochTestSettler
// manually to stage progressively deeper partial-proof roots (K=1, 2, 3) for the same epoch, then
// asserts: (a) the node picks the smallest covering root, (b) any covering root produces a valid
// consume tx, (c) the shared bitmap blocks double-spend, and (d) K=4 can be staged later.
// EpochsTestContext: single node, no prover, prod-seq, interval mining. Timing: ethSlot=default
// (8s/12s CI), aztecSlot=default, epoch=1000, proofSubmissionEpochs=1024, disableAnvilTestWatcher.
// The test actively calls the Outbox L1 contract to consume L2-to-L1 messages → cross-chain.
describe('e2e_epochs/epochs_partial_proof_multi_root', () => {
  let test: EpochsTestContext;
  let logger: Logger;
  let node: AztecNode;
  let l1Client: ExtendedViemWalletClient;
  let l1Contracts: L1ContractAddresses;
  let outbox: OutboxContract;
  let settler: EpochTestSettler;

  // The L1 EOA that submits the consume() tx. The L2-to-L1 message recipient must equal this
  // address. The Outbox enforces `msg.sender == _message.recipient.actor` on consume.
  let recipient: EthAddress;

  beforeEach(async () => {
    test = await EpochsTestContext.setup({
      numberOfAccounts: 1,
      minTxsPerBlock: 1,
      // With the enforced timetable this setup can have 5 blocks per checkpoint. The default
      // fallback DA gas for the TestContract deploy is based on a 4-block checkpoint, so give the
      // first block enough of the checkpoint DA budget to include the deploy tx.
      perBlockAllocationMultiplier: 1.3,
      // Long epoch so 4 well-spaced checkpoints comfortably fit before the boundary.
      aztecEpochDuration: 1000,
      // Don't let the real prover land a partial proof under us. We drive Outbox state via the
      // settler. `aztecProofSubmissionEpochs` >> test duration makes it impossible to enter the
      // submission window.
      aztecProofSubmissionEpochs: 1024,
      startProverNode: false,
    });
    ({ logger } = test);
    node = test.context.aztecNode;
    l1Client = test.context.deployL1ContractsValues.l1Client;
    l1Contracts = test.context.deployL1ContractsValues.l1ContractAddresses;
    outbox = new OutboxContract(l1Client, l1Contracts.outboxAddress);
    recipient = EthAddress.fromString(l1Client.account.address);

    // Construct a standalone EpochTestSettler that we drive by hand: we never call `.start()`,
    // just `handleEpochReadyToProve(epoch)` synchronously after each tx is checkpointed. That
    // keeps the prover-style polling loop out of the way and lets the test choose exactly when
    // each progressive K root lands in the Outbox.
    settler = new EpochTestSettler(
      test.context.cheatCodes.eth,
      l1Contracts.rollupAddress,
      test.context.aztecNodeService.getBlockSource(),
      logger.createChild('epoch-settler'),
      { pollingIntervalMs: 200 },
    );
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await test.teardown();
  });

  // Deploys TestContract, advances past the setup epoch, then sends 4 L2-to-L1-message txs each
  // in a fresh slot. After the first 3, calls settler.handleEpochReadyToProve to insert K=1, 2, 3
  // partial-proof roots. Asserts Outbox roots match locally-computed values, verifies consume()
  // succeeds under each covering K, and confirms the shared bitmap prevents re-consumption.
  it('stages 3 partial-proof roots and lets messages consume against any covering root', async () => {
    const { wallet } = test.context;
    const [from] = test.context.accounts;
    const version = BigInt(test.context.aztecNodeConfig.rollupVersion);
    const chainId = BigInt(l1Client.chain.id);

    // Deploy TestContract. It provides `create_l2_to_l1_message_arbitrary_recipient_private`,
    // the minimal way to emit a single L2-to-L1 message per tx.
    logger.warn(`Deploying TestContract`);
    const { contract } = await TestContract.deploy(wallet).send({ from });
    logger.warn(`Deployed TestContract at ${contract.address}`);

    // Warp past the current epoch so the deploy blocks (and any setup blocks) sit alone in the
    // previous epoch, leaving the new epoch with only the 4 L2-to-L1 message txs we are about to
    // send. Without this, the deploys would share an epoch with the messages and the per-checkpoint
    // assertions below would include the empty deploy checkpoints.
    await test.context.cheatCodes.rollup.advanceToNextEpoch();

    // Make each L2-to-L1 message ABI-shaped for the Outbox consume() call.
    const makeMsg = (content: Fr): ViemL2ToL1Msg => ({
      sender: { actor: contract.address.toString() as Hex, version },
      recipient: { actor: recipient.toString() as Hex, chainId },
      content: content.toString() as Hex,
    });
    const computeLeaf = (msg: ViemL2ToL1Msg) =>
      computeL2ToL1MessageHash({
        l2Sender: contract.address,
        l1Recipient: EthAddress.fromString(msg.recipient.actor),
        content: Fr.fromString(msg.content),
        rollupVersion: new Fr(msg.sender.version),
        chainId: new Fr(msg.recipient.chainId),
      });

    // Send 4 messages, each landing in a separate checkpoint of the same epoch. We send a tx,
    // wait for it to be CHECKPOINTED, then drive the settler to insert a partial-proof root that
    // covers the checkpoints seen so far (K=1, then K=2, then K=3). Between sends we advance an
    // L2 slot so the next tx lands in a fresh slot, and therefore the next checkpoint (one slot =
    // one checkpoint in current Aztec). The 4th tx is sent but intentionally NOT settled, to
    // exercise the "no covering root yet" negative case below.
    const sends: { msg: ViemL2ToL1Msg; leaf: Fr; receipt: TxReceipt }[] = [];
    let epoch: EpochNumber | undefined;
    for (let i = 0; i < 4; i++) {
      const content = Fr.random();
      const msg = makeMsg(content);
      const leaf = computeLeaf(msg);
      logger.warn(`Sending L2-to-L1 message ${i} (content=${content.toString()})`);
      const { receipt } = await contract.methods
        .create_l2_to_l1_message_arbitrary_recipient_private(content, recipient)
        .send({ from, wait: { waitForStatus: TxStatus.CHECKPOINTED } });
      logger.warn(`Tx ${i} checkpointed`, {
        txHash: receipt.txHash.toString(),
        blockNumber: receipt.blockNumber,
        epochNumber: receipt.epochNumber,
      });
      sends.push({ msg, leaf, receipt });

      if (epoch === undefined) {
        epoch = receipt.epochNumber;
        if (epoch === undefined) {
          throw new Error('First tx is missing an epochNumber on its receipt');
        }
      }
      expect(receipt.epochNumber).toBe(epoch);

      // Settle the epoch for the first 3 txs. The settler reads only checkpointed blocks from the
      // node, groups them per checkpoint, and inserts the resulting out-hash at
      // `numCheckpointsInEpoch = i + 1`. The 4th tx is left unsettled.
      if (i < 3) {
        logger.warn(`Settling epoch ${epoch} after tx ${i} (expecting K=${i + 1})`);
        await settler.handleEpochReadyToProve(epoch);
      }

      // Push the next tx into a fresh slot. Skipped after the last one.
      if (i < 3) {
        await test.context.cheatCodes.rollup.advanceToNextSlot();
      }
    }

    if (epoch === undefined) {
      throw new Error('No txs were sent');
    }

    // Confirm all 4 txs landed in the same epoch and 4 distinct checkpoints.
    const checkpointNumbers: number[] = [];
    for (const [i, { receipt }] of sends.entries()) {
      expect(receipt.epochNumber).toBe(epoch);
      const block = (await node.getBlock(receipt.blockNumber!))!;
      checkpointNumbers.push(Number(block.checkpointNumber));
      logger.warn(`Tx ${i} block ${receipt.blockNumber} is in checkpoint ${block.checkpointNumber}`);
    }
    expect(new Set(checkpointNumbers).size).toBe(4);
    // Checkpoints should be monotonically increasing (we advanced slots one-by-one).
    for (let i = 1; i < checkpointNumbers.length; i++) {
      expect(checkpointNumbers[i]).toBeGreaterThan(checkpointNumbers[i - 1]);
    }

    // Pull all messages in the epoch from the node, organized as checkpoint -> block -> tx ->
    // message. With 4 distinct checkpoints, each holding a single block with a single tx with a
    // single message, this should have shape [[[[m0]]], [[[m1]]], [[[m2]]], [[[m3]]]].
    const messagesPerCheckpoint = await node.getL2ToL1Messages(epoch);
    expect(messagesPerCheckpoint.length).toBe(4);
    for (let i = 0; i < 4; i++) {
      expect(messagesPerCheckpoint[i]).toHaveLength(1);
      expect(messagesPerCheckpoint[i][0]).toHaveLength(1);
      expect(messagesPerCheckpoint[i][0][0]).toHaveLength(1);
      expect(messagesPerCheckpoint[i][0][0][0].toString()).toBe(sends[i].leaf.toString());
    }

    // Recompute the 3 partial-proof roots locally for K in {1, 2, 3} to cross-check the settler.
    // This mirrors what the rollup proves on chain: slice the outer (checkpoint) array to the
    // first K entries and feed it to `computeEpochOutHash`, which internally zero-pads up to
    // OUT_HASH_TREE_LEAF_COUNT.
    const root1 = computeEpochOutHash(messagesPerCheckpoint.slice(0, 1));
    const root2 = computeEpochOutHash(messagesPerCheckpoint.slice(0, 2));
    const root3 = computeEpochOutHash(messagesPerCheckpoint.slice(0, 3));
    expect(root1.equals(root2)).toBe(false);
    expect(root2.equals(root3)).toBe(false);

    // Sanity-check the Outbox holds exactly the 3 roots the settler inserted, padded with zeros
    // beyond.
    const onChainRoots = await outbox.getRoots(epoch);
    expect(onChainRoots).toHaveLength(MAX_CHECKPOINTS_PER_EPOCH);
    expect(onChainRoots[0].toString()).toBe(root1.toString());
    expect(onChainRoots[1].toString()).toBe(root2.toString());
    expect(onChainRoots[2].toString()).toBe(root3.toString());
    for (let i = 3; i < MAX_CHECKPOINTS_PER_EPOCH; i++) {
      expect(onChainRoots[i].isZero()).toBe(true);
    }

    // Consume msg2 against the smallest covering root the node picks (K=2).
    {
      // REFACTOR: hand-rolled retryUntil waiting for L2ToL1 membership witness availability; a
      // DSL helper like waitForL2ToL1MembershipWitness(txHash, leaf) would encapsulate the retry.
      const witness = await retryUntil(
        () => node.getL2ToL1MembershipWitness(sends[1].receipt.txHash, sends[1].leaf),
        'K=2 membership witness',
        30,
        1,
      );
      expect(witness).toBeDefined();
      expect(witness.epochNumber).toBe(epoch);
      expect(witness.numCheckpointsInEpoch).toBe(2);
      expect(witness.root.toString()).toBe(root2.toString());

      await expectConsumeSucceeds(sends[1].msg, sends[1].leaf, witness, epoch);
    }

    // Negative: msg4 lives in checkpoint at index 3, and the largest covering K we inserted is
    // K=3 (covers indices 0..2). The node must return undefined: no covering root yet.
    {
      const witness = await node.getL2ToL1MembershipWitness(sends[3].receipt.txHash, sends[3].leaf);
      expect(witness).toBeUndefined();
    }

    // "User can pick any covering root" property. We consume msg1 (in checkpoint at index 0)
    // against K=1, the default the helper picks. Then we manually build a witness against K=2
    // (by hiding slot 0 of the on-chain roots from the helper so it walks past it) and verify
    // the second consume reverts due to the shared bitmap.
    {
      // K=1 path (default node choice).
      const witnessK1 = await retryUntil(
        () => node.getL2ToL1MembershipWitness(sends[0].receipt.txHash, sends[0].leaf),
        'K=1 membership witness',
        30,
        1,
      );
      expect(witnessK1.numCheckpointsInEpoch).toBe(1);
      expect(witnessK1.root.toString()).toBe(root1.toString());
      await expectConsumeSucceeds(sends[0].msg, sends[0].leaf, witnessK1, epoch);

      // K=2 path: feed the helper a roots array with slot 0 zeroed so it picks the next covering
      // root (K=2). This case can't go through the node RPC (which always picks the smallest
      // covering root for the cached on-chain state), so we use the helper directly with a
      // synthetic roots array. Both K=1 and K=2 cover checkpoint 0, so this is a legitimate
      // witness, but the shared bitmap (indexed by stable leafId) must prevent a second consume.
      const rootsWithoutK1: Fr[] = [Fr.ZERO, ...onChainRoots.slice(1)];
      const witnessK2 = (await computeL2ToL1MembershipWitness(node, rootsWithoutK1, sends[0].leaf, sends[0].receipt))!;
      expect(witnessK2.numCheckpointsInEpoch).toBe(2);
      expect(witnessK2.root.toString()).toBe(root2.toString());
      // The K=2 witness must produce the same leafId as the K=1 witness (leafId is stable).
      expect(getL2ToL1MessageLeafId(witnessK2)).toBe(getL2ToL1MessageLeafId(witnessK1));

      // Trying to consume msg1 again, under either K, reverts.
      await expect(
        outbox.consume(
          sends[0].msg,
          witnessK2.epochNumber,
          witnessK2.numCheckpointsInEpoch,
          witnessK2.leafIndex,
          witnessK2.siblingPath.toFields().map(f => f.toString()),
        ),
      ).rejects.toThrow();
    }

    // Replay protection: consuming msg2 again (now under any covering root) reverts.
    {
      const witness = await retryUntil(
        () => node.getL2ToL1MembershipWitness(sends[1].receipt.txHash, sends[1].leaf),
        'replay membership witness',
        30,
        1,
      );
      await expect(
        outbox.consume(
          sends[1].msg,
          witness.epochNumber,
          witness.numCheckpointsInEpoch,
          witness.leafIndex,
          witness.siblingPath.toFields().map(f => f.toString()),
        ),
      ).rejects.toThrow();
    }

    // After all the above, slot 3..31 of the Outbox stayed zero (we never staged K=4..32).
    const rootsAfter = await outbox.getRoots(epoch);
    for (let i = 3; i < MAX_CHECKPOINTS_PER_EPOCH; i++) {
      expect(rootsAfter[i].isZero()).toBe(true);
    }

    // Once we drive the settler one more time, K=4 lands and the previously-unwitnessable msg4
    // becomes consumable.
    {
      await settler.handleEpochReadyToProve(epoch);
      const root4 = computeEpochOutHash(messagesPerCheckpoint.slice(0, 4));
      await retryUntil(async () => !(await outbox.getRoots(epoch))[3].isZero(), 'K=4 root visible', 10, 0.1);

      const witness = await retryUntil(
        () => node.getL2ToL1MembershipWitness(sends[3].receipt.txHash, sends[3].leaf),
        'K=4 membership witness',
        30,
        1,
      );
      expect(witness.numCheckpointsInEpoch).toBe(4);
      expect(witness.root.toString()).toBe(root4.toString());
      await expectConsumeSucceeds(sends[3].msg, sends[3].leaf, witness, epoch);
    }
  });

  /**
   * Submits an Outbox.consume tx and asserts: the L1 tx succeeds, exactly one MessageConsumed log
   * is emitted, and the log's epoch/root/messageHash/leafId match the supplied witness.
   */
  async function expectConsumeSucceeds(
    msg: ViemL2ToL1Msg,
    leaf: Fr,
    witness: L2ToL1MembershipWitness,
    epoch: EpochNumber,
  ) {
    const txHash = await outbox.consume(
      msg,
      witness.epochNumber,
      witness.numCheckpointsInEpoch,
      witness.leafIndex,
      witness.siblingPath.toFields().map(f => f.toString()),
    );
    const l1Receipt = await l1Client.waitForTransactionReceipt({ hash: txHash });
    expect(l1Receipt.status).toBe('success');
    expect(l1Receipt.logs.length).toBe(1);

    const decoded = decodeEventLog({
      abi: OutboxAbi,
      data: l1Receipt.logs[0].data,
      topics: l1Receipt.logs[0].topics,
    }) as {
      eventName: 'MessageConsumed';
      args: {
        epoch: bigint;
        root: `0x${string}`;
        messageHash: `0x${string}`;
        leafId: bigint;
        numCheckpointsInEpoch: bigint;
      };
    };
    expect(decoded.eventName).toBe('MessageConsumed');
    expect(decoded.args.epoch).toBe(BigInt(epoch));
    expect(decoded.args.root).toBe(witness.root.toString());
    expect(decoded.args.messageHash).toBe(leaf.toString());
    expect(decoded.args.leafId).toBe(getL2ToL1MessageLeafId(witness));
  }
});
