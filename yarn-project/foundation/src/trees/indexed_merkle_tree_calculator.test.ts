import { toBigIntBE } from '../bigint-buffer/index.js';
import { poseidon2Hash } from '../crypto/poseidon/index.js';
import { Fr } from '../fields/fields.js';
import { BufferReader } from '../serialize/buffer_reader.js';
import type { AsyncHasher, IndexedTreeLeaf, IndexedTreeLeafPreimage } from './index.js';
import type { IndexedMerkleTree } from './indexed_merkle_tree.js';
import { IndexedMerkleTreeCalculator } from './indexed_merkle_tree_calculator.js';
import type { MembershipWitness } from './membership_witness.js';

class TestHasher implements AsyncHasher {
  public async hash(lhs: Buffer, rhs: Buffer) {
    return (await poseidon2Hash([lhs, rhs])).toBuffer() as Buffer<ArrayBuffer>;
  }
  public async hashInputs(inputs: Buffer[]) {
    const inputFields = inputs.map(i => Fr.fromBuffer(i));
    return (await poseidon2Hash(inputFields)).toBuffer() as Buffer<ArrayBuffer>;
  }
}

/**
 * An address to be inserted or checked in the protocol contract tree.
 */
export class TestLeaf implements IndexedTreeLeaf {
  constructor(
    /**
     * Address value.
     */
    public address: Fr,
  ) {}

  getKey(): bigint {
    return this.address.toBigInt();
  }

  toBuffer(): Buffer {
    return this.address.toBuffer();
  }

  isEmpty(): boolean {
    return this.address.isZero();
  }

  updateTo(_another: TestLeaf): TestLeaf {
    throw new Error('Test leaf tree is insert only');
  }

  static buildDummy(key: bigint): TestLeaf {
    return new TestLeaf(new Fr(key));
  }

  static fromBuffer(buf: Buffer): TestLeaf {
    return new TestLeaf(Fr.fromBuffer(buf));
  }
}

class TestLeafPreimage implements IndexedTreeLeafPreimage {
  constructor(
    /**
     * Leaf value inside the indexed tree's linked list.
     */
    public address: Fr,
    /**
     * Next value inside the indexed tree's linked list.
     */
    public nextAddress: Fr,
    /**
     * Index of the next leaf in the indexed tree's linked list.
     */
    public nextIndex: bigint,
  ) {}

  getKey(): bigint {
    return this.address.toBigInt();
  }

  getNextKey(): bigint {
    return this.nextAddress.toBigInt();
  }

  getNextIndex(): bigint {
    return this.nextIndex;
  }

  asLeaf(): TestLeaf {
    return new TestLeaf(this.address);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.toHashInputs());
  }

  static fromBuffer(buffer: Buffer | BufferReader): TestLeafPreimage {
    const reader = BufferReader.asReader(buffer);
    return new TestLeafPreimage(reader.readObject(Fr), reader.readObject(Fr), toBigIntBE(reader.readBytes(32)));
  }

  toHashInputs(): Buffer[] {
    return [Buffer.from(this.address.toBuffer()), Buffer.from(this.nextAddress.toBuffer())];
  }
}

async function checkSiblingPath<N extends number>(
  witness: MembershipWitness<N>,
  tree: IndexedMerkleTree<TestLeafPreimage, N>,
) {
  let index = Number(witness.leafIndex);
  let currentValue = tree.leaves[index];
  const hasher = new TestHasher();
  for (let i = 0; i < tree.height; i++) {
    const node = witness.siblingPath[i];
    const isRight = index % 2;
    const [l, r] = isRight ? [node.toBuffer(), currentValue] : [currentValue, node.toBuffer()];
    currentValue = await hasher.hash(l, r);
    index >>= 1;
  }
  expect(tree.root).toEqual(currentValue);
}

describe('indexed merkle tree root calculator', () => {
  it('should correctly handle no leaves', async () => {
    // Height of 3 is 8 leaves.
    const calculator = await IndexedMerkleTreeCalculator.create(4, new TestHasher(), TestLeafPreimage);
    const expected = await calculator.computeTreeRoot(new Array(8).fill(new Fr(0)).map(fr => fr.toBuffer()));
    await expect(calculator.computeTreeRoot()).resolves.toEqual(expected);
  });

  it('should compute entire tree', async () => {
    const hasher = new TestHasher();
    const calculator = await IndexedMerkleTreeCalculator.create(4, hasher, TestLeafPreimage);
    const values = Array.from({ length: 5 }).map((_, i) => new Fr(i).toBuffer());
    const result = await calculator.computeTree(values);

    const expectedLeafPreimages = values.map(
      (l, i) =>
        new TestLeafPreimage(new Fr(l), i == 4 ? Fr.ZERO : new Fr(l).add(Fr.ONE), i == 4 ? BigInt(0) : BigInt(i)),
    );
    const leaves = await Promise.all(expectedLeafPreimages.map(l => hasher.hashInputs(l.toHashInputs())));
    const expectedRoot = await calculator.computeTreeRoot(leaves);
    expect(result.nodes.length).toEqual(31);
    expect(result.root).toEqual(expectedRoot);
  });

  it('should correctly get a membership witness', async () => {
    const hasher = new TestHasher();
    const calculator = await IndexedMerkleTreeCalculator.create(3, hasher, TestLeafPreimage);
    const values = Array.from({ length: 5 }).map((_, i) => new Fr(i + 1).toBuffer());
    const tree = await calculator.computeTree(values);

    // We will have the below leaf at index 2.
    const testLeaf = new TestLeafPreimage(new Fr(2), new Fr(3), 3n);
    const testLeafHash = await hasher.hashInputs(testLeaf.toHashInputs());
    const index = tree.getIndex(testLeafHash);
    expect(index).toEqual(2);
    // We will have the below leaf at index 3 => is the right sibling of testLeaf.
    const rightSibling = new TestLeafPreimage(new Fr(3), new Fr(4), 4n);
    const rightSiblingHash = await hasher.hashInputs(rightSibling.toHashInputs());

    const witness = tree.getMembershipWitness(index);
    await checkSiblingPath(witness, tree);
    expect(witness.leafIndex).toEqual(BigInt(index));
    expect(witness.siblingPath[0].toString()).toEqual(Fr.fromBuffer(rightSiblingHash).toString());
  });

  it('should correctly get a non membership witness', async () => {
    const hasher = new TestHasher();
    const calculator = await IndexedMerkleTreeCalculator.create(3, hasher, TestLeafPreimage);
    const values = Array.from({ length: 5 }).map((_, i) => new Fr(i * 2).toBuffer());
    const tree = await calculator.computeTree(values);

    // Choose an odd value which will not be in the tree.
    const testValue = 5n;
    // Its low leaf will exist at index 2 in the tree.f
    const expectedLowLeaf = new TestLeafPreimage(new Fr(4), new Fr(6), 3n);

    const lowLeaf = tree.getLowLeaf(testValue);
    expect(lowLeaf).toEqual(expectedLowLeaf);

    const lowLeafHash = await hasher.hashInputs(lowLeaf.toHashInputs());
    const lowLeafIndex = tree.getIndex(lowLeafHash);
    expect(lowLeafIndex).toEqual(2);

    const witness = tree.getMembershipWitness(lowLeafIndex);
    await checkSiblingPath(witness, tree);
    expect(witness).toEqual(tree.getMembershipWitness(lowLeafHash));
    // The low leaf is at index 2 => it has a right sibling.
    const expectedSibling = tree.leaves[lowLeafIndex + 1];
    expect(witness.siblingPath[0].toString()).toStrictEqual(Fr.fromBuffer(expectedSibling).toString());
  });

  it('should correctly get a membership witness for addresses', async () => {
    const hasher = new TestHasher();
    const calculator = await IndexedMerkleTreeCalculator.create(3, hasher, TestLeafPreimage);
    let values: Fr[] = await Promise.all(Array.from({ length: 7 }).map(() => Fr.random()));
    // Manually add the zero leaf here, so the below recalcs are easier.
    values = [Fr.ZERO, ...values];
    const tree = await calculator.computeTree(values.map(a => a.toBuffer()));

    // Pick some value to find a witness for...
    const testIndex = 2;
    const testValue = values[testIndex];
    const sortedValues = [...values].sort((a, b) => Number(a.toBigInt() - b.toBigInt()));
    // ...and find its next value.
    const nextValue = sortedValues[sortedValues.indexOf(testValue) + 1] || Fr.ZERO;

    // Reconstruct its leaf preimage.
    const testLeafPreimage = new TestLeafPreimage(
      testValue.toField(),
      nextValue.toField(),
      BigInt(values.indexOf(nextValue) || 0),
    );
    expect(tree.leafPreimages[testIndex]).toEqual(testLeafPreimage);

    // Get the membership witness and expected sibling.
    const witness = tree.getMembershipWitness(testIndex);
    await checkSiblingPath(witness, tree);
    const expectedSibling = testIndex % 2 ? tree.leafPreimages[testIndex - 1] : tree.leafPreimages[testIndex + 1];
    expect(witness.leafIndex).toEqual(BigInt(testIndex));
    expect(witness.siblingPath[0].toString()).toStrictEqual(
      Fr.fromBuffer(await hasher.hashInputs(expectedSibling.toHashInputs())).toString(),
    );
  });

  it('should correctly get a non membership witness for addresses', async () => {
    const hasher = new TestHasher();
    const calculator = await IndexedMerkleTreeCalculator.create(3, hasher, TestLeafPreimage);
    let values: Fr[] = await Promise.all(Array.from({ length: 7 }).map(() => Fr.random()));
    // Manually add the zero leaf here, so the below recalcs are easier.
    values = [Fr.ZERO, ...values];
    const tree = await calculator.computeTree(values.map(a => a.toBuffer()));

    // Pick some value to find a low leaf for...
    const testValue = Fr.random();
    const sortedValues = [...values].sort((a, b) => Number(a.toBigInt() - b.toBigInt()));
    // ...and find its 'sandwich' values.
    const previousIndex = sortedValues.findIndex(
      (a, i) =>
        a.toBigInt() <= testValue.toBigInt() &&
        (i == sortedValues.length - 1 || sortedValues[i + 1].toBigInt() > testValue.toBigInt()),
    );
    const [previousValue, nextValue] = [sortedValues[previousIndex], sortedValues[previousIndex + 1] || Fr.ZERO];

    // Reconstruct the low leaf preimage.
    const expectedLowLeaf = new TestLeafPreimage(
      previousValue.toField(),
      nextValue.toField(),
      BigInt(values.indexOf(nextValue)),
    );
    const lowLeaf = tree.getLowLeaf(testValue.toBigInt());
    const hashedLowLeaf = await hasher.hashInputs(lowLeaf.toHashInputs());
    const lowLeafIndex = tree.getIndex(hashedLowLeaf);
    expect(lowLeaf).toEqual(expectedLowLeaf);
    expect(tree.leafPreimages[lowLeafIndex]).toEqual(lowLeaf);

    // Get the membership witness of the low leaf and expected sibling.
    const witness = tree.getMembershipWitness(lowLeafIndex);
    await checkSiblingPath(witness, tree);
    expect(witness).toEqual(tree.getMembershipWitness(hashedLowLeaf));
    const expectedSibling =
      lowLeafIndex % 2 ? tree.leafPreimages[lowLeafIndex - 1] : tree.leafPreimages[lowLeafIndex + 1];
    expect(witness.leafIndex).toEqual(BigInt(lowLeafIndex));
    expect(witness.siblingPath[0].toString()).toStrictEqual(
      Fr.fromBuffer(await hasher.hashInputs(expectedSibling.toHashInputs())).toString(),
    );
  });
});
