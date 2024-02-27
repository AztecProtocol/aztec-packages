import {
  Body,
  ContractData,
  ExtendedContractData,
  L2Block,
  MerkleTreeId,
  PublicDataWrite,
  Tx,
  TxEffect,
  TxL2Logs,
  makeEmptyLogs,
  mockTx,
} from '@aztec/circuit-types';
import {
  AppendOnlyTreeSnapshot,
  AztecAddress,
  BaseOrMergeRollupPublicInputs,
  EthAddress,
  Fr,
  GlobalVariables,
  Header,
  MAX_NEW_CONTRACTS_PER_TX,
  MAX_NEW_L2_TO_L1_MSGS_PER_TX,
  MAX_NEW_NOTE_HASHES_PER_TX,
  MAX_NEW_NULLIFIERS_PER_TX,
  MAX_NON_REVERTIBLE_NOTE_HASHES_PER_TX,
  MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX,
  MAX_NON_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX,
  MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  MAX_REVERTIBLE_NOTE_HASHES_PER_TX,
  MAX_REVERTIBLE_NULLIFIERS_PER_TX,
  MAX_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
  NULLIFIER_SUBTREE_HEIGHT,
  NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP,
  PUBLIC_DATA_SUBTREE_HEIGHT,
  PartialStateReference,
  Proof,
  PublicDataTreeLeaf,
  PublicDataUpdateRequest,
  PublicKernelCircuitPublicInputs,
  RootRollupPublicInputs,
  SideEffect,
  SideEffectLinkedToNoteHash,
  StateReference,
} from '@aztec/circuits.js';
import {
  fr,
  makeBaseOrMergeRollupPublicInputs,
  makeNewContractData,
  makeNewSideEffect,
  makeNewSideEffectLinkedToNoteHash,
  makePrivateKernelTailCircuitPublicInputs,
  makeProof,
  makePublicCallRequest,
  makeRootRollupPublicInputs,
} from '@aztec/circuits.js/testing';
import { makeTuple, range } from '@aztec/foundation/array';
import { toBufferBE } from '@aztec/foundation/bigint-buffer';
import { times } from '@aztec/foundation/collection';
import { Tuple, to2Fields } from '@aztec/foundation/serialize';
import { openTmpStore } from '@aztec/kv-store/utils';
import { MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';

import { MockProxy, mock } from 'jest-mock-extended';
import { type MemDown, default as memdown } from 'memdown';

import { VerificationKeys, getVerificationKeys } from '../mocks/verification_keys.js';
import { EmptyRollupProver } from '../prover/empty.js';
import { RollupProver } from '../prover/index.js';
import {
  ProcessedTx,
  makeEmptyProcessedTx as makeEmptyProcessedTxFromHistoricalTreeRoots,
  makeProcessedTx,
} from '../sequencer/processed_tx.js';
import { RollupSimulator } from '../simulator/index.js';
import { RealRollupCircuitSimulator } from '../simulator/rollup.js';
import { SoloBlockBuilder } from './solo_block_builder.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

describe('sequencer/solo_block_builder', () => {
  let builder: SoloBlockBuilder;
  let builderDb: MerkleTreeOperations;
  let expectsDb: MerkleTreeOperations;
  let vks: VerificationKeys;

  let simulator: MockProxy<RollupSimulator>;
  let prover: MockProxy<RollupProver>;

  let blockNumber: number;
  let baseRollupOutputLeft: BaseOrMergeRollupPublicInputs;
  let baseRollupOutputRight: BaseOrMergeRollupPublicInputs;
  let rootRollupOutput: RootRollupPublicInputs;
  let mockL1ToL2Messages: Fr[];

  let globalVariables: GlobalVariables;

  const emptyProof = new Proof(Buffer.alloc(32, 0));

  const chainId = Fr.ZERO;
  const version = Fr.ZERO;
  const coinbase = EthAddress.ZERO;
  const feeRecipient = AztecAddress.ZERO;

  beforeEach(async () => {
    blockNumber = 3;
    globalVariables = new GlobalVariables(chainId, version, new Fr(blockNumber), Fr.ZERO, coinbase, feeRecipient);

    builderDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());
    expectsDb = await MerkleTrees.new(openTmpStore()).then(t => t.asLatest());
    vks = getVerificationKeys();
    simulator = mock<RollupSimulator>();
    prover = mock<RollupProver>();
    builder = new SoloBlockBuilder(builderDb, vks, simulator, prover);

    // Create mock l1 to L2 messages
    mockL1ToL2Messages = new Array(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP).fill(new Fr(0n));

    // Create mock outputs for simulator
    baseRollupOutputLeft = makeBaseOrMergeRollupPublicInputs(0, globalVariables);
    baseRollupOutputRight = makeBaseOrMergeRollupPublicInputs(0, globalVariables);
    rootRollupOutput = makeRootRollupPublicInputs(0);
    rootRollupOutput.header.globalVariables = globalVariables;

    // Set up mocks
    prover.getBaseRollupProof.mockResolvedValue(emptyProof);
    prover.getRootRollupProof.mockResolvedValue(emptyProof);
    simulator.baseRollupCircuit
      .mockResolvedValueOnce(baseRollupOutputLeft)
      .mockResolvedValueOnce(baseRollupOutputRight);
    simulator.rootRollupCircuit.mockResolvedValue(rootRollupOutput);
  }, 20_000);

  const makeEmptyProcessedTx = async () => {
    const header = await builderDb.buildInitialHeader();
    return makeEmptyProcessedTxFromHistoricalTreeRoots(header, chainId, version);
  };

  // Updates the expectedDb trees based on the new note hashes, contracts, and nullifiers from these txs
  const updateExpectedTreesFromTxs = async (txs: ProcessedTx[]) => {
    const newContracts = txs.flatMap(tx => tx.data.end.newContracts.map(cd => cd.hash()));
    for (const [tree, leaves] of [
      [
        MerkleTreeId.NOTE_HASH_TREE,
        txs.flatMap(tx =>
          [...tx.data.endNonRevertibleData.newNoteHashes, ...tx.data.end.newNoteHashes].map(l => l.value.toBuffer()),
        ),
      ],
      [MerkleTreeId.CONTRACT_TREE, newContracts.map(x => x.toBuffer())],
    ] as const) {
      await expectsDb.appendLeaves(tree, leaves);
    }
    await expectsDb.batchInsert(
      MerkleTreeId.NULLIFIER_TREE,
      txs.flatMap(tx =>
        [...tx.data.endNonRevertibleData.newNullifiers, ...tx.data.end.newNullifiers].map(x => x.value.toBuffer()),
      ),
      NULLIFIER_SUBTREE_HEIGHT,
    );
    for (const tx of txs) {
      await expectsDb.batchInsert(
        MerkleTreeId.PUBLIC_DATA_TREE,
        [...tx.data.endNonRevertibleData.publicDataUpdateRequests, ...tx.data.end.publicDataUpdateRequests].map(
          write => {
            return new PublicDataTreeLeaf(write.leafSlot, write.newValue).toBuffer();
          },
        ),
        PUBLIC_DATA_SUBTREE_HEIGHT,
      );
    }
  };

  const updateL1ToL2MessageTree = async (l1ToL2Messages: Fr[]) => {
    const asBuffer = l1ToL2Messages.map(m => m.toBuffer());
    await expectsDb.appendLeaves(MerkleTreeId.L1_TO_L2_MESSAGE_TREE, asBuffer);
  };

  const updateArchive = async () => {
    const blockHash = rootRollupOutput.header.hash();
    await expectsDb.appendLeaves(MerkleTreeId.ARCHIVE, [blockHash.toBuffer()]);
  };

  const getTreeSnapshot = async (tree: MerkleTreeId) => {
    const treeInfo = await expectsDb.getTreeInfo(tree);
    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));
  };

  const getPartialStateReference = async () => {
    return new PartialStateReference(
      await getTreeSnapshot(MerkleTreeId.NOTE_HASH_TREE),
      await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE),
      await getTreeSnapshot(MerkleTreeId.CONTRACT_TREE),
      await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE),
    );
  };

  const getStateReference = async () => {
    return new StateReference(
      await getTreeSnapshot(MerkleTreeId.L1_TO_L2_MESSAGE_TREE),
      await getPartialStateReference(),
    );
  };

  const buildMockSimulatorInputs = async () => {
    const kernelOutput = makePrivateKernelTailCircuitPublicInputs();
    kernelOutput.constants.historicalHeader = await expectsDb.buildInitialHeader();

    const tx = makeProcessedTx(
      new Tx(
        kernelOutput,
        emptyProof,
        makeEmptyLogs(),
        makeEmptyLogs(),
        times(MAX_PUBLIC_CALL_STACK_LENGTH_PER_TX, makePublicCallRequest),
        [ExtendedContractData.random()],
      ),
    );

    const txs = [tx, await makeEmptyProcessedTx()];

    // Calculate what would be the tree roots after the first tx and update mock circuit output
    await updateExpectedTreesFromTxs([txs[0]]);
    baseRollupOutputLeft.end = await getPartialStateReference();

    // Same for the tx on the right
    await updateExpectedTreesFromTxs([txs[1]]);
    baseRollupOutputRight.end = await getPartialStateReference();

    // Update l1 to l2 message tree
    await updateL1ToL2MessageTree(mockL1ToL2Messages);

    // Collect all new nullifiers, commitments, and contracts from all txs in this block
    const txEffects: TxEffect[] = txs.map(
      tx =>
        new TxEffect(
          tx.data.combinedData.newNoteHashes.map((c: SideEffect) => c.value) as Tuple<
            Fr,
            typeof MAX_NEW_NOTE_HASHES_PER_TX
          >,
          tx.data.combinedData.newNullifiers.map((n: SideEffectLinkedToNoteHash) => n.value) as Tuple<
            Fr,
            typeof MAX_NEW_NULLIFIERS_PER_TX
          >,
          tx.data.combinedData.newL2ToL1Msgs,
          tx.data.combinedData.publicDataUpdateRequests.map(t => new PublicDataWrite(t.leafSlot, t.newValue)) as Tuple<
            PublicDataWrite,
            typeof MAX_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX
          >,
          tx.data.combinedData.newContracts.map(cd => cd.hash()) as Tuple<Fr, typeof MAX_NEW_CONTRACTS_PER_TX>,
          tx.data.combinedData.newContracts.map(
            cd => new ContractData(cd.contractAddress, cd.portalContractAddress),
          ) as Tuple<ContractData, typeof MAX_NEW_CONTRACTS_PER_TX>,
          tx.encryptedLogs || new TxL2Logs([]),
          tx.unencryptedLogs || new TxL2Logs([]),
        ),
    );

    const body = new Body(mockL1ToL2Messages, txEffects);
    // We are constructing the block here just to get body hash/calldata hash so we can pass in an empty archive and header
    const l2Block = L2Block.fromFields({
      archive: AppendOnlyTreeSnapshot.zero(),
      header: Header.empty(),
      // Only the values below go to body hash/calldata hash
      body,
    });

    // Now we update can make the final header, compute the block hash and update archive
    rootRollupOutput.header.globalVariables = globalVariables;
    rootRollupOutput.header.contentCommitment.txsHash = l2Block.body.getCalldataHash();
    rootRollupOutput.header.state = await getStateReference();

    await updateArchive();
    rootRollupOutput.archive = await getTreeSnapshot(MerkleTreeId.ARCHIVE);

    return txs;
  };

  describe('mock simulator', () => {
    beforeEach(() => {
      // Create instance to test
      builder = new SoloBlockBuilder(builderDb, vks, simulator, prover);
    });

    it('builds an L2 block using mock simulator', async () => {
      // Assemble a fake transaction
      const txs = await buildMockSimulatorInputs();

      // Actually build a block!
      const [l2Block, proof] = await builder.buildL2Block(globalVariables, txs, mockL1ToL2Messages);

      expect(l2Block.number).toEqual(blockNumber);
      expect(proof).toEqual(emptyProof);
    }, 20000);

    it('rejects if too many l1 to l2 messages are provided', async () => {
      // Assemble a fake transaction
      const txs = await buildMockSimulatorInputs();
      const l1ToL2Messages = new Array(100).fill(new Fr(0n));
      await expect(builder.buildL2Block(globalVariables, txs, l1ToL2Messages)).rejects.toThrow();
    });
  });

  describe('circuits simulator', () => {
    beforeEach(() => {
      const simulator = new RealRollupCircuitSimulator();
      const prover = new EmptyRollupProver();
      builder = new SoloBlockBuilder(builderDb, vks, simulator, prover);
    });

    const makeContractDeployProcessedTx = async (seed = 0x1) => {
      const tx = await makeEmptyProcessedTx();
      tx.data.end.newContracts = [makeNewContractData(seed + 0x1000)];
      return tx;
    };

    const makeBloatedProcessedTx = async (seed = 0x1) => {
      const tx = mockTx(seed);
      const kernelOutput = PublicKernelCircuitPublicInputs.empty();
      kernelOutput.constants.historicalHeader = await builderDb.buildInitialHeader();
      kernelOutput.end.publicDataUpdateRequests = makeTuple(
        MAX_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        i => new PublicDataUpdateRequest(fr(i), fr(i + 10)),
        seed + 0x500,
      );
      kernelOutput.endNonRevertibleData.publicDataUpdateRequests = makeTuple(
        MAX_NON_REVERTIBLE_PUBLIC_DATA_UPDATE_REQUESTS_PER_TX,
        i => new PublicDataUpdateRequest(fr(i), fr(i + 10)),
        seed + 0x600,
      );

      const processedTx = makeProcessedTx(tx, kernelOutput, makeProof());

      processedTx.data.end.newNoteHashes = makeTuple(
        MAX_REVERTIBLE_NOTE_HASHES_PER_TX,
        makeNewSideEffect,
        seed + 0x100,
      );
      processedTx.data.endNonRevertibleData.newNoteHashes = makeTuple(
        MAX_NON_REVERTIBLE_NOTE_HASHES_PER_TX,
        makeNewSideEffect,
        seed + 0x100,
      );
      processedTx.data.end.newNullifiers = makeTuple(
        MAX_REVERTIBLE_NULLIFIERS_PER_TX,
        makeNewSideEffectLinkedToNoteHash,
        seed + 0x200,
      );
      processedTx.data.endNonRevertibleData.newNullifiers = makeTuple(
        MAX_NON_REVERTIBLE_NULLIFIERS_PER_TX,
        makeNewSideEffectLinkedToNoteHash,
        seed + 0x300,
      );
      processedTx.data.end.newNullifiers[tx.data.end.newNullifiers.length - 1] = SideEffectLinkedToNoteHash.empty();

      processedTx.data.end.newL2ToL1Msgs = makeTuple(MAX_NEW_L2_TO_L1_MSGS_PER_TX, fr, seed + 0x300);
      processedTx.data.end.newContracts = [makeNewContractData(seed + 0x1000)];
      processedTx.data.end.encryptedLogsHash = to2Fields(processedTx.encryptedLogs.hash());
      processedTx.data.end.unencryptedLogsHash = to2Fields(processedTx.unencryptedLogs.hash());

      return processedTx;
    };

    it.each([
      [0, 4],
      [1, 4],
      [4, 4],
      [0, 16],
      [16, 16],
    ] as const)(
      'builds an L2 block with %i contract deploy txs and %i txs total',
      async (deployCount: number, totalCount: number) => {
        const contractTreeBefore = await builderDb.getTreeInfo(MerkleTreeId.CONTRACT_TREE);

        const txs = [
          ...(await Promise.all(times(deployCount, makeContractDeployProcessedTx))),
          ...(await Promise.all(times(totalCount - deployCount, makeEmptyProcessedTx))),
        ];

        const [l2Block] = await builder.buildL2Block(globalVariables, txs, mockL1ToL2Messages);
        expect(l2Block.number).toEqual(blockNumber);

        await updateExpectedTreesFromTxs(txs);
        const contractTreeAfter = await builderDb.getTreeInfo(MerkleTreeId.CONTRACT_TREE);

        if (deployCount > 0) {
          expect(contractTreeAfter.root).not.toEqual(contractTreeBefore.root);
        }

        const expectedContractTreeAfter = await expectsDb.getTreeInfo(MerkleTreeId.CONTRACT_TREE).then(t => t.root);
        expect(contractTreeAfter.root).toEqual(expectedContractTreeAfter);
        expect(contractTreeAfter.size).toEqual(BigInt(totalCount));
      },
      60000,
    );

    it('builds an empty L2 block', async () => {
      const txs = await Promise.all([
        makeEmptyProcessedTx(),
        makeEmptyProcessedTx(),
        makeEmptyProcessedTx(),
        makeEmptyProcessedTx(),
      ]);

      const [l2Block] = await builder.buildL2Block(globalVariables, txs, mockL1ToL2Messages);
      expect(l2Block.number).toEqual(blockNumber);
    }, 30_000);

    it('builds a mixed L2 block', async () => {
      // Ensure that each transaction has unique (non-intersecting nullifier values)
      const txs = await Promise.all([
        makeBloatedProcessedTx(1 * MAX_NEW_NULLIFIERS_PER_TX),
        makeBloatedProcessedTx(2 * MAX_NEW_NULLIFIERS_PER_TX),
        makeBloatedProcessedTx(3 * MAX_NEW_NULLIFIERS_PER_TX),
        makeBloatedProcessedTx(4 * MAX_NEW_NULLIFIERS_PER_TX),
      ]);

      const l1ToL2Messages = range(NUMBER_OF_L1_L2_MESSAGES_PER_ROLLUP, 1 + 0x400).map(fr);

      const [l2Block] = await builder.buildL2Block(globalVariables, txs, l1ToL2Messages);
      expect(l2Block.number).toEqual(blockNumber);
    }, 200_000);

    // This test specifically tests nullifier values which previously caused e2e_private_token test to fail
    it('e2e_private_token edge case regression test on nullifier values', async () => {
      const simulator = new RealRollupCircuitSimulator();
      const prover = new EmptyRollupProver();
      builder = new SoloBlockBuilder(builderDb, vks, simulator, prover);
      // update the starting tree
      const updateVals = Array(4 * MAX_NEW_NULLIFIERS_PER_TX).fill(0n);
      updateVals[0] = 19777494491628650244807463906174285795660759352776418619064841306523677458742n;
      updateVals[1] = 10246291467305176436335175657884940686778521321101740385288169037814567547848n;

      // new added values
      const tx = await makeEmptyProcessedTx();
      tx.data.end.newNullifiers[0] = new SideEffectLinkedToNoteHash(
        new Fr(10336601644835972678500657502133589897705389664587188571002640950065546264856n),
        Fr.ZERO,
        Fr.ZERO,
      );
      tx.data.end.newNullifiers[1] = new SideEffectLinkedToNoteHash(
        new Fr(17490072961923661940560522096125238013953043065748521735636170028491723851741n),
        Fr.ZERO,
        Fr.ZERO,
      );

      const txs = [tx, await makeEmptyProcessedTx(), await makeEmptyProcessedTx(), await makeEmptyProcessedTx()];

      // Must be built after the txs are created
      await builderDb.batchInsert(
        MerkleTreeId.NULLIFIER_TREE,
        updateVals.map(v => toBufferBE(v, 32)),
        NULLIFIER_SUBTREE_HEIGHT,
      );

      const [l2Block] = await builder.buildL2Block(globalVariables, txs, mockL1ToL2Messages);

      expect(l2Block.number).toEqual(blockNumber);
    }, 20000);
  });

  // describe("Input guard tests", () => {
  // })
});
