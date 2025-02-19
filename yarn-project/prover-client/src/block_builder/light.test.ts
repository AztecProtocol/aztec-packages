import { TestCircuitProver } from '@aztec/bb-prover';
import { Blob, SpongeBlob } from '@aztec/blob-lib';
import { MerkleTreeId, type ProcessedTx, toNumBlobFields } from '@aztec/circuit-types';
import { type MerkleTreeWriteOperations, type ServerCircuitProver } from '@aztec/circuit-types/interfaces/server';
import { makeBloatedProcessedTx } from '@aztec/circuit-types/testing';
import {
  AztecAddress,
  BaseParityInputs,
  Fr,
  type GlobalVariables,
  type ParityPublicInputs,
  PartialStateReference,
  PublicDataWrite,
  type RecursiveProof,
  RootParityInput,
  RootParityInputs,
  StateReference,
  type VerificationKeyAsFields,
  VkWitnessData,
  makeEmptyRecursiveProof,
} from '@aztec/circuits.js';
import {
  type BaseOrMergeRollupPublicInputs,
  BlockRootRollupBlobData,
  BlockRootRollupData,
  BlockRootRollupInputs,
  ConstantRollupData,
  EmptyBlockRootRollupInputs,
  MergeRollupInputs,
  PreviousRollupData,
  type PrivateBaseRollupHints,
  PrivateBaseRollupInputs,
  PrivateTubeData,
  SingleTxBlockRootRollupInputs,
} from '@aztec/circuits.js/rollup';
import { makeGlobalVariables } from '@aztec/circuits.js/testing';
import { type AppendOnlyTreeSnapshot, PublicDataTreeLeaf } from '@aztec/circuits.js/trees';
import {
  BLOBS_PER_BLOCK,
  FIELDS_PER_BLOB,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
  TUBE_VK_INDEX,
  VK_TREE_HEIGHT,
} from '@aztec/constants';
import { padArrayEnd, times, timesParallel } from '@aztec/foundation/collection';
import { sha256ToField } from '@aztec/foundation/crypto';
import { type Logger, createLogger } from '@aztec/foundation/log';
import { type Tuple, assertLength } from '@aztec/foundation/serialize';
import { MembershipWitness } from '@aztec/foundation/trees';
import {
  ProtocolCircuitVks,
  TubeVk,
  getVKIndex,
  getVKSiblingPath,
  getVKTreeRoot,
} from '@aztec/noir-protocol-circuits-types/vks';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { getTelemetryClient } from '@aztec/telemetry-client';
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

  let feePayer: AztecAddress;
  let feePayerSlot: Fr;
  let feePayerBalance: Fr;
  const expectedTxFee = new Fr(0x2200);

  beforeAll(() => {
    logger = createLogger('prover-client:test:block-builder');
    simulator = new TestCircuitProver();
    vkTreeRoot = getVKTreeRoot();
    emptyProof = makeEmptyRecursiveProof(NESTED_RECURSIVE_PROOF_LENGTH);
    emptyRollupProof = makeEmptyRecursiveProof(NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH);
  });

  beforeEach(async () => {
    feePayer = await AztecAddress.random();
    feePayerBalance = new Fr(10n ** 20n);
    feePayerSlot = await computeFeePayerBalanceLeafSlot(feePayer);
    const prefilledPublicData = [new PublicDataTreeLeaf(feePayerSlot, feePayerBalance)];

    db = await NativeWorldStateService.tmp(
      undefined /* rollupAddress */,
      true /* cleanupTmpDir */,
      prefilledPublicData,
    );

    globalVariables = makeGlobalVariables(1, { chainId: Fr.ZERO, version: Fr.ZERO });
    l1ToL2Messages = times(7, i => new Fr(i + 1));
    fork = await db.fork();
    expectsFork = await db.fork();
    builder = new LightweightBlockBuilder(fork, getTelemetryClient());
  });

  afterEach(async () => {
    await fork.close();
    await expectsFork.close();
  });

  afterAll(async () => {
    await db.close();
  });

  it('builds a 2 tx header', async () => {
    const txs = await timesParallel(2, makeTx);
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages);

    expect(header).toEqual(expectedHeader);
  });

  it('builds a 3 tx header', async () => {
    const txs = await timesParallel(3, makeTx);
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages, async rollupOutputs => {
      const merge = await getMergeOutput(rollupOutputs[0], rollupOutputs[1]);
      return Promise.resolve([merge, rollupOutputs[2]]);
    });

    expect(header).toEqual(expectedHeader);
  });

  it('builds a 4 tx header', async () => {
    const txs = await timesParallel(4, makeTx);
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
    const txs = await timesParallel(4, makeTx);
    const header = await buildHeader(txs, l1ToL2Messages);

    const expectedHeader = await buildExpectedHeader(txs, l1ToL2Messages, async rollupOutputs => {
      const mergeLeft = await getMergeOutput(rollupOutputs[0], rollupOutputs[1]);
      const mergeRight = await getMergeOutput(rollupOutputs[2], rollupOutputs[3]);
      return [mergeLeft, mergeRight];
    });

    expect(header).toEqual(expectedHeader);
  });

  it('builds a 5 tx header', async () => {
    const txs = await timesParallel(5, makeTx);
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
    const txs = await timesParallel(1, makeTx);
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

  const makeTx = (i: number) => {
    feePayerBalance = new Fr(feePayerBalance.toBigInt() - expectedTxFee.toBigInt());
    const feePaymentPublicDataWrite = new PublicDataWrite(feePayerSlot, feePayerBalance);

    return makeBloatedProcessedTx({
      header: fork.getInitialHeader(),
      globalVariables,
      vkTreeRoot,
      protocolContractTreeRoot,
      seed: i + 1,
      feePayer,
      feePaymentPublicDataWrite,
      privateOnly: true,
    });
  };

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
    getTopMerges?: (rollupOutputs: BaseOrMergeRollupPublicInputs[]) => Promise<BaseOrMergeRollupPublicInputs[]>,
  ) => {
    if (txs.length <= 2) {
      // No need to run a merge if there's 0-2 txs
      getTopMerges = rollupOutputs => Promise.resolve(rollupOutputs);
    }

    const rollupOutputs = await getPrivateBaseRollupOutputs(txs);
    const previousRollups = await getTopMerges!(rollupOutputs);
    const l1ToL2Snapshot = await getL1ToL2Snapshot(l1ToL2Messages);
    const parityOutput = await getParityOutput(l1ToL2Messages);
    const rootOutput = await getBlockRootOutput(previousRollups, parityOutput, l1ToL2Snapshot, txs);

    const messageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, expectsFork);
    const partialState = new PartialStateReference(
      await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE, expectsFork),
      await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE, expectsFork),
      await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE, expectsFork),
    );
    const endState = new StateReference(messageTreeSnapshot, partialState);

    const expectedHeader = await buildHeaderFromCircuitOutputs(
      previousRollups,
      parityOutput,
      rootOutput,
      endState,
      logger,
    );

    // Ensure that the expected mana used is the sum of the txs' gas used
    const expectedManaUsed = txs.reduce((acc, tx) => acc + tx.gasUsed.totalGas.l2Gas, 0);
    expect(expectedHeader.totalManaUsed.toNumber()).toBe(expectedManaUsed);

    expect(await expectedHeader.hash()).toEqual(rootOutput.endBlockHash);
    return expectedHeader;
  };

  const getL1ToL2Snapshot = async (msgs: Fr[]) => {
    const l1ToL2Messages = padArrayEnd(msgs, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);

    const l1ToL2MessageSubtreeSiblingPath = padArrayEnd(
      await getSubtreeSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_SUBTREE_HEIGHT, expectsFork),
      Fr.ZERO,
      L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
    );

    const messageTreeSnapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, expectsFork);
    return { messageTreeSnapshot, l1ToL2MessageSubtreeSiblingPath, l1ToL2Messages };
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
      // Update `expectedTxFee` if the fee changes.
      expect(result.inputs.accumulatedFees).toEqual(expectedTxFee);
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
    previousRollups: BaseOrMergeRollupPublicInputs[],
    parityOutput: ParityPublicInputs,
    l1ToL2Snapshot: {
      l1ToL2Messages: Tuple<Fr, typeof NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP>;
      l1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>;
      messageTreeSnapshot: AppendOnlyTreeSnapshot;
    },
    txs: ProcessedTx[],
  ) => {
    const mergeRollupVk = ProtocolCircuitVks['MergeRollupArtifact'].keyAsFields;
    const mergeRollupVkWitness = getVkMembershipWitness(mergeRollupVk);
    const previousRollupData = previousRollups.map(
      r => new PreviousRollupData(r, emptyRollupProof, mergeRollupVk, mergeRollupVkWitness),
    );

    const startArchiveSnapshot = await getTreeSnapshot(MerkleTreeId.ARCHIVE, expectsFork);
    const newArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, expectsFork);
    const blobFields = txs.map(tx => tx.txEffect.toBlobFields()).flat();
    const blobs = await Blob.getBlobs(blobFields);
    const blobsHash = sha256ToField(blobs.map(b => b.getEthVersionedBlobHash()));
    const rootParityVk = ProtocolCircuitVks['RootParityArtifact'].keyAsFields;
    const rootParityVkWitness = getVkMembershipWitness(rootParityVk);

    const rootParityInput = new RootParityInput(
      emptyProof,
      rootParityVk,
      rootParityVkWitness.siblingPath,
      parityOutput,
    );

    const previousBlockHeader = expectsFork.getInitialHeader();

    const data = BlockRootRollupData.from({
      l1ToL2Roots: rootParityInput,
      l1ToL2MessageSubtreeSiblingPath: l1ToL2Snapshot.l1ToL2MessageSubtreeSiblingPath,
      newArchiveSiblingPath,
      previousBlockHeader,
      proverId: Fr.ZERO,
    });

    if (previousRollupData.length === 0) {
      const constants = ConstantRollupData.from({
        lastArchive: startArchiveSnapshot,
        globalVariables,
        vkTreeRoot: getVKTreeRoot(),
        protocolContractTreeRoot,
      });
      const inputs = EmptyBlockRootRollupInputs.from({
        data,
        constants,
        isPadding: false,
      });
      return (await simulator.getEmptyBlockRootRollupProof(inputs)).inputs;
    } else {
      const blobData = BlockRootRollupBlobData.from({
        blobFields: padArrayEnd(blobFields, Fr.ZERO, FIELDS_PER_BLOB * BLOBS_PER_BLOCK),
        blobCommitments: padArrayEnd(
          blobs.map(b => b.commitmentToFields()),
          [Fr.ZERO, Fr.ZERO],
          BLOBS_PER_BLOCK,
        ),
        blobsHash,
      });

      if (previousRollupData.length === 1) {
        const inputs = SingleTxBlockRootRollupInputs.from({
          previousRollupData: [previousRollupData[0]],
          data,
          blobData,
        });
        return (await simulator.getSingleTxBlockRootRollupProof(inputs)).inputs;
      } else {
        const inputs = BlockRootRollupInputs.from({
          previousRollupData: [previousRollupData[0], previousRollupData[1]],
          data,
          blobData,
        });
        return (await simulator.getBlockRootRollupProof(inputs)).inputs;
      }
    }
  };

  function getVkMembershipWitness(vk: VerificationKeyAsFields) {
    const leafIndex = getVKIndex(vk);
    return new MembershipWitness(VK_TREE_HEIGHT, BigInt(leafIndex), getVKSiblingPath(leafIndex));
  }
});
