import { MAX_CHECKPOINTS_PER_EPOCH } from '@aztec/constants';
import type { OutboxContract } from '@aztec/ethereum/contracts';
import {
  BlockNumber,
  CheckpointNumber,
  EpochNumber,
  IndexWithinCheckpoint,
  SlotNumber,
} from '@aztec/foundation/branded-types';
import { sha256Trunc } from '@aztec/foundation/crypto/sha256';
import { Fr } from '@aztec/foundation/curves/bn254';
import { type L2ToL1MembershipWitness, computeEpochOutHash } from '@aztec/stdlib/messaging';
import { TxHash } from '@aztec/stdlib/tx';

import { type MockProxy, mock } from 'jest-mock-extended';

import { type OutboxTreesArchiverView, OutboxTreesResolver } from './outbox_trees_resolver.js';

/** Slots per epoch used to map fixture slot numbers back to epochs via `getEpochAtSlot`. */
const EPOCH_DURATION = 32;

describe('OutboxTreesResolver lazy roots cache', () => {
  let outbox: MockProxy<OutboxContract>;
  let archiver: MockProxy<OutboxTreesArchiverView>;
  let resolver: OutboxTreesResolver;

  let syncedL1Block: bigint;
  let getRootsCalls: number;

  const EPOCH = EpochNumber(0);

  beforeEach(() => {
    outbox = mock<OutboxContract>();
    archiver = mock<OutboxTreesArchiverView>();

    syncedL1Block = 100n;
    getRootsCalls = 0;

    outbox.getRoots.mockImplementation(() => {
      getRootsCalls++;
      return Promise.resolve(makeZeroRoots());
    });

    resolver = new OutboxTreesResolver(outbox, archiver, () => Promise.resolve(syncedL1Block), EPOCH_DURATION);
  });

  // Exercises the private #getRoots path through a witness request whose epoch has no blocks,
  // forcing #getRoots to run while letting the witness short-circuit afterwards. We assert the cache
  // side effects (getRoots counter) rather than the witness itself.
  const fetchRootsViaWitness = async (epoch: EpochNumber) => {
    const txHash = TxHash.random();
    archiver.getTxEffect.mockResolvedValue(makeTxEffect(epoch, 1) as never);
    // The archiver returns no blocks so the helper bails to undefined after #getRoots runs.
    archiver.getBlocks.mockResolvedValue([] as never);
    archiver.getBlock.mockResolvedValue(undefined as never);
    archiver.getCheckpointsData.mockResolvedValue([] as never);
    await resolver.getL2ToL1MembershipWitness(txHash, Fr.random());
  };

  it('caches roots within the same synced L1 block', async () => {
    await fetchRootsViaWitness(EPOCH);
    await fetchRootsViaWitness(EPOCH);
    // The second request at the same synced L1 block is served from the in-memory cache.
    expect(getRootsCalls).toBe(1);
  });

  it('refetches when the synced L1 block advances', async () => {
    await fetchRootsViaWitness(EPOCH);
    expect(getRootsCalls).toBe(1);

    syncedL1Block = 101n;
    await fetchRootsViaWitness(EPOCH);
    expect(getRootsCalls).toBe(2);
  });

  it('pins the getRoots read to the synced L1 block number', async () => {
    syncedL1Block = 777n;
    await fetchRootsViaWitness(EPOCH);
    expect(outbox.getRoots).toHaveBeenCalledWith(EPOCH, { blockNumber: 777n });
  });

  it('does no L1 reads and returns no witness when the node has not synced an L1 block yet', async () => {
    const notSyncedResolver = new OutboxTreesResolver(
      outbox,
      archiver,
      () => Promise.resolve(undefined),
      EPOCH_DURATION,
    );
    const txHash = TxHash.random();
    archiver.getTxEffect.mockResolvedValue(makeTxEffect(EPOCH, 1) as never);

    expect(await notSyncedResolver.getL2ToL1MembershipWitness(txHash, Fr.random())).toBeUndefined();
    expect(getRootsCalls).toBe(0);
  });

  it('single-flights concurrent requests for the same epoch into one getRoots call', async () => {
    const txHash = TxHash.random();
    archiver.getTxEffect.mockResolvedValue(makeTxEffect(EPOCH, 1) as never);
    archiver.getBlocks.mockResolvedValue([] as never);
    archiver.getBlock.mockResolvedValue(undefined as never);
    archiver.getCheckpointsData.mockResolvedValue([] as never);

    await Promise.all(Array.from({ length: 8 }, () => resolver.getL2ToL1MembershipWitness(txHash, Fr.random())));
    expect(getRootsCalls).toBe(1);
  });
});

describe('OutboxTreesResolver witness building', () => {
  let outbox: MockProxy<OutboxContract>;
  let archiver: MockProxy<OutboxTreesArchiverView>;
  let resolver: OutboxTreesResolver;

  beforeEach(() => {
    outbox = mock<OutboxContract>();
    archiver = mock<OutboxTreesArchiverView>();
    // Witness tests fetch the covering roots once at synced block 0 via the outbox mock.
    resolver = new OutboxTreesResolver(outbox, archiver, () => Promise.resolve(0n), EPOCH_DURATION);
  });

  it('returns undefined when the tx is not yet in a block', async () => {
    archiver.getTxEffect.mockResolvedValue(undefined);
    expect(await resolver.getL2ToL1MembershipWitness(TxHash.random(), Fr.random())).toBeUndefined();
  });

  it('builds a correct K=1 witness', async () => {
    const epoch = EpochNumber(0);
    const checkpoints: Fr[][][][] = [[[[Fr.random()]]]];
    const txHash = TxHash.random();
    const targetMessage = checkpoints[0][0][0][0];

    const fixture = buildFixture(checkpoints, epoch, txHash, 0, 0);
    wireWitnessFixture(outbox, archiver, fixture);

    const witness = await resolver.getL2ToL1MembershipWitness(txHash, targetMessage);
    assertWitness(witness, targetMessage, fixture, 1);
  });

  it('builds a correct K=2 witness for a tx in the second checkpoint', async () => {
    const epoch = EpochNumber(0);
    const checkpoints: Fr[][][][] = [[[[Fr.random()]]], [[[Fr.random()]]]];
    const txHash = TxHash.random();
    const targetMessage = checkpoints[1][0][0][0];

    const fixture = buildFixture(checkpoints, epoch, txHash, 1, 0);
    wireWitnessFixture(outbox, archiver, fixture);

    const witness = await resolver.getL2ToL1MembershipWitness(txHash, targetMessage);
    assertWitness(witness, targetMessage, fixture, 2);
  });

  it('builds a correct witness for a checkpoint with mixed empty/non-empty txs (block-level compression)', async () => {
    const epoch = EpochNumber(0);
    const t1 = [Fr.random(), Fr.random(), Fr.random()];
    const t3 = [Fr.random()];
    const checkpoints: Fr[][][][] = [[[[], t1, [], t3]]];
    const txHash = TxHash.random();
    const targetMessage = t1[1];

    const fixture = buildFixture(checkpoints, epoch, txHash, 0, 0, 1);
    wireWitnessFixture(outbox, archiver, fixture);

    const witness = await resolver.getL2ToL1MembershipWitness(txHash, targetMessage, 1);
    assertWitness(witness, targetMessage, fixture, 1);
  });

  it('disambiguates duplicate message values via messageIndexInTx', async () => {
    const epoch = EpochNumber(0);
    const dup = Fr.random();
    const checkpoints: Fr[][][][] = [[[[dup, Fr.random(), dup]]]];
    const txHash = TxHash.random();

    const fixture = buildFixture(checkpoints, epoch, txHash, 0, 0, 0);
    wireWitnessFixture(outbox, archiver, fixture);

    // Without an index, the duplicate value is ambiguous and the helper throws.
    await expect(resolver.getL2ToL1MembershipWitness(txHash, dup)).rejects.toThrow();

    const witnessAt0 = await resolver.getL2ToL1MembershipWitness(txHash, dup, 0);
    const witnessAt2 = await resolver.getL2ToL1MembershipWitness(txHash, dup, 2);
    assertWitness(witnessAt0, dup, fixture, 1);
    assertWitness(witnessAt2, dup, fixture, 1);
    // Distinct positions yield distinct leaf indices.
    expect(witnessAt0!.leafIndex).not.toBe(witnessAt2!.leafIndex);
  });

  it('throws when the cached root does not match the locally recomputed root and the synced block is stable', async () => {
    const epoch = EpochNumber(0);
    const checkpoints: Fr[][][][] = [[[[Fr.random()]]]];
    const txHash = TxHash.random();
    const targetMessage = checkpoints[0][0][0][0];

    const fixture = buildFixture(checkpoints, epoch, txHash, 0, 0);
    // Wire the archiver data but have the outbox return a deliberately wrong (random) covering root.
    wireArchiver(archiver, fixture);
    const roots = makeZeroRoots();
    roots[0] = Fr.random();
    outbox.getRoots.mockResolvedValue(roots);

    await expect(resolver.getL2ToL1MembershipWitness(txHash, targetMessage)).rejects.toThrow();
  });

  it('returns undefined instead of throwing when the synced block moved during a mismatched assembly', async () => {
    const epoch = EpochNumber(0);
    const checkpoints: Fr[][][][] = [[[[Fr.random()]]]];
    const txHash = TxHash.random();
    const targetMessage = checkpoints[0][0][0][0];

    const fixture = buildFixture(checkpoints, epoch, txHash, 0, 0);
    wireArchiver(archiver, fixture);
    const roots = makeZeroRoots();
    roots[0] = Fr.random(); // wrong root → helper throws a mismatch
    outbox.getRoots.mockResolvedValue(roots);

    // A synced block that advances between the before/after reads marks the mismatch transient.
    let syncedCalls = 0;
    const drifting = new OutboxTreesResolver(
      outbox,
      archiver,
      () => Promise.resolve(BigInt(syncedCalls++)),
      EPOCH_DURATION,
    );

    expect(await drifting.getL2ToL1MembershipWitness(txHash, targetMessage)).toBeUndefined();
  });
});

// --- Helpers ----------------------------------------------------------------

function makeZeroRoots(): Fr[] {
  return Array.from({ length: MAX_CHECKPOINTS_PER_EPOCH }, () => Fr.ZERO);
}

/**
 * Builds the slice of an `IndexedTxEffect` the resolver reads to assemble a witness. `slotNumber` is
 * placed inside `epoch` via `EPOCH_DURATION` so `getEpochAtSlot` recovers the intended epoch.
 */
function makeTxEffect(epoch: number, blockNumber: number, txIndexInBlock = 1) {
  return {
    l2BlockNumber: BlockNumber(blockNumber),
    txIndexInBlock,
    slotNumber: SlotNumber(epoch * EPOCH_DURATION),
  };
}

/**
 * Minimal fixture describing an epoch's worth of L2-to-L1 messages plus the metadata needed for
 * the resolver to assemble a witness for a specific tx. Encodes a single block per checkpoint
 * (sufficient for the cases exercised here).
 */
type Fixture = {
  epoch: EpochNumber;
  messagesInEpoch: Fr[][][][];
  blocks: Array<{
    number: BlockNumber;
    checkpointNumber: CheckpointNumber;
    indexWithinCheckpoint: IndexWithinCheckpoint;
    header: { globalVariables: { slotNumber: SlotNumber } };
    body: { txEffects: Array<{ l2ToL1Msgs: Fr[]; txHash: TxHash }> };
  }>;
  blockNumber: number;
  txHash: TxHash;
  txIndex: number;
  checkpointIndex: number;
  blockIndex: number;
};

function buildFixture(
  messagesInEpoch: Fr[][][][],
  epoch: EpochNumber,
  txHash: TxHash,
  checkpointIndex: number,
  blockIndex: number,
  txIndexInBlock = 0,
): Fixture {
  let blockCounter = 1;
  const blocks: Fixture['blocks'] = [];
  for (let ci = 0; ci < messagesInEpoch.length; ci++) {
    const checkpointNumber = CheckpointNumber(ci + 1);
    for (let bi = 0; bi < messagesInEpoch[ci].length; bi++) {
      const slotNumber = SlotNumber(ci + 1);
      const txEffects = messagesInEpoch[ci][bi].map((msgs, ti) => ({
        l2ToL1Msgs: msgs,
        txHash: ci === checkpointIndex && bi === blockIndex && ti === txIndexInBlock ? txHash : TxHash.random(),
      }));
      blocks.push({
        number: BlockNumber(blockCounter),
        checkpointNumber,
        indexWithinCheckpoint: IndexWithinCheckpoint(bi),
        header: { globalVariables: { slotNumber } },
        body: { txEffects },
      });
      blockCounter++;
    }
  }

  let targetBlockNumber = 1;
  for (let ci = 0; ci < checkpointIndex; ci++) {
    targetBlockNumber += messagesInEpoch[ci].length;
  }
  targetBlockNumber += blockIndex;

  return {
    epoch,
    messagesInEpoch,
    blocks,
    blockNumber: targetBlockNumber,
    txHash,
    txIndex: txIndexInBlock,
    checkpointIndex,
    blockIndex,
  };
}

function wireArchiver(archiver: MockProxy<OutboxTreesArchiverView>, fixture: Fixture) {
  archiver.getBlocks.mockImplementation((() => Promise.resolve(fixture.blocks as never)) as never);
  archiver.getBlock.mockImplementation((({ number }: { number: BlockNumber }) =>
    Promise.resolve(fixture.blocks.find(b => b.number === number) ?? undefined)) as never);
  archiver.getCheckpointsData.mockImplementation((() =>
    Promise.resolve(
      Array.from(new Set(fixture.blocks.map(b => b.checkpointNumber))).map(checkpointNumber => ({
        checkpointNumber,
      })),
    )) as never);
  archiver.getTxEffect.mockImplementation(((txHash: TxHash) => {
    if (!txHash.equals(fixture.txHash)) {
      return Promise.resolve(undefined);
    }
    // The target block's slot equals its checkpoint index + 1 (see buildFixture).
    return Promise.resolve({
      l2BlockNumber: BlockNumber(fixture.blockNumber),
      txIndexInBlock: fixture.txIndex,
      slotNumber: SlotNumber(fixture.checkpointIndex + 1),
    });
  }) as never);
}

function wireWitnessFixture(
  outbox: MockProxy<OutboxContract>,
  archiver: MockProxy<OutboxTreesArchiverView>,
  fixture: Fixture,
) {
  wireArchiver(archiver, fixture);
  const roots = makeZeroRoots();
  const k = fixture.checkpointIndex + 1;
  roots[k - 1] = computeEpochOutHash(fixture.messagesInEpoch.slice(0, k));
  outbox.getRoots.mockResolvedValue(roots);
}

function assertWitness(
  witness: L2ToL1MembershipWitness | undefined,
  targetMessage: Fr,
  fixture: Fixture,
  expectedNumCheckpointsInEpoch: number,
) {
  expect(witness).toBeDefined();
  expect(witness!.epochNumber).toBe(fixture.epoch);
  expect(witness!.numCheckpointsInEpoch).toBe(expectedNumCheckpointsInEpoch);

  const reconstructed = reconstructRoot(targetMessage, witness!);
  expect(reconstructed.equals(witness!.root.toBuffer())).toBe(true);
}

function reconstructRoot(leaf: Fr, witness: L2ToL1MembershipWitness): Buffer {
  let subtreeRoot = leaf.toBuffer();
  let index = witness.leafIndex;
  const path = witness.siblingPath.toBufferArray();
  for (let height = 0; height < path.length; height++) {
    const isRight = (index & 1n) === 1n;
    subtreeRoot = isRight
      ? sha256Trunc(Buffer.concat([path[height], subtreeRoot]))
      : sha256Trunc(Buffer.concat([subtreeRoot, path[height]]));
    index >>= 1n;
  }
  return subtreeRoot;
}
