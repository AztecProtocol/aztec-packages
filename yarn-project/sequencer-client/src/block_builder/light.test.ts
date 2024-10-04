import { TestCircuitProver } from '@aztec/bb-prover';
import {
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  type ServerCircuitProver,
  makeEmptyProcessedTx,
} from '@aztec/circuit-types';
import { makeBloatedProcessedTx } from '@aztec/circuit-types/test';
import {
  type AppendOnlyTreeSnapshot,
  type BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BlockRootRollupInputs,
  Fr,
  type GlobalVariables,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  type MembershipWitness,
  MergeRollupInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type ParityPublicInputs,
  PreviousRollupData,
  type RecursiveProof,
  RootParityInput,
  RootParityInputs,
  VK_TREE_HEIGHT,
  VerificationKeyData,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { makeGlobalVariables } from '@aztec/circuits.js/testing';
import { padArrayEnd, times } from '@aztec/foundation/collection';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { type Tuple, assertLength } from '@aztec/foundation/serialize';
import { getVKTreeRoot } from '@aztec/noir-protocol-circuits-types';
import {
  buildBaseRollupInput,
  buildHeaderFromCircuitOutputs,
  getRootTreeSiblingPath,
  getSubtreeSiblingPath,
  getTreeSnapshot,
  makeEmptyMembershipWitness,
} from '@aztec/prover-client/helpers';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { type MerkleTreeAdminDatabase, NativeWorldStateService } from '@aztec/world-state';

import { LightweightBlockBuilder } from './light.js';

describe('LightBlockBuilder', () => {
  let simulator: ServerCircuitProver;
  let logger: DebugLogger;
  let globals: GlobalVariables;
  let l1ToL2Messages: Fr[];
  let vkRoot: Fr;

  let db: MerkleTreeAdminDatabase;
  let fork: MerkleTreeWriteOperations;
  let expectsFork: MerkleTreeWriteOperations;
  let builder: LightweightBlockBuilder;

  let emptyProof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
  let emptyVk: VerificationKeyData;
  let emptyVkWitness: MembershipWitness<typeof VK_TREE_HEIGHT>;

  beforeAll(() => {
    logger = createDebugLogger('aztec:sequencer-client:test:block-builder');
    simulator = new TestCircuitProver(new NoopTelemetryClient());
    vkRoot = getVKTreeRoot();
    emptyProof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);
    emptyVk = VerificationKeyData.makeFake();
    emptyVkWitness = makeEmptyMembershipWitness(VK_TREE_HEIGHT);
  });

  beforeEach(async () => {
    globals = makeGlobalVariables(1, { chainId: Fr.ZERO, version: Fr.ZERO });
    l1ToL2Messages = times(7, i => new Fr(i + 1));
    db = await NativeWorldStateService.tmp();
    fork = await db.fork();
    expectsFork = await db.fork();
    builder = new LightweightBlockBuilder(fork, new NoopTelemetryClient());
  });

  afterEach(async () => {
    await fork.close();
    await expectsFork.close();
    await db.close();
  });

  it('builds a 2 tx header', async () => {
    const txs = times(2, makeTx);
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages);

    expect(header).toEqual(expectedHeader);
  });

  it('builds a 3 tx header', async () => {
    const txs = times(3, makeTx);
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages, async rollupOutputs => {
      const merge = await getMergeOutput(rollupOutputs[0], rollupOutputs[1]);
      return Promise.resolve([merge, rollupOutputs[2]]);
    });

    expect(header).toEqual(expectedHeader);
  });

  it('builds a 4 tx header', async () => {
    const txs = times(4, makeTx);
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages, async rollupOutputs => {
      const mergeLeft = await getMergeOutput(rollupOutputs[0], rollupOutputs[1]);
      const mergeRight = await getMergeOutput(rollupOutputs[2], rollupOutputs[3]);
      return [mergeLeft, mergeRight];
    });

    expect(header).toEqual(expectedHeader);
  });

  it('builds a 4 tx header with no l1 to l2 messages', async () => {
    const l1ToL2Messages: Fr[] = [];
    const txs = times(4, makeTx);
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages, async rollupOutputs => {
      const mergeLeft = await getMergeOutput(rollupOutputs[0], rollupOutputs[1]);
      const mergeRight = await getMergeOutput(rollupOutputs[2], rollupOutputs[3]);
      return [mergeLeft, mergeRight];
    });

    expect(header).toEqual(expectedHeader);
  });

  it('builds a 5 tx header', async () => {
    const txs = times(5, makeTx);
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages, async rollupOutputs => {
      const merge10 = await getMergeOutput(rollupOutputs[0], rollupOutputs[1]);
      const merge11 = await getMergeOutput(rollupOutputs[2], rollupOutputs[3]);
      const merge20 = await getMergeOutput(merge10, merge11);
      return [merge20, rollupOutputs[4]];
    });

    expect(header).toEqual(expectedHeader);
  });

  it('builds a single tx header', async () => {
    const txs = times(1, i => makeBloatedProcessedTx(fork, vkRoot, i));
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages);

    expect(header).toEqual(expectedHeader);
  });

  it('builds an empty header', async () => {
    const txs: ProcessedTx[] = [];
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages);

    expect(header).toEqual(expectedHeader);
  });

  // Makes a tx with a non-zero inclusion fee for testing
  const makeTx = (i: number) => makeBloatedProcessedTx(fork, vkRoot, i, { inclusionFee: new Fr(i) });

  // Builds the block header using the ts block builder
  const buildHeader = async (txs: ProcessedTx[], l1ToL2Messages: Fr[]) => {
    const txCount = Math.max(2, txs.length);
    await builder.startNewBlock(txCount, globals, l1ToL2Messages);
    for (const tx of txs) {
      await builder.addNewTx(tx);
    }
    const { header } = await builder.setBlockCompleted();
    return header;
  };

  // Builds the block header using circuit outputs
  // Requires a callback for manually assembling the merge rollup tree
  const buildExpectedHeader = async (
    txs: ProcessedTx[],
    l1ToL2Messages: Fr[],
    getTopMerges?: (
      rollupOutputs: BaseOrMergeRollupPublicInputs[],
    ) => Promise<[BaseOrMergeRollupPublicInputs, BaseOrMergeRollupPublicInputs]>,
  ) => {
    if (txs.length <= 2) {
      // Pad if we don't have enough txs
      txs = [
        ...txs,
        ...times(2 - txs.length, () =>
          makeEmptyProcessedTx(expectsFork.getInitialHeader(), globals.chainId, globals.version, vkRoot),
        ),
      ];
      // No need to run a merge if there's 0-2 txs
      getTopMerges = rollupOutputs => Promise.resolve([rollupOutputs[0], rollupOutputs[1]]);
    }

    const rollupOutputs = await getRollupOutputs(txs);
    const [mergeLeft, mergeRight] = await getTopMerges!(rollupOutputs);
    const l1ToL2Snapshot = await getL1ToL2Snapshot(l1ToL2Messages);
    const parityOutput = await getParityOutput(l1ToL2Messages);
    const messageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, expectsFork);
    const rootOutput = await getBlockRootOutput(mergeLeft, mergeRight, parityOutput, l1ToL2Snapshot);
    const expectedHeader = buildHeaderFromCircuitOutputs(
      [mergeLeft, mergeRight],
      parityOutput,
      rootOutput,
      messageTreeSnapshot,
      logger,
    );

    expect(expectedHeader.hash()).toEqual(rootOutput.endBlockHash);
    return expectedHeader;
  };

  const getL1ToL2Snapshot = async (msgs: Fr[]) => {
    const l1ToL2Messages = padArrayEnd(msgs, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

    const newL1ToL2MessageTreeRootSiblingPath = padArrayEnd(
      await getSubtreeSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_SUBTREE_HEIGHT, expectsFork),
      Fr.ZERO,
      L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
    );

    const messageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, expectsFork);
    return { messageTreeSnapshot, newL1ToL2MessageTreeRootSiblingPath, l1ToL2Messages };
  };

  const getRollupOutputs = async (txs: ProcessedTx[]) => {
    const rollupOutputs = [];
    for (const tx of txs) {
      const inputs = await buildBaseRollupInput(tx, emptyProof, globals, expectsFork, emptyVk);
      const result = await simulator.getBaseRollupProof(inputs);
      rollupOutputs.push(result.inputs);
    }
    return rollupOutputs;
  };

  const getMergeOutput = async (left: BaseOrMergeRollupPublicInputs, right: BaseOrMergeRollupPublicInputs) => {
    const leftInput = new PreviousRollupData(left, emptyProof, emptyVk.keyAsFields, emptyVkWitness);
    const rightInput = new PreviousRollupData(right, emptyProof, emptyVk.keyAsFields, emptyVkWitness);
    const inputs = new MergeRollupInputs([leftInput, rightInput]);
    const result = await simulator.getMergeRollupProof(inputs);
    return result.inputs;
  };

  const getParityOutput = async (msgs: Fr[]) => {
    const l1ToL2Messages = padArrayEnd(msgs, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    await expectsFork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);

    const rootParityInputs: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>[] = [];
    for (let i = 0; i < NUM_BASE_PARITY_PER_ROOT_PARITY; i++) {
      const input = BaseParityInputs.fromSlice(l1ToL2Messages, i, vkRoot);
      const { publicInputs } = await simulator.getBaseParityProof(input);
      const rootInput = new RootParityInput(emptyProof, emptyVk.keyAsFields, emptyVkWitness.siblingPath, publicInputs);
      rootParityInputs.push(rootInput);
    }

    const rootParityInput = new RootParityInputs(assertLength(rootParityInputs, NUM_BASE_PARITY_PER_ROOT_PARITY));
    const result = await simulator.getRootParityProof(rootParityInput);
    return result.publicInputs;
  };

  const getBlockRootOutput = async (
    left: BaseOrMergeRollupPublicInputs,
    right: BaseOrMergeRollupPublicInputs,
    parityOutput: ParityPublicInputs,
    l1ToL2Snapshot: {
      l1ToL2Messages: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>;
      newL1ToL2MessageTreeRootSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>;
      messageTreeSnapshot: AppendOnlyTreeSnapshot;
    },
  ) => {
    const rollupLeft = new PreviousRollupData(left, emptyProof, emptyVk.keyAsFields, emptyVkWitness);
    const rollupRight = new PreviousRollupData(right, emptyProof, emptyVk.keyAsFields, emptyVkWitness);
    const startArchiveSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, expectsFork);
    const newArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, expectsFork);
    const previousBlockHashLeafIndex = BigInt(startArchiveSnapshot.nextAvailableLeafIndex - 1);
    const previousBlockHash = (await expectsFork.getLeafValue(MerkleTreeId.ARCHIVE, previousBlockHashLeafIndex))!;

    const rootParityInput = new RootParityInput(
      emptyProof,
      emptyVk.keyAsFields,
      emptyVkWitness.siblingPath,
      parityOutput,
    );

    const inputs = BlockRootRollupInputs.from({
      previousRollupData: [rollupLeft, rollupRight],
      l1ToL2Roots: rootParityInput,
      newL1ToL2Messages: l1ToL2Snapshot.l1ToL2Messages,
      newL1ToL2MessageTreeRootSiblingPath: l1ToL2Snapshot.newL1ToL2MessageTreeRootSiblingPath,
      startL1ToL2MessageTreeSnapshot: l1ToL2Snapshot.messageTreeSnapshot,
      startArchiveSnapshot,
      newArchiveSiblingPath,
      previousBlockHash,
      proverId: Fr.ZERO,
    });

    const result = await simulator.getBlockRootRollupProof(inputs);
    return result.inputs;
  };
});
