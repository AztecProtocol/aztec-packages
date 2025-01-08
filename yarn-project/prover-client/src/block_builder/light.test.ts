import { TestCircuitProver } from '@aztec/bb-prover';
import {
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  type ServerCircuitProver,
  makeEmptyProcessedTx,
  toNumBlobFields,
} from '@aztec/circuit-types';
import { makeBloatedProcessedTx } from '@aztec/circuit-types/test';
import {
  type AppendOnlyTreeSnapshot,
  BLOBS_PER_BLOCK,
  BaseParityInputs,
  FIELDS_PER_BLOB,
  Fr,
  type GlobalVariables,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  MembershipWitness,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type ParityPublicInputs,
  type RecursiveProof,
  RootParityInput,
  RootParityInputs,
  TUBE_VK_INDEX,
  VK_TREE_HEIGHT,
  type VerificationKeyAsFields,
  VkWitnessData,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { SpongeBlob } from '@aztec/circuits.js/blobs';
import {
  type BaseOrMergeRollupPublicInputs,
  BlockRootRollupInputs,
  MergeRollupInputs,
  PreviousRollupData,
  type PrivateBaseRollupHints,
  PrivateBaseRollupInputs,
  PrivateTubeData,
} from '@aztec/circuits.js/rollup';
import { makeGlobalVariables } from '@aztec/circuits.js/testing';
import { Blob } from '@aztec/foundation/blob';
import { padArrayEnd, times } from '@aztec/foundation/collection';
import { sha256ToField } from '@aztec/foundation/crypto';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type Tuple, assertLength } from '@aztec/foundation/serialize';
import {
  ProtocolCircuitVks,
  TubeVk,
  getVKIndex,
  getVKSiblingPath,
  getVKTreeRoot,
} from '@aztec/noir-protocol-circuits-types/vks';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { type MerkleTreeAdminDatabase, NativeWorldStateService } from '@aztec/world-state';

import { jest } from '@jest/globals';

import {
  buildBaseRollupHints,
  buildHeaderFromCircuitOutputs,
  getRootTreeSiblingPath,
  getSubtreeSiblingPath,
  getTreeSnapshot,
} from '../orchestrator/block-building-helpers.js';
import { LightweightBlockBuilder } from './light.js';

jest.setTimeout(50_000);

describe('LightBlockBuilder', () => {
  let simulator: ServerCircuitProver;
  let logger: Logger;
  let globalVariables: GlobalVariables;
  let l1ToL2Messages: Fr[];
  let vkTreeRoot: Fr;

  let db: MerkleTreeAdminDatabase;
  let fork: MerkleTreeWriteOperations;
  let expectsFork: MerkleTreeWriteOperations;
  let builder: LightweightBlockBuilder;

  let emptyProof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
  let emptyRollupProof: RecursiveProof<typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>;

  beforeAll(async () => {
    logger = createLogger('prover-client:test:block-builder');
    simulator = new TestCircuitProver(new NoopTelemetryClient());
    vkTreeRoot = getVKTreeRoot();
    emptyProof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);
    emptyRollupProof = makeEmptyRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH);
    db = await NativeWorldStateService.tmp();
  });

  beforeEach(async () => {
    globalVariables = makeGlobalVariables(1, { chainId: Fr.ZERO, version: Fr.ZERO });
    l1ToL2Messages = times(7, i => new Fr(i + 1));
    fork = await db.fork();
    expectsFork = await db.fork();
    builder = new LightweightBlockBuilder(fork, new NoopTelemetryClient());
  });

  afterEach(async () => {
    await fork.close();
    await expectsFork.close();
  });

  afterAll(async () => {
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
    const txs = times(1, makeTx);
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

  const makeTx = (i: number) =>
    makeBloatedProcessedTx({
      header: fork.getInitialHeader(),
      globalVariables,
      vkTreeRoot,
      protocolContractTreeRoot,
      seed: i + 1,
      privateOnly: true,
    });

  // Builds the block header using the ts block builder
  const buildHeader = async (txs: ProcessedTx[], l1ToL2Messages: Fr[]) => {
    await builder.startNewBlock(globalVariables, l1ToL2Messages);
    await builder.addTxs(txs);
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
          makeEmptyProcessedTx(
            expectsFork.getInitialHeader(),
            globalVariables.chainId,
            globalVariables.version,
            vkTreeRoot,
            protocolContractTreeRoot,
          ),
        ),
      ];
      // No need to run a merge if there's 0-2 txs
      getTopMerges = rollupOutputs => Promise.resolve([rollupOutputs[0], rollupOutputs[1]]);
    }

    const rollupOutputs = await getPrivateBaseRollupOutputs(txs);
    const [mergeLeft, mergeRight] = await getTopMerges!(rollupOutputs);
    const l1ToL2Snapshot = await getL1ToL2Snapshot(l1ToL2Messages);
    const parityOutput = await getParityOutput(l1ToL2Messages);
    const messageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, expectsFork);
    const rootOutput = await getBlockRootOutput(mergeLeft, mergeRight, parityOutput, l1ToL2Snapshot, txs);
    const expectedHeader = buildHeaderFromCircuitOutputs(
      [mergeLeft, mergeRight],
      parityOutput,
      rootOutput,
      messageTreeSnapshot,
      logger,
    );

    // Ensure that the expected mana used is the sum of the txs' gas used
    const expectedManaUsed = txs.reduce((acc, tx) => acc + tx.gasUsed.totalGas.l2Gas, 0);
    expect(expectedHeader.totalManaUsed.toNumber()).toBe(expectedManaUsed);

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

  const getPrivateBaseRollupOutputs = async (txs: ProcessedTx[]) => {
    const rollupOutputs = [];
    const spongeBlobState = SpongeBlob.init(toNumBlobFields(txs));
    for (const tx of txs) {
      const vkIndex = TUBE_VK_INDEX;
      const vkPath = getVKSiblingPath(vkIndex);
      const vkData = new VkWitnessData(TubeVk, vkIndex, vkPath);
      const tubeData = new PrivateTubeData(
        tx.data.toPrivateToRollupKernelCircuitPublicInputs(),
        emptyRollupProof,
        vkData,
      );
      const hints = await buildBaseRollupHints(tx, globalVariables, expectsFork, spongeBlobState);
      const inputs = new PrivateBaseRollupInputs(tubeData, hints as PrivateBaseRollupHints);
      const result = await simulator.getPrivateBaseRollupProof(inputs);
      rollupOutputs.push(result.inputs);
    }
    return rollupOutputs;
  };

  const getMergeOutput = async (left: BaseOrMergeRollupPublicInputs, right: BaseOrMergeRollupPublicInputs) => {
    const baseRollupVk = ProtocolCircuitVks['PrivateBaseRollupArtifact'].keyAsFields;
    const baseRollupVkWitness = getVkMembershipWitness(baseRollupVk);
    const leftInput = new PreviousRollupData(left, emptyRollupProof, baseRollupVk, baseRollupVkWitness);
    const rightInput = new PreviousRollupData(right, emptyRollupProof, baseRollupVk, baseRollupVkWitness);
    const inputs = new MergeRollupInputs([leftInput, rightInput]);
    const result = await simulator.getMergeRollupProof(inputs);
    return result.inputs;
  };

  const getParityOutput = async (msgs: Fr[]) => {
    const l1ToL2Messages = padArrayEnd(msgs, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    await expectsFork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);

    const rootParityInputs: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>[] = [];
    const baseParityVk = ProtocolCircuitVks['BaseParityArtifact'].keyAsFields;
    const baseParityVkWitness = getVkMembershipWitness(baseParityVk);
    for (let i = 0; i < NUM_BASE_PARITY_PER_ROOT_PARITY; i++) {
      const input = BaseParityInputs.fromSlice(l1ToL2Messages, i, vkTreeRoot);
      const { inputs } = await simulator.getBaseParityProof(input);
      const rootInput = new RootParityInput(emptyProof, baseParityVk, baseParityVkWitness.siblingPath, inputs);
      rootParityInputs.push(rootInput);
    }

    const rootParityInput = new RootParityInputs(assertLength(rootParityInputs, NUM_BASE_PARITY_PER_ROOT_PARITY));
    const result = await simulator.getRootParityProof(rootParityInput);
    return result.inputs;
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
    txs: ProcessedTx[],
  ) => {
    const mergeRollupVk = ProtocolCircuitVks['MergeRollupArtifact'].keyAsFields;
    const mergeRollupVkWitness = getVkMembershipWitness(mergeRollupVk);

    const rollupLeft = new PreviousRollupData(left, emptyRollupProof, mergeRollupVk, mergeRollupVkWitness);
    const rollupRight = new PreviousRollupData(right, emptyRollupProof, mergeRollupVk, mergeRollupVkWitness);
    const startArchiveSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, expectsFork);
    const newArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, expectsFork);
    const previousBlockHashLeafIndex = BigInt(startArchiveSnapshot.nextAvailableLeafIndex - 1);
    const previousBlockHash = (await expectsFork.getLeafValue(MerkleTreeId.ARCHIVE, previousBlockHashLeafIndex))!;
    const blobFields = txs.map(tx => tx.txEffect.toBlobFields()).flat();
    const blobs = Blob.getBlobs(blobFields);
    const blobsHash = sha256ToField(blobs.map(b => b.getEthVersionedBlobHash()));
    const rootParityVk = ProtocolCircuitVks['RootParityArtifact'].keyAsFields;
    const rootParityVkWitness = getVkMembershipWitness(rootParityVk);

    const rootParityInput = new RootParityInput(
      emptyProof,
      rootParityVk,
      rootParityVkWitness.siblingPath,
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
      blobFields: padArrayEnd(blobFields, Fr.ZERO, FIELDS_PER_BLOB * BLOBS_PER_BLOCK),
      blobCommitments: padArrayEnd(
        blobs.map(b => b.commitmentToFields()),
        [Fr.ZERO, Fr.ZERO],
        BLOBS_PER_BLOCK,
      ),
      blobsHash,
    });

    const result = await simulator.getBlockRootRollupProof(inputs);
    return result.inputs;
  };

  function getVkMembershipWitness(vk: VerificationKeyAsFields) {
    const leafIndex = getVKIndex(vk);
    return new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), getVKSiblingPath(leafIndex));
  }
});
