import {
  AppendOnlyTreeSnapshot,
  BaseOrMergeRollupPublicInputs,
  BaseRollupInputs,
  CircuitsWasm,
  Fr,
  NewContractData,
  PublicDataRead,
  PublicDataWrite,
  RootRollupPublicInputs,
  UInt8Vector,
} from '@aztec/circuits.js';
import { computeContractLeaf } from '@aztec/circuits.js/abis';
import {
  fr,
  makeBaseRollupPublicInputs,
  makeKernelPublicInputs,
  makeNewContractData,
  makeProof,
  makeRootRollupPublicInputs,
} from '@aztec/circuits.js/factories';
import { AztecAddress, EthAddress, toBufferBE } from '@aztec/foundation';
import { ContractData, Tx } from '@aztec/types';
import { MerkleTreeId, MerkleTreeOperations, MerkleTrees } from '@aztec/world-state';
import { MockProxy, mock } from 'jest-mock-extended';
import { default as levelup } from 'levelup';
import flatMap from 'lodash.flatmap';
import times from 'lodash.times';
import { default as memdown, type MemDown } from 'memdown';
import { makeEmptyUnverifiedData, makePublicTx } from '../mocks/tx.js';
import { VerificationKeys, getVerificationKeys } from '../mocks/verification_keys.js';
import { EmptyRollupProver } from '../prover/empty.js';
import { RollupProver } from '../prover/index.js';
import { ProcessedTx, makeEmptyProcessedTx, makeProcessedTx } from '../sequencer/processed_tx.js';
import { RollupSimulator } from '../simulator/index.js';
import { WasmRollupCircuitSimulator } from '../simulator/rollup.js';
import { CircuitBlockBuilder } from './circuit_block_builder.js';
import { makePrivateTx } from '../index.js';

export const createMemDown = () => (memdown as any)() as MemDown<any, any>;

describe('sequencer/circuit_block_builder', () => {
  let builder: TestSubject;
  let builderDb: MerkleTreeOperations;
  let expectsDb: MerkleTreeOperations;
  let vks: VerificationKeys;

  let simulator: MockProxy<RollupSimulator>;
  let prover: MockProxy<RollupProver>;

  let blockNumber: number;
  let baseRollupOutputLeft: BaseOrMergeRollupPublicInputs;
  let baseRollupOutputRight: BaseOrMergeRollupPublicInputs;
  let rootRollupOutput: RootRollupPublicInputs;

  let wasm: CircuitsWasm;

  const emptyProof = new UInt8Vector(Buffer.alloc(32, 0));

  beforeAll(async () => {
    wasm = await CircuitsWasm.get();
  });

  beforeEach(async () => {
    blockNumber = 3;
    builderDb = await MerkleTrees.new(levelup(createMemDown())).then(t => t.asLatest());
    expectsDb = await MerkleTrees.new(levelup(createMemDown())).then(t => t.asLatest());
    vks = getVerificationKeys();
    simulator = mock<RollupSimulator>();
    prover = mock<RollupProver>();
    builder = new TestSubject(builderDb, vks, simulator, prover);

    // Populate root trees with first roots from the empty trees
    // TODO: Should this be responsibility of the MerkleTreeDb init?
    await updateRootTrees();

    // Create mock outputs for simualator
    baseRollupOutputLeft = makeBaseRollupPublicInputs();
    baseRollupOutputRight = makeBaseRollupPublicInputs();
    rootRollupOutput = makeRootRollupPublicInputs();

    // Set up mocks
    prover.getBaseRollupProof.mockResolvedValue(emptyProof);
    prover.getRootRollupProof.mockResolvedValue(emptyProof);
    simulator.baseRollupCircuit
      .mockResolvedValueOnce(baseRollupOutputLeft)
      .mockResolvedValueOnce(baseRollupOutputRight);
    simulator.rootRollupCircuit.mockResolvedValue(rootRollupOutput);
  }, 20_000);

  const updateRootTrees = async () => {
    for (const [newTree, rootTree] of [
      [MerkleTreeId.PRIVATE_DATA_TREE, MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE],
      [MerkleTreeId.CONTRACT_TREE, MerkleTreeId.CONTRACT_TREE_ROOTS_TREE],
    ] as const) {
      const newTreeInfo = await expectsDb.getTreeInfo(newTree);
      await expectsDb.appendLeaves(rootTree, [newTreeInfo.root]);
    }
  };

  // Updates the expectedDb trees based on the new commitments, contracts, and nullifiers from these txs
  const updateExpectedTreesFromTxs = async (txs: ProcessedTx[]) => {
    const newContracts = flatMap(txs, tx => tx.data.end.newContracts.map(n => computeContractLeaf(wasm, n)));
    for (const [tree, leaves] of [
      [MerkleTreeId.PRIVATE_DATA_TREE, flatMap(txs, tx => tx.data.end.newCommitments.map(l => l.toBuffer()))],
      [MerkleTreeId.CONTRACT_TREE, newContracts.map(x => x.toBuffer())],
      [MerkleTreeId.NULLIFIER_TREE, flatMap(txs, tx => tx.data.end.newNullifiers.map(l => l.toBuffer()))],
    ] as const) {
      await expectsDb.appendLeaves(tree, leaves);
    }
    for (const write of txs.flatMap(tx => tx.data.end.stateTransitions)) {
      await expectsDb.updateLeaf(MerkleTreeId.PUBLIC_DATA_TREE, write.newValue.toBuffer(), write.leafIndex.value);
    }
  };

  const getTreeSnapshot = async (tree: MerkleTreeId) => {
    const treeInfo = await expectsDb.getTreeInfo(tree);
    return new AppendOnlyTreeSnapshot(Fr.fromBuffer(treeInfo.root), Number(treeInfo.size));
  };

  const setTxHistoricTreeRoots = async (tx: ProcessedTx) => {
    for (const [name, id] of [
      ['privateDataTreeRoot', MerkleTreeId.PRIVATE_DATA_TREE],
      ['contractTreeRoot', MerkleTreeId.CONTRACT_TREE],
      ['nullifierTreeRoot', MerkleTreeId.NULLIFIER_TREE],
    ] as const) {
      tx.data.constants.historicTreeRoots.privateHistoricTreeRoots[name] = Fr.fromBuffer(
        (await builderDb.getTreeInfo(id)).root,
      );
    }
  };

  describe('mock simulator', () => {
    it('builds an L2 block using mock simulator', async () => {
      // Create instance to test
      builder = new TestSubject(builderDb, vks, simulator, prover);
      await builder.updateRootTrees();

      // Assemble a fake transaction, we'll tweak some fields below
      const tx = await makeProcessedTx(
        Tx.createPrivate(makeKernelPublicInputs(), emptyProof, makeEmptyUnverifiedData()),
      );
      const txsLeft = [tx, await makeEmptyProcessedTx()];
      const txsRight = [await makeEmptyProcessedTx(), await makeEmptyProcessedTx()];

      // Set tree roots to proper values in the tx
      await setTxHistoricTreeRoots(tx);

      // Calculate what would be the tree roots after the txs from the first base rollup land and update mock circuit output
      await updateExpectedTreesFromTxs(txsLeft);
      baseRollupOutputLeft.endContractTreeSnapshot = await getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
      baseRollupOutputLeft.endNullifierTreeSnapshot = await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
      baseRollupOutputLeft.endPrivateDataTreeSnapshot = await getTreeSnapshot(MerkleTreeId.PRIVATE_DATA_TREE);
      baseRollupOutputLeft.endPublicDataTreeSnapshot = await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE);

      // Same for the two txs on the right
      await updateExpectedTreesFromTxs(txsRight);
      baseRollupOutputRight.endContractTreeSnapshot = await getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
      baseRollupOutputRight.endNullifierTreeSnapshot = await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
      baseRollupOutputRight.endPrivateDataTreeSnapshot = await getTreeSnapshot(MerkleTreeId.PRIVATE_DATA_TREE);
      baseRollupOutputRight.endPublicDataTreeSnapshot = await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE);

      // And update the root trees now to create proper output to the root rollup circuit
      await updateRootTrees();
      rootRollupOutput.endContractTreeSnapshot = await getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
      rootRollupOutput.endNullifierTreeSnapshot = await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
      rootRollupOutput.endPrivateDataTreeSnapshot = await getTreeSnapshot(MerkleTreeId.PRIVATE_DATA_TREE);
      rootRollupOutput.endPublicDataTreeSnapshot = await getTreeSnapshot(MerkleTreeId.PUBLIC_DATA_TREE);
      rootRollupOutput.endTreeOfHistoricContractTreeRootsSnapshot = await getTreeSnapshot(
        MerkleTreeId.CONTRACT_TREE_ROOTS_TREE,
      );
      rootRollupOutput.endTreeOfHistoricPrivateDataTreeRootsSnapshot = await getTreeSnapshot(
        MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE,
      );

      // Actually build a block!
      const txs = [tx, await makeEmptyProcessedTx(), await makeEmptyProcessedTx(), await makeEmptyProcessedTx()];
      const [l2Block, proof] = await builder.buildL2Block(blockNumber, txs);

      expect(l2Block.number).toEqual(blockNumber);
      expect(proof).toEqual(emptyProof);
    }, 20000);

    // For varying orders of insertions assert the local batch insertion generator creates the correct proofs
    it.each([
      [[16, 15, 14, 13, 0, 0, 0, 0]],
      [[13, 14, 15, 16, 0, 0, 0, 0]],
      [[1234, 98, 0, 0, 99999, 88, 54, 0]],
      [[97, 98, 10, 0, 99999, 88, 100001, 9000000]],
    ] as const)('performs nullifier tree batch insertion correctly', async nullifiers => {
      const leaves = nullifiers.map(i => toBufferBE(BigInt(i), 32));
      await expectsDb.appendLeaves(MerkleTreeId.NULLIFIER_TREE, leaves);

      builder = new TestSubject(builderDb, vks, simulator, prover);

      await builder.performBaseRollupBatchInsertionProofs(leaves);

      const expected = await expectsDb.getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
      const actual = await builderDb.getTreeInfo(MerkleTreeId.NULLIFIER_TREE);
      expect(actual).toEqual(expected);
    });
  });

  describe('circuits simulator', () => {
    beforeEach(async () => {
      const simulator = await WasmRollupCircuitSimulator.new();
      const prover = new EmptyRollupProver();
      builder = new TestSubject(builderDb, vks, simulator, prover);
      await builder.updateRootTrees();
    });

    const makeContractDeployProcessedTx = async (seed = 0x1) => {
      const tx = await makeEmptyProcessedTx();
      await setTxHistoricTreeRoots(tx);
      tx.data.end.newContracts = [makeNewContractData(seed + 0x1000)];
      return tx;
    };

    const makePublicCallProcessedTx = async (seed = 0x1) => {
      const publicTx = makePublicTx(seed);
      const tx = await makeProcessedTx(publicTx, makeKernelPublicInputs(seed), makeProof());
      await setTxHistoricTreeRoots(tx);
      tx.data.end.stateReads[0] = new PublicDataRead(fr(1), fr(0));
      tx.data.end.stateTransitions[0] = new PublicDataWrite(fr(2), fr(0), fr(12));
      return tx;
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

        const [l2Block] = await builder.buildL2Block(blockNumber, txs);
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
      10000,
    );

    it('builds an L2 block with private and public txs', async () => {
      const txs = await Promise.all([
        makeContractDeployProcessedTx(),
        makePublicCallProcessedTx(),
        makeEmptyProcessedTx(),
        makeEmptyProcessedTx(),
      ]);

      const [l2Block] = await builder.buildL2Block(blockNumber, txs);
      expect(l2Block.number).toEqual(blockNumber);

      // TODO: Check that l2 block got the new state transitions once we merge
      // https://github.com/AztecProtocol/aztec3-packages/pull/360

      await updateExpectedTreesFromTxs(txs);
    });

    // This test specifically tests nullifier values which previously caused e2e_zk_token test to fail
    it('e2e_zk_token edge case regression test on nullifier values', async () => {
      const simulator = await WasmRollupCircuitSimulator.new();
      const prover = new EmptyRollupProver();
      builder = new TestSubject(builderDb, vks, simulator, prover);
      // update the starting tree
      const updateVals = Array(16).fill(0n);
      updateVals[0] = 19777494491628650244807463906174285795660759352776418619064841306523677458742n;
      updateVals[1] = 10246291467305176436335175657884940686778521321101740385288169037814567547848n;

      await builder.updateRootTrees();
      await builderDb.appendLeaves(
        MerkleTreeId.NULLIFIER_TREE,
        updateVals.map(v => toBufferBE(v, 32)),
      );

      // new added values
      const tx = await makeEmptyProcessedTx();
      tx.data.end.newNullifiers[0] = new Fr(
        10336601644835972678500657502133589897705389664587188571002640950065546264856n,
      );
      tx.data.end.newNullifiers[1] = new Fr(
        17490072961923661940560522096125238013953043065748521735636170028491723851741n,
      );
      const txs = [tx, await makeEmptyProcessedTx(), await makeEmptyProcessedTx(), await makeEmptyProcessedTx()];

      const [l2Block] = await builder.buildL2Block(blockNumber, txs);
      expect(l2Block.number).toEqual(blockNumber);
    });

    it('Build blocks on top of blocks l2 block with 4 txs', async () => {
      const txs = [...(await Promise.all(times(4, makeEmptyProcessedTx)))];
      const [block1] = await builder.buildL2Block(1, txs);
      const [block2] = await builder.buildL2Block(2, txs);

      expect(block1.number).toEqual(1);
      expect(block2.number).toEqual(2);

      /*const blocks = [block1, block2];
      for (let i = 0; i < 2; i++) {
        const block = blocks[i];
        console.log(block.encode().toString('hex'));
        console.log(`call data hash   : ${block.getCalldataHash().toString('hex')}`);
        console.log(`start state hash: ${block.getStartStateHash().toString('hex')}`);
        console.log(`end state hash  : ${block.getEndStateHash().toString('hex')}`);
        console.log(`public input hash: ${block.getPublicInputsHash().toString()}`);
      }*/
    }, 10000);

    it('Build blocks on top of blocks l2 block with 4 txs', async () => {
      for (let i = 0; i < 2; i++) {
        const tx = await makeProcessedTx(
          Tx.createPrivate(makeKernelPublicInputs(1 + i), emptyProof, makeEmptyUnverifiedData()),
        );
        /*
        const b = Buffer.alloc(20, 0);
        b[19] = 2;
        console.log(b);
        tx.data.end.newContracts[0] = new NewContractData(
          new AztecAddress(fr(1).toBuffer()),
          new EthAddress(b),
          fr(3),
        );
        console.log(tx.data.end.newContracts[0]);*/

        const txsLeft = [tx, await makeEmptyProcessedTx()];
        const txsRight = [await makeEmptyProcessedTx(), await makeEmptyProcessedTx()];

        // Set tree roots to proper values in the tx
        await setTxHistoricTreeRoots(tx);

        // Calculate what would be the tree roots after the txs from the first base rollup land and update mock circuit output
        await updateExpectedTreesFromTxs(txsLeft);
        baseRollupOutputLeft.endContractTreeSnapshot = await getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
        baseRollupOutputLeft.endNullifierTreeSnapshot = await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
        baseRollupOutputLeft.endPrivateDataTreeSnapshot = await getTreeSnapshot(MerkleTreeId.PRIVATE_DATA_TREE);

        // Same for the two txs on the right
        await updateExpectedTreesFromTxs(txsRight);
        baseRollupOutputRight.endContractTreeSnapshot = await getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
        baseRollupOutputRight.endNullifierTreeSnapshot = await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
        baseRollupOutputRight.endPrivateDataTreeSnapshot = await getTreeSnapshot(MerkleTreeId.PRIVATE_DATA_TREE);

        // And update the root trees now to create proper output to the root rollup circuit
        await updateRootTrees();
        rootRollupOutput.endContractTreeSnapshot = await getTreeSnapshot(MerkleTreeId.CONTRACT_TREE);
        rootRollupOutput.endNullifierTreeSnapshot = await getTreeSnapshot(MerkleTreeId.NULLIFIER_TREE);
        rootRollupOutput.endPrivateDataTreeSnapshot = await getTreeSnapshot(MerkleTreeId.PRIVATE_DATA_TREE);
        rootRollupOutput.endTreeOfHistoricContractTreeRootsSnapshot = await getTreeSnapshot(
          MerkleTreeId.CONTRACT_TREE_ROOTS_TREE,
        );
        rootRollupOutput.endTreeOfHistoricPrivateDataTreeRootsSnapshot = await getTreeSnapshot(
          MerkleTreeId.PRIVATE_DATA_TREE_ROOTS_TREE,
        );

        // Actually build a block!
        const txs = [tx, await makeEmptyProcessedTx(), await makeEmptyProcessedTx(), await makeEmptyProcessedTx()];
        const [block] = await builder.buildL2Block(1 + i, txs);

        console.log(block);

        // These output values are the same as in Decoder.t.sol tests
        if (i === 0) {
          expect(block.number).toEqual(1);
          expect(block.getCalldataHash()).toEqual(
            Buffer.from('9f1a00d7220a2b51a9c2591c2f85e089f03d06b01138586ea5e3656435d5e749', 'hex'),
          );
          expect(block.getStartStateHash()).toEqual(
            Buffer.from('d3f7645c4b49d31bca62aca09aa26740d7e47d264f3021e2de2db40562944745', 'hex'),
          );
          expect(block.getEndStateHash()).toEqual(
            Buffer.from('e3b20add23469bcbf25157ff75b81665564b089aa95083f8e095a3bb77062831', 'hex'),
          );
          expect(block.getPublicInputsHash().toBuffer()).toEqual(
            Buffer.from('20638cd5e03d287dbd356af6e16fd852337f535b12d06f7266599c035696098d', 'hex'),
          );
        } else {
          expect(block.number).toEqual(2);
          expect(block.getCalldataHash()).toEqual(
            Buffer.from('50f2f2dc986fc4022b8fdde8f2d610c82ee36776b282ca3514c12726dd9081ef', 'hex'),
          );
          expect(block.getStartStateHash()).toEqual(
            Buffer.from('e3b20add23469bcbf25157ff75b81665564b089aa95083f8e095a3bb77062831', 'hex'),
          );
          expect(block.getEndStateHash()).toEqual(
            Buffer.from('dc4f85374d479c6388a9bed0ddea9880422b515c88de0a76fd96b5c93c809b21', 'hex'),
          );
          expect(block.getPublicInputsHash().toBuffer()).toEqual(
            Buffer.from('12e84ea31aa75fab86269181c8c09dbb8486e518e5db9ce4dad204068fc0a925', 'hex'),
          );
        }

        // Printer useful for checking that output match contracts.
        /*console.log(block);
        console.log(block.encode().toString('hex'));
        console.log(`call data hash   : ${block.getCalldataHash().toString('hex')}`);
        console.log(`start state hash: ${block.getStartStateHash().toString('hex')}`);
        console.log(`end state hash  : ${block.getEndStateHash().toString('hex')}`);
        console.log(`public input hash: ${block.getPublicInputsHash().toString()}`);*/
      }
    }, 20000);
  });
});

// Test subject class that exposes internal functions for testing
class TestSubject extends CircuitBlockBuilder {
  public buildBaseRollupInput(tx1: ProcessedTx, tx2: ProcessedTx): Promise<BaseRollupInputs> {
    return super.buildBaseRollupInput(tx1, tx2);
  }

  public updateRootTrees(): Promise<void> {
    return super.updateRootTrees();
  }
}
