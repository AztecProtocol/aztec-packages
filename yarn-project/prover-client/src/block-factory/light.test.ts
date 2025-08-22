import { TestCircuitProver } from '@aztec/bb-prover';
import { SpongeBlob } from '@aztec/blob-lib';
import {
  ARCHIVE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_HEIGHT,
  L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
  NESTED_RECURSIVE_PROOF_LENGTH,
  NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  NUM_BASE_PARITY_PER_ROOT_PARITY,
} from '@aztec/constants';
import { padArrayEnd, times, timesParallel } from '@aztec/foundation/collection';
import { Fr } from '@aztec/foundation/fields';
import { type Tuple, assertLength } from '@aztec/foundation/serialize';
import { ProtocolCircuitVkIndexes, ProtocolCircuitVks } from '@aztec/noir-protocol-circuits-types/server/vks';
import type { ProtocolCircuitName } from '@aztec/noir-protocol-circuits-types/types';
import { getVKSiblingPath, getVKTreeRoot } from '@aztec/noir-protocol-circuits-types/vk-tree';
import { protocolContractTreeRoot } from '@aztec/protocol-contracts';
import { computeFeePayerBalanceLeafSlot } from '@aztec/protocol-contracts/fee-juice';
import { PublicDataWrite } from '@aztec/stdlib/avm';
import { AztecAddress } from '@aztec/stdlib/aztec-address';
import { createBlockEndMarker } from '@aztec/stdlib/block';
import { GasFees } from '@aztec/stdlib/gas';
import type { MerkleTreeWriteOperations, ServerCircuitProver } from '@aztec/stdlib/interfaces/server';
import { BaseParityInputs, ParityPublicInputs, RootParityInput, RootParityInputs } from '@aztec/stdlib/parity';
import { ProofData, type RecursiveProof, makeEmptyRecursiveProof } from '@aztec/stdlib/proofs';
import {
  type BaseOrMergeRollupPublicInputs,
  BlockRootEmptyTxFirstRollupPrivateInputs,
  BlockRootFirstRollupPrivateInputs,
  BlockRootSingleTxFirstRollupPrivateInputs,
  CheckpointConstantData,
  MergeRollupInputs,
  PreviousRollupData,
  type PrivateBaseRollupHints,
  PrivateBaseRollupInputs,
  PrivateTubeData,
} from '@aztec/stdlib/rollup';
import { makeBloatedProcessedTx } from '@aztec/stdlib/testing';
import { type AppendOnlyTreeSnapshot, MerkleTreeId, PublicDataTreeLeaf } from '@aztec/stdlib/trees';
import { GlobalVariables, type ProcessedTx, toNumBlobFields } from '@aztec/stdlib/tx';
import { VkData } from '@aztec/stdlib/vks';
import { type MerkleTreeAdminDatabase, NativeWorldStateService } from '@aztec/world-state';

import { jest } from '@jest/globals';

import {
  buildHeaderFromCircuitOutputs,
  getRootTreeSiblingPath,
  getSubtreeSiblingPath,
  getTreeSnapshot,
  insertSideEffectsAndBuildBaseRollupHints,
} from '../orchestrator/block-building-helpers.js';
import { buildBlockWithCleanDB } from './light.js';

jest.setTimeout(50_000);

describe('LightBlockBuilder', () => {
  let simulator: ServerCircuitProver;
  let globalVariables: GlobalVariables;
  let l1ToL2Messages: Fr[];
  let vkTreeRoot: Fr;

  let db: MerkleTreeAdminDatabase;
  let fork: MerkleTreeWriteOperations;
  let expectsFork: MerkleTreeWriteOperations;

  let emptyProof: RecursiveProof<typeof NESTED_RECURSIVE_PROOF_LENGTH>;
  let emptyRollupProof: RecursiveProof<typeof NESTED_RECURSIVE_ROLLUP_HONK_PROOF_LENGTH>;

  let feePayer: AztecAddress;
  let feePayerSlot: Fr;
  let feePayerBalance: Fr;
  const gasFees = new GasFees(8, 9);
  const expectedTxFee = new Fr(0x2200);
  const proverId = new Fr(112233);

  const getVkData = (artifact: ProtocolCircuitName) => {
    const vkIndex = ProtocolCircuitVkIndexes[artifact];
    return new VkData(ProtocolCircuitVks[artifact], vkIndex, getVKSiblingPath(vkIndex));
  };

  beforeAll(() => {
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

    l1ToL2Messages = times(7, i => new Fr(i + 1));
    fork = await db.fork();
    expectsFork = await db.fork();
    const initialHeader = fork.getInitialHeader();
    globalVariables = GlobalVariables.from({
      ...initialHeader.globalVariables,
      gasFees,
      blockNumber: initialHeader.globalVariables.blockNumber + 1,
      timestamp: initialHeader.globalVariables.timestamp + 1n,
    });
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
    const block = await buildBlockWithCleanDB(txs, globalVariables, l1ToL2Messages, fork);

    return block.getBlockHeader();
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

    // Get the states before inserting new leaves.
    const lastArchive = await getTreeSnapshot(MerkleTreeId.ARCHIVE, expectsFork);
    const lastArchiveSiblingPath = await getRootTreeSiblingPath(MerkleTreeId.ARCHIVE, expectsFork);
    const lastL1ToL2MessageSubtreeSiblingPath = padArrayEnd(
      await getSubtreeSiblingPath(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, L1_TO_L2_MSG_SUBTREE_HEIGHT, expectsFork),
      Fr.ZERO,
      L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH,
    );
    const lastL1ToL2Snapshot = await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, expectsFork);
    const startSpongeBlob = SpongeBlob.init(toNumBlobFields(txs) + 1 /* block end marker */);

    // Clone the sponge blob to avoid mutating the start state.
    const spongeBlobState = startSpongeBlob.clone();
    const rollupOutputs = await getPrivateBaseRollupOutputs(txs, lastArchive, lastL1ToL2Snapshot, spongeBlobState);

    const previousRollups = await getTopMerges!(rollupOutputs);
    const parityOutput = await getParityOutput(l1ToL2Messages);
    const rootOutput = await getBlockRootOutput(
      previousRollups,
      parityOutput,
      lastArchive,
      lastArchiveSiblingPath,
      lastL1ToL2MessageSubtreeSiblingPath,
      startSpongeBlob,
    );

    const expectedHeader = await buildHeaderFromCircuitOutputs(rootOutput);
    expect(expectedHeader.spongeBlobHash).toEqual(await spongeBlobState.squeeze());

    // Ensure that the expected mana used is the sum of the txs' gas used
    const expectedManaUsed = txs.reduce((acc, tx) => acc + tx.gasUsed.totalGas.l2Gas, 0);
    expect(expectedHeader.totalManaUsed.toNumber()).toBe(expectedManaUsed);

    await expectsFork.updateArchive(expectedHeader);
    const newArchiveRoot = (await expectsFork.getTreeInfo(MerkleTreeId.ARCHIVE)).root;
    expect(newArchiveRoot).toEqual(rootOutput.newArchive.root.toBuffer());

    return expectedHeader;
  };

  const getPrivateBaseRollupOutputs = async (
    txs: ProcessedTx[],
    lastArchive: AppendOnlyTreeSnapshot,
    lastL1ToL2Snapshot: AppendOnlyTreeSnapshot,
    // Mutable state.
    spongeBlobState: SpongeBlob,
  ) => {
    const rollupOutputs = [];
    for (const tx of txs) {
      const vkData = getVkData('PrivateTube');
      const tubeData = new PrivateTubeData(
        tx.data.toPrivateToRollupKernelCircuitPublicInputs(),
        emptyRollupProof,
        vkData,
      );
      const hints = await insertSideEffectsAndBuildBaseRollupHints(
        tx,
        lastArchive,
        lastL1ToL2Snapshot,
        spongeBlobState.clone(),
        proverId,
        expectsFork,
      );
      await spongeBlobState.absorb(tx.txEffect.toBlobFields());
      const inputs = new PrivateBaseRollupInputs(tubeData, hints as PrivateBaseRollupHints);
      const result = await simulator.getPrivateBaseRollupProof(inputs);
      // Update `expectedTxFee` if the fee changes.
      expect(result.inputs.accumulatedFees).toEqual(expectedTxFee);
      rollupOutputs.push(result.inputs);
    }
    await spongeBlobState.absorb([createBlockEndMarker(txs.length)]);
    return rollupOutputs;
  };

  const getMergeOutput = async (left: BaseOrMergeRollupPublicInputs, right: BaseOrMergeRollupPublicInputs) => {
    const baseRollupVk = getVkData('PrivateBaseRollupArtifact');
    const leftInput = new PreviousRollupData(left, emptyRollupProof, baseRollupVk);
    const rightInput = new PreviousRollupData(right, emptyRollupProof, baseRollupVk);
    const inputs = new MergeRollupInputs([leftInput, rightInput]);
    const result = await simulator.getMergeRollupProof(inputs);
    return result.inputs;
  };

  const getParityOutput = async (msgs: Fr[]) => {
    const l1ToL2Messages = padArrayEnd(msgs, Fr.ZERO, NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP);
    await expectsFork.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, l1ToL2Messages);

    const rootParityInputs: RootParityInput<typeof NESTED_RECURSIVE_PROOF_LENGTH>[] = [];
    const baseParityVk = getVkData('BaseParityArtifact');
    for (let i = 0; i < NUM_BASE_PARITY_PER_ROOT_PARITY; i++) {
      const input = BaseParityInputs.fromSlice(l1ToL2Messages, i, vkTreeRoot);
      const { inputs } = await simulator.getBaseParityProof(input);
      const rootInput = new RootParityInput(emptyProof, baseParityVk.vk.keyAsFields, baseParityVk.siblingPath, inputs);
      rootParityInputs.push(rootInput);
    }

    const rootParityInput = new RootParityInputs(assertLength(rootParityInputs, NUM_BASE_PARITY_PER_ROOT_PARITY));
    const result = await simulator.getRootParityProof(rootParityInput);
    return result.inputs;
  };

  const getBlockRootOutput = async (
    previousRollups: BaseOrMergeRollupPublicInputs[],
    parityOutput: ParityPublicInputs,
    lastArchive: AppendOnlyTreeSnapshot,
    lastArchiveSiblingPath: Tuple<Fr, typeof ARCHIVE_HEIGHT>,
    lastL1ToL2MessageSubtreeSiblingPath: Tuple<Fr, typeof L1_TO_L2_MSG_SUBTREE_SIBLING_PATH_LENGTH>,
    startSpongeBlob: SpongeBlob,
  ) => {
    const mergeRollupVk = getVkData('MergeRollupArtifact');
    const previousRollupsProofs = previousRollups.map(r => new ProofData(r, emptyRollupProof, mergeRollupVk));

    const rootParityVk = getVkData('RootParityArtifact');
    const l1ToL2Roots = new ProofData(parityOutput, emptyProof, rootParityVk);

    // The sibling paths to insert the new leaf are the last sibling paths.
    const newArchiveSiblingPath = lastArchiveSiblingPath;
    const newL1ToL2MessageSubtreeSiblingPath = lastL1ToL2MessageSubtreeSiblingPath;

    if (previousRollups.length === 0) {
      const previousBlockHeader = expectsFork.getInitialHeader();
      const constants = CheckpointConstantData.from({
        chainId: globalVariables.chainId,
        version: globalVariables.version,
        vkTreeRoot,
        protocolContractTreeRoot,
        proverId,
        slotNumber: globalVariables.slotNumber,
        coinbase: globalVariables.coinbase,
        feeRecipient: globalVariables.feeRecipient,
        gasFees: globalVariables.gasFees,
      });
      const inputs = BlockRootEmptyTxFirstRollupPrivateInputs.from({
        l1ToL2Roots,
        previousState: previousBlockHeader.state,
        previousArchive: lastArchive,
        constants,
        startSpongeBlob,
        timestamp: globalVariables.timestamp,
        newArchiveSiblingPath,
        newL1ToL2MessageSubtreeSiblingPath,
      });
      return (await simulator.getBlockRootEmptyTxFirstRollupProof(inputs)).inputs;
    } else if (previousRollups.length === 1) {
      const inputs = BlockRootSingleTxFirstRollupPrivateInputs.from({
        l1ToL2Roots,
        previousRollup: previousRollupsProofs[0],
        newArchiveSiblingPath,
        newL1ToL2MessageSubtreeSiblingPath,
      });
      return (await simulator.getBlockRootSingleTxFirstRollupProof(inputs)).inputs;
    } else {
      const inputs = BlockRootFirstRollupPrivateInputs.from({
        l1ToL2Roots,
        previousRollups: [previousRollupsProofs[0], previousRollupsProofs[1]],
        newArchiveSiblingPath,
        newL1ToL2MessageSubtreeSiblingPath,
      });
      return (await simulator.getBlockRootFirstRollupProof(inputs)).inputs;
    }
  };
});
