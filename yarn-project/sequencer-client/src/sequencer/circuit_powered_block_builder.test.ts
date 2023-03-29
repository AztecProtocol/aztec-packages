import { MerkleTreeDb, MerkleTreeId, MerkleTrees } from '@aztec/world-state';
import { mock, MockProxy } from 'jest-mock-extended';
import { Prover } from '../prover/index.js';
import { Simulator } from '../simulator/index.js';
import { CircuitPoweredBlockBuilder } from './circuit_powered_block_builder.js';
import { VerificationKeys, getVerificationKeys } from './vks.js';
import { default as memdown } from 'memdown';
import { default as levelup } from 'levelup';
import { BaseRollupInputs, Fr, UInt8Vector } from '@aztec/circuits.js';
import { Tx } from '@aztec/tx';
import {
  makeBaseRollupPublicInputs,
  makePrivateKernelPublicInputs,
  makeRootRollupPublicInputs,
} from '@aztec/circuits.js/factories';

/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-ignore
export const createMemDown = () => memdown();

describe('sequencer/circuit_block_builder', () => {
  let builder: TestSubject;
  let db: MerkleTreeDb;
  let blockNumber: number;
  let vks: VerificationKeys;
  let simulator: MockProxy<Simulator>;
  let prover: MockProxy<Prover>;

  const emptyProof = new UInt8Vector(Buffer.alloc(32, 0));

  beforeEach(async () => {
    blockNumber = 3;
    db = await MerkleTrees.new(levelup(createMemDown()));
    vks = getVerificationKeys();
    simulator = mock<Simulator>();
    prover = mock<Prover>();
    builder = new TestSubject(db, blockNumber, vks, simulator, prover);

    // Populate root trees with first roots
    // TODO: Should MerkleTrees.init take care of this?
    await builder.updateRootTrees();

    prover.getBaseRollupProof.mockResolvedValue(emptyProof);
    prover.getRootRollupProof.mockResolvedValue(emptyProof);

    simulator.baseRollupCircuit.mockResolvedValue(makeBaseRollupPublicInputs());
    simulator.rootRollupCircuit.mockResolvedValue(makeRootRollupPublicInputs());
  });

  it('builds an L2 block', async () => {
    // Assemble a fake transaction, we'll tweak some fields below
    const tx = new Tx(makePrivateKernelPublicInputs(), emptyProof);

    // Set tree roots to proper values
    for (const [name, id] of [
      ['privateDataTreeRoot', MerkleTreeId.DATA_TREE],
      ['contractTreeRoot', MerkleTreeId.CONTRACT_TREE],
      ['nullifierTreeRoot', MerkleTreeId.NULLIFIER_TREE],
    ] as const) {
      tx.data.constants.oldTreeRoots[name] = Fr.fromBuffer((await db.getTreeInfo(id)).root);
    }

    // Actually build a block!
    const [l2block, proof] = await builder.buildL2Block(tx);

    expect(l2block.number).toEqual(blockNumber);
    expect(proof).toEqual(emptyProof);
  });
});

// Test subject class that exposes internal functions for testing
class TestSubject extends CircuitPoweredBlockBuilder {
  public buildBaseRollupInput(tx1: Tx, tx2: Tx): Promise<BaseRollupInputs> {
    return super.buildBaseRollupInput(tx1, tx2);
  }

  public updateRootTrees(): Promise<void> {
    return super.updateRootTrees();
  }
}
