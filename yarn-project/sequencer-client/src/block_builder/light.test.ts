import { TestCircuitProver } from '@aztec/bb-prover';
import {
  MerkleTreeId,
  type MerkleTreeWriteOperations,
  type ProcessedTx,
  type ServerCircuitProver,
  makeEmptyProcessedTx,
  toNumTxsEffects,
  toTxEffect,
} from '@aztec/circuit-types';
import { makeBloatedProcessedTx } from '@aztec/circuit-types/test';
import {
  AZTEC_EPOCH_DURATION,
  type AppendOnlyTreeSnapshot,
  type BaseOrMergeRollupPublicInputs,
  BaseParityInputs,
  BlobPublicInputs,
  BlockRootOrBlockMergePublicInputs,
  BlockRootRollupInputs,
  EthAddress,
  FIELDS_PER_BLOB,
  FeeRecipient,
  Fr,
  type GlobalVariables,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  MembershipWitness,
  MergeRollupInputs,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  type ParityPublicInputs,
  PreviousRollupData,
  type RecursiveProof,
  RootParityInput,
  RootParityInputs,
  SpongeBlob,
  VK_TREE_HEIGHT,
  type VerificationKeyAsFields,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import { makeGlobalVariables } from '@aztec/circuits.js/testing';
import { Blob } from '@aztec/foundation/blob';
import { padArrayEnd, times } from '@aztec/foundation/collection';
import { sha256ToField } from '@aztec/foundation/crypto';
import { type DebugLogger, createDebugLogger } from '@aztec/foundation/log';
import { type Tuple, assertLength } from '@aztec/foundation/serialize';
import {
  ProtocolCircuitVks,
  TubeVk,
  getVKIndex,
  getVKSiblingPath,
  getVKTreeRoot,
} from '@aztec/noir-protocol-circuits-types';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import {
  buildBaseRollupInput,
  buildHeaderFromCircuitOutputs,
  getRootTreeSiblingPath,
  getSubtreeSiblingPath,
  getTreeSnapshot,
} from '@aztec/prover-client/helpers';
import { NoopTelemetryClient } from '@aztec/telemetry-client/noop';
import { type MerkleTreeAdminDatabase, NativeWorldStateService } from '@aztec/world-state';

import { jest } from '@jest/globals';

import { LightweightBlockBuilder } from './light.js';

jest.setTimeout(50_000);

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

  beforeAll(async () => {
    logger = createDebugLogger('aztec:sequencer-client:test:block-builder');
    simulator = new TestCircuitProver(new NoopTelemetryClient());
    vkRoot = getVKTreeRoot();
    emptyProof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);
    db = await NativeWorldStateService.tmp();
  });

  beforeEach(async () => {
    globals = makeGlobalVariables(1, { chainId: Fr.ZERO, version: Fr.ZERO });
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
    const txs = times(1, i => makeBloatedProcessedTx(fork, vkRoot, protocolContractTreeRoot, i));
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
  const makeTx = (i: number) =>
    makeBloatedProcessedTx(fork, vkRoot, protocolContractTreeRoot, i, { inclusionFee: new Fr(i) });

  // Builds the block header using the ts block builder
  const buildHeader = async (txs: ProcessedTx[], l1ToL2Messages: Fr[]) => {
    const txCount = Math.max(2, txs.length);
    const numTxsEffects = toNumTxsEffects(txs, globals.gasFees);
    await builder.startNewBlock(txCount, numTxsEffects, globals, l1ToL2Messages);
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
          makeEmptyProcessedTx(
            expectsFork.getInitialHeader(),
            globals.chainId,
            globals.version,
            vkRoot,
            protocolContractTreeRoot,
          ),
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
    const rootOutput = await getBlockRootOutput(mergeLeft, mergeRight, parityOutput, l1ToL2Snapshot, txs);
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
    const spongeBlobState = SpongeBlob.init(toNumTxsEffects(txs, globals.gasFees));
    for (const tx of txs) {
      const inputs = await buildBaseRollupInput(tx, emptyProof, globals, expectsFork, spongeBlobState, TubeVk);
      const result = await simulator.getBaseRollupProof(inputs);
      rollupOutputs.push(result.inputs);
    }
    return rollupOutputs;
  };

  const getMergeOutput = async (left: BaseOrMergeRollupPublicInputs, right: BaseOrMergeRollupPublicInputs) => {
    const baseRollupVk = ProtocolCircuitVks['BaseRollupArtifact'].keyAsFields;
    const baseRollupVkWitness = getVkMembershipWitness(baseRollupVk);
    const leftInput = new PreviousRollupData(left, emptyProof, baseRollupVk, baseRollupVkWitness);
    const rightInput = new PreviousRollupData(right, emptyProof, baseRollupVk, baseRollupVkWitness);
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
      const input = BaseParityInputs.fromSlice(l1ToL2Messages, i, vkRoot);
      const { publicInputs } = await simulator.getBaseParityProof(input);
      const rootInput = new RootParityInput(emptyProof, baseParityVk, baseParityVkWitness.siblingPath, publicInputs);
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
    txs: ProcessedTx[],
  ) => {
    const mergeRollupVk = ProtocolCircuitVks['MergeRollupArtifact'].keyAsFields;
    const mergeRollupVkWitness = getVkMembershipWitness(mergeRollupVk);

    const rollupLeft = new PreviousRollupData(left, emptyProof, mergeRollupVk, mergeRollupVkWitness);
    const rollupRight = new PreviousRollupData(right, emptyProof, mergeRollupVk, mergeRollupVkWitness);
    const startArchiveSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, expectsFork);
    const newArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, expectsFork);
    const previousBlockHashLeafIndex = BigInt(startArchiveSnapshot.nextAvailableLeafIndex - 1);
    const previousBlockHash = (await expectsFork.getLeafValue(MerkleTreeId.ARCHIVE, previousBlockHashLeafIndex))!;
    const txEffectsFields = txs.map(tx => toTxEffect(tx, left.constants.globalVariables.gasFees).toFields()).flat();
    const blob = new Blob(txEffectsFields);
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
      // @ts-expect-error - below line gives error 'Type instantiation is excessively deep and possibly infinite. ts(2589)'
      txEffects: padArrayEnd(txEffectsFields, Fr.ZERO, FIELDS_PER_BLOB),
      blobCommitment: blob.commitmentToFields(),
    });

    // TODO(Miranda): the wasm simulator can't run block root due to the bignum-based blob lib (stack too deep).
    // For this test only I'm building outputs in ts. For other tests, I force the simulator to use native ACVM (not wasm).
    // const result = await simulator.getBlockRootRollupProof(inputs);

    const newArchiveSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, fork);
    const newBlockHash = await fork.getLeafValue(
      MerkleTreeId.ARCHIVE,
      BigInt(newArchiveSnapshot.nextAvailableLeafIndex - 1),
    );
    const fees = [
      new FeeRecipient(
        rollupLeft.baseOrMergeRollupPublicInputs.constants.globalVariables.coinbase,
        rollupLeft.baseOrMergeRollupPublicInputs.accumulatedFees.add(
          rollupRight.baseOrMergeRollupPublicInputs.accumulatedFees,
        ),
      ),
    ];

    const blobPublicInputs = [BlobPublicInputs.fromBlob(blob)];
    const outputs = new BlockRootOrBlockMergePublicInputs(
      inputs.startArchiveSnapshot,
      newArchiveSnapshot,
      previousBlockHash,
      newBlockHash!,
      rollupLeft.baseOrMergeRollupPublicInputs.constants.globalVariables,
      rollupLeft.baseOrMergeRollupPublicInputs.constants.globalVariables,
      sha256ToField([
        rollupLeft.baseOrMergeRollupPublicInputs.outHash,
        rollupRight.baseOrMergeRollupPublicInputs.outHash,
      ]),
      padArrayEnd(fees, new FeeRecipient(EthAddress.ZERO, Fr.ZERO), AZTEC_EPOCH_DURATION),
      rollupLeft.baseOrMergeRollupPublicInputs.constants.vkTreeRoot,
      rollupLeft.baseOrMergeRollupPublicInputs.constants.protocolContractTreeRoot,
      inputs.proverId,
      padArrayEnd(blobPublicInputs, BlobPublicInputs.empty(), AZTEC_EPOCH_DURATION),
    );

    return outputs;
  };

  function getVkMembershipWitness(vk: VerificationKeyAsFields) {
    const leafIndex = getVKIndex(vk);
    return new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), getVKSiblingPath(leafIndex));
  }
});
